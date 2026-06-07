const db = require('../repositories/DatabaseRepository');
const { Proveedor } = require('../models');

/**
 * ProveedorService - Lógica de negocio para proveedores
 */
class ProveedorService {
  /**
   * Lista todos los proveedores ordenados alfabéticamente
   * @returns {Proveedor[]}
   */
  listar() {
    try {
      const sql = 'SELECT id, nombre, contacto FROM proveedores ORDER BY nombre ASC';
      const rows = db.query(sql);
      return rows.map(row => Proveedor.fromDatabase(row));
    } catch (error) {
      console.error('Error al listar proveedores:', error.message);
      return [];
    }
  }

  /**
   * Agrega un nuevo proveedor
   * @param {string} nombre - Nombre del proveedor
   * @param {string} contacto - Contacto del proveedor
   * @returns {number} - ID del proveedor insertado
   */
  agregar(nombre, contacto = '') {
    try {
      // Verificar si ya existe
      const checkSql = 'SELECT id FROM proveedores WHERE nombre = ? LIMIT 1';
      const existing = db.queryOne(checkSql, [nombre]);
      
      if (existing) {
        return existing.id;
      }

      // Insertar nuevo
      const sql = 'INSERT INTO proveedores (nombre, contacto) VALUES (?, ?)';
      const result = db.execute(sql, [nombre, contacto]);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error al agregar proveedor:', error.message);
      return -1;
    }
  }

  /**
   * Obtiene un proveedor por ID
   * @param {number} id - ID del proveedor
   * @returns {Proveedor|null}
   */
  obtener(id) {
    const sql = 'SELECT id, nombre, contacto FROM proveedores WHERE id = ?';
    const row = db.queryOne(sql, [id]);
    return row ? Proveedor.fromDatabase(row) : null;
  }

  /**
   * Actualiza un proveedor
   * @param {number} id - ID del proveedor
   * @param {string} nombre - Nuevo nombre
   * @param {string} contacto - Nuevo contacto
   */
  actualizar(id, nombre, contacto) {
    const sql = 'UPDATE proveedores SET nombre = ?, contacto = ? WHERE id = ?';
    db.execute(sql, [nombre, contacto, id]);
  }

  /**
   * Elimina un proveedor
   * @param {number} id - ID del proveedor
   */
  eliminar(id) {
    const sql = 'DELETE FROM proveedores WHERE id = ?';
    db.execute(sql, [id]);
  }
}

module.exports = new ProveedorService();
