const db = require('./repositories/DatabaseRepository');
const { app } = require('electron'); // Importar app si se ejecuta con electron
const { MarcaService, ProveedorService, ArticuloService, StockService } = require('./services');
const { Articulo } = require('./models');

/**
 * Script para generar datos de prueba en la base de datos
 */
async function generarDatosPrueba() {
  try {
    console.log('🔄 Inicializando base de datos...');
    await db.initialize();

    console.log('📦 Creando marcas...');
    const marcas = [
      'Samsung',
      'Apple',
      'Xiaomi',
      'LG',
      'Sony',
      'HP',
      'Dell',
      'Logitech',
      'Razer',
      'Corsair'
    ];

    const marcaIds = {};
    for (const nombre of marcas) {
      const id = MarcaService.agregar(nombre);
      marcaIds[nombre] = id;
      console.log(`  ✓ Marca creada: ${nombre} (ID: ${id})`);
    }

    console.log('\n🚚 Creando proveedores...');
    const proveedores = [
      { nombre: 'Distribuidora Tech SA', contacto: '011-4567-8901' },
      { nombre: 'Mayorista Digital', contacto: '011-4567-8902' },
      { nombre: 'Import Electronics', contacto: '011-4567-8903' },
      { nombre: 'Computación Central', contacto: '011-4567-8904' },
      { nombre: 'Electro Mayorista', contacto: '011-4567-8905' }
    ];

    const proveedorIds = {};
    for (const prov of proveedores) {
      const id = ProveedorService.agregar(prov.nombre, prov.contacto);
      proveedorIds[prov.nombre] = id;
      console.log(`  ✓ Proveedor creado: ${prov.nombre} (ID: ${id})`);
    }

    console.log('\n📱 Creando artículos...');
    const articulos = [
      // Smartphones
      { codigo: 'SAM-S21', descripcion: 'Samsung Galaxy S21 128GB', costo: 450000, ganancia: 25, iva: 0, stock: 15, stockMinimo: 5, marca: 'Samsung', proveedor: 'Distribuidora Tech SA' },
      { codigo: 'APP-IP13', descripcion: 'iPhone 13 256GB', costo: 850000, ganancia: 20, iva: 0, stock: 8, stockMinimo: 3, marca: 'Apple', proveedor: 'Import Electronics' },
      { codigo: 'XIA-RED10', descripcion: 'Xiaomi Redmi Note 10 Pro', costo: 280000, ganancia: 30, iva: 0, stock: 25, stockMinimo: 10, marca: 'Xiaomi', proveedor: 'Distribuidora Tech SA' },
      { codigo: 'SAM-A52', descripcion: 'Samsung Galaxy A52 128GB', costo: 320000, ganancia: 28, iva: 0, stock: 12, stockMinimo: 5, marca: 'Samsung', proveedor: 'Mayorista Digital' },
      
      // Notebooks
      { codigo: 'HP-PAV15', descripcion: 'HP Pavilion 15 i5 8GB 256SSD', costo: 550000, ganancia: 22, iva: 0, stock: 6, stockMinimo: 2, marca: 'HP', proveedor: 'Computación Central' },
      { codigo: 'DELL-INS', descripcion: 'Dell Inspiron 15 i7 16GB 512SSD', costo: 780000, ganancia: 20, iva: 0, stock: 4, stockMinimo: 2, marca: 'Dell', proveedor: 'Import Electronics' },
      { codigo: 'HP-OMEN', descripcion: 'HP Omen Gaming i7 RTX3060', costo: 1200000, ganancia: 18, iva: 0, stock: 3, stockMinimo: 1, marca: 'HP', proveedor: 'Electro Mayorista' },
      
      // Monitores
      { codigo: 'LG-27UL', descripcion: 'Monitor LG 27" 4K UltraHD', costo: 380000, ganancia: 25, iva: 0, stock: 10, stockMinimo: 3, marca: 'LG', proveedor: 'Distribuidora Tech SA' },
      { codigo: 'SAM-24C', descripcion: 'Monitor Samsung 24" Curved FHD', costo: 220000, ganancia: 30, iva: 0, stock: 15, stockMinimo: 5, marca: 'Samsung', proveedor: 'Mayorista Digital' },
      
      // Periféricos
      { codigo: 'LOG-MX3', descripcion: 'Logitech MX Master 3 Mouse', costo: 85000, ganancia: 35, iva: 0, stock: 20, stockMinimo: 8, marca: 'Logitech', proveedor: 'Distribuidora Tech SA' },
      { codigo: 'RAZ-KB', descripcion: 'Razer BlackWidow V3 Keyboard', costo: 120000, ganancia: 32, iva: 0, stock: 12, stockMinimo: 5, marca: 'Razer', proveedor: 'Electro Mayorista' },
      { codigo: 'COR-HS70', descripcion: 'Corsair HS70 Pro Wireless Headset', costo: 95000, ganancia: 33, iva: 0, stock: 18, stockMinimo: 6, marca: 'Corsair', proveedor: 'Computación Central' },
      { codigo: 'LOG-C920', descripcion: 'Logitech C920 HD Pro Webcam', costo: 65000, ganancia: 38, iva: 0, stock: 22, stockMinimo: 8, marca: 'Logitech', proveedor: 'Mayorista Digital' },
      
      // Audio
      { codigo: 'SONY-WH', descripcion: 'Sony WH-1000XM4 Headphones', costo: 380000, ganancia: 25, iva: 0, stock: 7, stockMinimo: 3, marca: 'Sony', proveedor: 'Import Electronics' },
      { codigo: 'SONY-SRS', descripcion: 'Sony SRS-XB33 Bluetooth Speaker', costo: 95000, ganancia: 35, iva: 0, stock: 14, stockMinimo: 5, marca: 'Sony', proveedor: 'Electro Mayorista' },
      
      // Almacenamiento
      { codigo: 'SAM-SSD1', descripcion: 'Samsung 970 EVO Plus SSD 1TB', costo: 120000, ganancia: 28, iva: 0, stock: 16, stockMinimo: 6, marca: 'Samsung', proveedor: 'Distribuidora Tech SA' },
      { codigo: 'SAM-SSD2', descripcion: 'Samsung T7 SSD Externo 2TB', costo: 210000, ganancia: 26, iva: 0, stock: 11, stockMinimo: 4, marca: 'Samsung', proveedor: 'Import Electronics' },
      
      // Accesorios
      { codigo: 'LOG-PAD', descripcion: 'Logitech Powerplay Mouse Pad', costo: 115000, ganancia: 30, iva: 0, stock: 9, stockMinimo: 3, marca: 'Logitech', proveedor: 'Electro Mayorista' },
      { codigo: 'RAZ-PAD', descripcion: 'Razer Goliathus Extended XXL', costo: 35000, ganancia: 40, iva: 0, stock: 25, stockMinimo: 10, marca: 'Razer', proveedor: 'Mayorista Digital' },
      { codigo: 'COR-FAN', descripcion: 'Corsair LL120 RGB Fan 3-Pack', costo: 75000, ganancia: 35, iva: 0, stock: 13, stockMinimo: 5, marca: 'Corsair', proveedor: 'Computación Central' },
      
      // Stock crítico (para probar alertas)
      { codigo: 'APP-AIRP', descripcion: 'Apple AirPods Pro 2', costo: 280000, ganancia: 22, iva: 0, stock: 2, stockMinimo: 5, marca: 'Apple', proveedor: 'Import Electronics' },
      { codigo: 'XIA-MI11', descripcion: 'Xiaomi Mi 11 Ultra', costo: 720000, ganancia: 18, iva: 0, stock: 1, stockMinimo: 3, marca: 'Xiaomi', proveedor: 'Distribuidora Tech SA' },
    ];

    for (const art of articulos) {
      const articulo = new Articulo({
        codigo: art.codigo,
        descripcion: art.descripcion,
        costo: art.costo,
        ganancia: art.ganancia,
        iva: art.iva,
        stock: art.stock,
        stockMinimo: art.stockMinimo,
        marcaId: marcaIds[art.marca] || 0,
        proveedorId: proveedorIds[art.proveedor] || 0
      });

      ArticuloService.guardar(articulo);
      console.log(`  ✓ Artículo creado: ${art.codigo} - ${art.descripcion}`);
    }

    console.log('\n📊 Generando historial de movimientos...');
    
    // Entradas
    const entradas = [
      { codigo: 'SAM-S21', cantidad: 10 },
      { codigo: 'APP-IP13', cantidad: 5 },
      { codigo: 'LOG-MX3', cantidad: 15 },
      { codigo: 'HP-PAV15', cantidad: 8 },
      { codigo: 'SAM-24C', cantidad: 12 }
    ];

    for (const entrada of entradas) {
      try {
        StockService.entrada(entrada.codigo, entrada.cantidad);
        console.log(`  ✓ Entrada registrada: ${entrada.codigo} (+${entrada.cantidad})`);
      } catch (error) {
        console.log(`  ⚠ Error en entrada ${entrada.codigo}: ${error.message}`);
      }
    }

    // Salidas (ventas)
    const salidas = [
      { codigo: 'SAM-S21', cantidad: 8 },
      { codigo: 'APP-IP13', cantidad: 3 },
      { codigo: 'LOG-MX3', cantidad: 12 },
      { codigo: 'LOG-C920', cantidad: 6 },
      { codigo: 'SAM-24C', cantidad: 7 },
      { codigo: 'SONY-WH', cantidad: 4 },
      { codigo: 'RAZ-PAD', cantidad: 10 },
      { codigo: 'SAM-S21', cantidad: 5 },
      { codigo: 'XIA-RED10', cantidad: 8 },
      { codigo: 'LOG-MX3', cantidad: 5 },
      { codigo: 'COR-HS70', cantidad: 7 },
      { codigo: 'SAM-SSD1', cantidad: 4 }
    ];

    for (const salida of salidas) {
      try {
        StockService.salida(salida.codigo, salida.cantidad);
        console.log(`  ✓ Salida registrada: ${salida.codigo} (-${salida.cantidad})`);
      } catch (error) {
        console.log(`  ⚠ Error en salida ${salida.codigo}: ${error.message}`);
      }
    }

    console.log('\n✅ ¡Base de datos generada exitosamente!');
    console.log('\n📈 Resumen:');
    console.log(`  - ${marcas.length} marcas`);
    console.log(`  - ${proveedores.length} proveedores`);
    console.log(`  - ${articulos.length} artículos`);
    console.log(`  - ${entradas.length} entradas de stock`);
    console.log(`  - ${salidas.length} salidas de stock`);
    console.log('\n🎉 Puedes ejecutar "npm start" para ver la aplicación con datos!');

  } catch (error) {
    console.error('❌ Error al generar datos:', error.message);
    console.error(error.stack);
  }

  // Si se está ejecutando dentro de Electron, salir explícitamente
  if (process.versions.electron) {
    process.exit(0);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  if (app) {
    app.whenReady().then(generarDatosPrueba);
  } else {
    generarDatosPrueba();
  }
}

module.exports = generarDatosPrueba;
