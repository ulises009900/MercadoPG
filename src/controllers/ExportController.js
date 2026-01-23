/**
 * ExportController - Controlador de la ventana de opciones de exportación
 */
class ExportController {
  constructor() {
    this.api = window.api;
    this.articulos = [];
    this.marcas = [];
    this.proveedores = [];
    this.categorias = [];
    this.config = {};
    this.init();
  }

  async init() {
    try {
      // 1. Obtener los datos que envió la ventana principal
      const data = await this.api.invoke('get-export-data');
      
      if (data && typeof data === 'object') {
        this.articulos = data.articulos || [];
        this.marcas = data.marcas || [];
        this.proveedores = data.proveedores || [];
        this.categorias = data.categorias || [];
        this.config = data.config || {};
        
        // Llenar los desplegables con estos datos
        this.populateCombos();
      }
      
      this.setupEventListeners();
    } catch (error) {
      console.error(error);
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

  /**
   * Rellena los selectores con los datos reales
   */
  populateCombos() {
    const llenarSelect = (id, datos, labelDefault) => {
      const select = document.getElementById(id);
      if (!select) return;

      select.innerHTML = ''; // Limpiar opciones anteriores
      
      // 1. Opción "Todas"
      const optDefault = document.createElement('option');
      optDefault.value = 'all';
      optDefault.textContent = labelDefault;
      select.appendChild(optDefault);

      // 2. Opción "Sin Asignar"
      const optSin = document.createElement('option');
      optSin.value = '0';
      optSin.textContent = 'Sin Asignar / General';
      select.appendChild(optSin);

      // 3. Datos reales ordenados alfabéticamente
      const datosOrdenados = [...datos].sort((a, b) => a.nombre.localeCompare(b.nombre));
      
      datosOrdenados.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.nombre;
        select.appendChild(opt);
      });
    };

    llenarSelect('filterMarca', this.marcas, 'Todas las Marcas');
    llenarSelect('filterProveedor', this.proveedores, 'Todos los Proveedores');
    llenarSelect('filterCategoria', this.categorias, 'Todas las Categorías');
  }

  async generar() {
    const btnGenerar = document.getElementById('btnGenerar');
    btnGenerar.disabled = true;
    btnGenerar.textContent = 'Procesando...';

    try {
      // 1. Obtener valores de los filtros
      const marcaId = document.getElementById('filterMarca').value;
      const proveedorId = document.getElementById('filterProveedor').value;
      const categoriaId = document.getElementById('filterCategoria').value;
      const sortOrder = document.getElementById('sortOrder').value;

      // 2. Filtrar artículos
      let resultado = this.articulos.filter(art => {
        if (marcaId !== 'all' && String(art.marcaId || 0) !== marcaId) return false;
        if (proveedorId !== 'all' && String(art.proveedorId || 0) !== proveedorId) return false;
        if (categoriaId !== 'all' && String(art.categoriaId || 0) !== categoriaId) return false;
        return true;
      });

      if (resultado.length === 0) {
        alert('No se encontraron artículos con los filtros seleccionados.');
        btnGenerar.disabled = false;
        btnGenerar.textContent = 'Generar Documento';
        return;
      }

      // 3. Ordenar resultados
      resultado.sort((a, b) => {
        let valA = '', valB = '';
        switch (sortOrder) {
          case 'marca':
            valA = this.obtenerNombre(this.marcas, a.marcaId);
            valB = this.obtenerNombre(this.marcas, b.marcaId);
            break;
          case 'proveedor':
            valA = this.obtenerNombre(this.proveedores, a.proveedorId);
            valB = this.obtenerNombre(this.proveedores, b.proveedorId);
            break;
          case 'categoria':
            valA = this.obtenerNombre(this.categorias, a.categoriaId);
            valB = this.obtenerNombre(this.categorias, b.categoriaId);
            break;
          default: // general (por código)
            valA = a.codigo;
            valB = b.codigo;
        }
        return valA.localeCompare(valB);
      });

      // 4. Enriquecer datos para el reporte
      const datosReporte = resultado.map(art => {
        const precios = this.calcularPrecios(art);
        return {
          ...art,
          marca: this.obtenerNombre(this.marcas, art.marcaId),
          proveedor: this.obtenerNombre(this.proveedores, art.proveedorId),
          categoria: this.obtenerNombre(this.categorias, art.categoriaId),
          precioFinal: `$ ${precios.precioFinal.toFixed(2)}`,
          precioUsd: `u$s ${precios.precioUsd.toFixed(2)}`
        };
      });

      // 5. Definir columnas seleccionadas
      const columnas = this.obtenerColumnasSeleccionadas();

      // 6. Guardar archivo
      const filePath = await this.api.showSaveDialog({
        title: 'Guardar Reporte',
        defaultPath: `Inventario_${new Date().toISOString().slice(0,10)}.docx`,
        filters: [{ name: 'Documento Word', extensions: ['docx'] }]
      });

      if (filePath) {
        const resp = await this.api.invoke('service-call', 'ExportService', 'exportarWord', datosReporte, columnas, filePath);
        if (resp.success) {
          alert('Documento generado exitosamente.');
          window.close();
        } else {
          alert('Error al generar: ' + resp.error);
        }
      }

    } catch (error) {
      console.error(error);
      alert('Ocurrió un error: ' + error.message);
    } finally {
      btnGenerar.disabled = false;
      btnGenerar.textContent = 'Generar Documento';
    }
  }

  // --- Helpers ---

  obtenerNombre(lista, id) {
    const item = lista.find(x => x.id === (id || 0));
    return item ? item.nombre : '-';
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
    
    const cotizacion = this.config.cotizacionUsd || 1;
    const precioUsd = cotizacion > 0 ? precioFinal / cotizacion : 0;

    return { precioFinal, precioUsd };
  }

  obtenerColumnasSeleccionadas() {
    const cols = [];
    const add = (id, key, label) => {
      const el = document.getElementById(id);
      if (el && el.checked) cols.push({ key, label });
    };

    add('colCodigo', 'codigo', 'Código');
    add('colDescripcion', 'descripcion', 'Descripción');
    add('colStock', 'stock', 'Stock');
    add('colStockMin', 'stockMinimo', 'Mín.');
    add('colCosto', 'costo', 'Costo');
    add('colPrecio', 'precioFinal', 'Precio');
    add('colPrecioUsd', 'precioUsd', 'USD');
    add('colMarca', 'marca', 'Marca');
    add('colProveedor', 'proveedor', 'Proveedor');
    add('colCategoria', 'categoria', 'Categoría');
    
    return cols;
  }
}

new ExportController();