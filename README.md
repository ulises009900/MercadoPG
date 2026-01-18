# MercadoPG - Gestor de Stock

Aplicación de escritorio para gestión de inventario con funciones avanzadas.

## Características

- ✅ Gestión completa de artículos (CRUD)
- ✅ Control de stock con historial (entradas/salidas)
- ✅ Sistema de marcas y proveedores
- ✅ Alertas de stock crítico
- ✅ Ranking de productos más vendidos
- ✅ Exportación a CSV
- ✅ Configuración personalizable (colores, IVA, moneda)
- ✅ Búsqueda avanzada con filtros

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm start
```

## Arquitectura

```
src/
├── main.js                 # Proceso principal de Electron
├── models/                 # Modelos de datos (POO)
├── repositories/           # Acceso a base de datos
├── services/              # Lógica de negocio
├── controllers/           # Controladores de vistas
├── views/                 # Interfaces HTML
├── assets/               # CSS, imágenes, fuentes
└── database/             # Inicialización de BD
```

## Tecnologías

- **Electron** - Framework de aplicaciones de escritorio
- **Better-SQLite3** - Base de datos SQLite sincrónica
- **JavaScript ES6+** - Programación orientada a objetos
- **HTML5/CSS3** - Interfaz de usuario moderna
