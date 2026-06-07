const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let Bonjour;
try { Bonjour = require('bonjour-service').Bonjour; } catch (_) { Bonjour = null; }

class MobileServer {
  constructor(options) {
    this.services = options.services;
    this.rootDir = options.rootDir;
    this.preferredPort = options.preferredPort || 3001;
    this.publicUrl = String(options.publicUrl || '').trim();
    this.onConnectionChange = options.onConnectionChange || null;
    this.onDataChanged = options.onDataChanged || null;
    this.server = null;
    this.port = null;
    this.clients = new Set();
    this._bonjour = null;
    this._mdnsService = null;
  }

  async start() {
    if (this.server) {
      return this.getStatus();
    }

    let lastError = null;
    for (let port = this.preferredPort; port < this.preferredPort + 10; port += 1) {
      try {
        await this.listenOnPort(port);
        this.port = port;
        console.log(`Servidor movil listo en puerto ${port}`);
        return this.getStatus();
      } catch (error) {
        lastError = error;
        if (error.code !== 'EADDRINUSE') {
          throw error;
        }
      }
    }

    throw lastError || new Error('No se pudo iniciar el servidor movil');
  }

  listenOnPort(port) {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((error) => {
          console.error('Error en servidor movil:', error);
          this.sendJson(res, 500, { error: 'Error interno del servidor' });
        });
      });

      candidate.once('error', reject);
      candidate.listen(port, '0.0.0.0', () => {
        candidate.removeListener('error', reject);
        this.server = candidate;
        this._registerMdns(port);
        resolve();
      });
    });
  }

  _registerMdns(port) {
    if (!Bonjour) return;
    try {
      if (this._bonjour) { try { this._bonjour.destroy(); } catch (_) {} }
      this._bonjour = new Bonjour();
      this._mdnsService = this._bonjour.publish({
        name: 'MercadoPG',
        type: 'http',
        port,
        txt: { path: '/' }
      });
      console.log(`mDNS: mercadopg.local:${port} registrado`);
    } catch (e) {
      console.warn('mDNS no disponible:', e.message);
    }
  }

  async stop() {
    if (!this.server) {
      return;
    }

    if (this._bonjour) {
      try { this._bonjour.destroy(); } catch (_) {}
      this._bonjour = null;
      this._mdnsService = null;
    }

    const server = this.server;
    this.server = null;
    this.port = null;

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  getStatus() {
    const urls = this.getUrls();
    const mdnsUrl = this.port ? `http://mercadopg.local:${this.port}` : null;
    return {
      running: Boolean(this.server),
      port: this.port,
      urls,
      primaryUrl: urls[0] || null,
      publicUrl: this.publicUrl || null,
      mdnsUrl,
      mobileConnected: this.isMobileConnected(),
      writeLocked: false
    };
  }

  isMobileConnected() {
    return this.clients.size > 0;
  }

  isMobileWriteLocked(req) {
    // Permitimos que el teléfono siempre pueda editar para paridad total con la PC
    return false;
  }

  getUrls() {
    if (!this.port) {
      return [];
    }

    return this.getLocalIPv4Addresses().map((address) => `http://${address}:${this.port}`);
  }

  getLocalIPv4Addresses() {
    const interfaces = os.networkInterfaces();
    const primary = [];   // WiFi / Ethernet físico
    const secondary = []; // Adaptadores virtuales (VirtualBox, Hyper-V, VMware)

    // Prefijos típicos de adaptadores virtuales
    const virtualPrefixes = ['192.168.56.', '192.168.99.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'];
    const virtualNames = /virtualbox|vmware|vethernet|hyper.?v|loopback|wsl|docker/i;

    for (const [ifaceName, addrs] of Object.entries(interfaces)) {
      const isVirtual = virtualNames.test(ifaceName);
      for (const details of addrs || []) {
        if (details.family === 'IPv4' && !details.internal) {
          const addr = details.address;
          const looksVirtual = isVirtual || virtualPrefixes.some(p => addr.startsWith(p));
          if (looksVirtual) {
            secondary.push(addr);
          } else {
            primary.push(addr);
          }
        }
      }
    }

    return Array.from(new Set([...primary, ...secondary]));
  }

  async handleRequest(req, res) {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/api/status' && req.method === 'GET') {
      this.sendJson(res, 200, this.getStatus());
      return;
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      this.handleEvents(req, res);
      return;
    }

    if (pathname === '/api/articulos' && req.method === 'GET') {
      const query = requestUrl.searchParams.get('q') || '';
      const articulos = query
        ? this.services.ArticuloService.buscar(query)
        : this.services.ArticuloService.listar();
      this.sendJson(res, 200, {
        items: articulos.map((articulo) => this.serializeArticulo(articulo)),
        total: articulos.length
      });
      return;
    }

    if (pathname === '/api/articulos' && req.method === 'POST') {
      if (this.isMobileWriteLocked(req)) {
        this.sendJson(res, 423, { error: 'Cambios bloqueados: el telefono esta conectado a la PC.' });
        return;
      }

      const payload = await this.readJsonBody(req);
      if (!payload.codigo) {
        this.sendJson(res, 400, { error: 'El codigo es obligatorio' });
        return;
      }

      const existente = this.services.ArticuloService.obtener(payload.codigo);
      if (existente) {
        this.sendJson(res, 409, { error: 'El codigo ya existe' });
        return;
      }

      const articulo = this.createArticuloFromPayload(payload);
      let newImagePath = null;

      if (payload.imagenDataUrl) {
        try {
          newImagePath = this.savePayloadImage(payload, payload.codigo);
          articulo.imagen = newImagePath;
        } catch (e) {
          this.sendJson(res, 400, { error: 'Formato de imagen invalido' });
          return;
        }
      }

      try {
        this.services.ArticuloService.guardar(articulo);
      } catch (error) {
        if (newImagePath && fs.existsSync(newImagePath)) fs.unlinkSync(newImagePath);
        throw error;
      }

      const creado = this.services.ArticuloService.obtener(payload.codigo);
      this.notifyDataChanged({ source: 'mobile', action: 'articulo-created', codigo: payload.codigo });
      this.sendJson(res, 201, this.serializeArticulo(creado));
      return;
    }

    if (pathname === '/api/notas' && req.method === 'GET') {
      const notas = this.services.NotaService.listar(); // Asumiendo que existe NotaService
      this.sendJson(res, 200, notas);
      return;
    }

    if (pathname === '/api/notas' && req.method === 'POST') {
      const payload = await this.readJsonBody(req);
      const nueva = this.services.NotaService.guardar(payload);
      this.notifyDataChanged({ source: 'mobile', action: 'nota-created' });
      this.sendJson(res, 201, nueva);
      return;
    }

    if (pathname.startsWith('/api/notas/') && req.method === 'PUT') {
      const id = pathname.slice('/api/notas/'.length);
      const payload = await this.readJsonBody(req);
      const actualizada = this.services.NotaService.actualizar(id, payload);
      this.notifyDataChanged({ source: 'mobile', action: 'nota-updated' });
      this.sendJson(res, 200, actualizada);
      return;
    }

    if (pathname.startsWith('/api/notas/') && req.method === 'DELETE') {
      const id = pathname.slice('/api/notas/'.length);
      this.services.NotaService.eliminar(id);
      this.notifyDataChanged({ source: 'mobile', action: 'nota-deleted' });
      this.sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/catalogos' && req.method === 'GET') {
      this.sendJson(res, 200, {
        marcas: this.services.MarcaService.listar(),
        proveedores: this.services.ProveedorService.listar(),
        categorias: this.services.CategoriaService.listar(),
        config: this.services.ConfigService.obtenerTodas()
      });
      return;
    }

    if (pathname === '/api/backup/snapshot' && req.method === 'GET') {
      // Genera el snapshot completo (articulos + catalogos + imagenes) y lo devuelve
      // El telefono lo descarga al conectarse y lo cachea para uso offline
      try {
        const snapshot = this.services.BackupService.buildMobileSnapshot();
        this.sendJson(res, 200, snapshot);
      } catch (err) {
        this.sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === '/api/backup/create' && req.method === 'POST') {
      const result = await this.services.BackupService.crearRespaldo();
      if (!result.success) {
        this.sendJson(res, 500, { error: result.error || 'No se pudo crear el respaldo' });
        return;
      }

      this.sendJson(res, 200, {
        ok: true,
        path: result.path
      });
      return;
    }

    if (pathname === '/api/config/drive-dir' && req.method === 'GET') {
      this.sendJson(res, 200, {
        driveBackupDir: this.services.ConfigService.driveBackupDir || ''
      });
      return;
    }

    if (pathname === '/api/config/drive-dir' && req.method === 'POST') {
      const payload = await this.readJsonBody(req);
      const dir = String(payload.driveBackupDir || '').trim();
      this.services.ConfigService.driveBackupDir = dir;
      this.sendJson(res, 200, { ok: true, driveBackupDir: dir });
      return;
    }

    if (pathname === '/api/config/drive-dir/test' && req.method === 'POST') {
      const payload = await this.readJsonBody(req);
      const driveUrl = String(payload.driveBackupDir || '').trim();
      
      // Validar formato del URL de Google Drive
      const isValidDriveUrl = /^https:\/\/(drive\.google\.com|docs\.google\.com)/.test(driveUrl) || 
                              /^G:\\\\|^[A-Z]:\\\\/.test(driveUrl); // Windows path
      
      if (!isValidDriveUrl) {
        this.sendJson(res, 400, { 
          ok: false, 
          error: 'URL de Drive inválido. Debe ser un enlace de Google Drive o una ruta local sincronizada.' 
        });
        return;
      }

      // Extraer ID de carpeta si es URL de Google Drive
      const folderId = driveUrl.match(/folders\/([a-zA-Z0-9-_]+)/)?.[1];
      
      // Si es una ruta local (Windows), verificar que existe
      if (/^[A-Z]:\\\\|^G:\\\\/.test(driveUrl) || driveUrl.includes('Mi unidad') || driveUrl.includes('My Drive')) {
        const exists = fs.existsSync(driveUrl);
        this.sendJson(res, 200, { 
          ok: exists,
          connected: exists,
          message: exists 
            ? 'Carpeta de Drive detectada en esta PC.' 
            : 'Carpeta de Drive no encontrada. Verifica que esté sincronizada en esta PC.'
        });
        return;
      }
      
      // Es un URL de Google Drive (requiere que esté sincronizado en PC)
      this.sendJson(res, 200, { 
        ok: true,
        connected: false,
        folderId: folderId,
        message: 'URL de Google Drive válido. Asegúrate de tener Google Drive Desktop sincronizado en la PC.'
      });
      return;
    }

    if (pathname.startsWith('/api/articulos/') && req.method === 'GET') {
      const codigo = pathname.slice('/api/articulos/'.length);
      const articulo = this.services.ArticuloService.obtener(codigo);
      if (!articulo) {
        this.sendJson(res, 404, { error: 'Articulo no encontrado' });
        return;
      }
      this.sendJson(res, 200, this.serializeArticulo(articulo));
      return;
    }

    if (pathname.startsWith('/api/articulos/') && req.method === 'PUT') {
      if (this.isMobileWriteLocked(req)) {
        this.sendJson(res, 423, { error: 'Cambios bloqueados: el telefono esta conectado a la PC.' });
        return;
      }

      const codigo = pathname.slice('/api/articulos/'.length);
      const payload = await this.readJsonBody(req);
      
      const existente = this.services.ArticuloService.obtener(codigo);
      const oldImagePath = existente ? existente.imagen : null;
      let newImagePath = null;

      if (payload.imagenDataUrl) {
        try {
          newImagePath = this.savePayloadImage(payload, codigo);
          payload.imagen = newImagePath;
        } catch (e) {
          this.sendJson(res, 400, { error: 'Imagen invalida' });
          return;
        }
      }

      try {
        const articulo = this.services.ArticuloService.actualizarParcial(codigo, payload);
        
        // Si todo salio bien, borramos la imagen vieja (si hay una nueva)
        if (newImagePath && oldImagePath && oldImagePath !== newImagePath) {
          if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
        }

        this.notifyDataChanged({ source: 'mobile', action: 'articulo-updated', codigo });
        this.sendJson(res, 200, this.serializeArticulo(articulo));
      } catch (error) {
        // Si fallo la DB, borramos la imagen que acabamos de crear para no dejar basura
        if (newImagePath && fs.existsSync(newImagePath)) fs.unlinkSync(newImagePath);
        throw error;
      }
      return;
    }

    if (pathname.startsWith('/api/articulos/') && req.method === 'DELETE') {
      if (this.isMobileWriteLocked(req)) {
        this.sendJson(res, 423, { error: 'Cambios bloqueados: el telefono esta conectado a la PC.' });
        return;
      }

      const codigo = pathname.slice('/api/articulos/'.length);
      const articulo = this.services.ArticuloService.obtener(codigo);
      if (!articulo) {
        this.sendJson(res, 404, { error: 'Articulo no encontrado' });
        return;
      }

      // Borrar el archivo fisico de la imagen antes de eliminar de la DB
      if (articulo.imagen) {
        try {
          if (fs.existsSync(articulo.imagen)) fs.unlinkSync(articulo.imagen);
        } catch (err) {
          console.warn('No se pudo eliminar el archivo de imagen:', err.message);
        }
      }

      this.services.ArticuloService.eliminar(codigo);
      this.notifyDataChanged({ source: 'mobile', action: 'articulo-deleted', codigo });
      this.sendJson(res, 200, { ok: true, codigo });
      return;
    }

    if (pathname === '/api/stock/entrada' && req.method === 'POST') {
      if (this.isMobileWriteLocked(req)) {
        this.sendJson(res, 423, { error: 'Cambios bloqueados: el telefono esta conectado a la PC.' });
        return;
      }

      const payload = await this.readJsonBody(req);
      this.services.StockService.entrada(payload.codigo, Number(payload.cantidad));
      const articulo = this.services.ArticuloService.obtener(payload.codigo);
      this.notifyDataChanged({ source: 'mobile', action: 'stock-entry', codigo: payload.codigo });
      this.sendJson(res, 200, this.serializeArticulo(articulo));
      return;
    }

    if (pathname === '/api/stock/salida' && req.method === 'POST') {
      if (this.isMobileWriteLocked(req)) {
        this.sendJson(res, 423, { error: 'Cambios bloqueados: el telefono esta conectado a la PC.' });
        return;
      }

      const payload = await this.readJsonBody(req);
      this.services.StockService.salida(payload.codigo, Number(payload.cantidad));
      const articulo = this.services.ArticuloService.obtener(payload.codigo);
      this.notifyDataChanged({ source: 'mobile', action: 'stock-exit', codigo: payload.codigo });
      this.sendJson(res, 200, this.serializeArticulo(articulo));
      return;
    }

    if (pathname.startsWith('/api/images/') && req.method === 'GET') {
      const fileName = path.basename(pathname.slice('/api/images/'.length));
      const { imagesPath } = this.services.BackupService.getPaths();
      const imagePath = path.join(imagesPath, fileName);
      if (!fs.existsSync(imagePath)) {
        this.sendJson(res, 404, { error: 'Imagen no encontrada' });
        return;
      }
      this.serveFile(res, imagePath);
      return;
    }

    if (pathname === '/' || pathname === '/mobile') {
      this.serveFile(res, path.join(this.rootDir, 'index.html'));
      return;
    }

    if (pathname === '/manifest.webmanifest') {
      this.serveFile(res, path.join(this.rootDir, 'manifest.webmanifest'));
      return;
    }

    if (pathname === '/service-worker.js') {
      this.serveFile(res, path.join(this.rootDir, 'service-worker.js'));
      return;
    }

    if (pathname.startsWith('/icons/')) {
      this.serveFile(res, path.join(this.rootDir, pathname.slice(1)));
      return;
    }

    if (pathname === '/styles.css') {
      this.serveFile(res, path.join(this.rootDir, 'styles.css'));
      return;
    }

    if (pathname === '/app.bundle.js') {
      this.serveFile(res, path.join(this.rootDir, 'app.bundle.js'));
      return;
    }

    this.sendJson(res, 404, { error: 'Ruta no encontrada' });
  }

  handleEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);
    this.clients.add(res);
    if (this.onConnectionChange) this.onConnectionChange(true);

    req.on('close', () => {
      this.clients.delete(res);
      if (this.onConnectionChange) this.onConnectionChange(this.clients.size > 0);
    });
  }

  notifyDataChanged(payload = {}) {
    const message = `data: ${JSON.stringify({ type: 'data-changed', at: new Date().toISOString(), ...payload })}\n\n`;
    for (const client of this.clients) {
      client.write(message);
    }

    if (this.onDataChanged) {
      this.onDataChanged(payload);
    }
  }

  savePayloadImage(payload = {}, codigo = '') {
    const raw = String(payload.imagenDataUrl || '').trim();
    const match = raw.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Imagen invalida');
    }

    const extMap = {
      jpeg: 'jpg',
      jpg: 'jpg',
      png: 'png',
      gif: 'gif',
      webp: 'webp',
      avif: 'avif'
    };
    const ext = extMap[String(match[1] || '').toLowerCase()] || 'jpg';
    const safeCode = String(codigo || payload.codigo || 'articulo').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'articulo';
    const safeName = path.basename(String(payload.imagenName || '')).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const suffix = safeName ? `_${Date.now()}_${safeName}` : `_${Date.now()}.${ext}`;
    const fileName = `${safeCode}${suffix.endsWith(`.${ext}`) ? suffix : `${suffix}.${ext}`}`;
    const { imagesPath } = this.services.BackupService.getPaths();

    fs.mkdirSync(imagesPath, { recursive: true });
    const imagePath = path.join(imagesPath, fileName);
    fs.writeFileSync(imagePath, Buffer.from(match[2], 'base64'));
    return imagePath;
  }

  serializeArticulo(articulo) {
    if (!articulo) {
      return null;
    }

    const ivaGlobal = this.services.ConfigService.ivaGlobal;
    const imageName = articulo.imagen ? path.basename(articulo.imagen) : null;
    return {
      codigo: articulo.codigo,
      descripcion: articulo.descripcion,
      costo: articulo.costo,
      ganancia: articulo.ganancia,
      iva: articulo.iva,
      stock: articulo.stock,
      stockMinimo: articulo.stockMinimo,
      marcaId: articulo.marcaId,
      proveedorId: articulo.proveedorId,
      categoriaId: articulo.categoriaId,
      protegido: articulo.protegido,
      precioFinal: articulo.calcularPrecioFinal(ivaGlobal),
      stockCritico: articulo.stockCritico,
      imagenUrl: imageName ? `/api/images/${encodeURIComponent(imageName)}` : null
    };
  }

  createArticuloFromPayload(payload = {}) {
    const config = this.services.ConfigService.obtenerTodas();
    return {
      codigo: String(payload.codigo || '').trim(),
      descripcion: String(payload.descripcion || '').trim(),
      costo: Number(payload.costo || 0),
      ganancia: Number(payload.ganancia ?? config.gananciaGlobal ?? 0),
      iva: Number(payload.iva ?? config.ivaGlobal ?? 21),
      stock: Number(payload.stock || 0),
      stockMinimo: Number(payload.stockMinimo || 0),
      marcaId: Number(payload.marcaId || 0),
      proveedorId: Number(payload.proveedorId || 0),
      categoriaId: Number(payload.categoriaId || 0),
      imagen: '',
      protegido: payload.protegido ? 1 : 0
    };
  }

  async readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    if (chunks.length === 0) {
      return {};
    }

    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      throw new Error('JSON invalido');
    }
  }

  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-mercadopg-sync-mode');
  }

  sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  serveFile(res, filePath) {
    if (!fs.existsSync(filePath)) {
      this.sendJson(res, 404, { error: 'Archivo no encontrado' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif'
    };

    const headers = {
      'Content-Type': contentTypes[ext] || 'application/octet-stream'
    };

    const shouldDisableCache = ['.html', '.webmanifest', '.css', '.js'].includes(ext);
    if (shouldDisableCache) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
      headers['Surrogate-Control'] = 'no-store';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = MobileServer;
