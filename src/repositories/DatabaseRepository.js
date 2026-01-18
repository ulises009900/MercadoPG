const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * DatabaseRepository - Capa de acceso a datos con better-sqlite3
 */
class DatabaseRepository {
  constructor() {
    this.db = null;
    this.initialized = false;
    // Eliminamos la inicialización automática para evitar errores de 'app.getPath' antes de 'ready'
  }

  /**
   * Obtiene la ruta de la base de datos
   * @returns {string}
   */
  getDatabasePath() {
    // En producción (instalado) usamos AppData para tener permisos de escritura.
    // En desarrollo usamos la carpeta local del proyecto.
    const basePath = (app && app.isPackaged) ? app.getPath('userData') : process.cwd();
    const appDataPath = path.join(basePath, 'Data');
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
    }
    return path.join(appDataPath, 'Stok.db');
  }

  /**
   * Inicializa la conexión a la base de datos
   */
  initialize() {
    if (this.initialized) return;
    console.log('Inicializando conexión a base de datos...');

    const dbPath = this.getDatabasePath();
    const dbExists = fs.existsSync(dbPath);

    try {
      this.db = new Database(dbPath); // Modo síncrono y rápido
      
      // Verificar si las tablas existen realmente (por si el archivo existe pero está vacío)
      const tablesExist = this.db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='articulos'").get().count > 0;

      if (!dbExists || !tablesExist) {
        this.createTables();
      }

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.initialized = true;
    } catch (error) {
      console.error('Error fatal al inicializar la base de datos con better-sqlite3:', error);
      throw error; // Lanzar el error para que main.js pueda mostrar una alerta visual
    }
  }

  /**
   * Crea las tablas necesarias en la BD
   */
  createTables() {
    const sqlStatements = [
      `CREATE TABLE IF NOT EXISTS marcas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS proveedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        contacto TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS articulos (
        codigo TEXT PRIMARY KEY,
        descripcion TEXT NOT NULL,
        costo REAL NOT NULL,
        ganancia REAL NOT NULL,
        iva REAL NOT NULL,
        stock INTEGER NOT NULL,
        stock_minimo INTEGER NOT NULL,
        marcaId INTEGER,
        proveedorId INTEGER,
        categoriaId INTEGER,
        imagen TEXT,
        protegido INTEGER DEFAULT 0,
        FOREIGN KEY (marcaId) REFERENCES marcas(id) ON DELETE SET NULL,
        FOREIGN KEY (proveedorId) REFERENCES proveedores(id) ON DELETE SET NULL,
        FOREIGN KEY (categoriaId) REFERENCES categorias(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS stock_historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        cantidad INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        fecha TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS config (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      )`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('IVA_GLOBAL', '21')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('MONEDA', 'ARS')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('ALERT_ENABLED', 'true')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('BACKGROUND_COLOR', '#F5F5F5')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('PRIMARY_COLOR', '#0078D4')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('FOREGROUND_COLOR', '#2C3E50')`,
      `INSERT OR IGNORE INTO config (clave, valor) VALUES ('COTIZACION_USD', '1000')`
    ];

    const transaction = this.db.transaction((stmts) => {
      for (const sql of stmts) {
        this.db.prepare(sql).run();
      }
    });
    transaction(sqlStatements);

    // Migraciones
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN imagen TEXT'); } catch (e) {}
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN protegido INTEGER DEFAULT 0'); } catch (e) {}
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN categoriaId INTEGER'); } catch (e) {}
  }

  /**
   * Obtiene la instancia de la base de datos
   * @returns {Database}
   */
  getConnection() {
    // Corrección crítica: Si this.db es null, forzamos la reinicialización
    // sin importar lo que diga this.initialized
    if (!this.db) {
      this.initialized = false;
    }

    if (!this.initialized) {
      this.initialize();
    }
    if (!this.db) throw new Error("La base de datos no está inicializada.");
    return this.db;
  }

  /**
   * Guarda los cambios en el disco duro
   */
  saveDatabase() {
    // No es necesario con better-sqlite3 (guarda automáticamente)
  }

  /**
   * Cierra la conexión a la base de datos
   */
  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
    }
  }

  /**
   * Ejecuta una consulta preparada
   * @param {string} sql - Consulta SQL
   * @param {Array} params - Parámetros de la consulta
   * @returns {Array} - Resultados
   */
  query(sql, params = []) {
    return this.getConnection().prepare(sql).all(params);
  }

  /**
   * Ejecuta una consulta que retorna una sola fila
   * @param {string} sql - Consulta SQL
   * @param {Array} params - Parámetros de la consulta
   * @returns {Object|null} - Resultado
   */
  queryOne(sql, params = []) {
    const result = this.getConnection().prepare(sql).get(params);
    return result || null;
  }

  /**
   * Ejecuta una consulta de modificación (INSERT, UPDATE, DELETE)
   * @param {string} sql - Consulta SQL
   * @param {Array} params - Parámetros de la consulta
   * @returns {Object} - Info de la ejecución
   */
  execute(sql, params = []) {
    return this.getConnection().prepare(sql).run(params);
  }

  /**
   * Ejecuta una transacción
   * @param {Function} callback - Función que contiene las operaciones
   * @returns {*} - Resultado del callback
   */
  transaction(callback) {
    return this.getConnection().transaction(callback)();
  }
}

// Singleton
const instance = new DatabaseRepository();
module.exports = instance;
