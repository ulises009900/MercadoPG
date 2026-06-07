const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const QRCode = require('qrcode');
const http = require('http');
const { spawn } = require('child_process');

// Manejo de errores al inicio (antes de cargar otras librerías)
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
  dialog.showErrorBox('Error Fatal al Iniciar', `Ocurrió un error crítico:\n${error.message}\n\nRevise la consola para más detalles.`);
});

const path = require('path');
const db = require('./repositories/DatabaseRepository');
const services = require('./services');
const MobileServer = require('./mobile/MobileServer');

function normalizePublicMobileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw.replace(/\/+$/, '');
}

function isNgrokDomain(value) {
  const raw = String(value || '').toLowerCase();
  return raw.includes('.ngrok-free.app') || raw.includes('.ngrok.app') || raw.includes('.ngrok.io') || raw.includes('.ngrok.dev');
}

function shouldAutoStartNgrok() {
  if (String(process.env.MERCADOPG_DISABLE_AUTO_NGROK || '').trim() === '1') {
    return false;
  }

  if (String(process.env.MERCADOPG_AUTO_NGROK || '').trim() === '1') {
    return true;
  }

  return app.isPackaged;
}

function getNgrokCandidatePaths() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  if (process.env.NGROK_PATH) {
    candidates.push(process.env.NGROK_PATH);
  }

  candidates.push('ngrok');

  if (localAppData) {
    candidates.push(path.join(localAppData, 'ngrok', 'ngrok.exe'));
  }

  candidates.push(path.join(programFiles, 'ngrok', 'ngrok.exe'));

  return candidates;
}

function findNgrokCommand() {
  const candidates = getNgrokCandidatePaths();
  for (const candidate of candidates) {
    if (candidate === 'ngrok') {
      return candidate;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'ngrok';
}

function readNgrokApi(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/tunnels',
      timeout: 1000
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function detectNgrokUrlFromApi() {
  for (let port = 4040; port <= 4045; port += 1) {
    try {
      const payload = await readNgrokApi(port);
      const tunnels = Array.isArray(payload.tunnels) ? payload.tunnels : [];
      const secure = tunnels.find((tunnel) => String(tunnel.public_url || '').startsWith('https://'));
      if (secure && secure.public_url) {
        return normalizePublicMobileUrl(secure.public_url);
      }
    } catch (_) {
      // Ignorar puertos sin API ngrok activa
    }
  }
  return '';
}

async function waitForNgrokUrl(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const detected = await detectNgrokUrlFromApi();
    if (detected) {
      return detected;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return '';
}

let ngrokProcess = null;

async function ensureNgrokPublicUrl(preferredPort) {
  const existing = await detectNgrokUrlFromApi();
  if (existing) {
    return existing;
  }

  const ngrokCmd = findNgrokCommand();
  try {
    ngrokProcess = spawn(ngrokCmd, ['http', String(preferredPort || 3001)], {
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
      shell: false
    });
  } catch (error) {
    console.warn('No se pudo iniciar ngrok:', error.message);
    return '';
  }

  ngrokProcess.on('error', (error) => {
    console.warn('Proceso ngrok error:', error.message);
  });

  ngrokProcess.on('exit', () => {
    ngrokProcess = null;
  });

  const url = await waitForNgrokUrl();
  if (!url && ngrokProcess && !ngrokProcess.killed) {
    ngrokProcess.kill();
    ngrokProcess = null;
  }
  return url;
}

function stopNgrokProcess() {
  if (!ngrokProcess) {
    return;
  }
  try {
    ngrokProcess.kill();
  } catch (_) {
    // noop
  }
  ngrokProcess = null;
}

/**
 * Ventanas de la aplicación
 */
let mainWindow = null;
let articuloFormWindow = null;
let historialWindow = null;
let rankingWindow = null;
let faltantesWindow = null;
let configWindow = null;
let scannerWindow = null;
let exportWindow = null;
let notasWindow = null;
let tempExportData = []; // Variable temporal para pasar datos a la ventana de exportación
const mobileServer = new MobileServer({
  services,
  rootDir: path.join(__dirname, 'mobile'),
  preferredPort: 3001,
  publicUrl: normalizePublicMobileUrl(process.env.MERCADOPG_PUBLIC_URL || process.env.NGROK_URL || ''),
  onConnectionChange: (connected) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('phone-connection-changed', { connected });
    }
  },
  onDataChanged: (payload = {}) => {
    const codigo = payload.codigo || undefined;
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('reload-data', codigo);
      }
    });
  }
});

const mutatingServiceCalls = new Set([
  'ArticuloService.guardar',
  'ArticuloService.actualizarParcial',
  'ArticuloService.eliminar',
  'ArticuloService.actualizarIvaMasivo',
  'ArticuloService.actualizarGananciaMasivo',
  'StockService.entrada',
  'StockService.salida',
  'ConfigService.guardarTodas',
  'NotaService.guardar',
  'NotaService.actualizar',
  'NotaService.eliminar'
]);

function getMobileClientVersion() {
  try {
    const bundlePath = path.join(__dirname, 'mobile', 'app.bundle.js');
    const stats = fs.statSync(bundlePath);
    return String(Math.floor(stats.mtimeMs));
  } catch {
    return String(Date.now());
  }
}

function getInstallUrl(status) {
  if (!status) {
    return null;
  }

  const baseUrl = normalizePublicMobileUrl(status.publicUrl || '') || status.primaryUrl;
  if (!baseUrl) {
    return null;
  }

  const installUrl = new URL(baseUrl);
  installUrl.searchParams.set('install', '1');
  installUrl.searchParams.set('appv', getMobileClientVersion());

  // Siempre embeber URL del snapshot local del PC para carga offline automatica
  const snapshotUrl = `${installUrl.origin}/api/backup/snapshot`;
  installUrl.searchParams.set('backup', snapshotUrl);
  installUrl.searchParams.set('autobackup', '1');

  return installUrl.toString();
}

// Variables temporales para pasar datos entre ventanas
let tempHistorialCodigo = null;

/**
 * Crea la ventana principal
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'views', 'main.html'));

  // Abrir DevTools en desarrollo
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Crea ventana de formulario de artículo
 */
function createArticuloFormWindow(codigo = null) {
  if (articuloFormWindow) {
    articuloFormWindow.focus();
    if (codigo) {
      articuloFormWindow.webContents.send('load-articulo', codigo);
    }
    return;
  }

  articuloFormWindow = new BrowserWindow({
    width: 550,
    height: 680,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  articuloFormWindow.loadFile(path.join(__dirname, 'views', 'articulo-form.html'));
  articuloFormWindow.setMenu(null);
  
  // Una vez que la ventana esté lista, enviamos el código
  articuloFormWindow.webContents.on('did-finish-load', () => {
    articuloFormWindow.webContents.send('load-articulo', codigo);
    articuloFormWindow.maximize(); // Maximizar después de cargar
  });

  articuloFormWindow.on('closed', () => {
    articuloFormWindow = null;
  });
}

/**
 * Crea ventana de historial
 */
function createHistorialWindow(codigo = null) {
  if (historialWindow) {
    historialWindow.focus();
    historialWindow.webContents.send('load-historial', codigo);
    return;
  }

  historialWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  historialWindow.loadFile(path.join(__dirname, 'views', 'historial.html'));
  historialWindow.setMenu(null);
  
  historialWindow.webContents.on('did-finish-load', () => {
    historialWindow.webContents.send('load-historial', codigo);
  });

  historialWindow.on('closed', () => {
    historialWindow = null;
  });
}

/**
 * Crea ventana de ranking
 */
function createRankingWindow() {
  if (rankingWindow) {
    rankingWindow.focus();
    return;
  }

  rankingWindow = new BrowserWindow({
    width: 700,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  rankingWindow.loadFile(path.join(__dirname, 'views', 'ranking.html'));
  rankingWindow.setMenu(null);

  rankingWindow.on('closed', () => {
    rankingWindow = null;
  });
}

/**
 * Crea ventana de faltantes
 */
function createFaltantesWindow() {
  if (faltantesWindow) {
    faltantesWindow.focus();
    return;
  }

  faltantesWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  faltantesWindow.loadFile(path.join(__dirname, 'views', 'faltantes.html'));
  faltantesWindow.setMenu(null);

  faltantesWindow.on('closed', () => {
    faltantesWindow = null;
  });
}

/**
 * Crea ventana de configuración
 */
function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 600,
    height: 700,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  configWindow.loadFile(path.join(__dirname, 'views', 'config.html'));
  configWindow.setMenu(null);

  configWindow.on('closed', () => {
    configWindow = null;
  });
}

/**
 * Crea ventana de exportación
 */
function createExportWindow() {
  if (exportWindow) {
    exportWindow.focus();
    return;
  }

  exportWindow = new BrowserWindow({
    width: 450,
    height: 600,
    parent: mainWindow,
    modal: true,
    title: 'Generar Reporte Word',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  exportWindow.loadFile(path.join(__dirname, 'views', 'export.html'));

  exportWindow.on('closed', () => {
    exportWindow = null;
    tempExportData = []; // Limpiar memoria
  });
}

/**
 * Crea ventana de notas
 */
function createNotasWindow() {
  if (notasWindow) {
    notasWindow.focus();
    return;
  }

  notasWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  notasWindow.loadFile(path.join(__dirname, 'views', 'notas.html'));
  notasWindow.setMenu(null);

  notasWindow.on('closed', () => {
    notasWindow = null;
  });
}

/**
 * Event Handlers
 */

// Cuando la app está lista
app.whenReady().then(async () => {
  try {
    // 1. Restaurar último respaldo antes de iniciar (Requerimiento: "tome siempre la ultima copia al inisiar")
    console.log('Verificando copias de seguridad...');
    const restoreResult = services.BackupService.restaurarUltimoRespaldo(false);
    if (restoreResult.success) {
      console.log('✓ Base de datos restaurada desde:', restoreResult.source);
    }

    // Inicializar base de datos
    await db.initialize();
    if (shouldAutoStartNgrok()) {
      const explicitPublicUrl = normalizePublicMobileUrl(process.env.MERCADOPG_PUBLIC_URL || process.env.NGROK_URL || '');
      if (!explicitPublicUrl) {
        const ngrokUrl = await ensureNgrokPublicUrl(mobileServer.preferredPort || 3001);
        if (ngrokUrl) {
          mobileServer.publicUrl = ngrokUrl;
          process.env.MERCADOPG_PUBLIC_URL = ngrokUrl;
          process.env.NGROK_URL = ngrokUrl;
          console.log('✓ ngrok activo:', ngrokUrl);
        } else {
          console.warn('No se pudo obtener URL publica de ngrok. Se mantiene acceso LAN.');
        }
      } else if (isNgrokDomain(explicitPublicUrl)) {
        mobileServer.publicUrl = explicitPublicUrl;
      }
    }

    const mobileStatus = await mobileServer.start();
    if (mobileStatus.primaryUrl) {
      console.log('✓ Acceso movil:', mobileStatus.primaryUrl);
    }
    
    // Crear ventana principal
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  } catch (error) {
    console.error('Error fatal al iniciar la base de datos:', error);
    dialog.showErrorBox('Error de Inicio', `No se pudo inicializar la base de datos:\n${error.message}`);
    app.quit();
  }
});

// Cuando todas las ventanas están cerradas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Cerrar DB y crear respaldo (Requerimiento: "aga una copia al serrar")
    db.close();
    
    services.BackupService.crearRespaldo().then(res => {
      if (res.success) console.log('✓ Respaldo creado al cerrar:', res.path);
      else console.error('Error creando respaldo al cerrar:', res.error);
    }).catch(err => console.error(err)).finally(async () => {
      try {
        await mobileServer.stop();
      } catch (error) {
        console.error('Error al detener servidor movil:', error);
      }
      stopNgrokProcess();
      app.quit();
    });
    
  }
});

app.on('before-quit', () => {
  stopNgrokProcess();
});

/**
 * IPC Handlers - Comunicación entre procesos
 */

// Abrir ventana de formulario de artículo
ipcMain.on('open-articulo-form', (event, codigo) => {
  createArticuloFormWindow(codigo);
});

// Cerrar formulario de artículo
ipcMain.on('close-articulo-form', (event, recargar) => {
  if (articuloFormWindow) {
    articuloFormWindow.close();
  }
  if (recargar && mainWindow) {
    mainWindow.webContents.send('reload-data');
  }
});

// Abrir ventana de historial
ipcMain.on('open-historial', (event, codigo) => {
  createHistorialWindow(codigo);
});

// Abrir ventana de ranking
ipcMain.on('open-ranking', () => {
  createRankingWindow();
});

// Abrir ventana de faltantes
ipcMain.on('open-faltantes', () => {
  createFaltantesWindow();
});

// Abrir ventana de configuración
ipcMain.on('open-config', () => {
  createConfigWindow();
});

// Abrir ventana de notas
ipcMain.on('open-notas', () => {
  createNotasWindow();
});

// Abrir ventana de exportación (recibe los datos de la tabla)
ipcMain.on('open-export-window', (event, data) => {
  tempExportData = data || [];
  createExportWindow();
});

// La ventana de exportación pide los datos cuando carga
ipcMain.handle('get-export-data', () => {
  return tempExportData;
});

// Abrir ventana de escáner (Acción Rápida)
ipcMain.on('open-scanner-window', (event, codigo) => {
  // Si la ventana ya existe, la traemos al frente y actualizamos el código
  if (scannerWindow && !scannerWindow.isDestroyed()) {
    scannerWindow.show();
    scannerWindow.focus();
    scannerWindow.webContents.send('load-scanner-articulo', codigo);
    return;
  }

  // Crear la ventana si no existe
  scannerWindow = new BrowserWindow({
    width: 600,
    height: 750,
    title: 'Escáner - Acción Rápida',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  scannerWindow.loadFile(path.join(__dirname, 'views', 'scanner.html'));

  scannerWindow.webContents.on('did-finish-load', () => {
    scannerWindow.webContents.send('load-scanner-articulo', codigo);
  });

  scannerWindow.on('closed', () => {
    scannerWindow = null;
  });
});

// Abrir ayuda
ipcMain.on('open-help', (event) => {
  const message = `ATAJOS DE TECLADO

Navegación:
• Flechas ↑/↓: Navegar por las listas
• Esc: Cerrar ventanas / Cancelar
• F1: Ver esta ayuda

Acciones Principales:
• F2: Nuevo Artículo
• F3 / Enter: Editar Artículo
• Supr: Eliminar Artículo
• F5: Actualizar datos
• F6 o (+): Registrar Entrada Stock
• F7 o (-): Registrar Salida Stock
• F4: Ver Historial
• F8: Ver Ranking
• F9: Ver Faltantes`;

  dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: 'info',
    title: 'Ayuda - MercadoPG',
    message: 'Guía de Atajos',
    detail: message,
    buttons: ['Entendido']
  });
});

// Configuración guardada
ipcMain.on('config-saved', () => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('reload-data');
    }
  });
});

// Manejador genérico para llamadas a servicios
ipcMain.handle('service-call', async (event, serviceName, methodName, ...args) => {
  if (services[serviceName] && typeof services[serviceName][methodName] === 'function') {
    try {
      const result = await services[serviceName][methodName](...args);
      if (mutatingServiceCalls.has(`${serviceName}.${methodName}`)) {
        mobileServer.notifyDataChanged({ source: 'desktop', action: `${serviceName}.${methodName}` });
      }
      return { success: true, data: result };
    } catch (error) {
      console.error(`Error en ${serviceName}.${methodName}:`, error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: `Método no encontrado: ${serviceName}.${methodName}` };
});

ipcMain.handle('save-image', (event, tempPath, codigo) => {
  if (!tempPath || !fs.existsSync(tempPath)) {
    return null;
  }

  const basePath = app.isPackaged ? app.getPath('userData') : process.cwd();
  const appDataPath = path.join(basePath, 'Data', 'Images');

  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true });
  }

  // Evitar duplicados si la imagen ya está en la carpeta de datos
  const isAlreadyInStore = path.resolve(tempPath).startsWith(path.resolve(appDataPath));
  if (isAlreadyInStore) {
    return tempPath;
  }

  const ext = path.extname(tempPath);
  const fileName = `img_${codigo}_${Date.now()}${ext}`;
  const destPath = path.join(appDataPath, fileName);

  try {
    fs.copyFileSync(tempPath, destPath);
    return destPath;
  } catch (error) {
    console.error('Error al guardar la imagen:', error);
    return null;
  }
});

ipcMain.handle('show-open-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif'] }
    ]
  });
  return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), options);
  return canceled ? null : filePath;
});

ipcMain.handle('get-image-data-url', (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).substring(1);
    return `data:image/${ext};base64,${data.toString('base64')}`;
  } catch (error) {
    console.error('Error al leer imagen para data URL:', error);
    return null;
  }
});

ipcMain.handle('get-mobile-sync-status', () => {
  const status = mobileServer.getStatus();
  return {
    ...status,
    installUrl: getInstallUrl(status),
    appVersion: getMobileClientVersion()
  };
});

ipcMain.handle('get-mobile-sync-qr', async () => {
  const status = mobileServer.getStatus();
  const installUrl = getInstallUrl(status);

  if (!installUrl) {
    return { success: false, error: 'No se detecto una URL movil disponible' };
  }

  try {
    const dataUrl = await QRCode.toDataURL(installUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#1d2a2f',
        light: '#fffdf8'
      }
    });
    return { success: true, data: { url: installUrl, dataUrl } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Estado de conexiones (Drive + Telefono)
ipcMain.handle('get-connection-status', () => {
  const mobileStatus = mobileServer.getStatus();
  const driveDir = services.BackupService.resolveDriveBackupDir();
  const driveAccessible = driveDir ? fs.existsSync(driveDir) : false;
  return {
    phoneConnected: mobileStatus.mobileConnected,
    phoneUrls: mobileStatus.urls || [],
    primaryUrl: mobileStatus.primaryUrl || null,
    mdnsUrl: mobileStatus.mdnsUrl || null,
    installUrl: getInstallUrl(mobileStatus),
    driveConfigured: Boolean(driveDir),
    driveAccessible,
    drivePath: driveDir || ''
  };
});

// Difundir evento reload-data a todas las ventanas
ipcMain.on('reload-data', (event, ...args) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('reload-data', ...args);
    }
  });
});

// Difundir vista previa de tema en tiempo real
ipcMain.on('preview-theme', (event, theme) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('preview-theme', theme);
    }
  });
});
