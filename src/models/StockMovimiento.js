/**
 * Modelo: StockMovimiento
 * Representa un movimiento de stock (entrada/salida)
 */
class StockMovimiento {
  constructor(data = {}) {
    this.id = data.id || 0;
    this.codigo = data.codigo || '';
    this.cantidad = data.cantidad || 0;
    this.tipo = data.tipo || ''; // 'ENTRADA' o 'SALIDA'
    this.fecha = data.fecha || new Date().toISOString();
  }

  /**
   * Valida que el movimiento sea correcto
   * @returns {boolean}
   */
  esValido() {
    if (!this.codigo || this.codigo.trim() === '') return false;
    if (this.cantidad <= 0) return false;
    if (this.tipo !== 'ENTRADA' && this.tipo !== 'SALIDA') return false;
    return true;
  }

  /**
   * Convierte el movimiento a objeto plano para BD
   * @returns {Object}
   */
  toDatabase() {
    return {
      id: this.id > 0 ? this.id : undefined,
      codigo: this.codigo,
      cantidad: this.cantidad,
      tipo: this.tipo,
      fecha: this.formatearFecha()
    };
  }

  /**
   * Formatea la fecha al formato usado en la BD
   * @returns {string}
   */
  formatearFecha() {
    const fecha = new Date(this.fecha);
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const hours = String(fecha.getHours()).padStart(2, '0');
    const minutes = String(fecha.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Crea una instancia desde datos de BD
   * @param {Object} row - Fila de la base de datos
   * @returns {StockMovimiento}
   */
  static fromDatabase(row) {
    return new StockMovimiento({
      id: row.id,
      codigo: row.codigo,
      cantidad: row.cantidad,
      tipo: row.tipo,
      fecha: row.fecha
    });
  }
}

module.exports = StockMovimiento;
