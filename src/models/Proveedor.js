/**
 * Modelo: Proveedor
 * Representa un proveedor de productos
 */
class Proveedor {
  constructor(data = {}) {
    this.id = data.id || 0;
    this.nombre = data.nombre || '';
    this.contacto = data.contacto || '';
  }

  /**
   * Valida que el proveedor tenga datos correctos
   * @returns {boolean}
   */
  esValido() {
    return this.nombre && this.nombre.trim() !== '';
  }

  /**
   * Convierte el proveedor a objeto plano para BD
   * @returns {Object}
   */
  toDatabase() {
    return {
      id: this.id > 0 ? this.id : undefined,
      nombre: this.nombre,
      contacto: this.contacto
    };
  }

  /**
   * Crea una instancia desde datos de BD
   * @param {Object} row - Fila de la base de datos
   * @returns {Proveedor}
   */
  static fromDatabase(row) {
    return new Proveedor({
      id: row.id,
      nombre: row.nombre,
      contacto: row.contacto
    });
  }
}

module.exports = Proveedor;
