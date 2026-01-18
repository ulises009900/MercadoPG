/**
 * Modelo: ArticuloRanking
 * Representa un artículo con su ranking de ventas
 */
class ArticuloRanking {
  constructor(data = {}) {
    this.codigo = data.codigo || '';
    this.descripcion = data.descripcion || '';
    this.vendidos = data.vendidos || 0;
  }

  /**
   * Crea una instancia desde datos de BD
   * @param {Object} row - Fila de la base de datos
   * @returns {ArticuloRanking}
   */
  static fromDatabase(row) {
    return new ArticuloRanking({
      codigo: row.codigo,
      descripcion: row.descripcion,
      vendidos: row.vendidos
    });
  }
}

module.exports = ArticuloRanking;
