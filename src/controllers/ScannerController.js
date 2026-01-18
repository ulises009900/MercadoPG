/**
 * ScannerController - Controlador de la ventana de escáner (pantalla rápida)
 */
class ScannerController {
  constructor() {
    this.api = window.api;
    this.codigo = null;
    this.articulo = null;
    this.config = { ivaGlobal: 21, cotizacionUsd: 1000 };
    this.accionPendiente = null; // Para saber si es 'vender' o 'agregar'
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    
    // Escuchar el evento que envía el código escaneado desde el proceso principal
    this.api.on('load-scanner-articulo', (codigo) => {
      if (codigo) {
        this.codigo = codigo;
        this.cargarDatos(codigo);
      }
    });

    // Escuchar actualizaciones externas (ej. si se edita el precio en otra ventana)
    this.api.on('reload-data', async (codigo) => {
      await this.cargarConfiguracion();
      // Si es una actualización general (sin código) o específica de este artículo
      if (!codigo || codigo === this.codigo) {
        if (this.codigo) this.cargarDatos(this.codigo);
      }
    });
  }

  setupEventListeners() {
    // Botones de acción
    const btnModificar = document.getElementById('btnModificar');
    if (btnModificar) btnModificar.addEventListener('click', () => this.modificar());

    const btnVender = document.getElementById('btnVender');
    if (btnVender) btnVender.addEventListener('click', () => this.vender());

    const btnAgregar = document.getElementById('btnAgregar');
    if (btnAgregar) btnAgregar.addEventListener('click', () => this.agregar());
    
    // Cerrar con tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });

    // Cerrar con botón (si existe)
    const btnCerrar = document.getElementById('btnCerrar');
    if (btnCerrar) btnCerrar.addEventListener('click', () => window.close());

    // Listeners del Modal de Cantidad
    const btnModalCancelar = document.getElementById('btnModalCancelar');
    if (btnModalCancelar) btnModalCancelar.addEventListener('click', () => this.cerrarModal());

    const btnModalAceptar = document.getElementById('btnModalAceptar');
    if (btnModalAceptar) btnModalAceptar.addEventListener('click', () => this.confirmarAccion());

    const inputCantidad = document.getElementById('inputCantidad');
    if (inputCantidad) {
      inputCantidad.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.confirmarAccion();
        if (e.key === 'Escape') this.cerrarModal();
      });
    }
  }

  async cargarConfiguracion() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if (result.success) {
      this.config = result.data;
      // Aplicar tema visual
      document.documentElement.style.setProperty('--background-color', this.config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', this.config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', this.config.colorTexto);
    }
  }

  async cargarDatos(codigo) {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'obtener', codigo);
    if (result.success && result.data) {
      this.articulo = result.data;
      this.renderizar();
    } else {
      alert('El artículo no se encuentra disponible.');
      window.close();
    }
  }

  renderizar() {
    if (!this.articulo) return;
    
    // Mostrar datos básicos
    const lblDescripcion = document.getElementById('lblDescripcion');
    if (lblDescripcion) lblDescripcion.textContent = this.articulo.descripcion;
    
    const lblStock = document.getElementById('lblStock');
    if (lblStock) {
      lblStock.textContent = this.articulo.stock;
      
      // Alerta visual de stock bajo
      if (this.articulo.stock <= this.articulo.stockMinimo) {
        lblStock.style.color = 'red';
        lblStock.style.fontWeight = 'bold';
      } else {
        lblStock.style.color = 'inherit';
        lblStock.style.fontWeight = 'normal';
      }
    }

    // Calcular y mostrar precios
    const { precioFinal, precioUsd } = this.calcularPrecios(this.articulo);
    
    const lblPrecioArs = document.getElementById('lblPrecioArs');
    if (lblPrecioArs) lblPrecioArs.textContent = `$ ${precioFinal.toFixed(2)}`;
    
    const lblPrecioUsd = document.getElementById('lblPrecioUsd');
    if (lblPrecioUsd) lblPrecioUsd.textContent = `u$s ${precioUsd.toFixed(2)}`;
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

  modificar() {
    if (this.codigo) {
      // Abre el formulario de edición y cierra esta ventana rápida
      this.api.send('open-articulo-form', this.codigo);
      window.close();
    }
  }

  vender() {
    this.abrirModal('vender');
  }

  agregar() {
    this.abrirModal('agregar');
  }

  abrirModal(accion) {
    this.accionPendiente = accion;
    const modal = document.getElementById('cantidadModal');
    const title = document.getElementById('modalTitle');
    const btnAceptar = document.getElementById('btnModalAceptar');
    const input = document.getElementById('inputCantidad');

    if (!modal) return;

    if (accion === 'vender') {
      title.textContent = `VENDER (Restar)`;
      title.style.backgroundColor = 'var(--danger-color)';
      btnAceptar.style.backgroundColor = 'var(--danger-color)';
    } else {
      title.textContent = `AGREGAR (Sumar)`;
      title.style.backgroundColor = 'var(--success-color)';
      btnAceptar.style.backgroundColor = 'var(--success-color)';
    }

    input.value = 1;
    modal.style.display = 'flex';
    
    // Dar foco al input para escribir rápido
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }

  cerrarModal() {
    const modal = document.getElementById('cantidadModal');
    if (modal) modal.style.display = 'none';
    this.accionPendiente = null;
  }

  async confirmarAccion() {
    const input = document.getElementById('inputCantidad');
    const cantidad = parseInt(input.value);
    
    if (isNaN(cantidad) || cantidad <= 0) return alert('Cantidad inválida');

    const accion = this.accionPendiente;
    this.cerrarModal();

    const metodo = accion === 'vender' ? 'salida' : 'entrada';
    const result = await this.api.invoke('service-call', 'StockService', metodo, this.codigo, cantidad);

    if (result.success) {
      await this.cargarDatos(this.codigo);
      this.api.send('reload-data', this.codigo);
    } else {
      alert('Error: ' + result.error);
    }
  }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  new ScannerController();
});