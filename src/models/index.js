/**
 * Exporta todos los modelos
 */
const Articulo = require('./Articulo');
const Marca = require('./Marca');
const Proveedor = require('./Proveedor');
const Categoria = require('./Categoria');
const StockMovimiento = require('./StockMovimiento');
const ArticuloRanking = require('./ArticuloRanking');

module.exports = {
  Articulo,
  Marca,
  Proveedor,
  Categoria,
  StockMovimiento,
  ArticuloRanking
};
