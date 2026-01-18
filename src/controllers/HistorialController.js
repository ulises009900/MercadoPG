/**
 * HistorialController - Controlador de la ventana de historial
 */
class HistorialController {
  constructor() {
    this.codigo = null;
    this.api = window.api;
    this.init();
  }

  init() {
    this.setupEventListeners();
    
    this.api.on('load-historial', (codigo) => {
      this.codigo = codigo;
      this.cargarHistorial();
    });
  }

  setupEventListeners() {
    document.getElementById('btnCerrar').addEventListener('click', () => {
      window.close();
    });
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
      this.renderizarTabla(movRes.data);
    } else {
      document.getElementById('historialTableBody').innerHTML = `<tr><td colspan="6" class="text-center">Error: ${movRes.error}</td></tr>`;
    }
  }

  async renderizarTabla(movimientos) {
    const tbody = document.getElementById('historialTableBody');
    tbody.innerHTML = '';

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

    movimientos.forEach(mov => {
      const row = document.createElement('tr');
      const articulo = articulosMap.get(mov.codigo);
      const descripcion = articulo ? articulo.descripcion : '-';
      const tipoClass = mov.tipo === 'ENTRADA' ? 'badge success' : 'badge danger';
      
      row.innerHTML = `
        <td>${mov.id}</td>
        <td>${mov.codigo}</td>
        <td>${descripcion}</td>
        <td class="text-center">${mov.cantidad}</td>
        <td><span class="${tipoClass}">${mov.tipo}</span></td>
        <td>${new Date(mov.fecha).toLocaleString()}</td>
      `;

      tbody.appendChild(row);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HistorialController();
});
