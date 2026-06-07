const db = require('../repositories/DatabaseRepository');
const { Marca } = require('../models');

/**
 * MarcaService - Lógica de negocio para marcas
 */
class MarcaService {
  /**
   * Lista todas las marcas ordenadas alfabéticamente
   * @returns {Marca[]}
   */
  listar() {
    try {
      const sql = 'SELECT id, nombre FROM marcas ORDER BY nombre ASC';
      const rows = db.query(sql);
      return rows.map(row => Marca.fromDatabase(row));
    } catch (error) {
      console.error('Error al listar marcas:', error.message);
      return [];
    }
  }

  /**
   * Agrega una nueva marca
   * @param {string} nombre - Nombre de la marca
   * @returns {number} - ID de la marca insertada
   */
  agregar(nombre) {
    try {
      const sql = 'INSERT INTO marcas (nombre) VALUES (?)';
      const result = db.execute(sql, [nombre]);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error al agregar marca:', error.message);
      return -1;
    }
  }

  /**
   * Obtiene una marca por ID
   * @param {number} id - ID de la marca
   * @returns {Marca|null}
   */
  obtener(id) {
    const sql = 'SELECT id, nombre FROM marcas WHERE id = ?';
    const row = db.queryOne(sql, [id]);
    return row ? Marca.fromDatabase(row) : null;
  }

  /**
   * Actualiza una marca
   * @param {number} id - ID de la marca
   * @param {string} nombre - Nuevo nombre
   */
  actualizar(id, nombre) {
    const sql = 'UPDATE marcas SET nombre = ? WHERE id = ?';
    db.execute(sql, [nombre, id]);
  }

  /**
   * Elimina una marca
   * @param {number} id - ID de la marca
   */
  eliminar(id) {
    const sql = 'DELETE FROM marcas WHERE id = ?';
    db.execute(sql, [id]);
  }
}

module.exports = new MarcaService();
