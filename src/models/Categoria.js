/**
 * Modelo: Categoria
 * Representa una categoría de productos
 */
class Categoria {
  constructor(data = {}) {
    this.id = data.id || 0;
    this.nombre = data.nombre || '';
  }

  /**
   * Valida que la categoría tenga datos correctos
   * @returns {boolean}
   */
  esValida() {
    return this.nombre && this.nombre.trim() !== '';
  }

  /**
   * Convierte la categoría a objeto plano para BD
   * @returns {Object}
   */
  toDatabase() {
    return {
      id: this.id > 0 ? this.id : undefined,
      nombre: this.nombre
    };
  }

  /**
   * Crea una instancia desde datos de BD
   * @param {Object} row - Fila de la base de datos
   * @returns {Categoria}
   */
  static fromDatabase(row) {
    return new Categoria({
      id: row.id,
      nombre: row.nombre
    });
  }
}

module.exports = Categoria;