const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const stylesPath = path.join(repoRoot, 'src', 'mobile', 'styles.css');
const bundlePath = path.join(repoRoot, 'src', 'mobile', 'app.bundle.js');
const outputPath = path.join(repoRoot, 'mobile-app-expo', 'offline-shell.generated.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function buildHtml({ styles, bundle }) {
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
    '  <title>MercadoPG Movil Offline</title>',
    '  <meta name="theme-color" content="#050505">',
    '  <style>',
    styles,
    '  </style>',
    '</head>',
    '<body>',
    '  <div id="root"></div>',
    '  <script>',
    bundle,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

function main() {
  const styles = readText(stylesPath);
  const bundle = readText(bundlePath);
  const html = buildHtml({ styles, bundle });
  const output = `export const OFFLINE_WEB_APP_HTML = ${JSON.stringify(html)};\n`;
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Offline shell generado en ${path.relative(repoRoot, outputPath)}`);
}

main();
