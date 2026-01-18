/**
 * ConfigController - Controlador de la ventana de configuración
 */
class ConfigController {
  constructor() {
    this.api = window.api;
    this.init();
  }

  async init() {
    try {
      this.setupEventListeners();
      
      // Habilitar barra de desplazamiento vertical (scrollbar)
      document.body.style.overflowY = 'auto';

      await this.cargarConfiguracion();
      
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

    // Botones para aplicar cambios masivos (asegúrate de crear estos botones en tu HTML)
    const btnAplicarIva = document.getElementById('btnAplicarIva');
    if (btnAplicarIva) {
      btnAplicarIva.addEventListener('click', () => this.aplicarIvaMasivo());
    }
    const btnAplicarGanancia = document.getElementById('btnAplicarGanancia');
    if (btnAplicarGanancia) {
      btnAplicarGanancia.addEventListener('click', () => this.aplicarGananciaMasivo());
    }

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

  async aplicarIvaMasivo() {
    const input = document.getElementById('ivaGlobal');
    if (!input) return;
    const iva = parseFloat(input.value);
    if (isNaN(iva)) return alert('Ingrese un valor de IVA válido');

    if (confirm(`¿Está seguro de asignar ${iva}% de IVA a todos los artículos NO protegidos?`)) {
      try {
        await this.api.invoke('service-call', 'ArticuloService', 'actualizarIvaMasivo', iva);
        alert('✓ IVA actualizado en todos los artículos');
        this.api.send('reload-data'); // Recargar tablas abiertas
      } catch (error) {
        alert('Error al actualizar: ' + error.message);
      }
    }
  }

  async aplicarGananciaMasivo() {
    const input = document.getElementById('gananciaGlobal');
    if (!input) return;
    const ganancia = parseFloat(input.value);
    if (isNaN(ganancia)) return alert('Ingrese un valor de ganancia válido');

    if (confirm(`¿Está seguro de asignar ${ganancia}% de Ganancia a todos los artículos NO protegidos?`)) {
      try {
        await this.api.invoke('service-call', 'ArticuloService', 'actualizarGananciaMasivo', ganancia);
        alert('✓ Ganancia actualizada en todos los artículos');
        this.api.send('reload-data'); // Recargar tablas abiertas
      } catch (error) {
        alert('Error al actualizar: ' + error.message);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ConfigController();
});
