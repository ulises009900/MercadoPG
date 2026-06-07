class ArticuloFormController {
  constructor() {
    this.codigoEdicion = null;
    this.imagenPath = '';
    this.modalTipo = null; // 'marca', 'proveedor', 'categoria'
    this.api = window.api; // Usar la API expuesta por preload
    this.config = { ivaGlobal: 21, cotizacionUsd: 1000 }; // Valores por defecto
    this.marcasList = [];
    this.proveedoresList = [];
    this.categoriasList = [];
    this.init();
  }

  async init() {
    this.setupEventListeners();
    
    // Iniciamos la carga de datos en segundo plano para no bloquear el registro de eventos
    const cargaInicial = Promise.all([this.cargarConfiguracion(), this.cargarCombos()]);
    
    // Escuchar si es edición o nuevo artículo
    // IMPORTANTE: Registramos el listener ANTES de cualquier await para capturar el evento a tiempo
    this.api.on('load-articulo', async (data) => {
      await cargaInicial; // Esperamos a que los datos estén listos antes de rellenar el formulario

      // Caso 1: Edición (recibe string con el código)
      if (typeof data === 'string' && data) {
        this.codigoEdicion = data;
        document.getElementById('formTitle').textContent = 'Editar Artículo';
        document.getElementById('codigo').readOnly = true;
        this.cargarDatos(data);
      } 
      // Caso 2: Nuevo con código escaneado (recibe objeto)
      else if (data && typeof data === 'object' && data.nuevo) {
        this.limpiarFormulario(); // Aplicar defaults (IVA, etc.)
        document.getElementById('codigo').value = data.codigo || '';
        if (data.codigo) this.renderizarBarcode(data.codigo);
        // Mantenemos codigoEdicion en null para que al guardar sea un INSERT
        // Poner foco en descripción para agilizar la carga
        setTimeout(() => document.getElementById('descripcion').focus(), 100);
      }
      // Caso 3: Nuevo artículo vacío (carga estándar)
      else {
        this.limpiarFormulario();
        setTimeout(() => document.getElementById('codigo').focus(), 100);
      }
    });

    // Esperamos a que termine la carga inicial para continuar con el resto del flujo
    await cargaInicial;

    // Escuchar cambios globales (configuración, tema, etc.)
    this.api.on('reload-data', async () => {
      await this.cargarConfiguracion();
      if (document.getElementById('costo').value) this.sincronizarCosto('ARS');
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
    ['ganancia', 'iva'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', () => this.calcularPrecios());
        element.addEventListener('keyup', () => this.calcularPrecios());
        element.addEventListener('change', () => this.calcularPrecios());
      }
    });

    // Eventos para Costo (ARS y USD) con sincronización
    const costoInput = document.getElementById('costo');
    const costoUsdInput = document.getElementById('costoUsd');
    
    if (costoInput) {
      costoInput.addEventListener('input', () => {
        this.sincronizarCosto('ARS');
        this.calcularPrecios();
      });
    }

    if (costoUsdInput) {
      costoUsdInput.addEventListener('input', () => {
        this.sincronizarCosto('USD');
        this.calcularPrecios();
      });
    }

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

    // Configurar botones de eliminación dinámicos
    this.setupDeleteControls();

    // Eventos del Modal
    document.getElementById('btnModalCancel').addEventListener('click', () => this.cerrarModal());
    document.getElementById('btnModalSave').addEventListener('click', () => this.guardarModal());

    // --- Buscador predictivo en el modal ---
    const modalInputName = document.getElementById('modalInputName');
    if (modalInputName) {
      // Crear contenedor de sugerencias dinámicamente
      const suggestionsBox = document.createElement('div');
      suggestionsBox.id = 'modalSuggestions';
      suggestionsBox.style.cssText = `
        max-height: 150px; overflow-y: auto; border: 1px solid #ddd; 
        display: none; background: white; position: absolute; 
        width: 100%; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      `;
      
      // Asegurar posición relativa en el padre para que el absolute funcione bien
      if (modalInputName.parentNode) {
        modalInputName.parentNode.style.position = 'relative';
        modalInputName.parentNode.appendChild(suggestionsBox);
      }

      // Escuchar escritura
      modalInputName.addEventListener('input', (e) => this.buscarCoincidencias(e.target.value));
      
      // Ocultar al perder foco (con delay para permitir el clic)
      modalInputName.addEventListener('blur', () => {
        setTimeout(() => { suggestionsBox.style.display = 'none'; }, 200);
      });
      
      // Mostrar al ganar foco si hay texto
      modalInputName.addEventListener('focus', (e) => {
        if (e.target.value.trim()) this.buscarCoincidencias(e.target.value);
      });
    }

    // Botón para descargar imagen del código de barras
    const btnDescargarBarcode = document.getElementById('btnDescargarBarcode');
    if (btnDescargarBarcode) {
      btnDescargarBarcode.addEventListener('click', () => this.descargarBarcode());
    }
  }

  async cargarCombos() {
    // Llamadas asíncronas a los servicios a través de IPC
    const [marcasRes, proveedoresRes, categoriasRes] = await Promise.all([
      this.api.invoke('service-call', 'MarcaService', 'listar'),
      this.api.invoke('service-call', 'ProveedorService', 'listar'),
      this.api.invoke('service-call', 'CategoriaService', 'listar') // Asumiendo que existe este método
    ]);

    this.marcasList = marcasRes.success ? marcasRes.data : [];
    this.proveedoresList = proveedoresRes.success ? proveedoresRes.data : [];
    this.categoriasList = (categoriasRes && categoriasRes.success) ? categoriasRes.data : [];

    const marcaSelect = document.getElementById('marcaId');
    marcaSelect.innerHTML = '<option value="0">Sin marca</option>';
    this.marcasList.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.nombre;
      marcaSelect.appendChild(option);
    });

    const proveedorSelect = document.getElementById('proveedorId');
    proveedorSelect.innerHTML = '<option value="0">Sin proveedor</option>';
    this.proveedoresList.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.nombre;
      proveedorSelect.appendChild(option);
    });

    const categoriaSelect = document.getElementById('categoriaId');
    categoriaSelect.innerHTML = '<option value="0">Sin categoría</option>';
    this.categoriasList.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      categoriaSelect.appendChild(option);
    });

    this.setupBuscadoresMain();
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
    this.sincronizarCosto('ARS'); // Calcular USD basado en el costo cargado
    document.getElementById('stock').value = articulo.stock;
    document.getElementById('stockMinimo').value = articulo.stockMinimo;
    document.getElementById('marcaId').value = articulo.marcaId || 0;
    document.getElementById('proveedorId').value = articulo.proveedorId || 0;
    document.getElementById('categoriaId').value = articulo.categoriaId || 0;
    document.getElementById('protegido').checked = articulo.protegido;

    this.actualizarBuscadoresMain();

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

  sincronizarCosto(origen) {
    const cotizacion = this.config.cotizacionUsd || 1;
    if (origen === 'ARS') {
      const ars = parseFloat(document.getElementById('costo').value);
      if (!isNaN(ars)) {
        document.getElementById('costoUsd').value = (ars / cotizacion).toFixed(2);
      } else {
        document.getElementById('costoUsd').value = '';
      }
    } else {
      const usd = parseFloat(document.getElementById('costoUsd').value);
      if (!isNaN(usd)) {
        document.getElementById('costo').value = (usd * cotizacion).toFixed(2);
      } else {
        document.getElementById('costo').value = '';
      }
    }
  }

  calcularPrecios() {
    const costo = parseFloat(document.getElementById('costo').value) || 0;
    const ganancia = parseFloat(document.getElementById('ganancia').value) || 0;
    const ivaInput = parseFloat(document.getElementById('iva').value) || 0;
    const protegido = document.getElementById('protegido').checked;
    
    // Obtener IVA Global con fallback por seguridad
    const ivaGlobalRaw = Number(this.config.ivaGlobal);
    const ivaGlobal = Number.isFinite(ivaGlobalRaw) ? ivaGlobalRaw : 21;

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

  async descargarBarcode() {
    const codigo = document.getElementById('codigo').value;
    if (!codigo) {
      alert('Debe existir un código para generar la imagen.');
      return;
    }

    const canvas = document.getElementById('barcodeCanvas');
    // Aseguramos que el canvas tenga el dibujo actualizado
    this.renderizarBarcode(codigo);
    
    const dataUrl = canvas.toDataURL('image/png');

    const filePath = await this.api.showSaveDialog({
      title: 'Guardar Código de Barras',
      defaultPath: `barcode_${codigo}.png`,
      filters: [{ name: 'Imagen PNG', extensions: ['png'] }]
    });

    if (filePath) {
      const result = await this.api.invoke('service-call', 'ExportService', 'guardarImagen', filePath, dataUrl);
      if (result.success) {
        alert('Imagen guardada correctamente.');
      } else {
        alert('Error al guardar la imagen: ' + result.error);
      }
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
    document.getElementById('costoUsd').value = '';
    this.actualizarBuscadoresMain();
    document.getElementById('protegido').checked = false;
    
    // Lógica inteligente para IVA por defecto:
    // Si en Configuración > Actualización Masiva dejaste "Todos los artículos", usamos ese valor.
    // Si no, usamos el IVA Global normal.
    let defaultIva = this.config.ivaGlobal;
    if (this.config.massIvaFilterType === 'all' && this.config.massIvaValue !== undefined) {
      defaultIva = this.config.massIvaValue;
    }
    document.getElementById('iva').value = defaultIva;
    
    // Lógica inteligente para Ganancia por defecto:
    let defaultGanancia = this.config.gananciaGlobal || 0;
    if (this.config.massGananciaFilterType === 'all' && this.config.massGananciaValue !== undefined) {
      defaultGanancia = this.config.massGananciaValue;
    }
    document.getElementById('ganancia').value = defaultGanancia;

    this.aplicarFiltrosConfigurados();
    this.calcularPrecios();
    document.getElementById('descripcion').focus();
  }

  aplicarFiltrosConfigurados() {
    const aplicar = (tipo, id) => {
      if (tipo && tipo !== 'all' && id) {
        const map = { marca: 'marcaId', proveedor: 'proveedorId', categoria: 'categoriaId' };
        const fieldId = map[tipo];
        if (fieldId) {
          const el = document.getElementById(fieldId);
          if (el) el.value = id;
        }
      }
    };

    // Intentamos aplicar tanto los filtros de IVA como los de Ganancia
    aplicar(this.config.massIvaFilterType, this.config.massIvaFilterId);
    aplicar(this.config.massGananciaFilterType, this.config.massGananciaFilterId);
  }

  /**
   * Crea e inyecta botones de eliminación al lado de los botones de agregar
   */
  setupDeleteControls() {
    const controls = [
      { btnId: 'btnNuevaMarca', selectId: 'marcaId', service: 'MarcaService', label: 'marca' },
      { btnId: 'btnNuevoProveedor', selectId: 'proveedorId', service: 'ProveedorService', label: 'proveedor' },
      { btnId: 'btnNuevaCategoria', selectId: 'categoriaId', service: 'CategoriaService', label: 'categoría' }
    ];

    controls.forEach(ctrl => {
      const addBtn = document.getElementById(ctrl.btnId);
      // Solo agregar si existe el botón de "Nuevo" y su padre
      if (addBtn && addBtn.parentNode) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '🗑️';
        delBtn.title = `Eliminar ${ctrl.label} seleccionada`;
        // Estilos para que se vea integrado pero distintivo (Rojo)
        delBtn.style.marginLeft = '5px';
        delBtn.style.padding = '2px 8px';
        delBtn.style.cursor = 'pointer';
        delBtn.style.backgroundColor = '#e74c3c';
        delBtn.style.color = 'white';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '4px';

        delBtn.addEventListener('click', async () => {
          const select = document.getElementById(ctrl.selectId);
          const id = parseInt(select.value);
          if (!id || id === 0) return alert(`Seleccione una ${ctrl.label} para eliminar.`);
          
          const nombre = select.options[select.selectedIndex].text;
          if (confirm(`¿Está seguro de eliminar "${nombre}"?\nEsta acción no se puede deshacer.`)) {
            const result = await this.api.invoke('service-call', ctrl.service, 'eliminar', id);
            if (result && result.success === false) alert('Error: ' + result.error);
            else { alert('Eliminado correctamente'); await this.cargarCombos(); }
          }
        });
        // Insertar el botón de eliminar justo después del botón de agregar
        addBtn.parentNode.insertBefore(delBtn, addBtn.nextSibling);
      }
    });
  }

  // --- Lógica del Buscador en Modal ---
  buscarCoincidencias(texto) {
    const suggestionsBox = document.getElementById('modalSuggestions');
    if (!suggestionsBox) return;

    if (!texto || texto.trim() === '') {
      suggestionsBox.style.display = 'none';
      return;
    }

    let lista = [];
    if (this.modalTipo === 'marca') lista = this.marcasList;
    else if (this.modalTipo === 'proveedor') lista = this.proveedoresList;
    else if (this.modalTipo === 'categoria') lista = this.categoriasList;

    const coincidencias = lista.filter(item => item.nombre.toLowerCase().includes(texto.toLowerCase()));

    suggestionsBox.innerHTML = '';
    if (coincidencias.length > 0) {
      suggestionsBox.style.display = 'block';
      coincidencias.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.nombre;
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; color: #333;';
        div.addEventListener('mouseover', () => div.style.backgroundColor = '#f0f0f0');
        div.addEventListener('mouseout', () => div.style.backgroundColor = 'white');
        div.addEventListener('click', () => {
          // Seleccionar el existente y cerrar modal
          const selectId = this.modalTipo + 'Id'; // marcaId, proveedorId, etc.
          const select = document.getElementById(selectId);
          if (select) select.value = item.id;
          this.cerrarModal();
        });
        suggestionsBox.appendChild(div);
      });
    } else {
      suggestionsBox.style.display = 'none';
    }
  }

  // --- Buscadores Predictivos en Formulario Principal ---
  setupBuscadoresMain() {
    const configs = [
      { type: 'marca', list: this.marcasList },
      { type: 'proveedor', list: this.proveedoresList },
      { type: 'categoria', list: this.categoriasList }
    ];

    configs.forEach(cfg => {
      const select = document.getElementById(`${cfg.type}Id`);
      if (!select) return;

      // Si ya existe el wrapper, solo actualizamos el valor
      if (document.getElementById(`search_wrapper_${cfg.type}`)) {
        this.actualizarInputBuscador(cfg.type, cfg.list);
        return;
      }

      // Ocultar select original
      select.style.display = 'none';

      // Crear wrapper
      const wrapper = document.createElement('div');
      wrapper.id = `search_wrapper_${cfg.type}`;
      wrapper.style.position = 'relative';
      wrapper.style.flex = '1';
      wrapper.style.marginRight = '5px'; // Espacio con el botón +

      // Crear input
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `search_input_${cfg.type}`;
      input.className = select.className; // Heredar estilos
      input.placeholder = 'Escriba para buscar...';
      input.autocomplete = 'off';
      
      // Crear caja de sugerencias
      const box = document.createElement('div');
      box.id = `suggestions_main_${cfg.type}`;
      box.style.cssText = `
        max-height: 200px; overflow-y: auto; border: 1px solid #ddd; 
        display: none; background: white; position: absolute; 
        width: 100%; z-index: 100; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        top: 100%; left: 0;
      `;

      // Insertar en el DOM
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(input);
      wrapper.appendChild(box);

      // Eventos
      input.addEventListener('input', (e) => this.filtrarBuscadorMain(e.target.value, cfg.type, cfg.list));
      input.addEventListener('focus', (e) => this.filtrarBuscadorMain(e.target.value, cfg.type, cfg.list));
      input.addEventListener('blur', () => {
        setTimeout(() => {
          box.style.display = 'none';
          this.validarTextoBuscador(cfg.type, cfg.list);
        }, 200);
      });

      this.actualizarInputBuscador(cfg.type, cfg.list);
    });
  }

  filtrarBuscadorMain(texto, type, list) {
    const box = document.getElementById(`suggestions_main_${type}`);
    const select = document.getElementById(`${type}Id`);
    const input = document.getElementById(`search_input_${type}`);
    
    const matches = list.filter(item => item.nombre.toLowerCase().includes(texto.toLowerCase()));
    
    box.innerHTML = '';
    if (matches.length > 0) {
      box.style.display = 'block';
      matches.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.nombre;
        div.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; color: black;';
        div.addEventListener('mouseover', () => div.style.backgroundColor = '#f0f0f0');
        div.addEventListener('mouseout', () => div.style.backgroundColor = 'white');
        div.addEventListener('click', () => {
          select.value = item.id;
          input.value = item.nombre;
          box.style.display = 'none';
        });
        box.appendChild(div);
      });
    } else {
      box.style.display = 'none';
    }
  }

  validarTextoBuscador(type, list) {
    const input = document.getElementById(`search_input_${type}`);
    const select = document.getElementById(`${type}Id`);
    const texto = input.value.trim();
    
    const item = list.find(i => i.nombre.toLowerCase() === texto.toLowerCase());
    if (item) {
      select.value = item.id;
    } else {
      // Si no coincide, revertir al valor seleccionado o limpiar si está vacío
      if (texto === '') {
        select.value = 0;
      } else {
        this.actualizarInputBuscador(type, list);
      }
    }
  }

  actualizarInputBuscador(type, list) {
    const select = document.getElementById(`${type}Id`);
    const input = document.getElementById(`search_input_${type}`);
    if (select && input) {
      const item = list.find(i => i.id == select.value);
      input.value = item ? item.nombre : '';
    }
  }

  actualizarBuscadoresMain() {
    this.actualizarInputBuscador('marca', this.marcasList);
    this.actualizarInputBuscador('proveedor', this.proveedoresList);
    this.actualizarInputBuscador('categoria', this.categoriasList);
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
    const box = document.getElementById('modalSuggestions');
    if (box) box.style.display = 'none';
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
        
        // Guardar selecciones actuales antes de recargar para no perderlas
        const currentMarca = document.getElementById('marcaId').value;
        const currentProveedor = document.getElementById('proveedorId').value;
        const currentCategoria = document.getElementById('categoriaId').value;

        // Recargar combos y seleccionar el nuevo elemento
        await this.cargarCombos();
        
        // Restaurar selecciones anteriores
        if (currentMarca) document.getElementById('marcaId').value = currentMarca;
        if (currentProveedor) document.getElementById('proveedorId').value = currentProveedor;
        if (currentCategoria) document.getElementById('categoriaId').value = currentCategoria;

        // Seleccionar el recién creado
        if (this.modalTipo === 'marca') {
          document.getElementById('marcaId').value = nuevoId;
        } else if (this.modalTipo === 'proveedor') {
          document.getElementById('proveedorId').value = nuevoId;
        } else if (this.modalTipo === 'categoria') {
          document.getElementById('categoriaId').value = nuevoId;
        }

        this.actualizarBuscadoresMain();

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