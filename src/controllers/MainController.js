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
    this.categorias = [];
    this.config = {};
    this.searchTimeout = null;
    this.sortState = { key: null, direction: 'asc' }; // Estado del ordenamiento
    
    // La API expuesta desde preload.js
    this.api = window.api;

    this.init();
  }

  /**
   * Inicializa el controlador
   */
  async init() {
    this.setupEventListeners();
    // Cargar datos y actualizar cotización al inicio (modo silencioso)
    await this.actualizarTablaCompleta(true);
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
    document.getElementById('btnActualizar').addEventListener('click', () => this.actualizarTablaCompleta());
    // Botón para generar documento Word
    const btnDoc = document.getElementById('btnGenerarDoc');
    if (btnDoc) btnDoc.addEventListener('click', () => this.generarDocumentoAvanzado());

    // Atajos de teclado Globales
    document.addEventListener('keydown', (e) => {
      // F5: Actualizar siempre disponible
      if (e.key === 'F5') {
        e.preventDefault(); // Evitar recarga predeterminada de la ventana
        this.actualizarTablaCompleta();
        return;
      }

      // F2: Nuevo Artículo
      if (e.key === 'F2') {
        e.preventDefault();
        this.nuevoArticulo();
        return;
      }

      // Si el foco está en un input (buscador), no interceptamos flechas ni letras
      const activeElement = document.activeElement;
      const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      if (isInput) {
        if (e.key === 'Escape') {
          activeElement.blur(); // Salir del buscador con Escape
          document.body.focus();
        }
        return;
      }

      // Navegación y acciones de tabla (cuando no se está escribiendo)
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.navegarTabla(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navegarTabla(-1);
          break;
        case 'Enter':
        case 'F3':
          e.preventDefault();
          this.editarArticulo();
          break;
        case 'Delete':
          this.eliminarArticulo();
          break;
        case 'F4':
          this.verHistorial();
          break;
        case 'F6':
        case '+': // Numpad +
          e.preventDefault();
          this.registrarEntrada();
          break;
        case 'F7':
        case '-': // Numpad -
          e.preventDefault();
          this.registrarSalida();
          break;
        case 'F1':
          this.mostrarAyuda();
          break;
        case 'F8':
          this.verRanking();
          break;
        case 'F9':
          this.verFaltantes();
          break;
      }
    });

    // Búsqueda
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.buscar(e.target.value);
      }, 300);
    });

    // Detectar escaneo (Enter) para abrir pantalla rápida
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const texto = e.target.value.trim();
        if (!texto) return;

        // 1. Buscar coincidencia exacta de código
        let articulo = this.articulos.find(a => String(a.codigo) === texto);

        // 2. Si no es exacto, buscar si hay un ÚNICO resultado coincidente (por código parcial o descripción)
        if (!articulo) {
          const coincidencias = this.articulos.filter(art => 
            String(art.codigo).toLowerCase().includes(texto.toLowerCase()) ||
            art.descripcion.toLowerCase().includes(texto.toLowerCase())
          );
          if (coincidencias.length === 1) articulo = coincidencias[0];
        }

        if (articulo) {
          e.preventDefault(); // Evitar comportamiento por defecto
          this.api.send('open-scanner-window', articulo.codigo); // Abrir la nueva pantalla
          e.target.select(); // Seleccionar texto para facilitar el siguiente escaneo
        } else {
          // Si no existe ni es único, verificamos si es una búsqueda general (coincide con descripción)
          const esBusqueda = this.articulos.some(a => a.descripcion.toLowerCase().includes(texto.toLowerCase()));
          
          // Si NO coincide con nada, asumimos que es un código nuevo escaneado
          if (!esBusqueda) {
            if (confirm(`El artículo con código "${texto}" no existe.\n¿Desea cargarlo ahora?`)) {
              e.preventDefault();
              this.api.send('open-articulo-form', { codigo: texto, nuevo: true });
              e.target.select();
            }
          }
        }
      }
    });

    // Escuchar eventos de actualización
    this.api.on('reload-data', async (codigo) => {
      await this.aplicarTema();
      await this.cargarDatos();

      // Restaurar búsqueda si existe para mantener el filtro visual
      const searchInput = document.getElementById('searchInput');
      if (searchInput && searchInput.value.trim() !== '') {
        this.buscar(searchInput.value);
      }

      // Si recibimos un código (nuevo artículo o editado), lo buscamos y resaltamos
      if (codigo && typeof codigo === 'string') {
        const row = document.querySelector(`tr[data-codigo="${codigo}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.seleccionarArticulo(row, this.articulos.find(a => a.codigo === codigo));
        }
      }
    });

    // Escuchar vista previa de tema
    this.api.on('preview-theme', (theme) => {
      document.documentElement.style.setProperty('--background-color', theme.colorFondo);
      document.documentElement.style.setProperty('--primary-color', theme.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', theme.colorTexto);
    });

    // Eventos de ordenamiento en columnas
    document.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (key) this.handleSort(key);
      });
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
      const [articulosRes, marcasRes, proveedoresRes, categoriasRes] = await Promise.all([
        this.api.invoke('service-call', 'ArticuloService', 'listar'),
        this.api.invoke('service-call', 'MarcaService', 'listar'),
        this.api.invoke('service-call', 'ProveedorService', 'listar'),
        this.api.invoke('service-call', 'CategoriaService', 'listar')
      ]);

      if (!articulosRes.success || !marcasRes.success || !proveedoresRes.success || !categoriasRes.success) {
        throw new Error('No se pudieron cargar los datos maestros.');
      }

      this.articulos = articulosRes.data;
      this.marcas = marcasRes.data;
      this.proveedores = proveedoresRes.data;
      this.categorias = categoriasRes.data;
      
      this.articulosFiltrados = [...this.articulos];
      this.aplicarOrdenamiento(); // Aplicar orden si ya existía
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
    this.actualizarIndicadoresOrden();
  }

  /**
   * Navega por la tabla con el teclado
   * @param {number} direccion - 1 para abajo, -1 para arriba
   */
  navegarTabla(direccion) {
    if (this.articulosFiltrados.length === 0) return;

    let nuevoIndex = 0;
    
    // Si hay seleccionados, buscar el índice del último seleccionado
    if (this.seleccionados.length > 0) {
      const ultimoSeleccionado = this.seleccionados[this.seleccionados.length - 1];
      const indexActual = this.articulosFiltrados.findIndex(a => a.codigo === ultimoSeleccionado.codigo);
      
      if (indexActual !== -1) {
        nuevoIndex = indexActual + direccion;
      }
    }

    // Validar límites
    if (nuevoIndex < 0) nuevoIndex = 0;
    if (nuevoIndex >= this.articulosFiltrados.length) nuevoIndex = this.articulosFiltrados.length - 1;

    // Seleccionar visualmente
    const articulo = this.articulosFiltrados[nuevoIndex];
    const row = document.querySelector(`tr[data-codigo="${articulo.codigo}"]`);
    
    if (row) {
      this.seleccionarArticulo(row, articulo);
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
        row.style.backgroundColor = '';
      } else {
        this.seleccionados.push(articulo);
        row.classList.add('selected');
        row.style.backgroundColor = '#0a6183'; // Celeste
      }
    } else {
      document.querySelectorAll('tbody tr').forEach(tr => {
        tr.classList.remove('selected');
        tr.style.backgroundColor = '';
      });
      row.classList.add('selected');
      row.style.backgroundColor = '#0a6183'; // Celeste
      this.seleccionados = [articulo];
    }
  }

  /**
   * Maneja el clic en un encabezado para ordenar
   */
  handleSort(key) {
    // Alternar dirección si es la misma columna, sino resetear a asc
    if (this.sortState.key === key) {
      this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortState.key = key;
      this.sortState.direction = 'asc';
    }
    
    this.aplicarOrdenamiento();
    this.renderizarTabla();
  }

  /**
   * Aplica el ordenamiento actual a articulosFiltrados
   */
  aplicarOrdenamiento() {
    if (!this.sortState.key) return;

    const key = this.sortState.key;
    const dir = this.sortState.direction === 'asc' ? 1 : -1;

    this.articulosFiltrados.sort((a, b) => {
      let valA, valB;

      switch(key) {
        case 'marca':
          valA = (this.marcas.find(m => m.id === a.marcaId)?.nombre || '').toLowerCase();
          valB = (this.marcas.find(m => m.id === b.marcaId)?.nombre || '').toLowerCase();
          break;
        case 'proveedor':
          valA = (this.proveedores.find(p => p.id === a.proveedorId)?.nombre || '').toLowerCase();
          valB = (this.proveedores.find(p => p.id === b.proveedorId)?.nombre || '').toLowerCase();
          break;
        case 'precioFinal':
          valA = this.calcularPrecios(a).precioFinal;
          valB = this.calcularPrecios(b).precioFinal;
          break;
        case 'costo':
        case 'ganancia':
        case 'stock':
        case 'stockMinimo':
        case 'iva':
          valA = parseFloat(a[key]) || 0;
          valB = parseFloat(b[key]) || 0;
          break;
        default: // codigo, descripcion
          valA = (a[key] || '').toString().toLowerCase();
          valB = (b[key] || '').toString().toLowerCase();
      }

      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  /**
   * Actualiza las flechas visuales en los headers
   */
  actualizarIndicadoresOrden() {
    document.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.key === this.sortState.key) {
        th.classList.add(`sorted-${this.sortState.direction}`);
      }
    });
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
    this.aplicarOrdenamiento(); // Re-aplicar orden tras filtrar
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
   * Actualiza todos los datos de la tabla y la cotización
   */
  async actualizarTablaCompleta(silencioso = false) {
    await this.aplicarTema();
    await this.cargarDatos();
    await this.actualizarDolar();
    if (!silencioso) {
      this.mostrarNotificacion('✓ Tabla actualizada correctamente', 'success');
    }
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
   * Genera un documento de Word con opciones de columnas
   */
  async generarDocumentoAvanzado() {
    // Enviamos todos los datos necesarios para que el usuario decida qué y cómo exportar
    this.api.send('open-export-window', {
      articulos: this.articulos,
      marcas: this.marcas,
      proveedores: this.proveedores,
      categorias: this.categorias,
      config: this.config
    });
  }

  /**
   * Abre ventana de configuración
   */
  abrirConfig() {
    this.api.send('open-config');
  }

  /**
   * Muestra la ayuda de atajos
   */
  mostrarAyuda() {
    this.api.send('open-help');
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
    const toast = document.getElementById('update-toast');
    if (toast) {
      toast.textContent = mensaje;
      
      // Cambiar color según el tipo de mensaje
      if (tipo === 'error') toast.style.backgroundColor = '#c0392b'; // Rojo
      else if (tipo === 'warning') toast.style.backgroundColor = '#f39c12'; // Naranja
      else toast.style.backgroundColor = '#28a745'; // Verde (default)

      toast.classList.add('show');

      // Reiniciar el temporizador si ya estaba visible para que no se corte antes
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new MainController();
});
