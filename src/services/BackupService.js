const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const db = require('../repositories/DatabaseRepository');
const configService = require('./ConfigService');

/**
 * BackupService - Servicio para gestión de copias de seguridad
 */
class BackupService {
  isSqliteDatabaseFile(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile() || stats.size < 16) {
        return false;
      }

      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      return buffer.toString('utf8') === 'SQLite format 3\u0000';
    } catch (error) {
      return false;
    }
  }

  getImageMimeType(fileName = '') {
    const ext = path.extname(String(fileName || '')).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.avif':
        return 'image/avif';
      case '.svg':
        return 'image/svg+xml';
      default:
        return null;
    }
  }

  buildMobileImagesMap(imageNames = [], imagesPath = '') {
    const images = {};
    if (!imagesPath || !fs.existsSync(imagesPath) || imageNames.length === 0) {
      return images;
    }

    for (const name of imageNames) {
      const fileName = path.basename(String(name || ''));
      if (!fileName || images[fileName]) {
        continue;
      }

      const absPath = path.join(imagesPath, fileName);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const mime = this.getImageMimeType(fileName);
      if (!mime) {
        continue;
      }

      const raw = fs.readFileSync(absPath);
      images[fileName] = `data:${mime};base64,${raw.toString('base64')}`;
    }

    return images;
  }

  buildMobileSnapshot() {
    const config = configService.obtenerTodas();
    const ivaGlobal = Number(config.ivaGlobal || 21);
    const { imagesPath } = this.getPaths();

    const articulosRows = db.query(`
      SELECT codigo, descripcion, costo, ganancia, iva, stock, stock_minimo,
             IFNULL(marcaId, 0) AS marcaId,
             IFNULL(proveedorId, 0) AS proveedorId,
             IFNULL(categoriaId, 0) AS categoriaId,
             imagen,
             IFNULL(protegido, 0) AS protegido
      FROM articulos
      ORDER BY descripcion ASC
    `);

    const imageNames = [];

    const articulos = articulosRows.map((row) => {
      const costo = Number(row.costo || 0);
      const ganancia = Number(row.ganancia || 0);
      const iva = Number(row.iva || 0);
      const stock = Number(row.stock || 0);
      const stockMinimo = Number(row.stock_minimo || 0);
      const protegido = Number(row.protegido || 0) === 1;
      const ivaAplicar = protegido ? iva : ivaGlobal;
      const precioFinal = costo * (1 + ganancia / 100) * (1 + ivaAplicar / 100);
      const imageName = row.imagen ? path.basename(String(row.imagen)) : null;
      if (imageName) {
        imageNames.push(imageName);
      }

      return {
        codigo: row.codigo,
        descripcion: row.descripcion,
        costo,
        ganancia,
        iva,
        stock,
        stockMinimo,
        marcaId: Number(row.marcaId || 0),
        proveedorId: Number(row.proveedorId || 0),
        categoriaId: Number(row.categoriaId || 0),
        precioFinal,
        stockCritico: stock <= stockMinimo,
        imagenUrl: imageName || null
      };
    });

    const images = this.buildMobileImagesMap(imageNames, imagesPath);

    const marcas = db.query('SELECT id, nombre FROM marcas ORDER BY nombre ASC');
    const proveedores = db.query('SELECT id, nombre, contacto FROM proveedores ORDER BY nombre ASC');
    const categorias = db.query('SELECT id, nombre FROM categorias ORDER BY nombre ASC');
    const notas = db.query('SELECT id, titulo, contenido, tipo FROM notas ORDER BY id DESC');

    return {
      timestamp: new Date().toISOString(),
      source: 'desktop-db',
      version: 1,
      articulos,
      catalogs: {
        marcas,
        proveedores,
        categorias,
        config
      },
      images,
      notas,
      history: []
    };
  }

  resolveDriveBackupDir() {
    const configuredDir = (configService.driveBackupDir || '').trim();
    if (configuredDir) {
      return configuredDir;
    }

    const envDir = (process.env.MERCADOPG_DRIVE_BACKUP_DIR || '').trim();
    if (envDir) {
      return envDir;
    }

    const homePath = (app && app.isPackaged)
      ? app.getPath('home')
      : (process.env.USERPROFILE || process.cwd());

    const driveRoots = [
      path.join(homePath, 'Google Drive', 'My Drive'),
      path.join(homePath, 'Google Drive', 'Mi unidad'),
      path.join(homePath, 'My Drive'),
      path.join(homePath, 'Mi unidad'),
      path.join('G:\\', 'My Drive'),
      path.join('G:\\', 'Mi unidad')
    ];

    const existingRoot = driveRoots.find((candidate) => fs.existsSync(candidate));
    if (existingRoot) {
      return path.join(existingRoot, 'MercadoPG', 'Backups');
    }

    return null;
  }

  getPaths() {
    // Determinar rutas (compatible con dev y prod)
    const basePath = (app && app.isPackaged) ? app.getPath('userData') : process.cwd();
    const dataPath = path.join(basePath, 'Data');
    const dbPath = path.join(dataPath, 'Stok.db');
    const imagesPath = path.join(dataPath, 'Images');
    const driveBackupDir = this.resolveDriveBackupDir();

    // SOLO respaldos en Drive - no permitir respaldos locales
    if (!driveBackupDir) {
      return {
        dbPath,
        imagesPath,
        backupDir: null,
        backupSource: 'none',
        error: 'Google Drive no está sincronizado en esta PC. Por favor, instale Google Drive Desktop y sincronice su carpeta.'
      };
    }

    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    
    if (!fs.existsSync(driveBackupDir)) {
      fs.mkdirSync(driveBackupDir, { recursive: true });
    }
    return {
      dbPath,
      imagesPath,
      backupDir: driveBackupDir,
      backupSource: 'drive'
    };
  }

  getLatestBackupPath(backupDir) {
    if (!fs.existsSync(backupDir)) {
      return null;
    }

    const entries = fs.readdirSync(backupDir)
      .filter((entry) => entry.startsWith('backup_') && entry !== 'backup_latest.json')
      .map((entry) => {
        const fullPath = path.join(backupDir, entry);
        if (!fs.existsSync(fullPath)) {
          return null;
        }

        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          const dbInDir = path.join(fullPath, 'Stok.db');
          if (!this.isSqliteDatabaseFile(dbInDir)) {
            return null;
          }
        } else {
          const ext = path.extname(entry).toLowerCase();
          if (ext !== '.db' || !this.isSqliteDatabaseFile(fullPath)) {
            return null;
          }
        }

        return { fullPath, mtimeMs: stats.mtimeMs };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return entries[0]?.fullPath || null;
  }

  async crearRespaldo() {
    const paths = this.getPaths();
    
    // Validar que Drive esté sincronizado
    if (!paths.backupDir || paths.error) {
      return { 
        success: false, 
        error: paths.error || 'No se puede crear respaldo sin Drive sincronizado' 
      };
    }

    const { dbPath, imagesPath, backupDir } = paths;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Ahora el respaldo será una CARPETA, no un archivo suelto
    const backupName = `backup_${timestamp}`;
    const currentBackupDir = path.join(backupDir, backupName);

    // Crear carpeta para este respaldo específico
    if (!fs.existsSync(currentBackupDir)) fs.mkdirSync(currentBackupDir, { recursive: true });

    try {
      // 1. Respaldar Base de Datos
      const dbBackupPath = path.join(currentBackupDir, 'Stok.db');
      
      // Si la BD está abierta, usar la API de backup de SQLite
      if (db.db && db.db.open) {
        await db.getConnection().backup(dbBackupPath);
      } else {
        // Si está cerrada o no inicializada, copia de archivo directa
        if (fs.existsSync(dbPath)) {
          fs.copyFileSync(dbPath, dbBackupPath);
        } else {
          // Si no hay DB, al menos seguimos con las imágenes
        }
      }
      
      // 2. Respaldar Imágenes (Copia recursiva)
      const imagesBackupPath = path.join(currentBackupDir, 'Images');
      if (fs.existsSync(imagesPath)) {
        this.copyRecursiveSync(imagesPath, imagesBackupPath);
      }

      // 3. Guardar snapshot JSON compatible con la app del telefono
      const mobileSnapshotPath = path.join(currentBackupDir, 'backup_mobile_full.json');
      const mobileSnapshot = this.buildMobileSnapshot();
      const mobileSnapshotJson = JSON.stringify(mobileSnapshot, null, 2);
      fs.writeFileSync(mobileSnapshotPath, mobileSnapshotJson, 'utf8');

      // 4. Siempre sobreescribir backup_latest.json en la raiz de la carpeta de backups
      // Este archivo tiene siempre el mismo nombre → su ID de Drive nunca cambia
      // El usuario lo comparte UNA sola vez y el telefono siempre descarga desde ese link fijo
      const latestSnapshotPath = path.join(backupDir, 'backup_latest.json');
      fs.writeFileSync(latestSnapshotPath, mobileSnapshotJson, 'utf8');

      // Mantener solo los últimos 10 respaldos
      this.limpiarRespaldosAntiguos(backupDir);

      return { success: true, path: currentBackupDir };
    } catch (error) {
      console.error('Error en respaldo:', error);
      return { success: false, error: error.message };
    }
  }

  restaurarUltimoRespaldo(reabrir = false) {
    const paths = this.getPaths();
    
    // Validar que Drive esté sincronizado
    if (!paths.backupDir || paths.error) {
      return { 
        success: false, 
        error: paths.error || 'No se puede restaurar sin Drive sincronizado' 
      };
    }

    const { dbPath, imagesPath, backupDir } = paths;
    if (!fs.existsSync(backupDir)) return { success: false, error: 'No existe carpeta de respaldos en Drive' };

    const ultimoBackupPath = this.getLatestBackupPath(backupDir);
    if (!ultimoBackupPath) return { success: false, error: 'No hay respaldos para restaurar' };
    const stats = fs.statSync(ultimoBackupPath);

    try {
      db.close(); // Cerrar conexión actual
      
      if (stats.isDirectory()) {
        // --- Restauración Nuevo Formato (Carpeta) ---
        
        // 1. Restaurar DB
        const dbSource = path.join(ultimoBackupPath, 'Stok.db');
        if (this.isSqliteDatabaseFile(dbSource)) {
          fs.copyFileSync(dbSource, dbPath);
        } else {
          return { success: false, error: 'El respaldo más reciente no contiene una base SQLite válida' };
        }

        // 2. Restaurar Imágenes
        const imagesSource = path.join(ultimoBackupPath, 'Images');
        if (fs.existsSync(imagesSource)) {
          if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true });
          this.copyRecursiveSync(imagesSource, imagesPath);
        }

      } else {
        // --- Soporte Legacy (Archivo .db antiguo) ---
        if (!this.isSqliteDatabaseFile(ultimoBackupPath)) {
          return { success: false, error: 'El archivo de respaldo legacy no es una base SQLite válida' };
        }
        fs.copyFileSync(ultimoBackupPath, dbPath);
      }
      
      if (reabrir) {
        db.initialize(); // Reabrir si se solicita (ej. restauración manual)
      }
      
      return { success: true, source: ultimoBackupPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Función auxiliar para copiar carpetas completas
  copyRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest);
      fs.readdirSync(src).forEach(childItemName => {
        this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  limpiarRespaldosAntiguos(backupDir) {
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_')).sort().reverse();
    if (files.length > 10) {
      files.slice(10).forEach(f => {
        const p = path.join(backupDir, f);
        // Eliminar sea archivo o carpeta
        if (fs.statSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        } else {
          fs.unlinkSync(p);
        }
      });
    }
  }

  async abrirCarpeta() {
    const paths = this.getPaths();
    if (!paths.backupDir || paths.error) {
      throw new Error(paths.error || 'No se puede abrir carpeta sin Drive sincronizado');
    }
    await shell.openPath(paths.backupDir);
  }
}

module.exports = new BackupService();