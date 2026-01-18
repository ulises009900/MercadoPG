/**
 * FaltantesController - Controlador de la ventana de faltantes
 */
class FaltantesController {
  constructor() {
    this.api = window.api;
    this.config = {};
    this.faltantes = [];
    this.seleccionadoIndex = -1;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    await this.cargarFaltantes();

    this.api.on('reload-data', async () => {
      await this.cargarConfiguracion();
      this.cargarFaltantes();
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

  async cargarFaltantes() {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'listarFaltantes');
    if (result.success) {
      this.faltantes = result.data;
      this.renderizarTabla(result.data);
    } else {
      const tbody = document.getElementById('faltantesTableBody');
      tbody.innerHTML = `<tr><td colspan="5" class="text-center">Error: ${result.error}</td></tr>`;
    }
  }

  renderizarTabla(faltantes) {
    const tbody = document.getElementById('faltantesTableBody');
    tbody.innerHTML = '';
    this.seleccionadoIndex = -1;

    if (faltantes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">✓ Todos los artículos tienen stock suficiente</td></tr>';
      return;
    }

    faltantes.forEach((art, index) => {
      const row = document.createElement('tr');
      const diferencia = art.stockMinimo - art.stock;
      
      row.innerHTML = `
        <td>${art.codigo}</td>
        <td>${art.descripcion}</td>
        <td class="text-center">${art.stock}</td>
        <td class="text-center">${art.stockMinimo}</td>
        <td class="text-center"><span class="badge danger">${diferencia}</span></td>
      `;

      row.addEventListener('click', () => this.seleccionarFila(index));
      tbody.appendChild(row);
    });
  }

  seleccionarFila(index) {
    const rows = document.querySelectorAll('#faltantesTableBody tr');
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
    if (this.faltantes.length === 0) return;
    let nuevoIndex = this.seleccionadoIndex + direccion;
    if (nuevoIndex < 0) nuevoIndex = 0;
    if (nuevoIndex >= this.faltantes.length) nuevoIndex = this.faltantes.length - 1;
    this.seleccionarFila(nuevoIndex);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FaltantesController();
});
