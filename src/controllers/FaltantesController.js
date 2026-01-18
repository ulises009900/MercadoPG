/**
 * FaltantesController - Controlador de la ventana de faltantes
 */
class FaltantesController {
  constructor() {
    this.api = window.api;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarFaltantes();
  }

  setupEventListeners() {
    document.getElementById('btnCerrar').addEventListener('click', () => {
      window.close();
    });
  }

  async cargarFaltantes() {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'listarFaltantes');
    if (result.success) {
      this.renderizarTabla(result.data);
    } else {
      const tbody = document.getElementById('faltantesTableBody');
      tbody.innerHTML = `<tr><td colspan="5" class="text-center">Error: ${result.error}</td></tr>`;
    }
  }

  renderizarTabla(faltantes) {
    const tbody = document.getElementById('faltantesTableBody');
    tbody.innerHTML = '';

    if (faltantes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">✓ Todos los artículos tienen stock suficiente</td></tr>';
      return;
    }

    faltantes.forEach(art => {
      const row = document.createElement('tr');
      const diferencia = art.stockMinimo - art.stock;
      
      row.innerHTML = `
        <td>${art.codigo}</td>
        <td>${art.descripcion}</td>
        <td class="text-center">${art.stock}</td>
        <td class="text-center">${art.stockMinimo}</td>
        <td class="text-center"><span class="badge danger">${diferencia}</span></td>
      `;

      tbody.appendChild(row);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FaltantesController();
});
