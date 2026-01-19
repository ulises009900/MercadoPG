/**
 * HistorialController - Controlador de la ventana de historial
 */
class HistorialController {
  constructor() {
    this.codigo = null;
    this.api = window.api;
    this.config = {};
    this.movimientos = [];
    this.movimientosFiltrados = [];
    this.seleccionadoIndex = -1;
    this.marcasMap = new Map();
    this.proveedoresMap = new Map();
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    
    this.api.on('load-historial', (codigo) => {
      this.codigo = codigo;
      this.cargarHistorial();
    });

    this.api.on('reload-data', async () => {
      await this.cargarConfiguracion();
      this.cargarHistorial();
    });

    // Escuchar vista previa de tema
    this.api.on('preview-theme', (theme) => {
      document.documentElement.style.setProperty('--background-color', theme.colorFondo);
      document.documentElement.style.setProperty('--primary-color', theme.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', theme.colorTexto);
    });
  }

  setupEventListeners() {
    document.getElementById('btnCerrar').addEventListener('click', () => {
      window.close();
    });

    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const btnLimpiarFechas = document.getElementById('btnLimpiarFechas');

    if (searchInput) {
      searchInput.addEventListener('input', () => this.aplicarFiltros());
    }

    if (fechaDesde) fechaDesde.addEventListener('change', () => this.aplicarFiltros());
    if (fechaHasta) fechaHasta.addEventListener('change', () => this.aplicarFiltros());
    if (btnLimpiarFechas) btnLimpiarFechas.addEventListener('click', () => {
      fechaDesde.value = '';
      fechaHasta.value = '';
      this.aplicarFiltros();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
      if (e.key === 'F1') this.api.send('open-help');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navegarTabla(1);
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navegarTabla(-1);
      }
    });
  }

  async cargarConfiguracion() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if (result.success) {
      this.config = result.data;
      document.documentElement.style.setProperty('--background-color', this.config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', this.config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', this.config.colorTexto);
    }
  }

  async cargarHistorial() {
    const serviceName = 'StockService';
    const methodName = this.codigo ? 'historial' : 'historialCompleto';
    const args = this.codigo ? [this.codigo] : [];

    // Cargar datos en paralelo: Movimientos, Marcas y Proveedores
    const [movRes, marcasRes, provRes] = await Promise.all([
      this.api.invoke('service-call', serviceName, methodName, ...args),
      this.api.invoke('service-call', 'MarcaService', 'listar'),
      this.api.invoke('service-call', 'ProveedorService', 'listar')
    ]);

    if (marcasRes.success) marcasRes.data.forEach(m => this.marcasMap.set(m.id, m.nombre));
    if (provRes.success) provRes.data.forEach(p => this.proveedoresMap.set(p.id, p.nombre));

    if (movRes.success) {
      // Obtener artículos relacionados para tener descripciones, marcas y proveedores
      const codigos = [...new Set(movRes.data.map(m => m.codigo))];
      const articulosRes = await this.api.invoke('service-call', 'ArticuloService', 'obtenerMultiples', codigos);
      const articulosMap = new Map();
      
      if (articulosRes.success) {
        articulosRes.data.forEach(a => articulosMap.set(a.codigo, a));
      }

      // Si estamos filtrando por un código específico, actualizar título
      if (this.codigo && articulosMap.has(this.codigo)) {
        const art = articulosMap.get(this.codigo);
        document.getElementById('historialTitle').textContent = 
          `Historial de ${art.codigo} - ${art.descripcion}`;
      }

      // Procesar movimientos para búsqueda
      this.movimientos = movRes.data.map(mov => {
        const articulo = articulosMap.get(mov.codigo);
        const descripcion = articulo ? articulo.descripcion : '';
        const marca = articulo ? (this.marcasMap.get(articulo.marcaId) || '') : '';
        const proveedor = articulo ? (this.proveedoresMap.get(articulo.proveedorId) || '') : '';
        
        // String de búsqueda
        const searchString = `${mov.codigo} ${descripcion} ${marca} ${proveedor} ${mov.tipo} ${mov.fecha}`.toLowerCase();

        return {
          ...mov,
          descripcionFull: descripcion,
          marcaNombre: marca,
          proveedorNombre: proveedor,
          searchString
        };
      });

      // Aplicar filtros actuales (texto y fechas)
      this.aplicarFiltros();
    } else {
      document.getElementById('historialTableBody').innerHTML = `<tr><td colspan="6" class="text-center">Error: ${movRes.error}</td></tr>`;
    }
  }

  aplicarFiltros() {
    const searchInput = document.getElementById('searchInput');
    const fechaDesdeInput = document.getElementById('fechaDesde');
    const fechaHastaInput = document.getElementById('fechaHasta');

    const termino = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const fechaDesde = fechaDesdeInput ? fechaDesdeInput.value : '';
    const fechaHasta = fechaHastaInput ? fechaHastaInput.value : '';

    this.movimientosFiltrados = this.movimientos.filter(mov => {
      // 1. Filtro de texto
      const coincideTexto = !termino || mov.searchString.includes(termino);
      
      // 2. Filtro de fecha
      let coincideFecha = true;
      if (fechaDesde || fechaHasta) {
        // Convertir fecha del movimiento a formato YYYY-MM-DD local para comparar
        const d = new Date(mov.fecha);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const movFechaStr = `${year}-${month}-${day}`;

        if (fechaDesde && movFechaStr < fechaDesde) coincideFecha = false;
        if (fechaHasta && movFechaStr > fechaHasta) coincideFecha = false;
      }

      return coincideTexto && coincideFecha;
    });

    this.renderizarTabla();
  }

  renderizarTabla() {
    const tbody = document.getElementById('historialTableBody');
    tbody.innerHTML = '';
    this.seleccionadoIndex = -1;

    // Asegurar orden descendente por fecha (lo más nuevo arriba)
    this.movimientosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (this.movimientosFiltrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay movimientos registrados</td></tr>';
      return;
    }

    this.movimientosFiltrados.forEach((mov, index) => {
      const row = document.createElement('tr');
      const tipoClass = mov.tipo === 'ENTRADA' ? 'badge success' : 'badge danger';
      
      // Construir info extra (Marca/Proveedor)
      let metaInfo = [];
      if (mov.marcaNombre) metaInfo.push(mov.marcaNombre);
      if (mov.proveedorNombre) metaInfo.push(mov.proveedorNombre);
      const metaHtml = metaInfo.length > 0 
        ? `<div style="font-size: 0.85em; color: #888; margin-top: 2px;">${metaInfo.join(' • ')}</div>` 
        : '';
      
      row.dataset.index = index;
      
      row.innerHTML = `
        <td>${mov.id}</td>
        <td>${mov.codigo}</td>
        <td>
          ${mov.descripcionFull || '-'}
          ${metaHtml}
        </td>
        <td class="text-center">${mov.cantidad}</td>
        <td><span class="${tipoClass}">${mov.tipo}</span></td>
        <td>${new Date(mov.fecha).toLocaleString()}</td>
      `;

      row.addEventListener('click', () => this.seleccionarFila(index));
      tbody.appendChild(row);
    });
  }

  seleccionarFila(index) {
    const rows = document.querySelectorAll('#historialTableBody tr');
    rows.forEach(r => {
      r.classList.remove('selected');
      r.style.backgroundColor = '';
    });
    
    if (index >= 0 && index < rows.length) {
      this.seleccionadoIndex = index;
      const row = rows[index];
      row.classList.add('selected');
      row.style.backgroundColor = '#0a6183'; // Celeste
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  navegarTabla(direccion) {
    if (this.movimientosFiltrados.length === 0) return;
    let nuevoIndex = this.seleccionadoIndex + direccion;
    if (nuevoIndex < 0) nuevoIndex = 0;
    if (nuevoIndex >= this.movimientosFiltrados.length) nuevoIndex = this.movimientosFiltrados.length - 1;
    this.seleccionarFila(nuevoIndex);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HistorialController();
});
