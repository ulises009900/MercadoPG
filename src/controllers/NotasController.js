class NotasController {
  constructor() {
    this.api = window.api;
    this.notas = [];
    this.notaActual = null;
    this.saveTimeout = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    await this.cargarNotas();

    this.api.on('reload-data', () => this.cargarNotas());
  }

  setupEventListeners() {
    document.getElementById('btnNuevaNota').addEventListener('click', () => this.crearNota());
    document.getElementById('btnEliminarNota').addEventListener('click', () => this.eliminarNota());
    document.getElementById('btnCerrar').addEventListener('click', () => window.close());

    // Guardado automático
    document.getElementById('editTitulo').addEventListener('input', () => this.planificarGuardado());
    document.getElementById('editContenido').addEventListener('input', () => this.planificarGuardado());
    
    // Modal
    document.getElementById('btnSelectNormal').onclick = () => this.confirmarCreacion('normal');
    document.getElementById('btnSelectCheck').onclick = () => this.confirmarCreacion('checklist');
    document.getElementById('btnCancelModal').onclick = () => {
      document.getElementById('newNotaTitle').value = '';
      document.getElementById('typeModal').style.display = 'none';
    };
    document.getElementById('btnCerrarEditor').onclick = () => { 
      this.guardarCambios();
      document.getElementById('editorModal').style.display = 'none'; 
    };

    document.getElementById('btnAddCheckItem').addEventListener('click', () => {
      this.agregarItemChecklist();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('typeModal').style.display = 'none';
        document.getElementById('editorModal').style.display = 'none';
      }
    });
  }

  async cargarConfiguracion() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if (result.success) {
      const config = result.data;
      document.documentElement.style.setProperty('--background-color', config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', config.colorTexto);
    }
  }

  async cargarNotas() {
    const result = await this.api.invoke('service-call', 'NotaService', 'listar');
    if (result.success) {
      this.notas = result.data;
      this.renderizarLista();
    }
  }

  renderizarLista() {
    const list = document.getElementById('notasList');
    list.innerHTML = '';
    this.notas.forEach(nota => {
      const div = document.createElement('div');
      div.className = 'nota-item' + (this.notaActual?.id === nota.id ? ' active' : '');
      const icono = nota.tipo === 'checklist' ? '📋' : '📝';
      
      let texto = String(nota.contenido || '');
      if (nota.tipo === 'checklist') {
        try {
          const items = JSON.parse(texto);
          texto = items.map(i => (i.checked ? '☑ ' : '☐ ') + i.text).join(', ');
        } catch { texto = ''; }
      }

      div.innerHTML = `<strong style="color: white;">${icono} ${nota.titulo || 'Sin título'}</strong><br><small style="color: white;">${texto.substring(0, 60)}...</small>`;
      div.onclick = () => this.seleccionarNota(nota);
      list.appendChild(div);
    });
  }

  seleccionarNota(nota) {
    this.notaActual = nota;
    document.getElementById('editorModal').style.display = 'flex';
    document.getElementById('editTitulo').value = nota.titulo;
    document.getElementById('editTitulo').style.color = 'white';
    
    if (nota.tipo === 'checklist') {
      document.getElementById('editContenido').style.display = 'none';
      document.getElementById('checklistEditor').style.display = 'flex';
      document.getElementById('btnAddCheckItem').style.display = 'block';
      this.renderizarChecklist(nota.contenido);
    } else {
      document.getElementById('editContenido').style.display = 'block';
      document.getElementById('checklistEditor').style.display = 'none';
      document.getElementById('btnAddCheckItem').style.display = 'none';
      document.getElementById('editContenido').value = nota.contenido;
      document.getElementById('editContenido').style.color = 'white';
      document.getElementById('editContenido').focus();
    }
    
    this.renderizarLista();
  }

  renderizarChecklist(contenido) {
    const container = document.getElementById('checklistEditor');
    container.innerHTML = '';
    let items = [];
    try { items = JSON.parse(contenido || '[]'); } catch (e) { items = []; }

    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'checklist-item';
      const isChecked = item.checked ? 'checked' : '';
      const style = item.checked ? 'text-decoration: line-through; opacity: 0.6;' : '';
      
      div.innerHTML = `
        <input type="checkbox" ${isChecked}>
        <input type="text" value="${item.text || ''}" placeholder="Tarea..." style="${style} color: white;">
        <button class="danger" style="padding: 2px 8px;">×</button>
      `;

      const check = div.querySelector('input[type="checkbox"]');
      const text = div.querySelector('input[type="text"]');

      check.onchange = () => {
        text.style.textDecoration = check.checked ? 'line-through' : 'none';
        text.style.opacity = check.checked ? '0.6' : '1';
        this.guardarCambios();
      };
      div.querySelector('input[type="text"]').onblur = () => this.guardarCambios();
      div.querySelector('button').onclick = () => { 
        div.remove(); 
        this.guardarCambios(); 
      };
      container.appendChild(div);
    });
  }

  agregarItemChecklist() {
    const container = document.getElementById('checklistEditor');
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.innerHTML = `
      <input type="checkbox">
      <input type="text" placeholder="Nueva tarea..." style="color: white;">
      <button class="danger" style="padding: 2px 8px;">×</button>
    `;
    
    const check = div.querySelector('input[type="checkbox"]');
    const text = div.querySelector('input[type="text"]');

    check.onchange = () => {
      text.style.textDecoration = check.checked ? 'line-through' : 'none';
      text.style.opacity = check.checked ? '0.6' : '1';
      this.guardarCambios();
    };
    text.onblur = () => this.guardarCambios();
    div.querySelector('button').onclick = () => { 
      div.remove(); 
      this.guardarCambios(); 
    };

    container.appendChild(div);
    text.focus();
  }

  async crearNota() {
    document.getElementById('newNotaTitle').value = '';
    document.getElementById('typeModal').style.display = 'flex';
    document.getElementById('newNotaTitle').focus();
  }

  async confirmarCreacion(tipo) {
    const titleInput = document.getElementById('newNotaTitle');
    const titulo = String(titleInput?.value || '').trim();
    if (!titulo) {
      alert('Escribe un título para la nota.');
      titleInput?.focus();
      return;
    }

    document.getElementById('typeModal').style.display = 'none';
    titleInput.value = '';

    const result = await this.api.invoke('service-call', 'NotaService', 'guardar', { 
      titulo, 
      contenido: tipo === 'checklist' ? '[]' : '',
      tipo 
    });

    if (result.success) {
      await this.cargarNotas();
      this.seleccionarNota(result.data);
    } else {
      alert('No se pudo guardar la nota: ' + (result.error || 'Error desconocido'));
    }
  }

  planificarGuardado() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.guardarCambios(), 500);
  }

  async guardarCambios() {
    if (!this.notaActual) return;
    const titulo = document.getElementById('editTitulo').value;
    let contenido = '';

    if (this.notaActual.tipo === 'checklist') {
      const items = [];
      document.querySelectorAll('.checklist-item').forEach(div => {
        items.push({
          checked: div.querySelector('input[type="checkbox"]').checked,
          text: div.querySelector('input[type="text"]').value
        });
      });
      contenido = JSON.stringify(items);
    } else {
      contenido = document.getElementById('editContenido').value;
    }

    if (titulo === this.notaActual.titulo && contenido === this.notaActual.contenido) return;

    const result = await this.api.invoke('service-call', 'NotaService', 'actualizar', this.notaActual.id, { 
      titulo, 
      contenido,
      tipo: this.notaActual.tipo 
    });

    if (!result.success) {
      alert('Error al guardar: ' + result.error);
      return;
    }

    this.notaActual.titulo = titulo;
    this.notaActual.contenido = contenido;
    this.renderizarLista();
  }

  async eliminarNota() {
    if (!this.notaActual) return;
    if (!confirm('¿Eliminar esta nota?')) return;

    const result = await this.api.invoke('service-call', 'NotaService', 'eliminar', this.notaActual.id);
    if (result.success) {
      this.notaActual = null;
      document.getElementById('notaEditor').style.display = 'none';
      document.getElementById('emptyState').style.display = 'flex';
      this.cargarNotas();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => new NotasController());