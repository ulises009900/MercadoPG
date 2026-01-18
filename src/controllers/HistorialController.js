/**
 * HistorialController - Controlador de la ventana de historial
 */
class HistorialController {
  constructor() {
    this.codigo = null;
    this.api = window.api;
    this.config = {};
    this.movimientos = [];
    this.seleccionadoIndex = -1;
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

    const movRes = await this.api.invoke('service-call', serviceName, methodName, ...args);

    if (movRes.success) {
      if (this.codigo) {
        const artRes = await this.api.invoke('service-call', 'ArticuloService', 'obtener', this.codigo);
        if (artRes.success && artRes.data) {
          document.getElementById('historialTitle').textContent = 
            `Historial de ${artRes.data.codigo} - ${artRes.data.descripcion}`;
        }
      }
      this.movimientos = movRes.data;
      this.renderizarTabla(movRes.data);
    } else {
      document.getElementById('historialTableBody').innerHTML = `<tr><td colspan="6" class="text-center">Error: ${movRes.error}</td></tr>`;
    }
  }

  async renderizarTabla(movimientos) {
    const tbody = document.getElementById('historialTableBody');
    tbody.innerHTML = '';
    this.seleccionadoIndex = -1;

    if (movimientos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay movimientos registrados</td></tr>';
      return;
    }

    // Para evitar N+1 llamadas, cargamos todos los artículos necesarios de una vez
    const codigos = [...new Set(movimientos.map(m => m.codigo))];
    const articulosRes = await this.api.invoke('service-call', 'ArticuloService', 'obtenerMultiples', codigos);
    const articulosMap = new Map();
    if(articulosRes.success) {
      articulosRes.data.forEach(a => articulosMap.set(a.codigo, a));
    }

    movimientos.forEach((mov, index) => {
      const row = document.createElement('tr');
      const articulo = articulosMap.get(mov.codigo);
      const descripcion = articulo ? articulo.descripcion : '-';
      const tipoClass = mov.tipo === 'ENTRADA' ? 'badge success' : 'badge danger';
      
      row.dataset.index = index;
      
      row.innerHTML = `
        <td>${mov.id}</td>
        <td>${mov.codigo}</td>
        <td>${descripcion}</td>
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
    if (this.movimientos.length === 0) return;
    let nuevoIndex = this.seleccionadoIndex + direccion;
    if (nuevoIndex < 0) nuevoIndex = 0;
    if (nuevoIndex >= this.movimientos.length) nuevoIndex = this.movimientos.length - 1;
    this.seleccionarFila(nuevoIndex);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HistorialController();
});
