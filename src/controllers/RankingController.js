/**
 * RankingController - Controlador de la ventana de ranking
 */
class RankingController {
  constructor() {
    this.api = window.api;
    this.config = {};
    this.ranking = [];
    this.seleccionadoIndex = -1;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    await this.cargarRanking();

    this.api.on('reload-data', async () => {
      await this.cargarConfiguracion();
      this.cargarRanking();
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

  async cargarRanking() {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'listarRankingMasVendidos');
    if (result.success) {
      this.ranking = result.data;
      this.renderizarTabla(result.data);
    } else {
      const tbody = document.getElementById('rankingTableBody');
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">Error: ${result.error}</td></tr>`;
    }
  }

  renderizarTabla(ranking) {
    const tbody = document.getElementById('rankingTableBody');
    tbody.innerHTML = '';
    this.seleccionadoIndex = -1;

    if (ranking.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No hay ventas registradas</td></tr>';
      return;
    }

    ranking.forEach((item, index) => {
      const row = document.createElement('tr');
      row.dataset.index = index;
      
      // Resaltar top 3
      let medalClass = '';
      if (index === 0) medalClass = 'style="background: #FFD700;"'; // Oro
      else if (index === 1) medalClass = 'style="background: #C0C0C0;"'; // Plata
      else if (index === 2) medalClass = 'style="background: #CD7F32;"'; // Bronce
      
      row.innerHTML = `
        <td class="text-center" ${medalClass}><strong>${index + 1}</strong></td>
        <td>${item.codigo}</td>
        <td>${item.descripcion}</td>
        <td class="text-center"><strong>${item.vendidos}</strong></td>
      `;

      row.addEventListener('click', () => this.seleccionarFila(index));
      tbody.appendChild(row);
    });
  }

  seleccionarFila(index) {
    const rows = document.querySelectorAll('#rankingTableBody tr');
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
    if (this.ranking.length === 0) return;
    let nuevoIndex = this.seleccionadoIndex + direccion;
    if (nuevoIndex < 0) nuevoIndex = 0;
    if (nuevoIndex >= this.ranking.length) nuevoIndex = this.ranking.length - 1;
    this.seleccionarFila(nuevoIndex);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RankingController();
});
