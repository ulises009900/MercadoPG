const db = require('../repositories/DatabaseRepository');
const ArticuloService = require('./ArticuloService');
const { StockMovimiento } = require('../models');

/**
 * StockService - Lógica de negocio para movimientos de stock
 */
class StockService {
  /**
   * Registra una entrada de stock
   * @param {string} codigo - Código del artículo
   * @param {number} cantidad - Cantidad a ingresar
   * @throws {Error} Si la validación falla
   */
  entrada(codigo, cantidad) {
    // Validar cantidad
    if (cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    // Validar existencia del artículo
    const articulo = ArticuloService.obtener(codigo);
    if (!articulo) {
      throw new Error(`Artículo '${codigo}' no existe`);
    }

    // Ejecutar transacción
    db.transaction(() => {
      // Actualizar stock
      const updateSql = 'UPDATE articulos SET stock = stock + ? WHERE codigo = ?';
      db.execute(updateSql, [cantidad, codigo]);

      // Registrar en historial
      const movimiento = new StockMovimiento({
        codigo,
        cantidad,
        tipo: 'ENTRADA',
        fecha: new Date().toISOString()
      });

      const historialSql = `
        INSERT INTO stock_historial (codigo, cantidad, tipo, fecha)
        VALUES (?, ?, ?, ?)
      `;
      
      const data = movimiento.toDatabase();
      db.execute(historialSql, [data.codigo, data.cantidad, data.tipo, data.fecha]);
    });
  }

  /**
   * Registra una salida de stock
   * @param {string} codigo - Código del artículo
   * @param {number} cantidad - Cantidad a retirar
   * @throws {Error} Si la validación falla o no hay stock suficiente
   */
  salida(codigo, cantidad) {
    // Validar cantidad
    if (cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    // Validar existencia y stock suficiente
    const articulo = ArticuloService.obtener(codigo);
    if (!articulo) {
      throw new Error(`Artículo '${codigo}' no existe`);
    }

    if (articulo.stock < cantidad) {
      throw new Error(
        `Stock insuficiente. Disponible: ${articulo.stock}, Solicitado: ${cantidad}`
      );
    }

    // Ejecutar transacción
    db.transaction(() => {
      // Actualizar stock
      const updateSql = 'UPDATE articulos SET stock = stock - ? WHERE codigo = ?';
      db.execute(updateSql, [cantidad, codigo]);

      // Registrar en historial
      const movimiento = new StockMovimiento({
        codigo,
        cantidad,
        tipo: 'SALIDA',
        fecha: new Date().toISOString()
      });

      const historialSql = `
        INSERT INTO stock_historial (codigo, cantidad, tipo, fecha)
        VALUES (?, ?, ?, ?)
      `;
      
      const data = movimiento.toDatabase();
      db.execute(historialSql, [data.codigo, data.cantidad, data.tipo, data.fecha]);
    });
  }

  /**
   * Obtiene el historial de movimientos de un artículo
   * @param {string} codigo - Código del artículo
   * @returns {StockMovimiento[]}
   */
  historial(codigo) {
    const sql = `
      SELECT id, codigo, cantidad, tipo, fecha
      FROM stock_historial
      WHERE codigo = ?
      ORDER BY id DESC
    `;
    
    const rows = db.query(sql, [codigo]);
    return rows.map(row => StockMovimiento.fromDatabase(row));
  }

  /**
   * Obtiene el historial completo de movimientos
   * @returns {StockMovimiento[]}
   */
  historialCompleto() {
    const sql = `
      SELECT id, codigo, cantidad, tipo, fecha
      FROM stock_historial
      ORDER BY id DESC
    `;
    
    const rows = db.query(sql);
    return rows.map(row => StockMovimiento.fromDatabase(row));
  }
}

module.exports = new StockService();
