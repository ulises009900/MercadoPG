/**
 * MainController - Controlador de la ventana principal
 */
class MainController {
  constructor() {
    this.articulos = [];
    this.articulosFiltrados = [];
    this.seleccionados = [];
    this.marcas = [];
    this.proveedores = [];
    this.config = {};
    this.searchTimeout = null;
    
    // La API expuesta desde preload.js
    this.api = window.api;

    this.init();
  }

  /**
   * Inicializa el controlador
   */
  async init() {
    this.setupEventListeners();
    await this.aplicarTema();
    await this.cargarDatos();

    // Actualizar cotización al inicio
    this.actualizarDolar();
  }

  /**
   * Configura los event listeners
   */
  setupEventListeners() {
    // Botones de la toolbar
    document.getElementById('btnNuevo').addEventListener('click', () => this.nuevoArticulo());
    document.getElementById('btnEditar').addEventListener('click', () => this.editarArticulo());
    document.getElementById('btnEntrada').addEventListener('click', () => this.registrarEntrada());
    document.getElementById('btnSalida').addEventListener('click', () => this.registrarSalida());
    document.getElementById('btnEliminar').addEventListener('click', () => this.eliminarArticulo());
    document.getElementById('btnHistorial').addEventListener('click', () => this.verHistorial());
    document.getElementById('btnRanking').addEventListener('click', () => this.verRanking());
    document.getElementById('btnFaltantes').addEventListener('click', () => this.verFaltantes());
    document.getElementById('btnExportar').addEventListener('click', () => this.exportar());
    document.getElementById('btnConfig').addEventListener('click', () => this.abrirConfig());
    // 2. Botón para generar documento avanzado (Esta función necesitará refactorización si usa 'fs' o 'path')
    // document.getElementById('btnGenerarDoc').addEventListener('click', () => this.generarDocumentoAvanzado());

    // Búsqueda
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.buscar(e.target.value);
      }, 300);
    });

    // Escuchar eventos de actualización
    this.api.on('reload-data', async (codigo) => {
      await this.aplicarTema();
      await this.cargarDatos();

      // Si recibimos un código (nuevo artículo o editado), lo buscamos y resaltamos
      if (codigo && typeof codigo === 'string') {
        // Limpiar búsqueda visualmente ya que cargarDatos resetea el filtro
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';

        const row = document.querySelector(`tr[data-codigo="${codigo}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.seleccionarArticulo(row, this.articulos.find(a => a.codigo === codigo));
        }
      }
    });
  }

  /**
   * Aplica el tema personalizado
   */
  async aplicarTema() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if (result.success) {
      this.config = result.data;
      document.documentElement.style.setProperty('--background-color', this.config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', this.config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', this.config.colorTexto);
    }
  }

  /**
   * Carga todos los datos necesarios
   */
  async cargarDatos() {
    try {
      const [articulosRes, marcasRes, proveedoresRes] = await Promise.all([
        this.api.invoke('service-call', 'ArticuloService', 'listar'),
        this.api.invoke('service-call', 'MarcaService', 'listar'),
        this.api.invoke('service-call', 'ProveedorService', 'listar')
      ]);

      if (!articulosRes.success || !marcasRes.success || !proveedoresRes.success) {
        throw new Error('No se pudieron cargar los datos maestros.');
      }

      this.articulos = articulosRes.data;
      this.marcas = marcasRes.data;
      this.proveedores = proveedoresRes.data;
      
      this.articulosFiltrados = [...this.articulos];
      this.renderizarTabla();
      this.verificarStockCritico();
    } catch (error) {
      this.mostrarNotificacion('Error al cargar datos: ' + error.message, 'error');
    }
  }

  /**
   * Renderiza la tabla de artículos
   */
  renderizarTabla() {
    const tbody = document.getElementById('articulosTableBody');
    tbody.innerHTML = '';

    const fragment = document.createDocumentFragment();
    this.articulosFiltrados.forEach(articulo => {
      const row = document.createElement('tr');
      row.dataset.codigo = articulo.codigo;
      
      const stockCritico = articulo.stock <= articulo.stockMinimo;
      if (stockCritico) {
        row.classList.add('stock-critico');
      }

      const marca = this.marcas.find(m => m.id === articulo.marcaId);
      const proveedor = this.proveedores.find(p => p.id === articulo.proveedorId);

      const { precioFinal, precioUsd } = this.calcularPrecios(articulo);
      const costo = parseFloat(articulo.costo) || 0;
      const ganancia = parseFloat(articulo.ganancia) || 0;

      row.innerHTML = `
        <td>${articulo.codigo}</td>
        <td>${articulo.descripcion}</td>
        <td>$${costo.toFixed(2)}</td>
        <td>${ganancia.toFixed(2)}%</td>
        <td>
            <div>$ ${precioFinal.toFixed(2)}</div>
            <div style="font-size: 0.85em; color: #2ecc71;">u$s ${precioUsd.toFixed(2)}</div>
        </td>
        <td class="text-center">${articulo.stock}</td>
        <td class="text-center">${articulo.stockMinimo}</td>
        <td>${marca ? marca.nombre : '-'}</td>
        <td>${proveedor ? proveedor.nombre : '-'}</td>
      `;

      row.addEventListener('click', (e) => this.seleccionarArticulo(row, articulo, e));
      row.addEventListener('dblclick', () => this.api.send('open-articulo-form', articulo.codigo));
      fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
  }

  /**
   * Calcula los precios final y en USD para un artículo
   * @param {Object} articulo - Datos del artículo
   * @returns {Object} - { precioFinal, precioUsd }
   */
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

  /**
   * Selecciona un artículo
   */
  seleccionarArticulo(row, articulo, event) {
    const isMultiSelect = event && (event.ctrlKey || event.metaKey);

    if (isMultiSelect) {
      const index = this.seleccionados.findIndex(a => a.codigo === articulo.codigo);
      if (index > -1) {
        this.seleccionados.splice(index, 1);
        row.classList.remove('selected');
      } else {
        this.seleccionados.push(articulo);
        row.classList.add('selected');
      }
    } else {
      document.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('selected'));
      row.classList.add('selected');
      this.seleccionados = [articulo];
    }
  }

  /**
   * Busca artículos
   */
  buscar(termino) {
    if (!termino || termino.trim() === '') {
      this.articulosFiltrados = [...this.articulos];
    } else {
      const busqueda = termino.toLowerCase();
      this.articulosFiltrados = this.articulos.filter(art =>
        art.codigo.toLowerCase().includes(busqueda) ||
        art.descripcion.toLowerCase().includes(busqueda)
      );
    }
    this.renderizarTabla();
  }

  /**
   * Verifica artículos con stock crítico
   */
  verificarStockCritico() {
    if (this.config.alertasHabilitadas) {
      const criticos = this.articulos.filter(art => art.stock <= art.stockMinimo).length;
      if (criticos > 0) {
        this.mostrarNotificacion(
          `⚠️ Hay ${criticos} artículo(s) en stock crítico`,
          'warning'
        );
      }
    }
  }

  /**
   * Abre ventana de nuevo artículo
   */
  nuevoArticulo() {
    this.api.send('open-articulo-form', null);
  }

  /**
   * Abre ventana de edición
   */
  editarArticulo() {
    if (this.seleccionados.length !== 1) {
      this.mostrarNotificacion('Seleccione un único artículo para editar', 'warning');
      return;
    }
    this.api.send('open-articulo-form', this.seleccionados[0].codigo);
  }

  /**
   * Registra entrada de stock
   */
  async registrarEntrada() {
    if (this.seleccionados.length !== 1) {
      this.mostrarNotificacion('Seleccione un único artículo', 'warning');
      return;
    }

    const cantidad = prompt('Cantidad a ingresar:', '1');
    if (cantidad) {
      const result = await this.api.invoke('service-call', 'StockService', 'entrada', this.seleccionados[0].codigo, parseInt(cantidad));
      if (result.success) {
        this.mostrarNotificacion('✓ Entrada registrada', 'success');
        this.cargarDatos();
      } else {
        this.mostrarNotificacion('Error: ' + result.error, 'error');
      }
    }
  }

  /**
   * Registra salida de stock
   */
  async registrarSalida() {
    if (this.seleccionados.length !== 1) {
      this.mostrarNotificacion('Seleccione un único artículo', 'warning');
      return;
    }

    const cantidad = prompt('Cantidad a retirar:', '1');
    if (cantidad) {
      const result = await this.api.invoke('service-call', 'StockService', 'salida', this.seleccionados[0].codigo, parseInt(cantidad));
      if (result.success) {
        this.mostrarNotificacion('✓ Salida registrada', 'success');
        this.cargarDatos();
      } else {
        this.mostrarNotificacion('Error: ' + result.error, 'error');
      }
    }
  }

  /**
   * Elimina artículo seleccionado
   */
  async eliminarArticulo() {
    if (this.seleccionados.length === 0) {
      this.mostrarNotificacion('Seleccione al menos un artículo', 'warning');
      return;
    }

    if (confirm(`¿Eliminar ${this.seleccionados.length} artículo(s)?`)) {
      let errores = 0;
      for (const articulo of this.seleccionados) {
        const result = await this.api.invoke('service-call', 'ArticuloService', 'eliminar', articulo.codigo);
        if (!result.success) errores++;
      }

      if (errores === 0) {
        this.mostrarNotificacion('✓ Artículos eliminados', 'success');
        this.seleccionados = [];
        this.cargarDatos();
      } else {
        this.mostrarNotificacion(`Eliminación completada con ${errores} errores`, 'warning');
        this.cargarDatos();
      }
    }
  }

  /**
   * Abre ventana de historial
   */
  verHistorial() {
    const codigo = this.seleccionados.length === 1 ? this.seleccionados[0].codigo : null;
    this.api.send('open-historial', codigo);
  }

  /**
   * Abre ventana de ranking
   */
  verRanking() {
    this.api.send('open-ranking');
  }

  /**
   * Abre ventana de faltantes
   */
  verFaltantes() {
    this.api.send('open-faltantes');
  }

  /**
   * Exporta a CSV
   */
  async exportar() {
    const result = await this.api.invoke('service-call', 'ExportService', 'exportarCSV', 'stock.csv');
    if (result.success) {
      this.mostrarNotificacion(`✓ Exportado a: ${result.data}`, 'success');
    } else {
      this.mostrarNotificacion('Error al exportar: ' + result.error, 'error');
    }
  }

  /**
   * Abre ventana de configuración
   */
  abrirConfig() {
    this.api.send('open-config');
  }

  /**
   * Actualiza el valor del dólar desde la API
   */
  async actualizarDolar() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'actualizarCotizacionDesdeApi');
    if (result.success && result.data) {
      this.mostrarNotificacion(`Dólar Blue actualizado: $${result.data}`, 'success');
      // Recargar tabla para actualizar precios en USD
      await this.aplicarTema(); // Recarga la config que incluye el dolar
      this.renderizarTabla();
    } else if (!result.success) {
        console.error('No se pudo actualizar el dólar:', result.error);
    }
  }

  /**
   * Muestra una notificación
   */
  mostrarNotificacion(mensaje, tipo = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${tipo}`;
    notification.textContent = mensaje;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new MainController();
});
