const db = require('../repositories/DatabaseRepository');
const Categoria = require('../models/Categoria');

/**
 * CategoriaService - Lógica de negocio para categorías
 */
class CategoriaService {
  /**
   * Lista todas las categorías ordenadas alfabéticamente
   * @returns {Categoria[]}
   */
  listar() {
    try {
      const sql = 'SELECT id, nombre FROM categorias ORDER BY nombre ASC';
      const rows = db.query(sql);
      return rows.map(row => Categoria.fromDatabase(row));
    } catch (error) {
      console.error('Error al listar categorías:', error.message);
      return [];
    }
  }

  /**
   * Agrega una nueva categoría
   * @param {string} nombre - Nombre de la categoría
   * @returns {number} - ID de la categoría insertada
   */
  agregar(nombre) {
    try {
      const sql = 'INSERT INTO categorias (nombre) VALUES (?)';
      const result = db.execute(sql, [nombre]);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error al agregar categoría:', error.message);
      return -1;
    }
  }

  /**
   * Elimina una categoría
   * @param {number} id - ID de la categoría
   */
  eliminar(id) {
    const sql = 'DELETE FROM categorias WHERE id = ?';
    db.execute(sql, [id]);
  }
}

module.exports = new CategoriaService();