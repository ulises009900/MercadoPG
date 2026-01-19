const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const db = require('../repositories/DatabaseRepository');

/**
 * BackupService - Servicio para gestión de copias de seguridad
 */
class BackupService {
  getPaths() {
    // Determinar rutas (compatible con dev y prod)
    const basePath = (app && app.isPackaged) ? app.getPath('userData') : process.cwd();
    const dataPath = path.join(basePath, 'Data');
    const dbPath = path.join(dataPath, 'Stok.db');
    const imagesPath = path.join(dataPath, 'Images');
    const backupDir = path.join(dataPath, 'Backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return { dbPath, imagesPath, backupDir };
  }

  async crearRespaldo() {
    const { dbPath, imagesPath, backupDir } = this.getPaths();
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

      // Mantener solo los últimos 10 respaldos
      this.limpiarRespaldosAntiguos(backupDir);

      return { success: true, path: currentBackupDir };
    } catch (error) {
      console.error('Error en respaldo:', error);
      return { success: false, error: error.message };
    }
  }

  restaurarUltimoRespaldo(reabrir = false) {
    const { dbPath, imagesPath, backupDir } = this.getPaths();
    if (!fs.existsSync(backupDir)) return { success: false, error: 'No existe carpeta de respaldos' };

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_')) // Aceptamos carpetas y archivos antiguos
      .sort()
      .reverse(); // El más nuevo primero

    if (files.length === 0) return { success: false, error: 'No hay respaldos para restaurar' };

    const ultimoBackupPath = path.join(backupDir, files[0]);
    const stats = fs.statSync(ultimoBackupPath);

    try {
      db.close(); // Cerrar conexión actual
      
      if (stats.isDirectory()) {
        // --- Restauración Nuevo Formato (Carpeta) ---
        
        // 1. Restaurar DB
        const dbSource = path.join(ultimoBackupPath, 'Stok.db');
        if (fs.existsSync(dbSource)) {
          fs.copyFileSync(dbSource, dbPath);
        }

        // 2. Restaurar Imágenes
        const imagesSource = path.join(ultimoBackupPath, 'Images');
        if (fs.existsSync(imagesSource)) {
          if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true });
          this.copyRecursiveSync(imagesSource, imagesPath);
        }

      } else {
        // --- Soporte Legacy (Archivo .db antiguo) ---
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
    const { backupDir } = this.getPaths();
    await shell.openPath(backupDir);
  }
}

module.exports = new BackupService();