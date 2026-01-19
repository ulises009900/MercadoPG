/**
 * ExportController - Controlador de la ventana de opciones de exportación
 */
class ExportController {
  constructor() {
    this.api = window.api;
    this.datos = [];
    this.marcas = [];
    this.proveedores = [];
    this.categorias = [];
    this.config = {};
    this.init();
  }

  async init() {
    try {
      // 1. Obtener los datos que envió la ventana principal
      this.datos = await this.api.invoke('get-export-data');
      
      // 2. Cargar datos auxiliares para mostrar nombres en lugar de IDs
      const [marcasRes, provRes, catRes, configRes] = await Promise.all([
        this.api.invoke('service-call', 'MarcaService', 'listar'),
        this.api.invoke('service-call', 'ProveedorService', 'listar'),
        this.api.invoke('service-call', 'CategoriaService', 'listar'),
        this.api.invoke('service-call', 'ConfigService', 'obtenerTodas')
      ]);

      this.marcas = marcasRes.success ? marcasRes.data : [];
      this.proveedores = provRes.success ? provRes.data : [];
      this.categorias = catRes.success ? catRes.data : [];
      this.config = configRes.success ? configRes.data : { ivaGlobal: 21, cotizacionUsd: 1000 };

      this.setupEventListeners();

    } catch (error) {
      alert('Error al inicializar: ' + error.message);
    }
  }

  setupEventListeners() {
    document.getElementById('btnGenerar').addEventListener('click', () => this.generar());
    document.getElementById('btnCancelar').addEventListener('click', () => window.close());
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });
  }

  async generar() {
    // 1. Construir lista de columnas seleccionadas
    const columnas = [];
    
    // Columnas fijas
    columnas.push({ key: 'codigo', label: 'Código' });
    columnas.push({ key: 'descripcion', label: 'Descripción' });

    // Columnas opcionales
    if (document.getElementById('colStock').checked) columnas.push({ key: 'stock', label: 'Stock' });
    if (document.getElementById('colStockMin').checked) columnas.push({ key: 'stockMinimo', label: 'Mínimo' });
    if (document.getElementById('colCosto').checked) columnas.push({ key: 'costoFormatted', label: 'Costo' });
    if (document.getElementById('colPrecio').checked) columnas.push({ key: 'precioFinalFormatted', label: 'Precio ARS' });
    if (document.getElementById('colPrecioUsd').checked) columnas.push({ key: 'precioUsdFormatted', label: 'Precio USD' });
    if (document.getElementById('colMarca').checked) columnas.push({ key: 'marcaNombre', label: 'Marca' });
    if (document.getElementById('colProveedor').checked) columnas.push({ key: 'proveedorNombre', label: 'Proveedor' });
    if (document.getElementById('colCategoria').checked) columnas.push({ key: 'categoriaNombre', label: 'Categoría' });

    // 2. Pedir ruta de guardado
    const filePath = await this.api.showSaveDialog({
      title: 'Guardar Reporte Word',
      defaultPath: 'Inventario.docx',
      filters: [{ name: 'Documento de Word', extensions: ['docx'] }]
    });

    if (!filePath) return;

    // 3. Procesar datos (calcular precios y resolver nombres)
    const datosProcesados = this.datos.map(art => {
      const { precioFinal, precioUsd } = this.calcularPrecios(art);
      const marca = this.marcas.find(m => m.id === art.marcaId);
      const proveedor = this.proveedores.find(p => p.id === art.proveedorId);
      const categoria = this.categorias.find(c => c.id === art.categoriaId);

      return {
        ...art,
        costoFormatted: `$${(art.costo || 0).toFixed(2)}`,
        precioFinalFormatted: `$${precioFinal.toFixed(2)}`,
        precioUsdFormatted: `u$s${precioUsd.toFixed(2)}`,
        marcaNombre: marca ? marca.nombre : '-',
        proveedorNombre: proveedor ? proveedor.nombre : '-',
        categoriaNombre: categoria ? categoria.nombre : '-'
      };
    });

    // 4. Llamar al servicio de exportación
    const result = await this.api.invoke('service-call', 'ExportService', 'exportarWord', datosProcesados, columnas, filePath);

    if (result.success) {
      // Usamos alert nativo porque estamos en una ventana modal
      alert('Documento generado exitosamente.');
      window.close();
    } else {
      alert('Error al generar: ' + result.error);
    }
  }

  calcularPrecios(articulo) {
    const costo = parseFloat(articulo.costo) || 0;
    const ganancia = parseFloat(articulo.ganancia) || 0;
    const iva = parseFloat(articulo.iva) || 0;
    const protegido = articulo.protegido;
    const ivaGlobal = (this.config.ivaGlobal || 21) / 100;

    let precioFinal = costo * (1 + ganancia / 100);
    if (protegido) {
      precioFinal = precioFinal * (1 + iva / 100);
    } else {
      precioFinal = precioFinal * (1 + ivaGlobal);
    }
    
    const cotizacion = this.config.cotizacionUsd || 0;
    const precioUsd = cotizacion > 0 ? precioFinal / cotizacion : 0;

    return { precioFinal, precioUsd };
  }
}

new ExportController();