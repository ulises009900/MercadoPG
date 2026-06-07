const db = require('../repositories/DatabaseRepository');

/**
 * ConfigService - Servicio de configuración de la aplicación
 */
class ConfigService {
  /**
   * Obtiene un valor de configuración
   * @param {string} clave - Clave de configuración
   * @returns {string} - Valor almacenado
   */
  get(clave) {
    const sql = 'SELECT valor FROM config WHERE clave = ?';
    const row = db.queryOne(sql, [clave]);
    return row ? row.valor : '';
  }

  /**
   * Establece un valor de configuración
   * @param {string} clave - Clave de configuración
   * @param {string} valor - Valor a guardar
   */
  set(clave, valor) {
    const sql = 'INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)';
    db.execute(sql, [clave, valor]);
  }

  /**
   * Obtiene el IVA global configurado
   * @returns {number}
   */
  get ivaGlobal() {
    const valor = this.get('IVA_GLOBAL');
    const iva = parseFloat(valor);
    return isNaN(iva) ? 21 : iva;
  }

  /**
   * Establece el IVA global
   * @param {number} valor - Nuevo valor de IVA
   */
  set ivaGlobal(valor) {
    this.set('IVA_GLOBAL', valor.toString());
  }

  /**
   * Obtiene la ganancia global configurada
   * @returns {number}
   */
  get gananciaGlobal() {
    const valor = this.get('GANANCIA_GLOBAL');
    const ganancia = parseFloat(valor);
    return isNaN(ganancia) ? 0 : ganancia;
  }

  /**
   * Establece la ganancia global
   * @param {number} valor - Nuevo valor de ganancia
   */
  set gananciaGlobal(valor) {
    this.set('GANANCIA_GLOBAL', valor.toString());
  }

  /**
   * Obtiene la moneda configurada
   * @returns {string}
   */
  get moneda() {
    return this.get('MONEDA') || 'ARS';
  }

  /**
   * Establece la moneda
   * @param {string} valor - Nueva moneda
   */
  set moneda(valor) {
    this.set('MONEDA', valor);
  }

  /**
   * Obtiene si las alertas están habilitadas
   * @returns {boolean}
   */
  get alertasHabilitadas() {
    const valor = this.get('ALERT_ENABLED');
    return valor.toLowerCase() === 'true';
  }

  /**
   * Establece si las alertas están habilitadas
   * @param {boolean} valor
   */
  set alertasHabilitadas(valor) {
    this.set('ALERT_ENABLED', valor.toString());
  }

  /**
   * Obtiene el color de fondo
   * @returns {string}
   */
  get colorFondo() {
    return this.get('BACKGROUND_COLOR') || '#F5F5F5';
  }

  /**
   * Establece el color de fondo
   * @param {string} color
   */
  set colorFondo(color) {
    this.set('BACKGROUND_COLOR', color);
  }

  /**
   * Obtiene el color primario
   * @returns {string}
   */
  get colorPrimario() {
    return this.get('PRIMARY_COLOR') || '#0078D4';
  }

  /**
   * Establece el color primario
   * @param {string} color
   */
  set colorPrimario(color) {
    this.set('PRIMARY_COLOR', color);
  }

  /**
   * Obtiene el color de texto
   * @returns {string}
   */
  get colorTexto() {
    return this.get('FOREGROUND_COLOR') || '#2C3E50';
  }

  /**
   * Establece el color de texto
   * @param {string} color
   */
  set colorTexto(color) {
    this.set('FOREGROUND_COLOR', color);
  }

  /**
   * Obtiene la cotización del USD
   * @returns {number}
   */
  get cotizacionUsd() {
    const valor = this.get('COTIZACION_USD');
    const cotizacion = parseFloat(valor);
    return isNaN(cotizacion) ? 1000 : cotizacion;
  }

  /**
   * Establece la cotización del USD
   * @param {number} valor
   */
  set cotizacionUsd(valor) {
    this.set('COTIZACION_USD', valor.toString());
  }

  /**
   * Obtiene la configuración de columnas visibles (JSON string)
   * @returns {string}
   */
  get columnasVisibles() {
    return this.get('COLUMNAS_VISIBLES');
  }

  /**
   * Establece la configuración de columnas visibles
   * @param {string} valor - JSON string
   */
  set columnasVisibles(valor) {
    this.set('COLUMNAS_VISIBLES', valor);
  }

  /**
   * Obtiene el valor guardado para actualización masiva de IVA
   * @returns {number}
   */
  get massIvaValue() {
    const val = this.get('MASS_IVA_VALUE');
    return val !== '' ? parseFloat(val) : 21;
  }

  /**
   * Establece el valor para actualización masiva de IVA
   * @param {number} val
   */
  set massIvaValue(val) {
    this.set('MASS_IVA_VALUE', val.toString());
  }

  /**
   * Obtiene el valor guardado para actualización masiva de Ganancia
   * @returns {number}
   */
  get massGananciaValue() {
    const val = this.get('MASS_GANANCIA_VALUE');
    return val !== '' ? parseFloat(val) : 0;
  }

  /**
   * Establece el valor para actualización masiva de Ganancia
   * @param {number} val
   */
  set massGananciaValue(val) {
    this.set('MASS_GANANCIA_VALUE', val.toString());
  }

  /**
   * Obtiene el tipo de filtro para actualización masiva de IVA
   */
  get massIvaFilterType() { return this.get('MASS_IVA_FILTER_TYPE') || 'all'; }
  set massIvaFilterType(val) { this.set('MASS_IVA_FILTER_TYPE', val); }

  /**
   * Obtiene el ID del filtro para actualización masiva de IVA
   */
  get massIvaFilterId() { return parseInt(this.get('MASS_IVA_FILTER_ID')) || 0; }
  set massIvaFilterId(val) { this.set('MASS_IVA_FILTER_ID', val.toString()); }

  /**
   * Obtiene el tipo de filtro para actualización masiva de Ganancia
   */
  get massGananciaFilterType() { return this.get('MASS_GANANCIA_FILTER_TYPE') || 'all'; }
  set massGananciaFilterType(val) { this.set('MASS_GANANCIA_FILTER_TYPE', val); }

  /**
   * Obtiene el ID del filtro para actualización masiva de Ganancia
   */
  get massGananciaFilterId() { return parseInt(this.get('MASS_GANANCIA_FILTER_ID')) || 0; }
  set massGananciaFilterId(val) { this.set('MASS_GANANCIA_FILTER_ID', val.toString()); }

  /**
   * Obtiene la ruta configurada para respaldos en Drive (PC)
   * @returns {string}
   */
  get driveBackupDir() {
    return this.get('DRIVE_BACKUP_DIR') || '';
  }

  /**
   * Establece la ruta configurada para respaldos en Drive (PC)
   * @param {string} valor
   */
  set driveBackupDir(valor) {
    this.set('DRIVE_BACKUP_DIR', String(valor || '').trim());
  }

  /**
   * Actualiza la cotización desde la API (Dolar Blue)
   * @returns {Promise<number|null>}
   */
  async actualizarCotizacionDesdeApi() {
    try {
      const response = await fetch('https://dolarapi.com/v1/dolares/blue');
      if (response.ok) {
        const data = await response.json();
        // Usamos el valor de venta
        if (data && data.venta) {
          this.cotizacionUsd = data.venta;
          return data.venta;
        }
      }
    } catch (error) {
      console.error('Error al consultar API dólar:', error);
    }
    return null;
  }

  /**
   * Obtiene todas las configuraciones
   * @returns {Object}
   */
  obtenerTodas() {
    return {
      ivaGlobal: this.ivaGlobal,
      gananciaGlobal: this.gananciaGlobal,
      moneda: this.moneda,
      alertasHabilitadas: this.alertasHabilitadas,
      colorFondo: this.colorFondo,
      colorPrimario: this.colorPrimario,
      colorTexto: this.colorTexto,
      cotizacionUsd: this.cotizacionUsd,
      columnasVisibles: this.columnasVisibles,
      massIvaValue: this.massIvaValue,
      massGananciaValue: this.massGananciaValue,
      massIvaFilterType: this.massIvaFilterType,
      massIvaFilterId: this.massIvaFilterId,
      massGananciaFilterType: this.massGananciaFilterType,
      massGananciaFilterId: this.massGananciaFilterId,
      driveBackupDir: this.driveBackupDir
    };
  }

  /**
   * Guarda todas las configuraciones
   * @param {Object} config - Objeto con todas las configuraciones
   */
  guardarTodas(config) {
    if (config.ivaGlobal !== undefined) this.ivaGlobal = config.ivaGlobal;
    if (config.gananciaGlobal !== undefined) this.gananciaGlobal = config.gananciaGlobal;
    if (config.moneda !== undefined) this.moneda = config.moneda;
    if (config.alertasHabilitadas !== undefined) this.alertasHabilitadas = config.alertasHabilitadas;
    if (config.colorFondo !== undefined) this.colorFondo = config.colorFondo;
    if (config.colorPrimario !== undefined) this.colorPrimario = config.colorPrimario;
    if (config.colorTexto !== undefined) this.colorTexto = config.colorTexto;
    if (config.cotizacionUsd !== undefined) this.cotizacionUsd = config.cotizacionUsd;
    if (config.columnasVisibles !== undefined) this.columnasVisibles = config.columnasVisibles;
    if (config.massIvaValue !== undefined) this.massIvaValue = config.massIvaValue;
    if (config.massGananciaValue !== undefined) this.massGananciaValue = config.massGananciaValue;
    if (config.massIvaFilterType !== undefined) this.massIvaFilterType = config.massIvaFilterType;
    if (config.massIvaFilterId !== undefined) this.massIvaFilterId = config.massIvaFilterId;
    if (config.massGananciaFilterType !== undefined) this.massGananciaFilterType = config.massGananciaFilterType;
    if (config.massGananciaFilterId !== undefined) this.massGananciaFilterId = config.massGananciaFilterId;
    if (config.driveBackupDir !== undefined) this.driveBackupDir = config.driveBackupDir;
  }
}

module.exports = new ConfigService();
