/**
 * Exporta todos los servicios
 */
const ArticuloService = require('./ArticuloService');
const MarcaService = require('./MarcaService');
const ProveedorService = require('./ProveedorService');
const CategoriaService = require('./CategoriaService');
const StockService = require('./StockService');
const ConfigService = require('./ConfigService');
const ExportService = require('./ExportService');
const BackupService = require('./BackupService');

module.exports = {
  ArticuloService,
  MarcaService,
  ProveedorService,
  CategoriaService,
  StockService,
  ConfigService,
  ExportService,
  BackupService
};
