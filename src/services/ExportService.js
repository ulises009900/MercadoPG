const ArticuloService = require('./ArticuloService');
const fs = require('fs');
const path = require('path');

/**
 * ExportService - Servicio de exportación de datos
 */
class ExportService {
  /**
   * Exporta artículos a CSV
   * @param {string} nombreArchivo - Nombre del archivo a crear
   * @returns {string} - Ruta del archivo creado
   */
  exportarCSV(nombreArchivo = 'stock.csv') {
    const articulos = ArticuloService.listar();
    
    // Encabezados
    const headers = [
      'Código',
      'Descripción',
      'Costo',
      'Ganancia %',
      'IVA %',
      'Stock',
      'Stock Mínimo',
      'Marca ID',
      'Proveedor ID'
    ];

    // Construir CSV
    let csv = headers.join(',') + '\n';
    
    articulos.forEach(art => {
      const row = [
        `"${art.codigo}"`,
        `"${art.descripcion}"`,
        art.costo,
        art.ganancia,
        art.iva,
        art.stock,
        art.stockMinimo,
        art.marcaId || '',
        art.proveedorId || ''
      ];
      csv += row.join(',') + '\n';
    });

    // Guardar archivo
    const filePath = path.join(process.cwd(), nombreArchivo);
    fs.writeFileSync(filePath, csv, 'utf8');
    
    return filePath;
  }

  /**
   * Exporta historial de movimientos a CSV
   * @param {string} nombreArchivo - Nombre del archivo a crear
   * @returns {string} - Ruta del archivo creado
   */
  exportarHistorialCSV(nombreArchivo = 'historial.csv') {
    const StockService = require('./StockService');
    const movimientos = StockService.historialCompleto();
    
    // Encabezados
    const headers = ['ID', 'Código', 'Cantidad', 'Tipo', 'Fecha'];

    // Construir CSV
    let csv = headers.join(',') + '\n';
    
    movimientos.forEach(mov => {
      const row = [
        mov.id,
        `"${mov.codigo}"`,
        mov.cantidad,
        mov.tipo,
        `"${mov.fecha}"`
      ];
      csv += row.join(',') + '\n';
    });

    // Guardar archivo
    const filePath = path.join(process.cwd(), nombreArchivo);
    fs.writeFileSync(filePath, csv, 'utf8');
    
    return filePath;
  }
}

module.exports = new ExportService();
