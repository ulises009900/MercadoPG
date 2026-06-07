/**
 * Modelo: Marca
 * Representa una marca de productos
 */
class Marca {
  constructor(data = {}) {
    this.id = data.id || 0;
    this.nombre = data.nombre || '';
  }

  /**
   * Valida que la marca tenga datos correctos
   * @returns {boolean}
   */
  esValida() {
    return this.nombre && this.nombre.trim() !== '';
  }

  /**
   * Convierte la marca a objeto plano para BD
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
   * @returns {Marca}
   */
  static fromDatabase(row) {
    return new Marca({
      id: row.id,
      nombre: row.nombre
    });
  }
}

module.exports = Marca;
