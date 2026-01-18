const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * BetterDatabaseRepository - Capa de acceso a datos con better-sqlite3
 */
class BetterDatabaseRepository {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  getDatabasePath() {
    const appDataPath = path.join(process.cwd(), 'Data');
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
    }
    return path.join(appDataPath, 'Stok.db');
  }

  async initialize() {
    if (this.initialized) return;

    const dbPath = this.getDatabasePath();
    const dbExists = fs.existsSync(dbPath);

    try {
      this.db = new Database(dbPath, { verbose: console.log });
      
      if (!dbExists) {
        this.createTables();
      }

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.initialized = true;
    } catch (error) {
      console.error('Error fatal al inicializar la base de datos con better-sqlite3:', error);
      throw error; // Lanzar el error para que el proceso principal sepa que falló
    }
  }

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

    // Migraciones (esto es simple, para una app real se usaría un sistema de migración)
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN imagen TEXT'); } catch (e) {}
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN protegido INTEGER DEFAULT 0'); } catch (e) {}
    try { this.db.exec('ALTER TABLE articulos ADD COLUMN categoriaId INTEGER'); } catch (e) {}
  }
  
  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
    }
  }

  query(sql, params = []) {
    if (!this.db) throw new Error("La base de datos no está inicializada.");
    return this.db.prepare(sql).all(params);
  }

  queryOne(sql, params = []) {
    if (!this.db) throw new Error("La base de datos no está inicializada.");
    return this.db.prepare(sql).get(params);
  }

  execute(sql, params = []) {
    if (!this.db) throw new Error("La base de datos no está inicializada.");
    return this.db.prepare(sql).run(params);
  }

  transaction(callback) {
    if (!this.db) throw new Error("La base de datos no está inicializada.");
    return this.db.transaction(callback)();
  }
}

// Singleton
const instance = new BetterDatabaseRepository();
module.exports = instance;
