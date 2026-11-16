// Cuenta (T034): cabecera con Volver y pestañas Perfil y Progreso. Cada pestaña es ./account/<archivo>.js,
// que se encuentra por convención (glob con nombres literales: Vite tolera los que aún no existen). El Monedero
// ya no es pestaña: es la pantalla #/monedero (src/screens/monedero.js). Un #/cuenta/monedero antiguo muestra Perfil.
// Mientras no exista el archivo de una pestaña (Progreso), muestra «En construcción».
import { bindHeader, bindLobby, header, listState, lobbyButton } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/account.js';

const NET_TIMEOUT_MS = 8000; // una pestaña que no carga no deja la pantalla colgada: error con Reintentar
// clave de la ruta (#/cuenta/<clave>) -> archivo de la pestaña y texto de su botón
export const ACCOUNT_TAB_FILES = { perfil: 'profile', progreso: 'progress' };
const TAB_LABELS = { perfil: 'account.tabProfile', progreso: 'account.tabProgress' };

export const tabModules = () => import.meta.glob(['./account/profile.js', './account/progress.js']);

export async function mount(root, ctx, params = {}, { modules = tabModules() } = {}) {
  const { router } = ctx;
  const scope = ctx.scope.child(); // todo lo de la pantalla cuelga de aquí: destroy lo libera entero
  const tab = Object.hasOwn(ACCOUNT_TAB_FILES, params?.tab) ? params.tab : 'perfil';
  let gone = false, run = 0, inner = null, tabScope = null;

  root.innerHTML = `<main class="screen account acct-screen" aria-label="${esc(t('account.title'))}">
    ${header({ title: t('account.title') })}
    <nav class="rank-tabs acc-tabs" aria-label="${esc(t('account.tabsLabel'))}">
      ${Object.keys(ACCOUNT_TAB_FILES).map((k) => `<button type="button" data-acc-tab="${k}" class="${k === tab ? 'on' : ''}" aria-current="${k === tab ? 'page' : 'false'}">${esc(t(TAB_LABELS[k]))}</button>`).join('')}
    </nav>
    <div class="acct-body" data-acc-body="1"></div>
    ${lobbyButton()}
  </main>`;
  bindHeader(root, { ...ctx, scope });
  bindLobby(root, { ...ctx, scope });
  for (const b of root.querySelectorAll('[data-acc-tab]')) {
    scope.on(b, 'click', () => {
      if (b.dataset.accTab === tab) return;
      ctx.sfx?.tap?.();
      router.replace('account', { tab: b.dataset.accTab });
    });
  }
  const body = root.querySelector('[data-acc-body]');

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  async function load() {
    const my = ++run;
    inner?.destroy?.();
    inner = null;
    tabScope?.dispose();
    tabScope = scope.child();
    body.innerHTML = '';
    listState(body, { state: 'loading' });
    try {
      const file = ACCOUNT_TAB_FILES[tab];
      const loader = modules[`./account/${file}.js`];
      if (loader) {
        const mod = await timed(loader());
        if (my !== run || gone) return;
        body.innerHTML = '';
        const made = await mod.mount(body, { ...ctx, scope: tabScope }, params);
        if (my !== run || gone) { made?.destroy?.(); return; }
        inner = made;
      } else {
        body.innerHTML = `<p class="scr-state" data-acc-pending="1">${esc(t('common.underConstructionText'))}</p>`;
        body.dataset.state = 'ready';
      }
    } catch {
      if (my === run && !gone) listState(body, { state: 'error', errorText: t('account.loadError'), onRetry: load, scope: tabScope });
    }
  }

  load(); // sin esperar: el host serializa los montajes y una red lenta no debe bloquear «Atrás»
  return {
    title: t('account.title'),
    destroy() {
      gone = true;
      run++;
      inner?.destroy?.();
      inner = null;
      scope.dispose();
    },
  };
}
