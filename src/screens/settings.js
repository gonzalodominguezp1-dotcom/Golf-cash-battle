// Pantalla Ajustes (T037): lo que showSettings pintaba en main.js. El panel (controles, calidad, sonido) es el de siempre,
// src/ui/settingsPanel.js: aquí solo se monta, con carga no bloqueante, tope de red y ciclo de vida. El silencio (sonido)
// sigue en la sección Sonido y en la tecla M; nada de eso cambia. Todas las secciones guardan como hoy.
import { bindLobby, listState, lobbyButton } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/settings.js';

const NET_TIMEOUT_MS = 8000; // el panel se descarga al abrir: si la red no responde, error con Reintentar

const defaultLoadPanel = () => import('../ui/settingsPanel.js');

export function mount(root, ctx) {
  const scope = ctx.scope.child();
  const { backend } = ctx;
  let gone = false, run = 0, sc = null, panel = null;

  ctx.leavePlay?.(); // al entrar: cerrar final y sala en vivo, liberar la partida
  root.innerHTML = `<main class="screen settings-screen" aria-label="${esc(t('settings.title'))}"><div class="settings-host" data-settings-host></div>${lobbyButton()}</main>`;
  bindLobby(root, { ...ctx, scope });
  const host = root.querySelector('[data-settings-host]');

  const synced = () => !!backend?.account && !backend.account.profile?.is_anonymous;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  // cada repintado suelta lo del anterior: el panel montado y los listeners del estado
  function fresh() {
    sc?.dispose();
    sc = scope.child();
    panel = null;
  }

  function paintState(state) {
    fresh();
    listState(host, { state, errorText: t('settings.loadError'), onRetry: () => load(), scope: sc });
  }

  function paint(mod) {
    fresh();
    listState(host, { state: 'ready' });
    try {
      panel = mod.mountSettingsPanel(host, { layout: 'screen', section: mod.lastSection(), synced: synced() });
    } catch { paintState('error'); return; }
    const p = panel;
    sc.sub(() => p.destroy?.());
  }

  function load() {
    const my = ++run;
    paintState('loading');
    timed((ctx.loadPanel ?? defaultLoadPanel)()).then(
      (mod) => { if (my === run && !gone) paint(mod); },
      () => { if (my === run && !gone) paintState('error'); },
    );
  }

  load();
  return { destroy() { gone = true; run++; scope.dispose(); } };
}
