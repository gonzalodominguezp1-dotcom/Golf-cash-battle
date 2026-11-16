// Comprobación de versión: lee version.json con un intervalo que para con la pestaña oculta
// y avisa una vez si el id de build servido cambia. Errores y tiempos agotados son silenciosos.
import '../screens/texts/version.js';
import { t } from '../screens/texts/index.js';
import {
  VERSION_FETCH_TIMEOUT_MS,
  VERSION_POLL_MS,
  isNewBuild,
  parseVersionInfo,
  visibilityAction,
} from './versionRules.js';

/** Id de build de esta página (lo define vite.config.js); en desarrollo no existe. */
const PAGE_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : null;

function showUpdateBanner() {
  if (document.getElementById('version-banner')) return;
  const box = document.createElement('div');
  box.id = 'version-banner';
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    position: 'fixed',
    left: '16px',
    right: '16px',
    bottom: '16px',
    zIndex: '10000',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '12px',
    background: '#16202a',
    color: '#fff',
    font: '600 15px system-ui, sans-serif',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
  });
  const text = document.createElement('span');
  text.textContent = t('version.title');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = t('version.reload');
  Object.assign(btn.style, {
    border: '0',
    borderRadius: '8px',
    padding: '8px 14px',
    background: '#f5c542',
    color: '#16202a',
    font: 'inherit',
    cursor: 'pointer',
  });
  btn.addEventListener('click', () => location.reload());
  box.append(text, btn);
  document.body.append(box);
}

/**
 * Arranca la comprobación. Devuelve una función que la para del todo.
 * Sin lecturas con la pestaña oculta; al volver a verla comprueba al momento.
 */
export function startVersionCheck({
  url = `${import.meta.env.BASE_URL}version.json`,
  fetchFn = fetch,
  timers = globalThis,
  doc = document,
  every = VERSION_POLL_MS,
  timeout = VERSION_FETCH_TIMEOUT_MS,
  onNew = showUpdateBanner,
} = {}) {
  let known = PAGE_BUILD;
  let handle = null;
  let running = false;
  let done = false;

  async function check() {
    if (done || doc.hidden) return;
    let info = null;
    const ac = new AbortController();
    const to = timers.setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetchFn(url, { cache: 'no-store', signal: ac.signal });
      if (res.ok) info = parseVersionInfo(await res.json());
    } catch {
      // silencioso: un fallo de red o un tope agotado no molesta al jugador
    } finally {
      timers.clearTimeout(to);
    }
    if (!info || done) return;
    if (known == null) {
      known = info.build;
      return;
    }
    if (isNewBuild(known, info)) {
      done = true;
      stop();
      onNew(info);
    }
  }

  function start() {
    if (running || done) return;
    running = true;
    check();
    handle = timers.setInterval(check, every);
  }

  function stop() {
    running = false;
    if (handle != null) timers.clearInterval(handle);
    handle = null;
  }

  function onVisibility() {
    const act = visibilityAction(doc.hidden, running);
    if (act === 'stop') stop();
    else if (act === 'start') start();
  }

  doc.addEventListener('visibilitychange', onVisibility);
  onVisibility();

  return () => {
    done = true;
    stop();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
