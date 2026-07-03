import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserMultiFormatReader } from '@zxing/browser';

class MobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error en app movil:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetLocal = () => {
    try {
      const keys = [
        'mercadopg.mobile.cache.v1',
        'mercadopg.mobile.queue.v1',
        'mercadopg.mobile.catalogs.v1',
        'mercadopg.mobile.conflicts.v1',
        'mercadopg.mobile.history.v1',
        'mercadopg.mobile.image-map.v1',
        'mercadopg.mobile.notes.v1',
        'mercadopg.mobile.last-selected-code.v1',
        'mercadopg.mobile.last-search.v1'
      ];
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      // noop
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="shell">
          <div className="notice error">
            La app detecto un error inesperado. Cierra y vuelve a abrir.
          </div>
          <section className="detail">
            <h2>Detalle técnico</h2>
            <p className="ops-empty">{String(this.state.error?.message || 'Sin detalle')}</p>
            <div className="detail-actions">
              <button type="button" onClick={this.handleReload}>Reintentar</button>
              <button type="button" className="secondary" onClick={this.handleResetLocal}>Reiniciar datos locales</button>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

const CACHE_KEY = 'mercadopg.mobile.cache.v1';
const QUEUE_KEY = 'mercadopg.mobile.queue.v1';
const CATALOGS_KEY = 'mercadopg.mobile.catalogs.v1';
const CONFLICTS_KEY = 'mercadopg.mobile.conflicts.v1';
const HISTORY_KEY = 'mercadopg.mobile.history.v1';
const CLIENT_VERSION_KEY = 'mercadopg.mobile.client-version';
const API_BASE_KEY = 'mercadopg.mobile.api-base';
const PC_HOST_KEY = 'mercadopg.mobile.pc-host';
const DRIVE_TOKEN_KEY = 'mercadopg.mobile.drive-token';
const DRIVE_CLIENT_ID_KEY = 'mercadopg.mobile.drive-client-id';
const DRIVE_EMAIL_KEY = 'mercadopg.mobile.drive-email';
const DRIVE_BACKUP_URL_KEY = 'mercadopg.mobile.drive-backup-url';
const DRIVE_AUTO_SYNC_KEY = 'mercadopg.mobile.drive-auto-sync';
const DRIVE_LAST_BACKUP_KEY = 'mercadopg.mobile.drive-last-backup';
const IMAGE_MAP_KEY = 'mercadopg.mobile.image-map.v1';
const LAST_SELECTED_CODE_KEY = 'mercadopg.mobile.last-selected-code.v1';
const LAST_SEARCH_KEY = 'mercadopg.mobile.last-search.v1';
const NOTES_KEY = 'mercadopg.mobile.notes.v1';
const IS_EMBEDDED_EXPO_WEBVIEW = typeof window !== 'undefined' && (
  Boolean(window.ReactNativeWebView)
  || /MercadoPGMobile/i.test(String((typeof navigator !== 'undefined' && navigator.userAgent) || ''))
);

function formatCurrency(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sameValue(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na === nb;
  }
  return String(a ?? '') === String(b ?? '');
}

function shortDate(value) {
  try {
    return new Date(value).toLocaleString('es-AR', { hour12: false });
  } catch {
    return value;
  }
}

function formatOpLabel(op) {
  const base = op.codigo ? `${op.codigo}` : 'Sin codigo';
  switch (op.type) {
    case 'stock-entry': return `Entrada de stock · ${base}`;
    case 'stock-exit': return `Salida de stock · ${base}`;
    case 'article-update': return `Edicion de articulo · ${base}`;
    case 'article-create': return `Alta de articulo · ${base}`;
    case 'article-delete': return `Baja de articulo · ${base}`;
    case 'nota-create': return `Nueva nota · ${op.payload?.titulo || 'Sin titulo'}`;
    case 'nota-update': return `Edicion de nota · ${op.payload?.titulo || 'Sin titulo'}`;
    case 'nota-delete': return `Baja de nota`;
    default: return `Operacion · ${base}`;
  }
}

function buildRankingModel(items) {
  try {
    const source = (Array.isArray(items) ? items : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        codigo: String(item.codigo || ''),
        descripcion: String(item.descripcion || 'Sin descripcion'),
        stock: Number(item.stock || 0),
        stockMinimo: Number(item.stockMinimo || 0),
        precioFinal: Number(item.precioFinal || 0)
      }));

    const rankingStockList = [...source]
      .sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))
      .slice(0, 20);

    const rankingByValue = [...source]
      .sort((a, b) => Number(b.precioFinal || 0) - Number(a.precioFinal || 0))
      .slice(0, 20);

    const faltantes = source
      .filter((item) => Number(item.stock || 0) <= Number(item.stockMinimo || 0))
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

    return { rankingStockList, rankingByValue, faltantes, error: '' };
  } catch (error) {
    return {
      rankingStockList: [],
      rankingByValue: [],
      faltantes: [],
      error: String(error?.message || 'Error desconocido al preparar ranking.')
    };
  }
}

function defaultCreateForm(config = {}) {
  return {
    codigo: '',
    descripcion: '',
    costo: '',
    ganancia: String(config.gananciaGlobal ?? 0),
    iva: String(config.ivaGlobal ?? 21),
    stock: '0',
    stockMinimo: '0',
    marcaId: '0',
    proveedorId: '0',
    categoriaId: '0'
  };
}

function normalizeItem(item) {
  return {
    ...item,
    stock: Number(item.stock || 0),
    stockMinimo: Number(item.stockMinimo || 0),
    costo: Number(item.costo || 0),
    ganancia: Number(item.ganancia || 0),
    iva: Number(item.iva || 0),
    precioFinal: Number(item.precioFinal || 0),
    stockCritico: Boolean(item.stockCritico)
  };
}

function extractImageName(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) {
    return '';
  }
  const noQuery = raw.split('?')[0];
  const segments = noQuery.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || '';
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isImageMimeType(value) {
  return /^image\//i.test(String(value || ''));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

async function fileToCompressedImage(file, maxSize = 1280, quality = 0.82) {
  const originalDataUrl = await fileToDataUrl(file);
  if (!isImageMimeType(file.type)) {
    return { dataUrl: originalDataUrl, fileName: file.name || `imagen_${Date.now()}.png` };
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
    img.src = originalDataUrl;
  });

  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) {
    return { dataUrl: originalDataUrl, fileName: file.name || `imagen_${Date.now()}.png` };
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (scale >= 1) {
    return { dataUrl: originalDataUrl, fileName: file.name || `imagen_${Date.now()}.png` };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: originalDataUrl, fileName: file.name || `imagen_${Date.now()}.png` };
  }

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  const mimeType = /^image\/png$/i.test(file.type) ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, mimeType === 'image/png' ? undefined : quality);
  const safeExt = mimeType === 'image/png' ? 'png' : 'jpg';
  return {
    dataUrl,
    fileName: (file.name || `imagen_${Date.now()}.${safeExt}`).replace(/\.[^.]+$/, `.${safeExt}`)
  };
}

function ChecklistEditor({ contenido, onSave }) {
  const [items, setItems] = React.useState(() => {
    try { return JSON.parse(contenido || '[]'); } catch { return []; }
  });

  const updateItems = (newItems) => {
    setItems(newItems);
    onSave(JSON.stringify(newItems));
  };

  const addItem = () => {
    updateItems([...items, { checked: false, text: '' }]);
  };

  const toggleItem = (index) => {
    const next = [...items];
    next[index].checked = !next[index].checked;
    updateItems(next);
  };

  const editItem = (index, text) => {
    const next = [...items];
    next[index].text = text;
    updateItems(next);
  };

  const removeItem = (index) => {
    updateItems(items.filter((_, i) => i !== index));
  };

  return (
    <div className="checklist-editor-mobile">
      {items.length === 0 ? <p className="checklist-empty">Todavia no hay tareas. Agrega el primer item.</p> : null}
      {items.map((item, index) => (
        <div key={index} className={`checklist-row ${item.checked ? 'done' : ''}`}>
          <input
            className="checklist-toggle"
            type="checkbox"
            checked={item.checked}
            onChange={() => toggleItem(index)}
          />
          <input
            className="checklist-text"
            type="text"
            value={item.text}
            onChange={(e) => editItem(index, e.target.value)}
            placeholder="Escribe una tarea..."
          />
          <button
            className="secondary checklist-remove"
            type="button"
            aria-label="Eliminar tarea"
            onClick={() => removeItem(index)}
          >
            ×
          </button>
        </div>
      ))}
      <button className="secondary checklist-add" type="button" onClick={addItem}>+ Agregar item</button>
    </div>
  );
}

function isDriveExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = String(url.hostname || '').toLowerCase();
    if (!/^https?:$/i.test(url.protocol)) {
      return false;
    }
    return host.includes('drive.google.com') || host.includes('docs.google.com');
  } catch {
    return false;
  }
}

function shouldDefaultToHttps(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw.includes('.ngrok-free.app') || raw.includes('.ngrok.app') || raw.includes('.ngrok.io') || raw.includes('.ngrok.dev');
}

function normalizeApiInput(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }

  const scheme = shouldDefaultToHttps(raw) ? 'https' : 'http';
  return `${scheme}://${raw.replace(/\/+$/, '')}`;
}

function buildFallbackApiFromHost(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    return normalizeApiInput(raw);
  }

  if (shouldDefaultToHttps(raw)) {
    return `https://${raw.replace(/\/+$/, '')}`;
  }

  return raw.includes(':') ? `http://${raw}` : `http://${raw}:3001`;
}

function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const installIntent = params.get('install') === '1';
  const requestedVersion = params.get('appv') || '';
  const apiFromQr = params.get('api') || '';
  const backupFromQr = params.get('backup') || '';
  const autoBackupFromQr = params.get('autobackup') === '1';
  const storedPcHost = localStorage.getItem(PC_HOST_KEY) || '';
  const storedApiBase = localStorage.getItem(API_BASE_KEY) || '';
  const originApi = window.location.origin.startsWith('http') ? window.location.origin : '';
  const fallbackApi = storedPcHost ? buildFallbackApiFromHost(storedPcHost) : '';
  const initialApiBase = apiFromQr || storedApiBase || fallbackApi || originApi;

  const [items, setItems] = useState(() => readJson(CACHE_KEY, []));
  const [selectedCode, setSelectedCode] = useState(() => localStorage.getItem(LAST_SELECTED_CODE_KEY) || null);
  const [selected, setSelected] = useState(() => {
    const lastCode = localStorage.getItem(LAST_SELECTED_CODE_KEY) || '';
    if (!lastCode) return null;
    const cachedItems = readJson(CACHE_KEY, []).map(normalizeItem);
    return cachedItems.find((item) => item.codigo === lastCode) || null;
  });
  const [search, setSearch] = useState(() => localStorage.getItem(LAST_SEARCH_KEY) || '');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState({ running: false, primaryUrl: window.location.origin, offline: false });
  const [activeSection, setActiveSection] = useState('mercado');
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [pcHost, setPcHost] = useState(() => storedPcHost);
  const [quantity, setQuantity] = useState('1');
  const [form, setForm] = useState({ descripcion: '', costo: '', ganancia: '', iva: '', stockMinimo: '' });
  const [catalogs, setCatalogs] = useState(() => readJson(CATALOGS_KEY, { marcas: [], proveedores: [], categorias: [], config: {} }));
  const [createForm, setCreateForm] = useState(() => defaultCreateForm(readJson(CATALOGS_KEY, { config: {} }).config || {}));
  const [message, setMessage] = useState(null);
  const [fatalError, setFatalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingOps, setPendingOps] = useState(() => readJson(QUEUE_KEY, []));
  const [pendingCount, setPendingCount] = useState(() => pendingOps.length);
  const [notas, setNotas] = useState(() => readJson(NOTES_KEY, []));
  const [conflicts, setConflicts] = useState(() => readJson(CONFLICTS_KEY, []));
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const [createOpen, setCreateOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [driveDir, setDriveDir] = useState('');
  const [driveClientId, setDriveClientId] = useState(() => localStorage.getItem(DRIVE_CLIENT_ID_KEY) || '');
  const [driveToken, setDriveToken] = useState(() => localStorage.getItem(DRIVE_TOKEN_KEY) || '');
  const [driveEmail, setDriveEmail] = useState(() => localStorage.getItem(DRIVE_EMAIL_KEY) || '');
  const [driveConnected, setDriveConnected] = useState(() => !!localStorage.getItem(DRIVE_TOKEN_KEY));
  const [driveBusy, setDriveBusy] = useState(false);
  const [backupFolderUrl, setBackupFolderUrl] = useState(() => backupFromQr || localStorage.getItem(DRIVE_BACKUP_URL_KEY) || '');
  const [autoBackupSync, setAutoBackupSync] = useState(() => (autoBackupFromQr ? true : localStorage.getItem(DRIVE_AUTO_SYNC_KEY) !== '0'));
  const [driveBackups, setDriveBackups] = useState([]);
  const [imageMap, setImageMap] = useState(() => readJson(IMAGE_MAP_KEY, {}));
  const [createImageDraft, setCreateImageDraft] = useState({ dataUrl: '', fileName: '' });
  const [selectedImageDraft, setSelectedImageDraft] = useState({ dataUrl: '', fileName: '' });
  const queueRef = useRef(readJson(QUEUE_KEY, []));
  const conflictsRef = useRef(readJson(CONFLICTS_KEY, []));
  const historyRef = useRef(readJson(HISTORY_KEY, []));
  const imageMapRef = useRef(readJson(IMAGE_MAP_KEY, {}));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const zxingReaderRef = useRef(null);
  const backupAutoPasteRef = useRef('');

  async function loadDriveDir() {
    try {
      const data = await fetchJson('/api/config/drive-dir');
      setDriveDir(data.driveBackupDir || '');
    } catch {
      // sin conexion, no pasa nada
    }
  }

  function saveDriveClientId() {
    const id = driveClientId.trim();
    if (!id) {
      setMessage({ type: 'error', text: 'Pegá el Client ID de Google Cloud.' });
      return;
    }
    localStorage.setItem(DRIVE_CLIENT_ID_KEY, id);
    setMessage({ type: 'success', text: 'Client ID guardado. Ya podés conectar con Google.' });
  }

  function driveSignIn() {
    const clientId = driveClientId.trim();
    if (!clientId) {
      setMessage({ type: 'error', text: 'Primero guardá el Client ID de Google Cloud.' });
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin + '/',
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive.file email profile',
      include_granted_scopes: 'true'
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  function driveSignOut() {
    localStorage.removeItem(DRIVE_TOKEN_KEY);
    localStorage.removeItem(DRIVE_EMAIL_KEY);
    setDriveToken('');
    setDriveEmail('');
    setDriveConnected(false);
    setMessage({ type: 'success', text: 'Desconectado de Google Drive.' });
  }

  async function driveGetOrCreateFolder(token, name, parentId) {
    const q = parentId
      ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Error ${res.status}`);
    }
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) })
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(created.error?.message || 'Error al crear carpeta en Drive');
    return created.id;
  }

  async function driveMakeBackup() {
    if (!driveToken) {
      setMessage({ type: 'error', text: 'Conectate a Google Drive primero.' });
      return;
    }
    setDriveBusy(true);
    try {
      const rootId = await driveGetOrCreateFolder(driveToken, 'MercadoPG', null);
      const backupsFolderId = await driveGetOrCreateFolder(driveToken, 'Backups', rootId);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupData = {
        timestamp: new Date().toISOString(),
        source: 'mobile',
        articulos: items,
        catalogs,
        queue: pendingOps,
        history
      };
      const fileName = `backup_mobile_${timestamp}.json`;
      const metaBlob = new Blob([JSON.stringify({ name: fileName, parents: [backupsFolderId] })], { type: 'application/json' });
      const fileBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const form = new FormData();
      form.append('metadata', metaBlob);
      form.append('file', fileBlob);
      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driveToken}` },
        body: form
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        if (uploadRes.status === 401) {
          localStorage.removeItem(DRIVE_TOKEN_KEY);
          setDriveToken('');
          setDriveConnected(false);
          throw new Error('Sesión de Drive expirada. Volvé a conectar.');
        }
        throw new Error(err.error?.message || `Error ${uploadRes.status}`);
      }
      setMessage({ type: 'success', text: `✓ Backup subido a Drive/MercadoPG/Backups/${fileName}` });
    } catch (err) {
      setMessage({ type: 'error', text: `Error Drive: ${err.message}` });
    } finally {
      setDriveBusy(false);
    }
  }

  function extractDriveResource(url) {
    const value = String(url || '').trim();
    if (!value) {
      return null;
    }

    const folderMatch = value.match(/\/folders\/([a-zA-Z0-9-_]+)/) || value.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (folderMatch && value.includes('/folders/')) {
      return { id: folderMatch[1], type: 'folder' };
    }

    const fileMatch = value.match(/\/d\/([a-zA-Z0-9-_]+)/) || value.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (fileMatch) {
      return { id: fileMatch[1], type: 'file' };
    }

    if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) {
      return { id: value, type: 'file' };
    }

    return null;
  }

  function parseBackupPayloadText(text) {
    const cleaned = text.trim();
    if (!cleaned) {
      throw new Error('El archivo descargado está vacío.');
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error('El archivo no tiene formato JSON válido.');
    }
  }

  async function readBackupPayload(response) {
    const text = await response.text();
    return parseBackupPayloadText(text);
  }

  function extractDriveConfirmUrl(htmlText) {
    const html = String(htmlText || '');
    const hrefMatch = html.match(/href=\"([^\"]*(?:uc\?export=download|drive\.usercontent\.google\.com\/download)[^\"]*)\"/i);
    if (hrefMatch && hrefMatch[1]) {
      return new URL(hrefMatch[1].replace(/&amp;/g, '&'), 'https://drive.google.com').toString();
    }

    const formActionMatch = html.match(/<form[^>]*id=\"download-form\"[^>]*action=\"([^\"]+)\"/i);
    if (formActionMatch && formActionMatch[1]) {
      return new URL(formActionMatch[1].replace(/&amp;/g, '&'), 'https://drive.google.com').toString();
    }

    return '';
  }

  function extractJsonFromText(text) {
    const cleaned = String(text || '').trim();
    if (!cleaned) {
      return null;
    }

    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      return parseBackupPayloadText(cleaned);
    }

    return null;
  }

  async function fetchDriveText(url, headers) {
    const response = await fetch(url, { headers, redirect: 'follow' });
    if (!response.ok) {
      return { ok: false, text: '', contentType: '' };
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();
    return { ok: true, text, contentType };
  }

  async function downloadDriveBackupPayload(fileId) {
    if (driveToken) {
      const privateRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${driveToken}` }
      });

      if (privateRes.ok) {
        return readBackupPayload(privateRes);
      }
    }

    const encodedId = encodeURIComponent(fileId);
    const fallbackUrls = [
      `https://drive.usercontent.google.com/download?id=${encodedId}&export=download&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${encodedId}&confirm=t`,
      `https://drive.google.com/uc?id=${encodedId}&export=download`
    ];

    for (const url of fallbackUrls) {
      const result = await fetchDriveText(url);
      if (!result.ok) {
        continue;
      }

      const directJson = extractJsonFromText(result.text);
      if (directJson) {
        return directJson;
      }

      const confirmUrl = extractDriveConfirmUrl(result.text);
      if (!confirmUrl) {
        continue;
      }

      const confirmResult = await fetchDriveText(confirmUrl);
      if (!confirmResult.ok) {
        continue;
      }

      const confirmedJson = extractJsonFromText(confirmResult.text);
      if (confirmedJson) {
        return confirmedJson;
      }
    }

    throw new Error('No se pudo descargar el backup automáticamente desde Drive. Compartí el archivo como "Cualquier persona con el enlace".');
  }

  function isBackupJsonName(name) {
    const normalized = String(name || '').toLowerCase();
    if (!normalized.endsWith('.json')) {
      return false;
    }
    return normalized.includes('backup') || normalized.includes('mercadopg');
  }

  function sortBackupsByPriority(entries) {
    const score = (name) => {
      const normalized = String(name || '').toLowerCase();
      if (normalized.includes('backup_mobile_full')) return 100;
      if (normalized.includes('backup_mobile')) return 80;
      if (normalized.includes('backup')) return 60;
      return 10;
    };

    return [...entries].sort((a, b) => {
      const byScore = score(b.name) - score(a.name);
      if (byScore !== 0) return byScore;
      return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
    });
  }

  async function listDriveChildren(folderId, authToken = '') {
    const q = `'${folderId}' in parents and trashed=false`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`, { headers });
    if (!res.ok) {
      throw new Error('No se pudo acceder a la carpeta de Drive.');
    }
    const data = await res.json();
    return data.files || [];
  }

  async function collectFolderBackups(folderId, authToken = '') {
    const directChildren = await listDriveChildren(folderId, authToken);

    const directBackupFiles = directChildren
      .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
      .filter((file) => isBackupJsonName(file.name));

    if (directBackupFiles.length > 0) {
      return sortBackupsByPriority(directBackupFiles);
    }

    const backupFolders = directChildren
      .filter((file) => file.mimeType === 'application/vnd.google-apps.folder')
      .filter((file) => String(file.name || '').toLowerCase().includes('backup'))
      .slice(0, 20);

    if (backupFolders.length === 0) {
      return [];
    }

    const nestedLists = await Promise.all(
      backupFolders.map(async (folder) => {
        const children = await listDriveChildren(folder.id, authToken);
        return children
          .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
          .filter((file) => isBackupJsonName(file.name))
          .map((file) => ({
            ...file,
            name: `${folder.name}/${file.name}`
          }));
      })
    );

    return sortBackupsByPriority(nestedLists.flat());
  }

  async function resolveLatestBackupFromFolder(folderId) {
    if (driveToken) {
      const privateFiles = await collectFolderBackups(folderId, driveToken);
      if (privateFiles.length > 0) {
        return privateFiles[0];
      }
    }

    // Intento sin token para carpetas/archivos totalmente públicos.
    const publicFiles = await collectFolderBackups(folderId, '');
    if (publicFiles.length > 0) {
      return publicFiles[0];
    }

    return null;
  }

  async function processDriveUrl() {
    const url = backupFolderUrl.trim();
    if (!url) {
      setMessage({ type: 'error', text: 'Pegá una URL de Google Drive.' });
      return;
    }

    const info = extractDriveResource(url);
    if (!info) {
      setMessage({ type: 'error', text: 'Ingresá una URL de carpeta o archivo de Drive válida.' });
      return;
    }

    if (info.type === 'file') {
      await loadDriveBackupFile(info.id, { backupMarker: `file:${info.id}` });
      return;
    }

    // Link de CARPETA: no se puede listar sin OAuth. Guiar al usuario.
    setMessage({
      type: 'info',
      text: '⚠️ Pegaste un link de carpeta. Para que funcione sin abrir Drive: abrí esa carpeta en el navegador de la PC, buscá el archivo "backup_latest.json", hacé clic derecho → Compartir → Copiar enlace, y pegá ese link directo aquí.'
    });
  }

  function normalizeBackupData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    if (Array.isArray(rawData.articulos)) {
      return rawData;
    }

    if (rawData.db && Array.isArray(rawData.db.articulos)) {
      return {
        ...rawData,
        articulos: rawData.db.articulos,
        catalogs: rawData.catalogs || rawData.db.catalogs || rawData.db.catalogos,
        history: rawData.history || rawData.db.history,
        images: rawData.images || rawData.db.images
      };
    }

    if (Array.isArray(rawData.items)) {
      return {
        ...rawData,
        articulos: rawData.items,
        catalogs: rawData.catalogs,
        history: rawData.history,
        images: rawData.images
      };
    }

    return null;
  }

  async function loadDriveBackupFile(fileId, options = {}) {
    const { silent = false, closeSettings = true, backupMarker = '' } = options;
    setDriveBusy(true);
    try {
      const rawData = await downloadDriveBackupPayload(fileId);
      const data = normalizeBackupData(rawData);

      if (data && Array.isArray(data.articulos)) {
        applyBackupPayload(data, { silent, backupMarker });
        if (closeSettings) {
          setSettingsOpen(false);
        }
      } else {
        throw new Error('El archivo descargado no tiene un formato de backup compatible de MercadoPG.');
      }
    } catch (err) {
      if (!silent) {
        setMessage({ type: 'error', text: `Error al cargar backup: ${err.message}` });
      }
    } finally {
      setDriveBusy(false);
    }
  }

  async function syncLatestBackupSilently() {
    if (!autoBackupSync || driveBusy) {
      return;
    }

    const url = backupFolderUrl.trim();
    if (!url) {
      return;
    }

    const info = extractDriveResource(url);
    if (!info) {
      return;
    }

    try {
      if (info.type === 'file') {
        const marker = `file:${info.id}`;
        if (localStorage.getItem(DRIVE_LAST_BACKUP_KEY) === marker) {
          return;
        }
        await loadDriveBackupFile(info.id, { silent: true, closeSettings: false, backupMarker: marker });
        return;
      }

      // Carpeta: no se puede sincronizar sin OAuth. Ignorar silenciosamente.
    } catch {
      // Modo silencioso.
    }
  }

  async function saveDriveDir() {
    if (!driveDir.trim()) {
      setMessage({ type: 'error', text: 'Pega el URL de la carpeta de Drive.' });
      return;
    }

    try {
      // Primero probar la conexión
      const testRes = await fetchJson('/api/config/drive-dir/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveBackupDir: driveDir.trim() })
      });

      if (!testRes.ok) {
        setMessage({ type: 'error', text: `No válido: ${testRes.error}` });
        return;
      }

      // Si pasa validación, guardar en PC
      await fetchJson('/api/config/drive-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveBackupDir: driveDir.trim() })
      });

      setMessage({ type: 'success', text: testRes.message || 'URL de Drive guardado en la PC.' });
    } catch (error) {
      setMessage({ type: 'error', text: `No se pudo guardar: ${error.message}` });
    }
  }

  async function createPcBackup(silencioso = false) {
    if (status.offline) {
      return;
    }

    try {
      await fetchJson('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'mobile' })
      });
      if (!silencioso) {
        setMessage({ type: 'success', text: 'Backup solicitado a la PC/Drive.' });
      }
    } catch (error) {
      if (!silencioso) {
        setMessage({ type: 'error', text: `No se pudo crear backup: ${error.message}` });
      }
    }
  }

  async function connectToPc() {
    const host = String(pcHost || '').trim();
    if (!host) {
      setMessage({ type: 'error', text: 'Ingresa la IP, host o URL HTTPS de la PC.' });
      return;
    }

    const nextBase = await resolvePcApiBase(host);
    const cleanHost = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    localStorage.setItem(PC_HOST_KEY, cleanHost);
    localStorage.setItem(API_BASE_KEY, nextBase);
    setApiBase(nextBase);
    setPcHost(cleanHost);
    setMessage({ type: 'info', text: 'Probando conexion con la PC...' });

    const ok = await loadStatus();
    if (ok) {
      loadCatalogs().catch(() => undefined);
      loadItems().catch(() => undefined);
      setMessage({ type: 'success', text: 'Telefono conectado con la PC.' });
    } else {
      setMessage({ type: 'error', text: 'No se pudo conectar. Verifica IP, WiFi y puerto 3001.' });
    }
  }

  function saveApiBase() {
    const current = (apiBase || '').trim();
    localStorage.setItem(API_BASE_KEY, current);
    setMessage({ type: 'success', text: 'Servidor API guardado. Actualizando conexion...' });
    loadStatus().then((online) => {
      if (online) {
        loadCatalogs().catch(() => undefined);
        loadItems().catch(() => undefined);
      }
    });
  }

  function buildApiUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    const base = (apiBase || '').trim();
    if (!base) {
      return endpoint;
    }

    return `${base.replace(/\/+$/, '')}${endpoint}`;
  }

  async function fetchStatusWithTimeout(baseUrl, timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/status`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolvePcApiBase(hostInput) {
    const raw = String(hostInput || '').trim();
    if (!raw) {
      return null;
    }

    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/\/+$/, '');
    }

    if (shouldDefaultToHttps(raw)) {
      return `https://${raw.replace(/\/+$/, '')}`;
    }

    if (/:[0-9]+$/.test(raw)) {
      return `http://${raw}`;
    }

    return `http://${raw}:3001`;
  }

  function persistCache(nextItems) {
    writeJson(CACHE_KEY, nextItems);
    setItems(nextItems);
  }

  function persistCatalogs(nextCatalogs) {
    writeJson(CATALOGS_KEY, nextCatalogs);
    setCatalogs(nextCatalogs);
  }

  function persistQueue(nextQueue) {
    queueRef.current = nextQueue;
    writeJson(QUEUE_KEY, nextQueue);
    setPendingOps(nextQueue);
    setPendingCount(nextQueue.length);
  }

  async function loadNotas() {
    try {
      const data = await fetchJson('/api/notas');
      setNotas(data);
      writeJson(NOTES_KEY, data);
    } catch {
      setNotas(readJson(NOTES_KEY, []));
    }
  }

  function persistNotas(nextNotas) {
    writeJson(NOTES_KEY, nextNotas);
    setNotas(nextNotas);
  }

  function persistConflicts(next) {
    const clipped = next.slice(0, 80);
    conflictsRef.current = clipped;
    writeJson(CONFLICTS_KEY, clipped);
    setConflicts(clipped);
  }

  function persistHistory(next) {
    const clipped = next.slice(0, 120);
    historyRef.current = clipped;
    writeJson(HISTORY_KEY, clipped);
    setHistory(clipped);
  }

  function persistImageMap(nextMap) {
    imageMapRef.current = nextMap;
    writeJson(IMAGE_MAP_KEY, nextMap);
    setImageMap(nextMap);
  }

  function resolveBackupImageUrl(rawValue = '', extraImages = {}) {
    const raw = String(rawValue || '').trim();
    if (!raw) {
      return null;
    }

    if (raw.startsWith('data:') || isAbsoluteUrl(raw) || raw.startsWith('/api/images/')) {
      return raw;
    }

    const fileName = extractImageName(raw);
    if (!fileName) {
      return raw;
    }

    if (extraImages[fileName]) {
      return extraImages[fileName];
    }

    if (imageMapRef.current[fileName]) {
      return imageMapRef.current[fileName];
    }

    return `/api/images/${encodeURIComponent(fileName)}`;
  }

  function applyBackupPayload(data, options = {}) {
    const { silent = false, backupMarker = '' } = options;
    const backupImages = data && typeof data.images === 'object' && data.images ? data.images : {};

    if (Object.keys(backupImages).length > 0) {
      persistImageMap({ ...imageMapRef.current, ...backupImages });
    }

    const normalizedItems = (data.articulos || []).map((item) => {
      const normalized = normalizeItem(item);
      const sourceImage = item.imagenUrl || item.imagenName || '';
      return {
        ...normalized,
        imagenUrl: resolveBackupImageUrl(sourceImage, backupImages)
      };
    });

    persistCache(normalizedItems);
    if (data.catalogs) persistCatalogs(data.catalogs);
    if (data.history) persistHistory(data.history);
    if (backupMarker) localStorage.setItem(DRIVE_LAST_BACKUP_KEY, backupMarker);

    if (!silent) {
      setMessage({ type: 'success', text: 'Backup de MercadoPG cargado correctamente.' });
    }
  }

  function pushHistory(entry) {
    persistHistory([{ ...entry, at: nowIso() }, ...historyRef.current]);
  }

  function pushConflict(entry) {
    persistConflicts([{ ...entry, at: nowIso() }, ...conflictsRef.current]);
  }

  function applyThemeFromConfig(config = {}) {
    const root = document.documentElement;
    // Color principal de la app: afecta destacados y titulos acentuados.
    const primary = config.colorPrimario || '#f5f5f5';

    // Fondo general de toda la app movil conectada.
    root.style.setProperty('--bg', '#050505');
    // Acento principal reutilizado por titulos y botones destacados.
    root.style.setProperty('--accent', primary);
    // Variante mas intensa del acento para etiquetas secundarias.
    root.style.setProperty('--accent-strong', '#e6e6e6');
    // Texto principal de la interfaz.
    root.style.setProperty('--ink', '#f5f5f5');
    // Bordes y divisiones entre paneles.
    root.style.setProperty('--line', 'rgba(255,255,255,0.24)');
    // Fondo principal de paneles y formularios.
    root.style.setProperty('--panel', '#0f0f0f');
    // Fondo mas solido para tarjetas internas.
    root.style.setProperty('--panel-strong', '#151515');
    // Texto secundario: ayudas, subtitulos y estados suaves.
    root.style.setProperty('--muted', '#b8b8b8');
  }

  async function fetchJson(url, options) {
    const response = await fetch(buildApiUrl(url), options);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Error de sincronizacion');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadStatus() {
    if (!apiBase && !window.location.origin.startsWith('http')) {
      setStatus((prev) => ({ ...prev, offline: true }));
      return false;
    }

    try {
      const data = await fetchJson('/api/status');
      setStatus({ ...data, offline: false });
      return true;
    } catch {
      setStatus((prev) => ({ ...prev, offline: true }));
      return false;
    }
  }

  async function syncSnapshotFromPc() {
    // Descarga el snapshot completo del PC (articulos + imagenes) y lo cachea offline
    try {
      const snapshot = await fetchJson('/api/backup/snapshot');
      if (snapshot && Array.isArray(snapshot.articulos)) {
        applyBackupPayload(snapshot, { silent: true, backupMarker: `pc-snapshot:${snapshot.timestamp || Date.now()}` });
      }
    } catch {
      // PC no disponible o endpoint no existe — no pasa nada, usamos cache anterior
    }
  }

  async function loadCatalogs() {
    try {
      const data = await fetchJson('/api/catalogos');
      persistCatalogs(data);
      setCreateForm((prev) => ({ ...defaultCreateForm(data.config), ...prev }));
      applyThemeFromConfig(data.config);
    } catch {
      setStatus((prev) => ({ ...prev, offline: true }));
      const cachedCatalogs = readJson(CATALOGS_KEY, { config: {} });
      applyThemeFromConfig(cachedCatalogs.config || {});
    }
  }

  async function loadItems(query = deferredSearch) {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/articulos?q=${encodeURIComponent(query || '')}`);
      const normalized = (data.items || []).map(normalizeItem);
      startTransition(() => {
        if (!query) {
          persistCache(normalized);
        } else {
          setItems(normalized);
        }
        if (selectedCode) {
          const baseItems = query ? readJson(CACHE_KEY, []).map(normalizeItem) : normalized;
          const nextSelected = baseItems.find((item) => item.codigo === selectedCode) || normalized.find((item) => item.codigo === selectedCode) || null;
          setSelected(nextSelected);
        }
      });
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      const cached = readJson(CACHE_KEY, []);
      const filtered = (cached || []).filter((item) => {
        if (!query) return true;
        const needle = query.toLowerCase();
        return item.codigo.toLowerCase().includes(needle) || item.descripcion.toLowerCase().includes(needle);
      });
      setItems(filtered);
      setStatus((prev) => ({ ...prev, offline: true }));
    } finally {
      setLoading(false);
    }
  }

  async function loadOne(codigo) {
    try {
      const data = normalizeItem(await fetchJson(`/api/articulos/${encodeURIComponent(codigo)}`));
      setSelectedCode(data.codigo);
      setSelected(data);
      setForm({
        descripcion: data.descripcion || '',
        costo: String(data.costo ?? ''),
        ganancia: String(data.ganancia ?? ''),
        iva: String(data.iva ?? ''),
        stockMinimo: String(data.stockMinimo ?? '')
      });
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      const cached = readJson(CACHE_KEY, []);
      const data = cached.find((item) => item.codigo === codigo) || null;
      if (data) {
        setSelectedCode(data.codigo);
        setSelected(data);
        setForm({
          descripcion: data.descripcion || '',
          costo: String(data.costo ?? ''),
          ganancia: String(data.ganancia ?? ''),
          iva: String(data.iva ?? ''),
          stockMinimo: String(data.stockMinimo ?? '')
        });
      }
      setStatus((prev) => ({ ...prev, offline: true }));
    }
  }

  function updateCachedItem(updated) {
    const current = readJson(CACHE_KEY, []);
    const index = current.findIndex((item) => item.codigo === updated.codigo);
    const next = [...current];
    if (index >= 0) {
      next[index] = normalizeItem(updated);
    } else {
      next.unshift(normalizeItem(updated));
    }
    persistCache(next);
    if (!deferredSearch) {
      setItems(next);
    }
    if (selectedCode === updated.codigo) {
      setSelected(normalizeItem(updated));
    }
  }

  async function handleSelectedImageChange(file) {
    if (!file) {
      return;
    }

    if (!isImageMimeType(file.type)) {
      setMessage({ type: 'error', text: 'El archivo seleccionado no es una imagen.' });
      return;
    }

    const compressed = await fileToCompressedImage(file);
    setSelectedImageDraft(compressed);
    setMessage({ type: 'success', text: 'Imagen lista para guardar.' });
  }

  async function handleCreateImageChange(file) {
    if (!file) {
      return;
    }

    if (!isImageMimeType(file.type)) {
      setMessage({ type: 'error', text: 'El archivo seleccionado no es una imagen.' });
      return;
    }

    const compressed = await fileToCompressedImage(file);
    setCreateImageDraft(compressed);
    setMessage({ type: 'success', text: 'Imagen preparada para el nuevo articulo.' });
  }

  function enqueue(action) {
    const nextQueue = [...queueRef.current, { id: nextId(), createdAt: nowIso(), ...action }];
    persistQueue(nextQueue);
  }

  function removeQueueItem(id) {
    persistQueue(queueRef.current.filter((item) => item.id !== id));
  }

  function captureArticleSnapshot(articulo) {
    if (!articulo) return null;
    return {
      descripcion: articulo.descripcion,
      costo: articulo.costo,
      ganancia: articulo.ganancia,
      iva: articulo.iva,
      stockMinimo: articulo.stockMinimo
    };
  }

  function hasUpdateConflict(serverArticle, baseSnapshot, payload) {
    if (!serverArticle || !baseSnapshot) {
      return false;
    }

    const watched = ['descripcion', 'costo', 'ganancia', 'iva', 'stockMinimo'];
    return watched.some((field) => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) {
        return false;
      }
      return !sameValue(serverArticle[field], baseSnapshot[field]);
    });
  }

  async function flushQueue() {
    if (queueRef.current.length === 0) {
      return;
    }

    const online = await loadStatus();
    if (!online) {
      return;
    }

    const pending = [...queueRef.current];
    for (const action of pending) {
      try {
        if (action.type === 'stock-entry') {
          await fetchJson('/api/stock/entrada', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-mercadopg-sync-mode': 'queue'
            },
            body: JSON.stringify(action.payload)
          });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        } else if (action.type === 'stock-exit') {
          await fetchJson('/api/stock/salida', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-mercadopg-sync-mode': 'queue'
            },
            body: JSON.stringify(action.payload)
          });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        } else if (action.type === 'article-update') {
          const current = await fetchJson(`/api/articulos/${encodeURIComponent(action.codigo)}`);
          if (hasUpdateConflict(current, action.baseSnapshot, action.payload)) {
            removeQueueItem(action.id);
            pushConflict({
              status: 'conflict',
              summary: formatOpLabel(action),
              reason: 'El articulo cambio en la PC antes de sincronizar. Revisalo y guardalo de nuevo.'
            });
            continue;
          }

          await fetchJson(`/api/articulos/${encodeURIComponent(action.codigo)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-mercadopg-sync-mode': 'queue'
            },
            body: JSON.stringify(action.payload)
          });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        } else if (action.type === 'article-create') {
          try {
            await fetchJson('/api/articulos', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-mercadopg-sync-mode': 'queue'
              },
              body: JSON.stringify(action.payload)
            });
            pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
          } catch (error) {
            const msg = String(error.message || '').toLowerCase();
            if (msg.includes('existe')) {
              removeQueueItem(action.id);
              pushConflict({
                status: 'conflict',
                summary: formatOpLabel(action),
                reason: 'Ya existe un articulo con ese codigo en la PC.'
              });
              continue;
            }
            throw error;
          }
        } else if (action.type === 'article-delete') {
          try {
            await fetchJson(`/api/articulos/${encodeURIComponent(action.codigo)}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'x-mercadopg-sync-mode': 'queue'
              }
            });
            pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
          } catch (error) {
            if (error.status === 404) {
              pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: 'Ya no existia en la PC.' });
            } else {
              throw error;
            }
          }
        } else if (action.type === 'nota-create') {
          await fetchJson('/api/notas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload)
          });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        } else if (action.type === 'nota-update') {
          await fetchJson(`/api/notas/${action.notaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload)
          });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        } else if (action.type === 'nota-delete') {
          await fetchJson(`/api/notas/${action.notaId}`, { method: 'DELETE' });
          pushHistory({ status: 'synced', summary: formatOpLabel(action), reason: '' });
        }

        removeQueueItem(action.id);
      } catch (error) {
        if (error.status === 423) {
          setMessage({ type: 'info', text: 'La PC esta conectada: no se aplican cambios del telefono mientras siga conectada.' });
          break;
        }
        setMessage({ type: 'error', text: `Quedo una operacion pendiente: ${error.message}` });
        setStatus((prev) => ({ ...prev, offline: true }));
        break;
      }
    }

    await loadItems();
    await loadNotas();
  }

  function applyOfflineStock(codigo, delta) {
    const current = readJson(CACHE_KEY, []);
    const next = current.map((item) => {
      if (item.codigo !== codigo) return item;
      const stock = Number(item.stock || 0) + delta;
      return normalizeItem({ ...item, stock, stockCritico: stock <= Number(item.stockMinimo || 0) });
    });
    persistCache(next);
    if (!deferredSearch) setItems(next);
    const updated = next.find((item) => item.codigo === codigo);
    if (updated) {
      setSelected(updated);
    }
  }

  function applyOfflineArticleUpdate(codigo, payload) {
    const current = readJson(CACHE_KEY, []);
    const next = current.map((item) => item.codigo === codigo ? normalizeItem({ ...item, ...payload }) : item);
    persistCache(next);
    if (!deferredSearch) setItems(next);
    const updated = next.find((item) => item.codigo === codigo) || null;
    setSelected(updated);
  }

  function applyOfflineArticleCreate(payload) {
    const current = readJson(CACHE_KEY, []);
    const created = normalizeItem({
      ...payload,
      precioFinal: Number(payload.costo || 0) * (1 + Number(payload.ganancia || 0) / 100) * (1 + Number(payload.iva || 0) / 100),
      stockCritico: Number(payload.stock || 0) <= Number(payload.stockMinimo || 0),
      imagenUrl: null
    });
    const next = [created, ...current.filter((item) => item.codigo !== created.codigo)];
    persistCache(next);
    if (!deferredSearch) setItems(next);
    setSelectedCode(created.codigo);
    setSelected(created);
  }

  function applyOfflineArticleDelete(codigo) {
    const current = readJson(CACHE_KEY, []);
    const next = current.filter((item) => item.codigo !== codigo);
    persistCache(next);
    if (!deferredSearch) setItems(next);
    if (selectedCode === codigo) {
      setSelectedCode(null);
      setSelected(null);
    }
  }

  // Manejar callback de OAuth2 de Google Drive (token en hash de URL)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      if (token) {
        localStorage.setItem(DRIVE_TOKEN_KEY, token);
        setDriveToken(token);
        // Limpiar hash de la URL
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
        // Obtener email del usuario
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).then(info => {
          const email = info.email || '';
          localStorage.setItem(DRIVE_EMAIL_KEY, email);
          setDriveEmail(email);
          setDriveConnected(true);
          setMessage({ type: 'success', text: `✓ Conectado a Drive como ${email || 'Google'}` });
        }).catch(() => {
          setDriveConnected(true);
          setMessage({ type: 'success', text: '✓ Conectado a Google Drive' });
        });
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(DRIVE_BACKUP_URL_KEY, backupFolderUrl.trim());
  }, [backupFolderUrl]);

  useEffect(() => {
    const link = backupFolderUrl.trim();
    if (!link) {
      backupAutoPasteRef.current = '';
      return;
    }

    if (backupAutoPasteRef.current === link) {
      return;
    }

    const info = extractDriveResource(link);
    if (!info || info.type !== 'file') {
      // Solo autoprocesar links directos de archivo, no carpetas
      return;
    }

    const timer = setTimeout(() => {
      backupAutoPasteRef.current = link;
      processDriveUrl().catch(() => undefined);
    }, 700);

    return () => clearTimeout(timer);
  }, [backupFolderUrl]);

  useEffect(() => {
    localStorage.setItem(DRIVE_AUTO_SYNC_KEY, autoBackupSync ? '1' : '0');
  }, [autoBackupSync]);

  useEffect(() => {
    const onClickCapture = (event) => {
      const target = event.target;
      if (!target || !target.closest) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href') || '';
      if (!isDriveExternalUrl(href)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMessage({
        type: 'info',
        text: 'Link externo bloqueado. Pegá el enlace en "Importar Datos desde URL Compartida" para descargar sin abrir Drive.'
      });
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  useEffect(() => {
    syncLatestBackupSilently().catch(() => undefined);

    const timer = setInterval(() => {
      syncLatestBackupSilently().catch(() => undefined);
    }, 120000);

    return () => clearInterval(timer);
  }, [backupFolderUrl, autoBackupSync, driveToken]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (IS_EMBEDDED_EXPO_WEBVIEW) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch(() => undefined);
      } else {
        navigator.serviceWorker.register('/service-worker.js').then((registration) => {
          if (requestedVersion) {
            const lastVersion = localStorage.getItem(CLIENT_VERSION_KEY);
            if (lastVersion !== requestedVersion) {
              localStorage.setItem(CLIENT_VERSION_KEY, requestedVersion);
              registration.update().catch(() => undefined);
            }
          }
        }).catch(() => undefined);
      }
    }

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      if (installIntent) {
        setMessage({ type: 'info', text: 'Escaneaste el QR de instalacion. Toca "Instalar app" para agregarla al inicio del telefono.' });
      }
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setMessage({ type: 'success', text: 'La app quedo instalada en el telefono.' });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (apiFromQr) {
      localStorage.setItem(API_BASE_KEY, apiFromQr);
      setApiBase(apiFromQr);
    }

    if (backupFromQr) {
      localStorage.setItem(DRIVE_BACKUP_URL_KEY, backupFromQr);
      setBackupFolderUrl(backupFromQr);
      if (autoBackupFromQr) {
        localStorage.setItem(DRIVE_AUTO_SYNC_KEY, '1');
        setAutoBackupSync(true);
      }

      processDriveUrl().catch(() => undefined);
    }

    loadStatus().then((online) => {
      if (online) {
        loadCatalogs().catch(() => undefined);
        loadItems().catch(() => undefined);
        loadNotas().catch(() => undefined);
        flushQueue().catch(() => undefined);
        // Descargar snapshot completo del PC para cache offline automatica
        syncSnapshotFromPc().catch(() => undefined);
      } else {
        // Si hay un host guardado, intentar conectar automáticamente
        const host = (storedPcHost || '').trim();
        if (host) {
          resolvePcApiBase(host)
            .then((probeBase) => fetch(`${probeBase.replace(/\/+$/, '')}/api/status`).then((r) => ({ r, probeBase })))
            .then(({ r, probeBase }) => {
              if (!r.ok) {
                return;
              }
              localStorage.setItem(API_BASE_KEY, probeBase);
              setApiBase(probeBase);
              loadStatus().then((ok) => {
                if (ok) {
                  loadCatalogs().catch(() => undefined);
                  loadItems().catch(() => undefined);
                  loadNotas().catch(() => undefined);
                  syncSnapshotFromPc().catch(() => undefined);
                }
              });
            })
            .catch(() => undefined);
        }
        setItems(readJson(CACHE_KEY, []));
        setNotas(readJson(NOTES_KEY, []));
        const cachedCatalogs = readJson(CATALOGS_KEY, { config: {} });
        applyThemeFromConfig(cachedCatalogs.config || {});
        setMessage({ type: 'info', text: 'Sin conexión: mostrando lo último guardado hasta recuperar la red.' });
      }
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (selectedCode) {
      localStorage.setItem(LAST_SELECTED_CODE_KEY, selectedCode);
    } else {
      localStorage.removeItem(LAST_SELECTED_CODE_KEY);
    }
  }, [selectedCode]);

  useEffect(() => {
    localStorage.setItem(LAST_SEARCH_KEY, search || '');
  }, [search]);

  useEffect(() => {
    const flushLocalState = () => {
      try {
        writeJson(CACHE_KEY, items || []);
        writeJson(QUEUE_KEY, queueRef.current || []);
        writeJson(CATALOGS_KEY, catalogs || { marcas: [], proveedores: [], categorias: [], config: {} });
        writeJson(CONFLICTS_KEY, conflictsRef.current || []);
        writeJson(HISTORY_KEY, historyRef.current || []);
        writeJson(IMAGE_MAP_KEY, imageMapRef.current || {});
      } catch {
        // Si falla almacenamiento local en cierre, no interrumpimos la navegación.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalState();
      }
    };

    window.addEventListener('beforeunload', flushLocalState);
    window.addEventListener('pagehide', flushLocalState);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushLocalState);
      window.removeEventListener('pagehide', flushLocalState);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [items, catalogs]);

  useEffect(() => {
    if (!selectedCode) {
      if (selected) setSelected(null);
      return;
    }

    const inCurrentList = items.find((item) => item.codigo === selectedCode) || null;
    if (inCurrentList) {
      setSelected(inCurrentList);
      return;
    }

    const cached = readJson(CACHE_KEY, []).map(normalizeItem);
    const inCache = cached.find((item) => item.codigo === selectedCode) || null;
    if (inCache) {
      setSelected(inCache);
      return;
    }

    setSelectedCode(null);
    setSelected(null);
  }, [items, selectedCode]);

  useEffect(() => () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch {
        // noop
      }
      zxingReaderRef.current = null;
    }
  }, []);

  useEffect(() => {
    loadItems().catch(() => undefined);
  }, [deferredSearch, apiBase]);

  useEffect(() => {
    const onOnline = () => {
      loadStatus().then((online) => {
        if (online) {
          loadCatalogs().catch(() => undefined);
          loadNotas().catch(() => undefined);
          flushQueue().catch(() => undefined);
          syncSnapshotFromPc().catch(() => undefined);
        }
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      flushQueue().catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!status.offline) {
        loadCatalogs().catch(() => undefined);
        loadItems().catch(() => undefined);
        loadNotas().catch(() => undefined);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [status.offline]);

  useEffect(() => {
    const onGlobalError = (event) => {
      const msg = String(event?.error?.message || event?.message || 'Error de ejecución no identificado');
      console.error('Global runtime error:', event?.error || event);
      setFatalError(msg);
      setActiveSection('mercado');
      setMessage({ type: 'error', text: `Error interno: ${msg}` });
    };

    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      const msg = String(reason?.message || reason || 'Promesa rechazada sin detalle');
      console.error('Unhandled rejection:', reason || event);
      setFatalError(msg);
      setActiveSection('mercado');
      setMessage({ type: 'error', text: `Error interno: ${msg}` });
    };

    window.addEventListener('error', onGlobalError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onGlobalError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const triggerCloseBackup = () => {
      if (status.offline || !navigator.sendBeacon) {
        return;
      }

      const backupUrl = buildApiUrl('/api/backup/create');
      navigator.sendBeacon(backupUrl, new Blob(['{}'], { type: 'application/json' }));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerCloseBackup();
      }
    };

    window.addEventListener('beforeunload', triggerCloseBackup);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', triggerCloseBackup);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [status.offline, apiBase]);

  useEffect(() => {
    if (!status.offline) {
      return;
    }

    const host = (pcHost || '').trim();
    const currentBase = (apiBase || '').trim();

    const recoverFromBase = async (baseUrl) => {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/status`);
      if (!response.ok) {
        return false;
      }

      localStorage.setItem(API_BASE_KEY, baseUrl);
      setApiBase(baseUrl);
      await loadStatus().catch(() => undefined);
      await loadCatalogs().catch(() => undefined);
      await loadItems().catch(() => undefined);
      await syncSnapshotFromPc().catch(() => undefined);
      setMessage({ type: 'success', text: 'Conexión recuperada. Datos actualizados.' });
      return true;
    };

    const timer = setInterval(() => {
      if (host) {
        resolvePcApiBase(host)
          .then((probeBase) => recoverFromBase(probeBase))
          .catch(() => undefined);
        return;
      }

      if (currentBase) {
        recoverFromBase(currentBase).catch(() => undefined);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [pcHost, apiBase, status.offline]);

  useEffect(() => {
    if (status.offline) {
      return undefined;
    }

    const events = new EventSource(buildApiUrl('/api/events'));
    events.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'data-changed') {
        loadItems().catch(() => undefined);
        loadNotas().catch(() => undefined);
        if (data.codigo && data.codigo === selectedCode) {
          loadOne(data.codigo).catch(() => undefined);
        }
      }
    };
    events.onerror = () => {
      setStatus((prev) => ({ ...prev, offline: true }));
      events.close();
    };
    return () => events.close();
  }, [status.offline, selectedCode, deferredSearch, apiBase]);

  async function handleAdjust(type) {
    if (!selectedCode) return;
    const payload = { codigo: selectedCode, cantidad: Number(quantity) };

    try {
      const data = await fetchJson(`/api/stock/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setMessage({ type: 'success', text: `Stock actualizado para ${data.codigo}` });
      updateCachedItem(data);
      await loadOne(selectedCode);
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      enqueue({ type: type === 'entrada' ? 'stock-entry' : 'stock-exit', codigo: selectedCode, payload });
      applyOfflineStock(selectedCode, type === 'entrada' ? Number(quantity) : -Number(quantity));
      setStatus((prev) => ({ ...prev, offline: true }));
      setMessage({ type: 'info', text: 'Sin red: el cambio quedo guardado en el telefono y se sincronizara despues.' });
    }
  }

  async function handleSave() {
    if (!selectedCode) return;

    const payload = {
      descripcion: form.descripcion,
      costo: Number(form.costo),
      ganancia: Number(form.ganancia),
      iva: Number(form.iva),
      stockMinimo: Number(form.stockMinimo)
    };

    if (selectedImageDraft.dataUrl) {
      payload.imagenDataUrl = selectedImageDraft.dataUrl;
      payload.imagenName = selectedImageDraft.fileName || `img_${selectedCode}.jpg`;
    }

    try {
      const data = await fetchJson(`/api/articulos/${encodeURIComponent(selectedCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      updateCachedItem(data);
      setSelectedImageDraft({ dataUrl: '', fileName: '' });
      setMessage({ type: 'success', text: `Articulo ${data.codigo} actualizado` });
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      enqueue({ type: 'article-update', codigo: selectedCode, payload, baseSnapshot: captureArticleSnapshot(selected) });
      applyOfflineArticleUpdate(selectedCode, payload);
      setStatus((prev) => ({ ...prev, offline: true }));
      setMessage({ type: 'info', text: 'Edicion guardada offline. Se enviara a la PC cuando vuelva la conexion.' });
    }
  }

  async function handleDelete() {
    if (!selectedCode || !selected) return;

    const confirmed = window.confirm(`Eliminar el articulo ${selected.codigo} (${selected.descripcion})?`);
    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/articulos/${encodeURIComponent(selectedCode)}`, {
        method: 'DELETE'
      });
      applyOfflineArticleDelete(selectedCode);
      setMessage({ type: 'success', text: `Articulo ${selectedCode} eliminado` });
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      enqueue({ type: 'article-delete', codigo: selectedCode });
      applyOfflineArticleDelete(selectedCode);
      setStatus((prev) => ({ ...prev, offline: true }));
      setMessage({ type: 'info', text: 'Baja guardada offline. Se eliminara en la PC cuando vuelva la conexion.' });
    }
  }

  async function handleCreate() {
    const payload = {
      codigo: createForm.codigo.trim(),
      descripcion: createForm.descripcion.trim(),
      costo: Number(createForm.costo),
      ganancia: Number(createForm.ganancia),
      iva: Number(createForm.iva),
      stock: Number(createForm.stock),
      stockMinimo: Number(createForm.stockMinimo),
      marcaId: Number(createForm.marcaId),
      proveedorId: Number(createForm.proveedorId),
      categoriaId: Number(createForm.categoriaId)
    };

    if (createImageDraft.dataUrl) {
      payload.imagenDataUrl = createImageDraft.dataUrl;
      payload.imagenName = createImageDraft.fileName || `img_${payload.codigo}.jpg`;
    }

    if (!payload.codigo || !payload.descripcion || payload.costo <= 0) {
      setMessage({ type: 'error', text: 'Completa codigo, descripcion y costo para crear el articulo.' });
      return;
    }

    try {
      const data = await fetchJson('/api/articulos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      updateCachedItem(data);
      setCreateForm(defaultCreateForm(catalogs.config || {}));
      setCreateImageDraft({ dataUrl: '', fileName: '' });
      setCreateOpen(false);
      setMessage({ type: 'success', text: `Articulo ${data.codigo} creado` });
      setStatus((prev) => ({ ...prev, offline: false }));
    } catch {
      enqueue({ type: 'article-create', codigo: payload.codigo, payload });
      applyOfflineArticleCreate(payload);
      setCreateForm(defaultCreateForm(catalogs.config || {}));
      setCreateImageDraft({ dataUrl: '', fileName: '' });
      setCreateOpen(false);
      setStatus((prev) => ({ ...prev, offline: true }));
      setMessage({ type: 'info', text: 'Articulo guardado en el telefono. Se creara en la PC cuando vuelva la conexion.' });
    }
  }

  async function handleCreateNota(titulo, tipo = 'normal') {
    const cleanTitle = String(titulo || 'Sin título').trim();
    const id = nextId();
    const payload = { id, titulo: cleanTitle, contenido: tipo === 'checklist' ? '[]' : '', tipo };
    const next = [payload, ...notas];
    persistNotas(next);
    try {
      await fetchJson('/api/notas', { method: 'POST', body: JSON.stringify(payload) });
    } catch {
      enqueue({ type: 'nota-create', payload });
    }
  }

  async function handleUpdateNota(notaId, contenido) {
    const current = notas.find((nota) => nota.id === notaId);
    if (!current || contenido === current.contenido) return;
    const nextContenido = String(contenido ?? '');
    const updated = { ...current, contenido: nextContenido };
    persistNotas(notas.map(n => n.id === notaId ? updated : n));
    try {
      await fetchJson(`/api/notas/${notaId}`, { method: 'PUT', body: JSON.stringify(updated) });
    } catch {
      enqueue({ type: 'nota-update', notaId, payload: updated });
    }
  }

  async function handleInstall() {
    if (!window.isSecureContext) {
      setMessage({
        type: 'error',
        text: 'Instalacion bloqueada: el navegador exige HTTPS para instalar PWA en red local. Como alternativa, usa el menu del navegador y crea un acceso directo.'
      });
      return;
    }

    if (!installPrompt) {
      setMessage({ type: 'info', text: 'Si no aparece el prompt, usa Chrome en Android y el menu "Instalar app" o "Agregar a pantalla de inicio".' });
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  }

  async function startScanner() {
    setScannerError('');
    setScannerOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScannerError('No hay acceso a camara en este navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ('BarcodeDetector' in window) {
        barcodeDetectorRef.current = new window.BarcodeDetector({
          formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'itf']
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || !barcodeDetectorRef.current) {
            return;
          }

          try {
            const barcodes = await barcodeDetectorRef.current.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const code = String(barcodes[0].rawValue || '').trim();
              if (code) {
                handleScannedCode(code);
              }
            }
          } catch {
            // seguimos intentando mientras la camara este abierta
          }
        }, 350);
        return;
      }

      // Fallback para equipos sin BarcodeDetector
      zxingReaderRef.current = new BrowserMultiFormatReader();
      zxingReaderRef.current.decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
        if (result) {
          const code = String(result.getText() || '').trim();
          if (code) {
            handleScannedCode(code);
          }
        }
        if (error && error.name === 'NotFoundException') {
          // flujo normal mientras busca un codigo
        }
      });
    } catch (error) {
      setScannerError(`No se pudo abrir la camara: ${error.message}`);
    }
  }

  function stopScanner() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch {
        // noop
      }
      zxingReaderRef.current = null;
    }

    setScannerOpen(false);
  }

  function handleScannedCode(code) {
    setSearch(code);
    const normalized = code.toLowerCase();
    const match = items.find((item) => String(item.codigo).toLowerCase() === normalized)
      || items.find((item) => String(item.codigo).toLowerCase().includes(normalized));

    if (match) {
      loadOne(match.codigo).catch(() => undefined);
      setMessage({ type: 'success', text: `Codigo detectado: ${code}` });
    } else {
      setCreateOpen(true);
      setCreateForm((prev) => ({ ...prev, codigo: code }));
      setMessage({ type: 'info', text: `Codigo ${code} detectado. Puedes crear el articulo.` });
    }

    stopScanner();
  }

  function handleSelectArticle(codigo) {
    if (!codigo) {
      return;
    }

    if (selectedCode === codigo) {
      // Tocar el mismo articulo minimiza/cierra el detalle.
      setSelectedCode(null);
      setSelected(null);
      return;
    }

    loadOne(codigo).catch(() => undefined);
  }

  function clearConflicts() {
    persistConflicts([]);
  }

  function clearHistory() {
    persistHistory([]);
  }

  function resetLocalMobileData() {
    try {
      [
        CACHE_KEY,
        QUEUE_KEY,
        CATALOGS_KEY,
        CONFLICTS_KEY,
        HISTORY_KEY,
        IMAGE_MAP_KEY,
        NOTES_KEY,
        LAST_SELECTED_CODE_KEY,
        LAST_SEARCH_KEY
      ].forEach((key) => localStorage.removeItem(key));
    } catch {
      // noop
    }

    setItems([]);
    setNotas([]);
    setSelected(null);
    setSelectedCode(null);
    setFatalError('');
    setActiveSection('mercado');
    setMessage({ type: 'info', text: 'Datos locales reiniciados. Recargando desde la PC...' });

    loadStatus().then((online) => {
      if (!online) {
        return;
      }
      loadCatalogs().catch(() => undefined);
      loadItems().catch(() => undefined);
      loadNotas().catch(() => undefined);
    }).catch(() => undefined);
  }

  const rankingModel = useMemo(() => buildRankingModel(items), [items]);
  const rankingStockList = Array.isArray(rankingModel?.rankingStockList) ? rankingModel.rankingStockList : [];
  const rankingByValue = Array.isArray(rankingModel?.rankingByValue) ? rankingModel.rankingByValue : [];
  const faltantes = Array.isArray(rankingModel?.faltantes) ? rankingModel.faltantes : [];
  const rankingError = String(rankingModel?.error || '');

  return (
    <div className="shell">
      <div className="status-bar">
        <span className="app-title">MercadoPG</span>
        <div className="status-pills">
          <span className={`pill ${status.offline ? 'pill-offline' : 'pill-online'}`}>
            {status.offline
              ? (pcHost ? `PC: ${pcHost} ✗` : 'Sin conexión')
              : `PC: ${pcHost || 'conectado'} ✓`}
          </span>
          {pendingCount > 0 ? <span className="pill pill-pending">Pendientes: {pendingCount}</span> : null}
        </div>
      </div>

      {message ? <div className={`notice ${message.type}`}>{message.text}</div> : null}

      {fatalError ? (
        <section className="detail">
          <div className="ops-head">
            <h2>Modo Recuperación</h2>
          </div>
          <div className="notice error">Se detectó un error crítico: {fatalError}</div>
          <div className="detail-actions">
            <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
            <button type="button" className="secondary" onClick={resetLocalMobileData}>Reiniciar datos locales</button>
          </div>
        </section>
      ) : null}

      <section className="triple-nav" role="tablist" aria-label="Navegacion principal">
        <button
          type="button"
          className={activeSection === 'mercado' ? 'active' : ''}
          onClick={() => setActiveSection('mercado')}
          aria-selected={activeSection === 'mercado'}
        >
          Mercado
        </button>
        <button
          type="button"
          className={activeSection === 'ranking' ? 'active' : ''}
          onClick={() => {
            if (rankingError) {
              setMessage({ type: 'error', text: `Ranking deshabilitado por datos invalidos: ${rankingError}` });
              setActiveSection('mercado');
              return;
            }
            setActiveSection('ranking');
          }}
          aria-selected={activeSection === 'ranking'}
        >
          Ranking
        </button>
        <button
          type="button"
          className={activeSection === 'notas' ? 'active' : ''}
          onClick={() => setActiveSection('notas')}
          aria-selected={activeSection === 'notas'}
        >
          Notas
        </button>
        <button
          type="button"
          className={activeSection === 'sync' ? 'active' : ''}
          onClick={() => setActiveSection('sync')}
          aria-selected={activeSection === 'sync'}
        >
          Sincronizacion
        </button>
      </section>

      {activeSection === 'mercado' && (
        <>
          <div className="notice info">Desde el telefono podes crear, editar, eliminar y mover stock. Si no hay red, los cambios quedan pendientes y se sincronizan solos.</div>
          <section className="toolbar">
            <input
              type="search"
              placeholder="Buscar por código o descripción"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="secondary" onClick={() => setCreateOpen((prev) => !prev)}>{createOpen ? 'Cerrar nuevo' : 'Nuevo'}</button>
            <button className="secondary" onClick={() => loadItems(search)}>{loading ? 'Actualizando...' : 'Refrescar'}</button>
            <button className="secondary" onClick={() => startScanner()}>Escanear</button>
          </section>

          {scannerOpen ? (
            <section className="detail">
              <div className="ops-head">
                <h2>Escaner de codigo</h2>
                <div className="ops-actions">
                  <button className="secondary" onClick={stopScanner}>Cerrar camara</button>
                </div>
              </div>
              <div className="scanner-box">
                <video ref={videoRef} className="scanner-video" playsInline muted />
              </div>
              {scannerError ? <div className="notice error">{scannerError}</div> : <div className="notice info">Apunta la camara al codigo de barras.</div>}
            </section>
          ) : null}

          {createOpen ? (
            <section className="detail">
              <div className="ops-head">
                <h2>Nuevo articulo</h2>
                <div className="ops-actions">
                  <button className="secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
                </div>
              </div>

              <div className="detail-grid create-grid">
                <div className="detail-group">
                  <label>Imagen desde el teléfono</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => handleCreateImageChange(event.target.files && event.target.files[0]).catch(() => undefined)}
                  />
                  {createImageDraft.dataUrl ? (
                    <div className="detail-media">
                      <img className="detail-image" src={createImageDraft.dataUrl} alt="Vista previa nueva imagen" />
                    </div>
                  ) : null}
                </div>
                <div className="detail-group">
                  <label>Código</label>
                  <input
                    value={createForm.codigo}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, codigo: event.target.value }))}
                    placeholder="Ej: A-100"
                  />
                </div>
                <div className="detail-group">
                  <label>Descripción</label>
                  <input
                    value={createForm.descripcion}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="detail-group">
                  <label>Costo</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={createForm.costo}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, costo: event.target.value }))}
                  />
                </div>
                <div className="detail-group">
                  <label>Ganancia %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={createForm.ganancia}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, ganancia: event.target.value }))}
                  />
                </div>
                <div className="detail-group">
                  <label>IVA %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={createForm.iva}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, iva: event.target.value }))}
                  />
                </div>
                <div className="detail-group">
                  <label>Stock</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={createForm.stock}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, stock: event.target.value }))}
                  />
                </div>
                <div className="detail-group">
                  <label>Stock mínimo</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={createForm.stockMinimo}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, stockMinimo: event.target.value }))}
                  />
                </div>
                <div className="detail-group">
                  <label>Marca</label>
                  <select
                    value={createForm.marcaId}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, marcaId: event.target.value }))}
                  >
                    <option value="0">Sin marca</option>
                    {(catalogs.marcas || []).map((marca) => (
                      <option key={marca.id} value={String(marca.id)}>{marca.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="detail-group">
                  <label>Proveedor</label>
                  <select
                    value={createForm.proveedorId}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, proveedorId: event.target.value }))}
                  >
                    <option value="0">Sin proveedor</option>
                    {(catalogs.proveedores || []).map((proveedor) => (
                      <option key={proveedor.id} value={String(proveedor.id)}>{proveedor.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="detail-group">
                  <label>Categoría</label>
                  <select
                    value={createForm.categoriaId}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, categoriaId: event.target.value }))}
                  >
                    <option value="0">Sin categoría</option>
                    {(catalogs.categorias || []).map((categoria) => (
                      <option key={categoria.id} value={String(categoria.id)}>{categoria.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="detail-actions">
                <button onClick={handleCreate}>Crear artículo</button>
                <button className="secondary" onClick={() => setCreateForm(defaultCreateForm(catalogs.config || {}))}>Limpiar</button>
              </div>
            </section>
          ) : null}

          {!scannerOpen && !createOpen && (
            <div className="hero-grid">
              <section className="list">
                {items.length === 0 ? (
                  <div className="empty">No hay articulos para mostrar.</div>
                ) : (
                  items.map((item) => (
                    <article
                      key={item.codigo}
                      className={`card ${selectedCode === item.codigo ? 'active' : ''}`}
                      onClick={() => handleSelectArticle(item.codigo)}
                    >
                      <div className="card-top">
                        <div className="card-main">
                          {item.imagenUrl ? (
                            <img
                              className="card-thumb"
                              src={item.imagenUrl}
                              alt={item.descripcion}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="card-thumb placeholder">Sin foto</div>
                          )}
                          <div>
                            <h3>{item.descripcion}</h3>
                            <code>{item.codigo}</code>
                          </div>
                        </div>
                        <strong className={item.stockCritico ? 'critical' : ''}>{item.stock} u.</strong>
                      </div>
                      <div className="metrics">
                        <div className="metric">
                          <span>Precio</span>
                          <strong>{formatCurrency(item.precioFinal)}</strong>
                        </div>
                        <div className="metric">
                          <span>Minimo</span>
                          <strong>{item.stockMinimo}</strong>
                        </div>
                        <div className="metric">
                          <span>Estado</span>
                          <strong className={item.stockCritico ? 'critical' : ''}>{item.stockCritico ? 'Critico' : 'OK'}</strong>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </section>

              <section className="detail">
                {!selected ? (
                  <div className="empty">Elegí un artículo para ver su detalle. Tocá el mismo artículo nuevamente para minimizar.</div>
                ) : (
                  <>
                    <div className="card-top">
                      <div>
                        <p className="eyebrow">Articulo seleccionado</p>
                        <h2>{selected.descripcion}</h2>
                        <code>{selected.codigo}</code>
                      </div>
                      <strong className={selected.stockCritico ? 'critical' : ''}>Stock {selected.stock}</strong>
                    </div>

                    {selected.imagenUrl ? (
                      <div className="detail-media">
                        <img
                          className="detail-image"
                          src={selected.imagenUrl}
                          alt={selected.descripcion}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : null}

                    <div className="detail-group">
                      <label>Actualizar imagen desde el teléfono</label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) => handleSelectedImageChange(event.target.files && event.target.files[0]).catch(() => undefined)}
                      />
                      {selectedImageDraft.dataUrl ? (
                        <div className="detail-media">
                          <img className="detail-image" src={selectedImageDraft.dataUrl} alt="Vista previa imagen a guardar" />
                        </div>
                      ) : null}
                    </div>

                    <div className="detail-grid">
                      <div className="detail-group">
                        <label>Descripción</label>
                        <input
                          value={form.descripcion}
                          onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                        />
                      </div>
                      <div className="detail-group">
                        <label>Costo</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={form.costo}
                          onChange={(event) => setForm((prev) => ({ ...prev, costo: event.target.value }))}
                        />
                      </div>
                      <div className="detail-group">
                        <label>Ganancia</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={form.ganancia}
                          onChange={(event) => setForm((prev) => ({ ...prev, ganancia: event.target.value }))}
                        />
                      </div>
                      <div className="detail-group">
                        <label>IVA %</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={form.iva}
                          onChange={(event) => setForm((prev) => ({ ...prev, iva: event.target.value }))}
                        />
                      </div>
                      <div className="detail-group">
                        <label>Stock mínimo</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={form.stockMinimo}
                          onChange={(event) => setForm((prev) => ({ ...prev, stockMinimo: event.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="stock-actions">
                      <div className="detail-group">
                        <label>Cantidad</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          min="1"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                        />
                      </div>
                      <button className="secondary" onClick={() => handleAdjust('entrada')}>Entrada</button>
                      <button className="secondary" onClick={() => handleAdjust('salida')}>Salida</button>
                    </div>

                    <div className="detail-actions">
                      <button onClick={handleSave}>Guardar cambios</button>
                      <button className="secondary" onClick={handleDelete}>Eliminar artículo</button>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {activeSection === 'ranking' && (
        <section className="detail ranking-panel" style={{ background: '#111111', color: '#f5f5f5' }}>
          <div className="ops-head">
            <h2>Ranking y faltantes</h2>
          </div>
          <div
            style={{
              marginBottom: '10px',
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.25)',
              background: '#151515',
              color: '#f5f5f5',
              fontSize: '14px'
            }}
          >
            Ranking activo · Stock: {rankingStockList.length} · Precio: {rankingByValue.length} · Faltantes: {faltantes.length}
          </div>
          {rankingError ? (
            <>
              <div className="notice error">No se pudo cargar ranking: {rankingError}</div>
              <div className="detail-actions">
                <button type="button" onClick={() => setActiveSection('mercado')}>Volver a Mercado</button>
              </div>
            </>
          ) : null}
          {!rankingError ? (
          <div className="ops-grid">
            <div className="ops-col">
              <h3>Top stock</h3>
              {rankingStockList.length === 0 ? <p className="ops-empty">Sin datos todavía.</p> : null}
              <ul className="ops-list">
                {rankingStockList.map((item, index) => (
                  <li key={`stock-${item.codigo || index}`}>
                    <strong>{item.descripcion || 'Sin descripcion'}</strong>
                    <span>{item.codigo || 'Sin codigo'} · {Number(item.stock || 0)} unidades</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ops-col">
              <h3>Top precio</h3>
              {rankingByValue.length === 0 ? <p className="ops-empty">Sin datos todavía.</p> : null}
              <ul className="ops-list">
                {rankingByValue.map((item, index) => (
                  <li key={`value-${item.codigo || index}`}>
                    <strong>{item.descripcion || 'Sin descripcion'}</strong>
                    <span>{item.codigo || 'Sin codigo'} · {formatCurrency(Number(item.precioFinal || 0))}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ops-col">
              <h3>Faltantes</h3>
              {faltantes.length === 0 ? <p className="ops-empty">No hay faltantes críticos.</p> : null}
              <ul className="ops-list">
                {faltantes.map((item, index) => (
                  <li key={`low-${item.codigo || index}`}>
                    <strong>{item.descripcion || 'Sin descripcion'}</strong>
                    <span>{item.codigo || 'Sin codigo'} · stock {Number(item.stock || 0)} / mínimo {Number(item.stockMinimo || 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          ) : null}
        </section>
      )}

      {activeSection === 'notas' && (
        <section className="detail">
          <div className="ops-head">
            <h2>Mis Notas y Checklists</h2>
            <button className="secondary" onClick={() => {
              const titulo = prompt("Título de la nota:");
              if (titulo === null) return;
              const tipo = confirm("¿Deseas que sea una lista de tareas (Checklist)?") ? "checklist" : "normal";
              handleCreateNota(titulo, tipo);
            }}> Nueva Nota</button>
          </div>
          <div className="list">
            {notas.map(nota => (
              <div key={nota.id} className="card">
                <div className="note-card-head">
                  <h3>{nota.tipo === 'checklist' ? '📋 ' : '📝 '}{nota.titulo}</h3>
                  <button className="secondary" onClick={() => handleDeleteNota(nota.id)}>Eliminar</button>
                </div>
                {nota.tipo === 'checklist' ? (
                  <ChecklistEditor
                    contenido={nota.contenido}
                    onSave={(newContent) => handleUpdateNota(nota.id, newContent)}
                  />
                ) : (
                  <textarea
                    className="note-textarea"
                    defaultValue={nota.contenido}
                    onBlur={(e) => handleUpdateNota(nota.id, e.target.value)}
                    placeholder="Escribe aqui tu nota..."
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === 'sync' && (
        <>
          <section className="detail">
            <div className="ops-head">
              <h2>Conexión y cache</h2>
              <div className="ops-actions">
                <button className="secondary" onClick={() => loadStatus()}>Estado</button>
                <button className="secondary" onClick={() => loadItems()}>Recargar cache</button>
                <button className="secondary" onClick={() => flushQueue()}>Reintentar cola</button>
              </div>
            </div>
            <div className="detail-grid">
              <div className="detail-group">
                <label>IP y puerto de la PC</label>
                <input
                  value={pcHost}
                  onChange={(event) => setPcHost(event.target.value)}
                  placeholder="Ej: 192.168.0.12:3001"
                />
              </div>
              <div className="detail-actions">
                <button onClick={connectToPc}>Conectar a PC</button>
                <button className="secondary" onClick={saveApiBase}>Guardar API</button>
              </div>
              <div className="detail-group">
                <label>Base API actual</label>
                <input
                  value={apiBase}
                  onChange={(event) => setApiBase(normalizeApiInput(event.target.value))}
                  placeholder="http://192.168.0.12:3001"
                />
              </div>
              <div className="detail-group">
                <label>URL backup compartido (archivo)</label>
                <input
                  value={backupFolderUrl}
                  onChange={(event) => setBackupFolderUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                />
              </div>
              <div className="detail-actions">
                <button onClick={() => processDriveUrl()}>Importar desde URL</button>
                <button className="secondary" onClick={() => createPcBackup(false)}>Pedir backup a PC</button>
              </div>
            </div>
          </section>

          <section className="detail">
            <div className="ops-head">
              <h2>Google Drive</h2>
              <div className="ops-actions">
                <button className="secondary" onClick={saveDriveClientId}>Guardar Client ID</button>
                {!driveConnected ? <button className="secondary" onClick={driveSignIn}>Conectar</button> : <button className="secondary" onClick={driveSignOut}>Desconectar</button>}
                <button className="secondary" onClick={driveMakeBackup} disabled={driveBusy}>Subir backup</button>
              </div>
            </div>
            <div className="detail-grid">
              <div className="detail-group">
                <label>Client ID Google</label>
                <input
                  value={driveClientId}
                  onChange={(event) => setDriveClientId(event.target.value)}
                  placeholder="Google OAuth Client ID"
                />
              </div>
              <div className="detail-group">
                <label>Cuenta conectada</label>
                <input value={driveEmail || 'Sin conectar'} readOnly />
              </div>
              <div className="detail-group checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={autoBackupSync}
                    onChange={(event) => setAutoBackupSync(event.target.checked)}
                  />
                  Sincronizar backup automáticamente
                </label>
              </div>
              <div className="detail-group">
                <label>Ruta Drive en PC</label>
                <input
                  value={driveDir}
                  onChange={(event) => setDriveDir(event.target.value)}
                  placeholder="G:\\Mi unidad\\MercadoPG"
                />
              </div>
              <div className="detail-actions">
                <button onClick={() => saveDriveDir()}>Guardar ruta Drive PC</button>
                <button className="secondary" onClick={() => loadDriveDir()}>Leer ruta actual</button>
              </div>
            </div>
          </section>

          <section className="detail">
            <div className="ops-head">
              <h2>Cola de actualizaciones ({pendingOps.length})</h2>
            </div>
            {pendingOps.length === 0 ? <p className="ops-empty">No hay operaciones pendientes.</p> : null}
            <ul className="ops-list">
              {pendingOps.slice(0, 30).map((op) => (
                <li key={op.id}>
                  <strong>{formatOpLabel(op)}</strong>
                  <span>{shortDate(op.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="detail">
            <div className="ops-head">
              <h2>Conflictos ({conflicts.length}) e historial ({history.length})</h2>
              <div className="ops-actions">
                <button className="secondary" onClick={clearConflicts}>Limpiar conflictos</button>
                <button className="secondary" onClick={clearHistory}>Limpiar historial</button>
              </div>
            </div>
            <div className="ops-grid">
              <div className="ops-col">
                <h3>Conflictos</h3>
                {conflicts.length === 0 ? <p className="ops-empty">Sin conflictos.</p> : null}
                <ul className="ops-list">
                  {conflicts.slice(0, 30).map((entry, index) => (
                    <li key={`conflict-${index}`}>
                      <strong>{entry.summary || 'Conflicto'}</strong>
                      <span>{entry.reason || 'Sin detalle'} · {shortDate(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ops-col">
                <h3>Historial sync</h3>
                {history.length === 0 ? <p className="ops-empty">Sin historial todavía.</p> : null}
                <ul className="ops-list">
                  {history.slice(0, 40).map((entry, index) => (
                    <li key={`history-${index}`}>
                      <strong>{entry.summary || 'Sin resumen'}</strong>
                      <span>{entry.reason || 'OK'} · {shortDate(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <MobileErrorBoundary>
    <App />
  </MobileErrorBoundary>
);
