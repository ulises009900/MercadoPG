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

## Escritorio + ngrok (QR remoto listo)

Para abrir MercadoPG de escritorio con URL publica ngrok automatica (sin exportar variables manualmente):

```bash
npm run desktop:ngrok
```

Tambien puedes usar doble click en Windows:

```text
mercadopg-desktop-ngrok.cmd
```

Este flujo:

1. Inicia ngrok en el puerto 3001.
2. Detecta la URL HTTPS publica.
3. Exporta `MERCADOPG_PUBLIC_URL` y `NGROK_URL`.
4. Abre el ejecutable desktop de MercadoPG.

Requisito: `ngrok` instalado y autenticado (`ngrok config add-authtoken ...`).

## APK Android (descargable)

### Generar APK local (Windows)

Requisitos: Java 17 + Android SDK + Gradle.

```bash
npm run apk:debug
```

APK generado en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Descargar APK desde CI (sin Android Studio local)

El workflow [build-android-apk](.github/workflows/build-android-apk.yml) genera un artifact descargable con el APK debug.

## Movil: conexion con servidor

En la app movil puedes configurar la URL del servidor API desde el campo `Servidor API`.

- Para uso en la misma red: URL de la PC (ej. `http://192.168.1.31:3001`)
- Para uso remoto: URL publica HTTPS de un backend accesible desde internet
- Si usas ngrok, pega la URL `https://xxxxx.ngrok-free.app` y la app la tratara como HTTPS.

Para que el QR del escritorio salga apuntando a ngrok, inicia Electron con la variable `MERCADOPG_PUBLIC_URL`:

```powershell
$env:MERCADOPG_PUBLIC_URL = 'https://xxxxx.ngrok-free.app'
npm start
```

Nota: sincronizacion bidireccional en tiempo real desde "cualquier parte" requiere backend publico siempre disponible. Si ambos dispositivos estan offline al mismo tiempo, la sincronizacion se aplica al reconectar.

## Probar en Expo (telefono)

Proyecto Expo creado en `mobile-app-expo/` para probar la app desde Expo Go.

Comandos desde la raiz del repo:

```bash
npm run mobile:expo:start
npm run mobile:expo:android
npm run mobile:expo:ios
npm run mobile:expo:web
npm run mobile:tunnel:start
```

Pasos:

1. Ejecutar MercadoPG en la PC (`npm start`) para levantar el servidor movil.
2. Si queres acceso por internet, abrir un tunel HTTPS con ngrok apuntando al puerto 3001 y exportar esa URL en `MERCADOPG_PUBLIC_URL`.
3. Ejecutar `npm run mobile:expo:start` para pruebas con Expo Go, o generar APK con EAS para instalar en telefono.
4. En el telefono, pegar la URL HTTPS publica de ngrok o la URL local de tu PC y abrir MercadoPG.

Si queres hacerlo todo junto en Windows, usa:

```powershell
npm run mobile:tunnel:start
```

Si queres levantar Expo y el tunel junto al escritorio en dos ventanas separadas, usa:

```cmd
levantar-todo.cmd
```

Checklist cuando el APK no conecta:

1. PC y telefono en la misma red WiFi.
2. Usar la URL HTTPS de ngrok si no queres depender de la red local.
3. Si usas red local, usar IP local de la PC, no `localhost` ni `127.0.0.1`.
4. Permitir Node/Electron en el firewall de Windows para red privada (puerto 3001).
5. Si cambias de red, volver a cargar la URL en la app del telefono.
6. El APK ya queda configurado con permisos de red Android y trafico HTTP habilitado para conexiones LAN, pero con ngrok ya no hace falta HTTP local.

## Arquitectura

```text
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
