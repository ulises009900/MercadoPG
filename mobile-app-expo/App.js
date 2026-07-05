import { useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const URL_STORAGE_KEY = 'mercadopg.expo.mobile-url';
const STORAGE_SNAPSHOT_KEY = 'mercadopg.expo.storage-snapshot.v1';
const DEFAULT_URL = process.env.EXPO_PUBLIC_MERCADOPG_URL || '';
const AUTO_DISCOVERY_CANDIDATES = Array.from(new Set([
  process.env.EXPO_PUBLIC_MERCADOPG_URL || ''
].filter(Boolean)));
const DISCOVERY_TIMEOUT_MS = 1800;

const STORAGE_PREFIX_ALLOWLIST = ['mercadopg.mobile.', 'mercadopg.expo.'];
const MAX_SNAPSHOT_VALUE_LENGTH = 120000;

async function requestAndroidMediaPermissions() {
  if (Platform.OS !== 'android') {
    return;
  }

  const permissions = [
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED
  ].filter(Boolean);

  try {
    await PermissionsAndroid.requestMultiple(permissions);
  } catch {
    // Si Android no reconoce algun permiso en una version vieja, el WebView
    // igualmente pedira lo que pueda al abrir camara o galeria.
  }
}

function shouldPersistStorageKey(key) {
  return STORAGE_PREFIX_ALLOWLIST.some((prefix) => String(key || '').startsWith(prefix));
}

function parseSnapshot(raw) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function buildInjectedBridge(snapshot) {
  const safeSnapshot = JSON.stringify(snapshot || {}).replace(/</g, '\\u003c');
  return `
    (function () {
      // Compatibilidad defensiva: algunos bundles viejos referencian estas
      // variables globales al abrir Ranking.
      if (typeof window.rankingByStock === 'undefined') {
        window.rankingByStock = [];
      }
      if (typeof window.rankingByValue === 'undefined') {
        window.rankingByValue = [];
      }
      if (typeof window.faltantes === 'undefined') {
        window.faltantes = [];
      }

      var snapshot = ${safeSnapshot};

      function post(type, payload) {
        try {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
            return;
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} }));
        } catch (error) {
          // noop
        }
      }

      function collectStorage() {
        var out = {};
        try {
          for (var i = 0; i < window.localStorage.length; i += 1) {
            var key = window.localStorage.key(i);
            if (!key) {
              continue;
            }
            var keep = ${JSON.stringify(STORAGE_PREFIX_ALLOWLIST)}.some(function (prefix) {
              return String(key).indexOf(prefix) === 0;
            });
            if (keep) {
              out[key] = window.localStorage.getItem(key);
            }
          }
        } catch (error) {
          return {};
        }
        return out;
      }

      function postSnapshot() {
        post('mercadopg-storage-snapshot', collectStorage());
      }

      window.addEventListener('error', function (event) {
        post('mercadopg-runtime-error', {
          message: String((event && event.message) || 'Error JavaScript sin detalle'),
          source: String((event && event.filename) || ''),
          line: Number((event && event.lineno) || 0),
          column: Number((event && event.colno) || 0),
          stack: String((event && event.error && event.error.stack) || '')
        });
      });

      window.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        post('mercadopg-runtime-error', {
          message: String((reason && reason.message) || reason || 'Promise rechazada sin detalle'),
          source: 'unhandledrejection',
          line: 0,
          column: 0,
          stack: String((reason && reason.stack) || '')
        });
      });

      try {
        if (snapshot && typeof snapshot === 'object') {
          Object.keys(snapshot).forEach(function (key) {
            if (window.localStorage.getItem(key) == null && typeof snapshot[key] === 'string') {
              window.localStorage.setItem(key, snapshot[key]);
            }
          });
        }
      } catch (error) {
        // noop
      }

      postSnapshot();
      window.addEventListener('pagehide', postSnapshot);
      window.addEventListener('beforeunload', postSnapshot);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          postSnapshot();
        }
      });
    })();
    true;
  `;
}

function buildInjectedNavigationPatch() {
  return `
    (function () {
      function navigate(url) {
        if (!url) {
          return;
        }
        window.location.href = url;
      }

      var originalOpen = window.open;
      window.open = function (url) {
        if (url) {
          navigate(url);
          return null;
        }
        if (typeof originalOpen === 'function') {
          return originalOpen.apply(window, arguments);
        }
        return null;
      };

      document.addEventListener('click', function (event) {
        var el = event.target;
        while (el && el.tagName !== 'A') {
          el = el.parentElement;
        }
        if (!el) {
          return;
        }
        var href = el.getAttribute('href');
        var target = String(el.getAttribute('target') || '').toLowerCase();
        if (href && (target === '_blank' || target === '_new')) {
          event.preventDefault();
          navigate(el.href || href);
        }
      }, true);

      document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || form.tagName !== 'FORM') {
          return;
        }
        var target = String(form.getAttribute('target') || '').toLowerCase();
        if (target === '_blank' || target === '_new') {
          form.removeAttribute('target');
        }
      }, true);
    })();
    true;
  `;
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  // Corrige typos frecuentes al escribir ngrok (grok/grock).
  const fixedRaw = raw
    .replace(/\.grock-free\.app/ig, '.ngrok-free.app')
    .replace(/\.grok-free\.app/ig, '.ngrok-free.app')
    .replace(/\.grock\.app/ig, '.ngrok.app')
    .replace(/\.grok\.app/ig, '.ngrok.app')
    .replace(/\.grock\.io/ig, '.ngrok.io')
    .replace(/\.grok\.io/ig, '.ngrok.io')
    .replace(/\.grock\.dev/ig, '.ngrok.dev')
    .replace(/\.grok\.dev/ig, '.ngrok.dev');

  if (/^https?:\/\//i.test(fixedRaw)) {
    return fixedRaw.replace(/\/+$/, '');
  }

  const shouldUseHttps = fixedRaw.includes('.ngrok-free.app') || fixedRaw.includes('.ngrok.app') || fixedRaw.includes('.ngrok.io') || fixedRaw.includes('.ngrok.dev');
  const host = fixedRaw.replace(/\/+$/, '');
  const hasPort = /:[0-9]+$/.test(host);

  // ngrok usa 443 público y no debe forzarse :3001.
  if (shouldUseHttps) {
    return `https://${host}`;
  }

  return `http://${hasPort ? host : `${host}:3001`}`;
}

async function canReachServer(baseUrl, timeoutMs = DISCOVERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const normalized = normalizeUrl(baseUrl);
    if (!normalized) {
      return false;
    }

    const response = await fetch(`${normalized}/api/status`, {
      method: 'GET',
      headers: isNgrokUrl(normalized) ? { 'ngrok-skip-browser-warning': 'true' } : undefined,
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverServerUrl(candidates) {
  for (const rawCandidate of candidates || []) {
    const candidate = normalizeUrl(rawCandidate);
    if (!candidate) {
      continue;
    }
    const reachable = await canReachServer(candidate);
    if (reachable) {
      return candidate;
    }
  }
  return '';
}

function canLoadRequest(activeUrl, request) {
  const requestUrl = String(request?.url || '').trim();
  if (!requestUrl) {
    return true;
  }

  try {
    const target = new URL(requestUrl);

    if (target.protocol === 'about:' || target.protocol === 'data:' || target.protocol === 'blob:') {
      return true;
    }

    // Permitir navegación HTTP/HTTPS completa para evitar falsos bloqueos en
    // red local cuando el sitio abre popups, redirecciona o usa enlaces externos.
    return /^https?:$/i.test(target.protocol);
  } catch {
    return true;
  }
}

function buildConnectionHelp(url, extra = '') {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return 'No se pudo abrir. Revisa la URL del servidor.';
  }

  const suffix = extra ? ` Detalle: ${extra}` : '';
  return `No se pudo conectar con MercadoPG. Verifica que la PC y el telefono esten en la misma WiFi, que MercadoPG este abierto y que el firewall permita el puerto 3001.${suffix}`;
}

function isNgrokUrl(value) {
  const raw = String(value || '').toLowerCase();
  return raw.includes('.ngrok-free.app') || raw.includes('.ngrok.app') || raw.includes('.ngrok.io') || raw.includes('.ngrok.dev');
}

export default function App() {
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
  const [activeUrl, setActiveUrl] = useState('');
  const [storageSnapshot, setStorageSnapshot] = useState({});
  const [loadingSavedUrl, setLoadingSavedUrl] = useState(true);
  const [webMessage, setWebMessage] = useState('');

  useEffect(() => {
    async function hydrateUrl() {
      try {
        const [saved, snapshotRaw] = await Promise.all([
          AsyncStorage.getItem(URL_STORAGE_KEY),
          AsyncStorage.getItem(STORAGE_SNAPSHOT_KEY)
        ]);

        const snapshot = parseSnapshot(snapshotRaw);
        setStorageSnapshot(snapshot);

        const normalizedSaved = normalizeUrl(saved || '');
        if (normalizedSaved) {
          setInputUrl(normalizedSaved);
          setActiveUrl(normalizedSaved);
          return;
        }

        const discovered = await discoverServerUrl(AUTO_DISCOVERY_CANDIDATES);
        if (discovered) {
          setInputUrl(discovered);
          setActiveUrl(discovered);
          await AsyncStorage.setItem(URL_STORAGE_KEY, discovered);
          return;
        }

        const fallbackDefault = normalizeUrl(DEFAULT_URL);
        setInputUrl(fallbackDefault);
        setActiveUrl('');
      } finally {
        setLoadingSavedUrl(false);
      }
    }
    hydrateUrl();
  }, []);

  const canOpen = useMemo(() => Boolean(normalizeUrl(inputUrl)), [inputUrl]);
  const injectedBridgeScript = useMemo(() => buildInjectedBridge(storageSnapshot), [storageSnapshot]);
  const injectedNavigationPatch = useMemo(() => buildInjectedNavigationPatch(), []);

  useEffect(() => {
    requestAndroidMediaPermissions();
  }, []);

  async function openMercadoPg() {
    const next = normalizeUrl(inputUrl);
    if (!next) {
      return;
    }

    await AsyncStorage.setItem(URL_STORAGE_KEY, next);
    setInputUrl(next);
    setActiveUrl(next);
  }

  async function handleWebMessage(event) {
    try {
      const data = parseSnapshot(event?.nativeEvent?.data);
      if (data.type === 'mercadopg-runtime-error') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const base = String(payload.message || 'Error JavaScript sin detalle');
        const src = String(payload.source || 'origen desconocido');
        const line = Number(payload.line || 0);
        const where = line > 0 ? `${src}:${line}` : src;
        setWebMessage(`Error interno detectado en la app web: ${base} (${where}).`);
        return;
      }

      if (data.type !== 'mercadopg-storage-snapshot') {
        return;
      }

      const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
      const filtered = Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => {
          if (!shouldPersistStorageKey(key) || typeof value !== 'string') {
            return false;
          }
          return value.length <= MAX_SNAPSHOT_VALUE_LENGTH;
        })
      );

      setStorageSnapshot(filtered);
      await AsyncStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(filtered));
    } catch {
      // Ignoramos mensajes inválidos para no romper la navegación.
    }
  }

  if (loadingSavedUrl) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <StatusBar style="dark" />
        <Text style={styles.loadingText}>Cargando MercadoPG...</Text>
      </SafeAreaView>
    );
  }

  if (activeUrl) {
    return (
      <SafeAreaView style={styles.webviewWrap}>
        <StatusBar style="dark" />
        <View style={styles.webHeader}>
          <Text style={styles.webHeaderTitle}>MercadoPG en Expo</Text>
          <TouchableOpacity style={styles.webHeaderButton} onPress={() => setActiveUrl('')}>
            <Text style={styles.webHeaderButtonText}>Cambiar URL</Text>
          </TouchableOpacity>
        </View>
        {webMessage ? <Text style={styles.webNotice}>{webMessage}</Text> : null}
        <WebView
          source={{
            uri: activeUrl,
            headers: isNgrokUrl(activeUrl) ? { 'ngrok-skip-browser-warning': 'true' } : undefined
          }}
          originWhitelist={['http://*', 'https://*', 'about:*', 'data:*']}
          userAgent="MercadoPGMobile/1.0"
          javaScriptCanOpenWindowsAutomatically
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          startInLoadingState
          cacheEnabled
          javaScriptEnabled
          domStorageEnabled
          onPermissionRequest={(event) => {
            try {
              if (event && typeof event.grant === 'function') {
                event.grant();
              }
            } catch {
              // El WebView pedirá el permiso de forma nativa si este grant falla.
            }
          }}
          injectedJavaScriptBeforeContentLoaded={injectedBridgeScript}
          injectedJavaScript={injectedNavigationPatch}
          onMessage={handleWebMessage}
          onLoadStart={() => {
            if (webMessage) {
              setWebMessage('');
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            const allowed = canLoadRequest(activeUrl, request);
            if (!allowed) {
              setWebMessage('Bloqueado: enlace externo detectado. Abrí ese link dentro de MercadoPG, en Configuración.');
            } else if (webMessage) {
              setWebMessage('');
            }
            return allowed;
          }}
          onOpenWindow={(event) => {
            const nextUrl = String(event?.nativeEvent?.targetUrl || event?.nativeEvent?.url || '').trim();
            if (nextUrl) {
              setActiveUrl(nextUrl);
            }
          }}
          onHttpError={(event) => {
            const statusCode = event?.nativeEvent?.statusCode;
            setWebMessage(buildConnectionHelp(activeUrl, `HTTP ${statusCode || 'sin codigo'}`));
          }}
          onError={(event) => {
            const description = event?.nativeEvent?.description || 'sin descripcion';
            setWebMessage(`${buildConnectionHelp(activeUrl, description)} Si ya abriste esta URL antes, se intentará mostrar la última copia en caché.`);
          }}
          onContentProcessDidTerminate={() => {
            setWebMessage('El proceso de la app web se cerró en el teléfono. Reabre MercadoPG o toca "Cambiar URL" y vuelve a entrar.');
          }}
          onRenderProcessGone={(event) => {
            const details = String(event?.nativeEvent?.didCrash ? 'crash' : 'cerrado por sistema');
            setWebMessage(`El motor de render de la app web se detuvo (${details}). Reintentá abrir MercadoPG.`);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>MercadoPG - Prueba con Expo</Text>
        <Text style={styles.subtitle}>
          Pegá la IP y el puerto del servidor. Para red local usá algo como 192.168.0.12:3001; si querés ngrok, pegá la URL HTTPS pública.
        </Text>

        <Text style={styles.label}>URL del servidor</Text>
        <TextInput
          value={inputUrl}
          onChangeText={setInputUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          placeholder="http://192.168.0.12:3001"
          placeholderTextColor="#6f6f6f"
        />

        <TouchableOpacity style={[styles.button, !canOpen && styles.buttonDisabled]} disabled={!canOpen} onPress={openMercadoPg}>
          <Text style={styles.buttonText}>Abrir MercadoPG</Text>
        </TouchableOpacity>

        <Text style={styles.tip}>
          Consejo: la PC y el teléfono deben estar en la misma red WiFi.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '600'
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 18,
    justifyContent: 'center'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfcfcf',
    padding: 20,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5
  },
  title: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  subtitle: {
    color: '#4a4a4a',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6
  },
  label: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '700'
  },
  input: {
    borderWidth: 1,
    borderColor: '#bcbcbc',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    color: '#111111',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16
  },
  button: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  tip: {
    marginTop: 6,
    color: '#4a4a4a',
    fontSize: 13
  },
  webviewWrap: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  webNotice: {
    fontSize: 13,
    color: '#111111',
    backgroundColor: '#f2f2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#d4d4d4',
    backgroundColor: '#ffffff'
  },
  webHeaderTitle: {
    fontSize: 15,
    color: '#111111',
    fontWeight: '700',
    letterSpacing: 0.5
  },
  webHeaderButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#111111'
  },
  webHeaderButtonText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '800'
  }
});
