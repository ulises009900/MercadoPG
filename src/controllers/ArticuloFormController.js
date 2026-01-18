class ArticuloFormController {
  constructor() {
    this.codigoEdicion = null;
    this.imagenPath = '';
    this.modalTipo = null; // 'marca', 'proveedor', 'categoria'
    this.api = window.api; // Usar la API expuesta por preload
    this.config = { ivaGlobal: 21, cotizacionUsd: 1000 }; // Valores por defecto
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.cargarConfiguracion();
    await this.cargarCombos();
    
    // Escuchar si es edición o nuevo artículo
    this.api.on('load-articulo', (data) => {
      // Caso 1: Edición (recibe string con el código)
      if (typeof data === 'string' && data) {
        this.codigoEdicion = data;
        document.getElementById('formTitle').textContent = 'Editar Artículo';
        document.getElementById('codigo').readOnly = true;
        this.cargarDatos(data);
      } 
      // Caso 2: Nuevo con código escaneado (recibe objeto)
      else if (data && typeof data === 'object' && data.nuevo) {
        document.getElementById('codigo').value = data.codigo || '';
        if (data.codigo) this.renderizarBarcode(data.codigo);
        // Mantenemos codigoEdicion en null para que al guardar sea un INSERT
        // Poner foco en descripción para agilizar la carga
        setTimeout(() => document.getElementById('descripcion').focus(), 100);
      }
    });

    // Escuchar cambios globales (configuración, tema, etc.)
    this.api.on('reload-data', async () => {
      await this.cargarConfiguracion();
      this.calcularPrecios();
    });

    // Escuchar vista previa de tema
    this.api.on('preview-theme', (theme) => {
      document.documentElement.style.setProperty('--background-color', theme.colorFondo);
      document.documentElement.style.setProperty('--primary-color', theme.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', theme.colorTexto);
    });

    // Calcular precios iniciales (por si hay valores por defecto)
    this.calcularPrecios();
  }

  async cargarConfiguracion() {
    const result = await this.api.invoke('service-call', 'ConfigService', 'obtenerTodas');
    if (result.success) {
      this.config = result.data;
      // Aplicar tema visual
      document.documentElement.style.setProperty('--background-color', this.config.colorFondo);
      document.documentElement.style.setProperty('--primary-color', this.config.colorPrimario);
      document.documentElement.style.setProperty('--foreground-color', this.config.colorTexto);
    }
  }

  setupEventListeners() {
    // Guardar formulario
    document.getElementById('articuloForm').addEventListener('submit', (e) => this.guardar(e));
    document.getElementById('btnGuardarNuevo').addEventListener('click', (e) => this.guardar(e, true));
    document.getElementById('btnCancelar').addEventListener('click', () => window.close());
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });
    
    // Eventos para cálculo de precios en tiempo real
    ['costo', 'ganancia', 'iva'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', () => this.calcularPrecios());
        element.addEventListener('keyup', () => this.calcularPrecios());
        element.addEventListener('change', () => this.calcularPrecios());
      }
    });

    // Evento especial para IVA: Si el usuario escribe, se protege automáticamente
    const ivaInput = document.getElementById('iva');
    ivaInput.addEventListener('input', () => {
      document.getElementById('protegido').checked = true;
      this.calcularPrecios();
    });

    // Evento para Protegido: Si se desmarca, usar IVA Global visualmente
    document.getElementById('protegido').addEventListener('change', (e) => {
      if (!e.target.checked) {
        document.getElementById('iva').value = this.config.ivaGlobal;
      }
      this.calcularPrecios();
    });

    // Código de barras: Generar visualización al escribir
    document.getElementById('codigo').addEventListener('input', (e) => {
      // Forzar solo números
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
      this.renderizarBarcode(e.target.value);
    });

    // Limpiar errores al escribir
    const inputsRequeridos = ['codigo', 'descripcion', 'costo', 'ganancia', 'stock', 'stockMinimo'];
    inputsRequeridos.forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener('input', () => el.classList.remove('input-error'));
    });

    // Selección de Imagen
    document.getElementById('btnSelectImage').addEventListener('click', () => {
      document.getElementById('imagenInput').click();
    });

    document.getElementById('imagenInput').addEventListener('change', (e) => this.procesarImagen(e));

    // Botones rápidos (Funcionales con Modal)
    document.getElementById('btnNuevaMarca').addEventListener('click', () => this.abrirModal('marca'));
    document.getElementById('btnNuevoProveedor').addEventListener('click', () => this.abrirModal('proveedor'));
    document.getElementById('btnNuevaCategoria').addEventListener('click', () => this.abrirModal('categoria'));

    // Eventos del Modal
    document.getElementById('btnModalCancel').addEventListener('click', () => this.cerrarModal());
    document.getElementById('btnModalSave').addEventListener('click', () => this.guardarModal());
  }

  async cargarCombos() {
    // Llamadas asíncronas a los servicios a través de IPC
    const [marcasRes, proveedoresRes, categoriasRes] = await Promise.all([
      this.api.invoke('service-call', 'MarcaService', 'listar'),
      this.api.invoke('service-call', 'ProveedorService', 'listar'),
      this.api.invoke('service-call', 'CategoriaService', 'listar') // Asumiendo que existe este método
    ]);

    const marcas = marcasRes.success ? marcasRes.data : [];
    const proveedores = proveedoresRes.success ? proveedoresRes.data : [];
    
    // Manejo de error si CategoriaService no tiene listar o falla
    let categorias = [];
    if (categoriasRes && categoriasRes.success) {
      categorias = categoriasRes.data;
    }

    const marcaSelect = document.getElementById('marcaId');
    marcaSelect.innerHTML = '<option value="0">Sin marca</option>';
    marcas.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.nombre;
      marcaSelect.appendChild(option);
    });

    const proveedorSelect = document.getElementById('proveedorId');
    proveedorSelect.innerHTML = '<option value="0">Sin proveedor</option>';
    proveedores.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.nombre;
      proveedorSelect.appendChild(option);
    });

    const categoriaSelect = document.getElementById('categoriaId');
    categoriaSelect.innerHTML = '<option value="0">Sin categoría</option>';
    categorias.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      categoriaSelect.appendChild(option);
    });
  }

  async cargarDatos(codigo) {
    const result = await this.api.invoke('service-call', 'ArticuloService', 'obtener', codigo);
    if (!result.success || !result.data) {
      alert('Error al cargar el artículo');
      return;
    }
    const articulo = result.data;

    document.getElementById('codigo').value = articulo.codigo;
    document.getElementById('descripcion').value = articulo.descripcion;
    document.getElementById('costo').value = articulo.costo;
    document.getElementById('ganancia').value = articulo.ganancia;
    document.getElementById('iva').value = articulo.iva;
    document.getElementById('stock').value = articulo.stock;
    document.getElementById('stockMinimo').value = articulo.stockMinimo;
    document.getElementById('marcaId').value = articulo.marcaId || 0;
    document.getElementById('proveedorId').value = articulo.proveedorId || 0;
    document.getElementById('categoriaId').value = articulo.categoriaId || 0;
    document.getElementById('protegido').checked = articulo.protegido;

    // Si no está protegido, mostrar el IVA global actual para referencia
    if (!articulo.protegido) {
      document.getElementById('iva').value = this.config.ivaGlobal;
    }

    if (articulo.imagen) {
      this.imagenPath = articulo.imagen;
      this.mostrarPreview(articulo.imagen);
    }

    if (articulo.codigo) {
      this.renderizarBarcode(articulo.codigo);
    }

    this.calcularPrecios();
  }

  procesarImagen(event) {
    const file = event.target.files[0];
    if (file) {
      // Nota: file.path funciona en Electron si no se ha deshabilitado explícitamente en webUtils
      this.imagenPath = file.path;
      this.mostrarPreview(file.path);
    }
  }

  mostrarPreview(pathImg) {
    const preview = document.getElementById('imagePreview');
    preview.src = pathImg;
    preview.style.display = 'block';
    document.getElementById('noImageText').style.display = 'none';
  }

  calcularPrecios() {
    const costo = parseFloat(document.getElementById('costo').value) || 0;
    const ganancia = parseFloat(document.getElementById('ganancia').value) || 0;
    const ivaInput = parseFloat(document.getElementById('iva').value) || 0;
    const protegido = document.getElementById('protegido').checked;
    
    // Obtener IVA Global con fallback por seguridad
    const ivaGlobal = this.config.ivaGlobal || 21;

    // Cálculo manual ya que no podemos importar el Modelo aquí
    const ivaGlobalDecimal = ivaGlobal / 100;
    
    let precioArs = costo * (1 + ganancia / 100);
    if (protegido) {
      precioArs = precioArs * (1 + ivaInput / 100);
    } else {
      precioArs = precioArs * (1 + ivaGlobalDecimal);
    }

    const cotizacionUsd = this.config.cotizacionUsd;
    const precioUsd = cotizacionUsd > 0 ? precioArs / cotizacionUsd : 0;

    // Actualizamos la visualización (Texto fijo, no input)
    document.getElementById('precioFinalArs').textContent = `$ ${precioArs.toFixed(2)}`;
    document.getElementById('precioFinalUsd').textContent = `US$ ${precioUsd.toFixed(2)}`;
  }

  renderizarBarcode(codigo) {
    const canvas = document.getElementById('barcodeCanvas');
    
    // Si no hay código, limpiar el canvas para reducir ruido visual
    if (!codigo || !codigo.trim()) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    try {
      // Generar código de barras en el canvas oculto
      // Asumimos que JsBarcode está cargado globalmente en el HTML
      JsBarcode(canvas, codigo, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 50, // Altura reducida para ser más compacto
        displayValue: true,
        fontSize: 12,
        margin: 5
      });
    } catch (error) {
      // Ignorar errores silenciosamente mientras se escribe
      // console.error(error);
    }
  }

  async guardar(e, mantenerAbierto = false) {
    e.preventDefault();

    if (!this.validarCampos()) return;
    
    try {
      let codigo = document.getElementById('codigo').value.trim();

      // Validar duplicados si es nuevo artículo
      if (!this.codigoEdicion) {
        const resExistente = await this.api.invoke('service-call', 'ArticuloService', 'obtener', codigo);
        const existente = resExistente.success ? resExistente.data : null;
        if (existente) {
          alert('El código ingresado ya existe. Por favor utilice otro.');
          document.getElementById('codigo').classList.add('input-error');
          return;
        }
      }

      // Lógica de guardado de imagen
      let imagenFinal = this.imagenPath;
      
      // Si hay una imagen seleccionada, la copiamos a la carpeta de datos de la app
      if (this.imagenPath) {
        // Delegamos el guardado de imagen al proceso principal
        const savedPath = await this.api.invoke('save-image', this.imagenPath, codigo);
        if (savedPath) imagenFinal = savedPath;
      }

      // Enviamos un objeto plano (DTO) en lugar de una instancia de clase
      const articuloData = {
        codigo: codigo,
        descripcion: document.getElementById('descripcion').value,
        costo: parseFloat(document.getElementById('costo').value),
        ganancia: parseFloat(document.getElementById('ganancia').value),
        iva: parseFloat(document.getElementById('iva').value),
        stock: parseInt(document.getElementById('stock').value),
        stockMinimo: parseInt(document.getElementById('stockMinimo').value),
        marcaId: parseInt(document.getElementById('marcaId').value),
        proveedorId: parseInt(document.getElementById('proveedorId').value),
        categoriaId: parseInt(document.getElementById('categoriaId').value),
        imagen: imagenFinal,
        protegido: document.getElementById('protegido').checked ? 1 : 0 // SQLite usa 1/0 para booleanos
      };

      await this.api.invoke('service-call', 'ArticuloService', 'guardar', articuloData);
      
      // Notificar a la ventana principal para recargar la tabla
      this.api.send('reload-data', codigo);
      
      if (mantenerAbierto) {
        this.limpiarFormulario();
      } else {
        window.close();
      }
    } catch (error) {
      alert('Error al guardar el artículo: ' + error.message);
    }
  }

  validarCampos() {
    let esValido = true;
    const requeridos = ['codigo', 'descripcion', 'costo', 'ganancia', 'stock', 'stockMinimo'];
    
    requeridos.forEach(id => {
      const el = document.getElementById(id);
      if (!el.value || el.value.trim() === '') {
        el.classList.add('input-error');
        esValido = false;
      } else {
        el.classList.remove('input-error');
      }
    });

    if (!esValido) {
      alert('Por favor, complete los campos obligatorios marcados en rojo.');
    }
    return esValido;
  }

  limpiarFormulario() {
    document.getElementById('articuloForm').reset();
    this.codigoEdicion = null;
    this.imagenPath = '';
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('noImageText').style.display = 'block';
    document.getElementById('formTitle').textContent = 'Nuevo Artículo';
    document.getElementById('codigo').readOnly = false;
    
    // Valores por defecto
    document.getElementById('protegido').checked = false;
    // Al limpiar, mostrar IVA Global por defecto
    document.getElementById('iva').value = this.config.ivaGlobal;
    
    document.getElementById('ganancia').value = 0;
    this.calcularPrecios();
    document.getElementById('descripcion').focus();
  }

  // --- Gestión del Modal ---

  abrirModal(tipo) {
    this.modalTipo = tipo;
    const titulo = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    document.getElementById('modalTitle').textContent = `Nueva ${titulo}`;
    document.getElementById('modalInputName').value = '';
    
    // Mostrar campo de contacto solo para proveedores
    const contactGroup = document.getElementById('modalContactGroup');
    if (tipo === 'proveedor') {
      contactGroup.style.display = 'block';
      document.getElementById('modalInputContact').value = '';
    } else {
      contactGroup.style.display = 'none';
    }

    document.getElementById('genericModal').style.display = 'flex';
    document.getElementById('modalInputName').focus();
  }

  cerrarModal() {
    document.getElementById('genericModal').style.display = 'none';
    this.modalTipo = null;
  }

  async guardarModal() {
    const nombre = document.getElementById('modalInputName').value.trim();
    if (!nombre) {
      alert('El nombre es obligatorio');
      return;
    }

    try {
      let result = { success: false };

      if (this.modalTipo === 'marca') {
        result = await this.api.invoke('service-call', 'MarcaService', 'agregar', nombre);
      } else if (this.modalTipo === 'proveedor') {
        const contacto = document.getElementById('modalInputContact').value.trim();
        result = await this.api.invoke('service-call', 'ProveedorService', 'agregar', nombre, contacto);
      } else if (this.modalTipo === 'categoria') {
        result = await this.api.invoke('service-call', 'CategoriaService', 'agregar', nombre);
      }

      if (result.success && result.data > 0) {
        const nuevoId = result.data;
        
        // Recargar combos y seleccionar el nuevo elemento
        await this.cargarCombos();
        
        // Seleccionar el recién creado
        if (this.modalTipo === 'marca') {
          document.getElementById('marcaId').value = nuevoId;
        } else if (this.modalTipo === 'proveedor') {
          document.getElementById('proveedorId').value = nuevoId;
        } else if (this.modalTipo === 'categoria') {
          document.getElementById('categoriaId').value = nuevoId;
        }

        this.cerrarModal();
      } else {
        alert('No se pudo guardar el registro.');
      }
    } catch (error) {
      alert('Error al guardar: ' + error.message);
    }
  }
}

// Inicializar el controlador
new ArticuloFormController();21