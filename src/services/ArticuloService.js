const db = require('../repositories/DatabaseRepository');
const { Articulo, ArticuloRanking } = require('../models');

/**
 * ArticuloService - Lógica de negocio para artículos
 */
class ArticuloService {
  constructor() {
    this.baseSelect = `
      SELECT codigo, descripcion, costo, ganancia, iva, stock, stock_minimo,
      IFNULL(marcaId, 0) as marcaId, IFNULL(proveedorId, 0) as proveedorId, IFNULL(categoriaId, 0) as categoriaId,
      imagen, protegido
      FROM articulos
    `;
  }

  /**
   * Obtiene la cantidad total vendida de un artículo
   * @param {string} codigo - Código del artículo
   * @returns {number}
   */
  obtenerVendidos(codigo) {
    const sql = `
      SELECT IFNULL(SUM(CASE WHEN tipo = 'SALIDA' THEN cantidad ELSE 0 END), 0) as vendidos
      FROM stock_historial
      WHERE codigo = ?
    `;
    const result = db.queryOne(sql, [codigo]);
    return result ? result.vendidos : 0;
  }

  /**
   * Lista todos los artículos
   * @returns {Articulo[]}
   */
  listar() {
    const rows = db.query(this.baseSelect);
    return rows.map(row => Articulo.fromDatabase(row));
  }

  /**
   * Lista artículos con stock crítico
   * @returns {Articulo[]}
   */
  listarFaltantes() {
    const sql = `${this.baseSelect} WHERE stock <= stock_minimo`;
    const rows = db.query(sql);
    return rows.map(row => Articulo.fromDatabase(row));
  }

  /**
   * Obtiene un artículo por su código
   * @param {string} codigo - Código del artículo
   * @returns {Articulo|null}
   */
  obtener(codigo) {
    const sql = `${this.baseSelect} WHERE codigo = ?`;
    const row = db.queryOne(sql, [codigo]);
    return row ? Articulo.fromDatabase(row) : null;
  }

  /**
   * Obtiene múltiples artículos por sus códigos
   * @param {string[]} codigos - Códigos de los artículos a obtener
   * @returns {Articulo[]}
   */
  obtenerMultiples(codigos) {
    if (!codigos || codigos.length === 0) {
      return [];
    }
    const placeholders = codigos.map(() => '?').join(',');
    const sql = `${this.baseSelect} WHERE codigo IN (${placeholders})`;
    const rows = db.query(sql, codigos);
    return rows.map(row => Articulo.fromDatabase(row));
  }

  /**
   * Guarda o actualiza un artículo
   * @param {Articulo} articulo - Artículo a guardar
   * @throws {Error} Si los datos no son válidos
   */
  guardar(articuloData) {
    // Reconstruir la instancia del modelo porque al pasar por IPC se pierden los métodos
    const articulo = (articuloData instanceof Articulo) 
      ? articuloData 
      : new Articulo(articuloData);

    if (!articulo.esValido()) {
      throw new Error('Datos del artículo inválidos');
    }

    const sql = `
      INSERT OR REPLACE INTO articulos
      (codigo, descripcion, costo, ganancia, iva, stock, stock_minimo, marcaId, proveedorId, categoriaId, imagen, protegido)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const data = articulo.toDatabase();
    db.execute(sql, [
      data.codigo,
      data.descripcion,
      data.costo,
      data.ganancia,
      data.iva,
      data.stock,
      data.stock_minimo,
      data.marcaId || null,
      data.proveedorId || null,
      data.categoriaId || null,
      data.imagen,
      data.protegido
    ]);
  }

  /**
   * Elimina un artículo
   * @param {string} codigo - Código del artículo
   */
  eliminar(codigo) {
    const sql = 'DELETE FROM articulos WHERE codigo = ?';
    db.execute(sql, [codigo]);
  }

  /**
   * Actualiza el IVA de todos los artículos
   * @param {number} nuevoIva
   */
  actualizarIvaMasivo(nuevoIva) {
    const sql = 'UPDATE articulos SET iva = ? WHERE protegido = 0';
    db.execute(sql, [nuevoIva]);
  }

  /**
   * Actualiza la ganancia de todos los artículos
   * @param {number} nuevaGanancia
   */
  actualizarGananciaMasivo(nuevaGanancia) {
    const sql = 'UPDATE articulos SET ganancia = ? WHERE protegido = 0';
    db.execute(sql, [nuevaGanancia]);
  }

  /**
   * Lista ranking de artículos más vendidos
   * @returns {ArticuloRanking[]}
   */
  listarRankingMasVendidos() {
    const sql = `
      SELECT a.codigo, a.descripcion,
      IFNULL(SUM(CASE WHEN sh.tipo = 'SALIDA' THEN sh.cantidad ELSE 0 END), 0) as vendidos
      FROM articulos a
      LEFT JOIN stock_historial sh ON a.codigo = sh.codigo
      GROUP BY a.codigo, a.descripcion
      ORDER BY vendidos DESC
    `;
    
    const rows = db.query(sql);
    return rows.map(row => ArticuloRanking.fromDatabase(row));
  }

  /**
   * Busca artículos por término de búsqueda
   * @param {string} termino - Término a buscar
   * @returns {Articulo[]}
   */
  buscar(termino) {
    if (!termino || termino.trim() === '') {
      return this.listar();
    }

    const sql = `
      ${this.baseSelect}
      WHERE codigo LIKE ? OR descripcion LIKE ?
    `;
    
    const patron = `%${termino}%`;
    const rows = db.query(sql, [patron, patron]);
    return rows.map(row => Articulo.fromDatabase(row));
  }
}

module.exports = new ArticuloService();
