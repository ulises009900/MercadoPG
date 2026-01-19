/**
 * ConfigController - Controlador de la ventana de configuración
 */
class ConfigController {
  constructor() {
    this.api = window.api;
    this.init();
    this.marcas = [];
    this.proveedores = [];
    this.categorias = [];
  }

  async init() {
    try {
      this.setupEventListeners();
      
      // Habilitar barra de desplazamiento vertical (scrollbar)
      document.body.style.overflowY = 'auto';

      await this.cargarConfiguracion();
      await this.cargarDatosAuxiliares();
      this.renderMassiveUpdateControls();
      this.renderBackupControls(); // Agregar controles de backup
      
      // Ajustar tamaño de ventana para asegurar que se vea todo el contenido
      // Usamos el alto disponible de la pantalla con un margen, o 900px si es grande
      const height = Math.min(900, window.screen.availHeight - 60);
      window.resizeTo(700, height);
    } catch (error) {
      console.error('Error al inicializar ConfigController:', error);
    }
  }

  setupEventListeners() {
    const form = document.getElementById('configForm');
    if (form) form.addEventListener('submit', (e) => this.guardar(e));

    const btnCancelar = document.getElementById('btnCancelar');
    if (btnCancelar) btnCancelar.addEventListener('click', () => window.close());
    
    const btnRestaurar = document.getElementById('btnRestaurar');
    if (btnRestaurar) btnRestaurar.addEventListener('click', () => this.restaurarDefaults());

    // Vista previa en tiempo real de los colores
    const colorInputs = [
      { id: 'colorFondo', prop: '--background-color' },
      { id: 'colorPrimario', prop: '--primary-color' },
      { id: 'colorTexto', prop: '--foreground-color' }
    ];

    colorInputs.forEach(item => {
      const input = document.getElementById(item.id);
      if (input) {
        input.addEventListener('input', (e) => {
          this.actualizarTemaEnTiempoReal();
        });
      }
    });
  }

  async cargarConfiguracion() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if(result.success) {
      const config = result.data;

      // Aplicar tema visual para que coincida con el resto del programa
      document.documentElement.style.setProperty('--background-color', config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', config.colorTexto);

      // Helper para asignar valores de forma segura sin romper el script si falta un input
      const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
      const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };

      setVal('ivaGlobal', config.ivaGlobal);
      setVal('gananciaGlobal', config.gananciaGlobal);
      setVal('moneda', config.moneda);
      setCheck('alertasHabilitadas', config.alertasHabilitadas);
      setVal('colorFondo', config.colorFondo);
      setVal('colorPrimario', config.colorPrimario);
      setVal('colorTexto', config.colorTexto);
      
      // Cargar cotización si existe el campo
      setVal('cotizacionUsd', config.cotizacionUsd);
    } else {
      alert('Error al cargar la configuración: ' + result.error);
    }
  }

  async guardar(e) {
    e.preventDefault();

    try {
      const formData = new FormData(e.target);
      
      // Validar cotización para evitar NaN
      const cotizacionRaw = parseFloat(formData.get('cotizacionUsd'));
      const cotizacionValida = !isNaN(cotizacionRaw) ? cotizacionRaw : undefined;

      const config = {
        ivaGlobal: parseFloat(formData.get('ivaGlobal')),
        gananciaGlobal: parseFloat(formData.get('gananciaGlobal')),
        moneda: formData.get('moneda'),
        alertasHabilitadas: formData.get('alertasHabilitadas') === 'on',
        colorFondo: formData.get('colorFondo'),
        colorPrimario: formData.get('colorPrimario'),
        colorTexto: formData.get('colorTexto'),
        cotizacionUsd: cotizacionValida,
      };
      
      const result = await this.api.invoke('service-call', 'ConfigService', 'guardarTodas', config);

      if (result.success) {
        alert('✓ Configuración guardada');
        this.api.send('reload-data');
        window.close();
      } else {
        alert('Error al guardar: ' + result.error);
      }
    } catch (error) {
      alert('Error al guardar: ' + error.message);
    }
  }

  restaurarDefaults() {
    if (confirm('¿Restaurar configuración por defecto?')) {
      const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
      const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };

      setVal('ivaGlobal', 21);
      setVal('gananciaGlobal', 0);
      setVal('moneda', 'ARS');
      setCheck('alertasHabilitadas', true);
      setVal('colorFondo', '#F5F5F5');
      setVal('colorPrimario', '#0078D4');
      setVal('colorTexto', '#2C3E50');
      setVal('cotizacionUsd', 1000);
      
      this.actualizarTemaEnTiempoReal();
    }
  }

  actualizarTemaEnTiempoReal() {
    const theme = {
      colorFondo: document.getElementById('colorFondo').value,
      colorPrimario: document.getElementById('colorPrimario').value,
      colorTexto: document.getElementById('colorTexto').value
    };
    
    // Aplicar localmente
    document.documentElement.style.setProperty('--background-color', theme.colorFondo);
    document.documentElement.style.setProperty('--primary-color', theme.colorPrimario);
    document.documentElement.style.setProperty('--foreground-color', theme.colorTexto);

    // Difundir a otras ventanas
    this.api.send('preview-theme', theme);
  }

  /**
   * Carga datos auxiliares para los filtros
   */
  async cargarDatosAuxiliares() {
    try {
      const [marcasRes, provRes, catRes] = await Promise.all([
        this.api.invoke('service-call', 'MarcaService', 'listar'),
        this.api.invoke('service-call', 'ProveedorService', 'listar'),
        this.api.invoke('service-call', 'CategoriaService', 'listar')
      ]);
      
      this.marcas = marcasRes.success ? marcasRes.data : [];
      this.proveedores = provRes.success ? provRes.data : [];
      this.categorias = catRes.success ? catRes.data : [];
    } catch (error) {
      console.error('Error cargando datos auxiliares:', error);
    }
  }

  /**
   * Renderiza controles de actualización masiva con filtros
   */
  renderMassiveUpdateControls() {
    const form = document.getElementById('configForm');
    if (!form || document.getElementById('massUpdateSection')) return;

    const fieldset = document.createElement('fieldset');
    fieldset.id = 'massUpdateSection';
    fieldset.style.marginTop = '20px';
    fieldset.style.border = '1px solid #ddd';
    fieldset.style.padding = '10px';
    
    const createRow = (label, idPrefix, defaultVal) => `
      <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
        <label style="display:block; font-weight:bold; margin-bottom:5px;">${label}</label>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <input type="number" id="${idPrefix}Value" placeholder="%" style="width: 70px; padding: 5px;" value="${defaultVal}">
          <select id="${idPrefix}FilterType" style="padding: 5px;">
            <option value="all">Todos los artículos</option>
            <option value="marca">Por Marca</option>
            <option value="proveedor">Por Proveedor</option>
            <option value="categoria">Por Categoría</option>
          </select>
          <select id="${idPrefix}FilterValue" style="padding: 5px; display: none; min-width: 150px;">
            <!-- Options populated dynamically -->
          </select>
          <button type="button" id="${idPrefix}BtnApply" style="padding: 5px 15px; background-color: var(--primary-color, #0078D4); color: white; border: none; cursor: pointer;">Aplicar</button>
        </div>
      </div>
    `;

    fieldset.innerHTML = `
      <legend style="font-weight:bold; padding: 0 5px;">Actualización Masiva de Precios</legend>
      <p style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
        Aplica cambios a artículos NO protegidos.
      </p>
      ${createRow('Actualizar IVA', 'massIva', 21)}
      ${createRow('Actualizar Ganancia', 'massGanancia', 0)}
    `;

    // Insertar antes de los botones de acción (o antes de backup si existe)
    const backupSection = document.getElementById('backupControlsSection');
    if (backupSection) {
      form.insertBefore(fieldset, backupSection);
    } else {
      const buttonsContainer = form.querySelector('.buttons') || form.lastElementChild;
      form.insertBefore(fieldset, buttonsContainer);
    }

    // Event Listeners
    this.setupMassUpdateListeners('massIva', 'actualizarIvaMasivo');
    this.setupMassUpdateListeners('massGanancia', 'actualizarGananciaMasivo');
  }

  setupMassUpdateListeners(prefix, serviceMethod) {
    const typeSelect = document.getElementById(`${prefix}FilterType`);
    const valueSelect = document.getElementById(`${prefix}FilterValue`);
    const btnApply = document.getElementById(`${prefix}BtnApply`);

    typeSelect.addEventListener('change', () => {
      const type = typeSelect.value;
      valueSelect.innerHTML = '';
      valueSelect.style.display = type === 'all' ? 'none' : 'block';

      let data = [];
      if (type === 'marca') data = this.marcas;
      else if (type === 'proveedor') data = this.proveedores;
      else if (type === 'categoria') data = this.categorias;

      data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.nombre;
        valueSelect.appendChild(option);
      });
    });

    btnApply.addEventListener('click', async () => {
      const valor = parseFloat(document.getElementById(`${prefix}Value`).value);
      if (isNaN(valor)) return alert('Ingrese un valor numérico válido');

      const type = typeSelect.value;
      const filtros = {};
      let mensajeFiltro = 'TODOS los artículos';

      if (type !== 'all') {
        const selectedId = parseInt(valueSelect.value);
        const selectedText = valueSelect.options[valueSelect.selectedIndex]?.text;
        
        if (!selectedId) return alert('Seleccione un elemento de la lista');

        if (type === 'marca') filtros.marcaId = selectedId;
        else if (type === 'proveedor') filtros.proveedorId = selectedId;
        else if (type === 'categoria') filtros.categoriaId = selectedId;

        mensajeFiltro = `artículos de ${type.toUpperCase()}: ${selectedText}`;
      }

      const label = prefix === 'massIva' ? 'IVA' : 'Ganancia';
      
      if (confirm(`¿Aplicar ${label} de ${valor}% a ${mensajeFiltro}?`)) {
        try {
          await this.api.invoke('service-call', 'ArticuloService', serviceMethod, valor, filtros);
          alert(`✓ ${label} actualizado correctamente`);
          this.api.send('reload-data');
        } catch (error) {
          alert('Error al actualizar: ' + error.message);
        }
      }
    });
  }

  /**
   * Renderiza controles de backup en el formulario
   */
  renderBackupControls() {
    const form = document.getElementById('configForm');
    if (!form || document.getElementById('backupControlsSection')) return;

    const fieldset = document.createElement('fieldset');
    fieldset.id = 'backupControlsSection';
    fieldset.style.marginTop = '20px';
    fieldset.style.border = '1px solid #ddd';
    fieldset.style.padding = '10px';
    fieldset.innerHTML = `
      <legend style="font-weight:bold; padding: 0 5px;">Copias de Seguridad</legend>
      <div class="form-group">
        <p style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
          El sistema realiza copias automáticas al cerrar y restaura la última al iniciar.
        </p>
        <div style="display: flex; gap: 10px;">
          <button type="button" id="btnCrearRespaldo" style="padding: 8px 15px; cursor: pointer;">💾 Crear Respaldo Ahora</button>
          <button type="button" id="btnAbrirCarpeta" style="padding: 8px 15px; cursor: pointer; background-color: #f39c12; color: white; border: none;">📂 Abrir Carpeta</button>
          <button type="button" id="btnRestaurarRespaldo" style="padding: 8px 15px; cursor: pointer; background-color: #e74c3c; color: white; border: none;">↺ Restaurar Último</button>
        </div>
      </div>
    `;

    // Insertar antes de los botones de acción
    const buttonsContainer = form.querySelector('.buttons') || form.lastElementChild;
    form.insertBefore(fieldset, buttonsContainer);

    document.getElementById('btnCrearRespaldo').addEventListener('click', () => this.crearRespaldoManual());
    document.getElementById('btnAbrirCarpeta').addEventListener('click', () => this.abrirCarpetaRespaldos());
    document.getElementById('btnRestaurarRespaldo').addEventListener('click', () => this.restaurarRespaldoManual());
  }

  async crearRespaldoManual() {
    const result = await this.api.invoke('service-call', 'BackupService', 'crearRespaldo');
    if (result.success) alert('✓ Respaldo creado correctamente');
    else alert('Error: ' + result.error);
  }

  async abrirCarpetaRespaldos() {
    await this.api.invoke('service-call', 'BackupService', 'abrirCarpeta');
  }

  async restaurarRespaldoManual() {
    if (confirm('⚠️ ¿Restaurar el último respaldo?\nSe perderán los cambios no guardados en la sesión actual.')) {
      const result = await this.api.invoke('service-call', 'BackupService', 'restaurarUltimoRespaldo', true);
      if (result.success) {
        alert('✓ Base de datos restaurada. Los datos se han actualizado.');
        this.api.send('reload-data');
      } else {
        alert('Error: ' + result.error);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ConfigController();
});
