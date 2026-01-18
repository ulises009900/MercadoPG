/**
 * Modelo: Artículo
 * Representa un artículo en el inventario con sus propiedades y validaciones
 */
class Articulo {
  constructor(data = {}) {
    this.codigo = data.codigo || '';
    this.descripcion = data.descripcion || '';
    this.costo = data.costo || 0;
    this.ganancia = data.ganancia || 0;
    this.iva = data.iva || 0;
    this.stock = data.stock || 0;
    this.stockMinimo = data.stockMinimo || 0;
    this.marcaId = data.marcaId || 0;
    this.proveedorId = data.proveedorId || 0;
    this.categoriaId = data.categoriaId || 0;
    this.imagen = data.imagen || '';
    this.protegido = data.protegido === true || data.protegido === 1;
    
    // Propiedades calculadas (cacheadas)
    this._precioFinal = null;
  }

  /**
   * Calcula el precio final con ganancia e IVA
   * @param {number} ivaGlobal - IVA global de configuración
   * @returns {number}
   */
  calcularPrecioFinal(ivaGlobal = 21) {
    const ivaAplicar = this.protegido ? this.iva : ivaGlobal;
    return this.costo * (1 + this.ganancia / 100) * (1 + ivaAplicar / 100);
  }

  /**
   * Getter para precio final
   */
  get precioFinal() {
    if (this._precioFinal === null) {
      this._precioFinal = this.calcularPrecioFinal();
    }
    return this._precioFinal;
  }

  /**
   * Determina si el stock está en nivel crítico
   * @returns {boolean}
   */
  get stockCritico() {
    return this.stock <= this.stockMinimo;
  }

  /**
   * Valida que el artículo tenga datos correctos
   * @returns {boolean}
   */
  esValido() {
    if (!this.codigo || this.codigo.trim() === '') return false;
    if (!this.descripcion || this.descripcion.trim() === '') return false;
    if (this.costo <= 0) return false;
    if (this.ganancia < 0) return false;
    if (this.iva < 0) return false;
    if (this.stock < 0) return false;
    if (this.stockMinimo < 0) return false;
    return true;
  }

  /**
   * Convierte el artículo a objeto plano para BD
   * @returns {Object}
   */
  toDatabase() {
    return {
      codigo: this.codigo,
      descripcion: this.descripcion,
      costo: this.costo,
      ganancia: this.ganancia,
      iva: this.iva,
      stock: this.stock,
      stock_minimo: this.stockMinimo,
      marcaId: this.marcaId || null,
      proveedorId: this.proveedorId || null,
      categoriaId: this.categoriaId || null,
      imagen: this.imagen,
      protegido: this.protegido ? 1 : 0
    };
  }

  /**
   * Crea una instancia desde datos de BD
   * @param {Object} row - Fila de la base de datos
   * @returns {Articulo}
   */
  static fromDatabase(row) {
    return new Articulo({
      codigo: row.codigo,
      descripcion: row.descripcion,
      costo: row.costo,
      ganancia: row.ganancia,
      iva: row.iva,
      stock: row.stock,
      stockMinimo: row.stock_minimo,
      marcaId: row.marcaId,
      proveedorId: row.proveedorId,
      categoriaId: row.categoriaId,
      imagen: row.imagen,
      protegido: row.protegido === 1
    });
  }
}

module.exports = Articulo;
