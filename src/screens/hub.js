// NOTA: el logo ya no está en la barra; vuelve como banderín en la escena (tarea aparte). Queda un h1 sr-only con el nombre del juego.
// Hub: pantalla raíz con la composición C10 (usuario · saldo · Ajustes y pantalla completa arriba; Ranking/Logros a la
// izquierda, Skins/Amigos a la derecha; Mapas · JUGAR · Práctica abajo). Fondo: escena 3D precargada (ctx.hubScene) o, sin ella, la imagen fija del CSS.
// El CSS (hub.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { CHALLENGES } from '../progress/skins.js';
import { esc } from './shared.js';
import { badge } from './components.js';
import { levelRing, badgeFor, achievementsBadge } from './hubRules.js';
import { seenSet } from './achievementsRules.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/hub.js';

// clave -> { ruta | acción, icono, texto }; la columna decide dónde se pinta
const NAV = {
  ranking: { go: 'ranking', icon: 'trophy', text: 'ranking' },
  achievements: { go: 'achievements', icon: 'medal', text: 'achievements', opts: { tone: 'gold' } },
  skins: { go: 'skins', icon: 'skins', text: 'skins' },
  friends: { go: 'friends', icon: 'users', text: 'friends', guest: true },
  maps: { go: 'maps', icon: 'map', text: 'maps' },
  practice: { act: 'startPractice', icon: 'tee', text: 'practice' },
};

// 1250 -> «1.250» (separador de miles fijo: Intl es-ES no agrupa los números de 4 cifras). Siempre entero y >= 0;
// desde 10 millones pasa a formato compacto («12,3 M») para que nunca haga falta truncar el número; el nombre accesible lleva la cantidad completa.
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const fmtCoins = (n, compact = true) => {
  const v = Math.min(Math.max(Math.trunc(n), 0), 999_999_999_999_999);
  if (compact && v >= 10_000_000) return `${group(String(Math.floor(v / 1e6)))}${v % 1e6 >= 1e5 && v < 1e9 ? `,${Math.floor((v % 1e6) / 1e5)}` : ''} M`;
  return group(String(v));
};

export async function mount(root, ctx) {
  const { router, scope, progress, notifier } = ctx;
  // El tamaño real lo fija hub.css (--ico-svg, por pantalla); este valor es solo el de reserva del atributo.
  const icon = (n, o = {}) => ctx.icon(n, { size: 52, ...o });
  const account = ctx.backend?.account;
  const guest = !account || !!account.profile?.is_anonymous;
  const userId = ctx.backend?.user?.id ?? 'local';
  const storage = ctx.storage ?? globalThis.localStorage;

  const ring = levelRing(progress.level);
  const accountLabel = t(guest ? 'hub.accountGuestLabel' : 'hub.accountLabel', { level: ring.label });

  const friendsNow = (c) => badgeFor((c?.friendRequests || 0) + (c?.partyInvites || 0));
  const achievementsNow = () => {
    const states = CHALLENGES.map((c) => ({ id: c.id, done: !!progress.challenge(c.id).done }));
    return achievementsBadge(states, seenSet(storage, userId));
  };
  const badges = { friends: friendsNow(notifier?.counts), achievements: achievementsNow() };

  const nav = (key, cls = 'hub-nav') => {
    const n = NAV[key];
    const needs = n.guest && guest;
    return `<button type="button" class="${cls}${needs ? ' hub-needs-account' : ''}" data-hub="${key}" data-focus-key="${key}">`
      + `<span class="hub-ico hub-ico--${key}">${icon(n.icon, n.opts)}<span data-badge="${key}">${badges[key] ? badge(badges[key]) : ''}</span></span>`
      + `<span class="hub-nav-t">${esc(t(`hub.${n.text}`))}</span>`
      + `${needs ? `<span class="sr-only">${esc(t('hub.needsAccount'))}</span>` : ''}</button>`;
  };

  // botones grandes de la barra inferior: icono y texto DENTRO de la caja, con color de fondo propio
  const big = (key, cls) => {
    const n = NAV[key];
    return `<button type="button" class="hub-big ${cls}" data-hub="${key}" data-focus-key="${key}">${icon(n.icon, { size: 34 })}<span class="hub-big-t">${esc(t(`hub.${n.text}`))}</span></button>`;
  };

  root.innerHTML = `<main class="hub" aria-label="${esc(t('hub.title'))}">
    <div class="hub-scene" data-hub-scene="1" aria-hidden="true"></div>
    <h1 class="sr-only">${esc(t('hub.logoAlt'))}</h1>
    <header class="hub-top">
      <div class="hub-left">
        <button type="button" class="hub-user${guest ? ' hub-needs-account' : ''}" data-hub="account" data-focus-key="account" style="--pct:${ring.pct}" aria-label="${esc(accountLabel)}">
          <span class="hub-face">${icon('user', { size: 40 })}<b class="hub-lv" data-hub-lv="1" aria-hidden="true">${ring.level}</b></span>
        </button>
        ${ctx.wallet ? `<button type="button" class="hub-wallet" data-hub="wallet" data-focus-key="wallet" aria-label="${esc(t('hub.wallet'))}">
          <span class="hub-wallet-ico" aria-hidden="true">${icon('coins', { size: 26 })}</span>
          <b class="hub-wallet-n" data-hub-balance="1" aria-hidden="true">${esc(t('hub.walletEmpty'))}</b>
        </button>` : ''}
      </div>
      <div class="hub-tools">
        <button type="button" class="hub-nav hub-tool" data-hub="settings" data-focus-key="settings" aria-label="${esc(t('hub.settings'))}"><span class="hub-ico hub-ico--tool">${icon('gear')}</span></button>
        <button type="button" class="hub-nav hub-tool" data-hub="fullscreen" aria-label="${esc(t('hub.fullscreenLabel'))}"><span class="hub-ico hub-ico--tool">${icon('fullscreen')}</span></button>
      </div>
    </header>
    <nav class="hub-mid" aria-label="${esc(t('hub.title'))}">
      <div class="hub-col">${nav('ranking')}${nav('achievements')}</div>
      <div class="hub-col">${nav('skins')}${nav('friends')}</div>
    </nav>
    <footer class="hub-bottom">
      ${big('maps', 'hub-maps')}
      <button type="button" class="hub-play" data-hub="play" data-focus-key="play"><span class="hub-shine" aria-hidden="true"></span>${icon('play', { size: 34 })}<span class="hub-play-t">${esc(t('hub.play'))}</span></button>
      ${big('practice', 'hub-practice')}
    </footer>
  </main>`;

  // Referencias guardadas al montar: con el hub tapado su DOM está fuera de la raíz y root.querySelector ya no lo ve.
  const refs = {
    friends: root.querySelector('[data-badge="friends"]'),
    achievements: root.querySelector('[data-badge="achievements"]'),
    user: root.querySelector('[data-hub="account"]'),
    lv: root.querySelector('[data-hub-lv="1"]'),
    wallet: root.querySelector('[data-hub="wallet"]'),
    balance: root.querySelector('[data-hub-balance="1"]'),
  };
  // Saldo (decisión del humano, cambia C10): sin ctx.wallet no hay píldora; si getBalance falla o no resuelve queda «—».
  let gone = false, fresh = false, seq = 0; // fresh: ya llegó un valor por suscripción, que manda sobre las lecturas; seq: solo pinta la última lectura lanzada
  const paintBalance = (n) => {
    if (gone || !Number.isFinite(n)) return;
    if (refs.balance) refs.balance.textContent = fmtCoins(n);
    refs.wallet?.setAttribute?.('aria-label', Math.trunc(n) === 1 ? t('hub.walletLabelOne') : t('hub.walletLabel', { n: fmtCoins(n, false) }));
  };
  const readBalance = () => {
    if (!ctx.wallet) return;
    const my = ++seq;
    try {
      Promise.resolve(ctx.wallet.getBalance()).then((n) => { if (my === seq && !fresh && !gone) paintBalance(n); }, () => {});
    } catch { /* un monedero roto no tumba el hub */ }
  };
  if (ctx.wallet) {
    if (refs.balance) refs.balance.textContent = t('hub.walletEmpty');
    readBalance();
    try { scope.sub(ctx.wallet.subscribe((n) => { fresh = true; paintBalance(n); })); } catch { /* idem */ }
  }
  const paintBadge = (key) => {
    const el = refs[key];
    if (el) el.innerHTML = badges[key] ? badge(badges[key]) : '';
  };
  // Al destapar se recalcula todo: pudo cambiar el notifier, los logros vistos o el nivel mientras estaba tapado.
  const repaintAll = () => {
    const r = levelRing(progress.level);
    badges.friends = friendsNow(notifier?.counts);
    badges.achievements = achievementsNow();
    paintBadge('friends');
    paintBadge('achievements');
    if (refs.user) {
      refs.user.style?.setProperty?.('--pct', String(r.pct));
      refs.user.setAttribute?.('aria-label', t(guest ? 'hub.accountGuestLabel' : 'hub.accountLabel', { level: r.label }));
    }
    if (refs.lv) refs.lv.textContent = String(r.level);
    fresh = false;
    readBalance();
  };

  const go = (id) => { ctx.sfx?.tap?.(); router.push(id); };
  const ACTIONS = { play: () => go('tables'), account: () => go('account'), wallet: () => { ctx.sfx?.tap?.(); router.push('account', { tab: 'monedero' }); }, settings: () => go('settings'), fullscreen: () => ctx.actions.toggleFullscreen() };
  for (const [key, n] of Object.entries(NAV)) ACTIONS[key] = n.go ? () => go(n.go) : () => { ctx.sfx?.tap?.(); ctx.actions[n.act](); };
  for (const el of root.querySelectorAll('[data-hub]')) scope.on(el, 'click', ACTIONS[el.dataset.hub]);

  if (notifier) {
    scope.sub(notifier.subscribe((c) => { badges.friends = friendsNow(c); paintBadge('friends'); }));
  }
  // Escena 3D de fondo. Es del contexto (la libera la partida), no del hub: aquí solo se coloca, se pausa y se suelta.
  // Si no hay (sin WebGL, omitida por el margen, three bloqueado, liberada por una partida) se ve la imagen fija.
  const box = root.querySelector('[data-hub-scene="1"]');
  const doc = scope.doc;
  let scene = null, attached = false, covered = false;
  const sync = () => {
    if (!scene) return;
    try { (!covered && !doc?.hidden) ? scene.resume() : scene.pause(); } catch { /* una escena rota no tumba el hub */ }
  };
  const place = () => {
    if (!scene || !box || covered) return; // tapado el contenedor mide 0: se coloca al destapar
    try {
      if (!attached) { scene.attach(box); attached = true; }
      scene.setQuality?.(ctx.quality?.());
      scene.resize?.();
    } catch { /* idem */ }
    sync();
  };
  const drop = () => {
    try { scene?.pause(); } catch { /* ya liberada */ }
    scene = null; attached = false;
    if (box) box.innerHTML = '';
  };
  const adopt = (sc) => {
    if (sc === scene) return;
    if (scene) drop();
    scene = sc || null;
    place();
  };
  adopt(ctx.getHubScene ? ctx.getHubScene() : ctx.hubScene);
  if (ctx.watchHubScene) scope.sub(ctx.watchHubScene(adopt));
  scope.on(doc, 'visibilitychange', sync);
  scope.on(scope.win, 'resize', () => { if (!covered) scene?.resize?.(); });
  if (import.meta.env?.DEV && scope.win) scope.win.__gcbHub = { get stats() { return scene?.stats; } };

  ctx.actions.claimRewards();

  return {
    title: t('hub.title'),
    onCover() { covered = true; sync(); },
    onUncover(from) {
      covered = false;
      repaintAll();
      const cur = ctx.getHubScene ? ctx.getHubScene() : ctx.hubScene;
      if (cur !== scene) adopt(cur); else place();
      if (from) root.querySelector?.(`[data-focus-key="${from}"]`)?.focus?.();
      ctx.actions.claimRewards();
    },
    destroy() { // los listeners y la suscripción los libera el scope del host
      gone = true;
      drop();
      if (scope.win?.__gcbHub) delete scope.win.__gcbHub;
    },
  };
}
