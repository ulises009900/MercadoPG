/**
 * RankingController - Controlador de la ventana de ranking
 */
class RankingController {
  constructor() {
    this.api = window.api;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarRanking();
  }

  setupEventListeners() {
    document.getElementById('btnCerrar').addEventListener('click', () => {
      window.close();
    });
  }

  async cargarRanking() {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'listarRankingMasVendidos');
    if (result.success) {
      this.renderizarTabla(result.data);
    } else {
      const tbody = document.getElementById('rankingTableBody');
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">Error: ${result.error}</td></tr>`;
    }
  }

  renderizarTabla(ranking) {
    const tbody = document.getElementById('rankingTableBody');
    tbody.innerHTML = '';

    if (ranking.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No hay ventas registradas</td></tr>';
      return;
    }

    ranking.forEach((item, index) => {
      const row = document.createElement('tr');
      
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

      tbody.appendChild(row);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RankingController();
});
