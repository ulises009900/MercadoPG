const db = require('../repositories/DatabaseRepository');

class NotaService {
  ensureTable() {
    try {
      db.execute(`
        CREATE TABLE IF NOT EXISTS notas (
          id TEXT PRIMARY KEY,
          titulo TEXT,
          contenido TEXT,
          tipo TEXT DEFAULT 'normal'
        )
      `);
    } catch (e) {
      console.error("Error asegurando tabla notas:", e);
    }
  }

  listar() {
    this.ensureTable();
    return db.query('SELECT * FROM notas ORDER BY id DESC');
  }

  obtener(id) {
    this.ensureTable();
    return db.queryOne('SELECT * FROM notas WHERE id = ?', [id]);
  }

  guardar(nota) {
    this.ensureTable();
    // Si no tiene ID (creación desde el servidor movil o similar sin ID previo)
    const id = nota.id || Date.now().toString();
    db.execute('INSERT INTO notas (id, titulo, contenido, tipo) VALUES (?, ?, ?, ?)', [
      id,
      nota.titulo || 'Nueva Nota',
      nota.contenido || '',
      nota.tipo || 'normal'
    ]);
    return this.obtener(id);
  }

  actualizar(id, nota) {
    this.ensureTable();
    db.execute('UPDATE notas SET titulo = ?, contenido = ?, tipo = ? WHERE id = ?', [
      nota.titulo,
      nota.contenido,
      nota.tipo,
      id
    ]);
    return this.obtener(id);
  }

  eliminar(id) {
    this.ensureTable();
    return db.execute('DELETE FROM notas WHERE id = ?', [id]);
  }
}

module.exports = new NotaService();