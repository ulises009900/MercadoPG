const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// Manejo de errores al inicio (antes de cargar otras librerías)
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
  dialog.showErrorBox('Error Fatal al Iniciar', `Ocurrió un error crítico:\n${error.message}\n\nRevise la consola para más detalles.`);
});

const path = require('path');
const db = require('./repositories/DatabaseRepository');
const services = require('./services');

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
 * Event Handlers
 */

// Cuando la app está lista
app.whenReady().then(async () => {
  try {
    // Inicializar base de datos
    await db.initialize();
    
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
    db.close();
    app.quit();
  }
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
    height: 500,
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

  const appDataPath = path.join(app.getAppPath(), 'Data', 'Images');

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
