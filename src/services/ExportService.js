const ArticuloService = require('./ArticuloService');
const { app } = require('electron');
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
    const basePath = app ? app.getPath('downloads') : process.cwd();
    const filePath = path.join(basePath, nombreArchivo);
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
    const basePath = app ? app.getPath('downloads') : process.cwd();
    const filePath = path.join(basePath, nombreArchivo);
    fs.writeFileSync(filePath, csv, 'utf8');
    
    return filePath;
  }

  /**
   * Exporta datos a un documento de Word (.docx)
   * @param {Array} datos - Lista de objetos con los datos
   * @param {Array} columnas - Definición de columnas { key, label }
   * @param {string} filePath - Ruta donde guardar
   */
  async exportarWord(datos, columnas, filePath) {
    try {
      // Requerimos docx aquí para no bloquear la app si no está instalada
      const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, BorderStyle, PageOrientation, VerticalAlign, TextRun, AlignmentType, TableLayoutType } = require('docx');

      // Helper para alineación (Números a la derecha, texto a la izquierda)
      const getAlignment = (key) => {
        const k = key.toLowerCase();
        if (k.includes('precio') || k.includes('costo') || k.includes('stock')) return AlignmentType.RIGHT;
        return AlignmentType.LEFT;
      };

      // 1. Crear encabezados
      const headerCells = columnas.map(col => new TableCell({
        children: [new Paragraph({ 
          children: [new TextRun({ text: col.label, bold: true, size: 22 })], // 11pt
          alignment: AlignmentType.CENTER
        })],
        shading: { fill: "E0E0E0" }, // Fondo gris claro
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 120, bottom: 120, left: 100, right: 100 } // Padding interno (espacio)
      }));

      const tableRows = [new TableRow({ children: headerCells, tableHeader: true })];

      // 2. Crear filas de datos
      datos.forEach(item => {
        const cells = columnas.map(col => new TableCell({
          children: [new Paragraph({ 
            children: [new TextRun({ text: String(item[col.key] || ''), size: 20 })], // 10pt
            alignment: getAlignment(col.key)
          })],
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 80, right: 80 } // Padding interno
        }));
        tableRows.push(new TableRow({ children: cells }));
      });

      // Determinar orientación de página basada en cantidad de columnas
      // Si hay muchas columnas, usamos horizontal (Landscape)
      const orientation = columnas.length > 5 ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT;

      // 3. Crear documento
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 }, // Márgenes estrechos (aprox 1.27cm)
              orientation: orientation
            }
          },
          children: [
            new Paragraph({ text: "Reporte de Inventario", heading: "Heading1" }),
            new Paragraph({ text: `Generado el: ${new Date().toLocaleString()}` }),
            new Paragraph({ text: "" }), // Espacio
            new Table({ 
              rows: tableRows, 
              layout: { type: TableLayoutType.AUTOFIT },
              width: { size: 0, type: WidthType.AUTO }
            })
          ],
        }],
      });

      // 4. Guardar archivo
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (error) {
      throw new Error('Error al generar Word (¿instalaste "docx"?): ' + error.message);
    }
  }

  /**
   * Guarda una imagen desde Data URL (Base64)
   * @param {string} filePath - Ruta donde guardar
   * @param {string} dataUrl - String en formato data:image/png;base64,...
   */
  guardarImagen(filePath, dataUrl) {
    // Remover el encabezado del Data URL para obtener solo el base64
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}

module.exports = new ExportService();
