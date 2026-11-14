// Hub: pantalla raíz con la composición C10 (usuario · logo · Ajustes y pantalla completa arriba; Ranking/Logros a la
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
      + `<span class="hub-ico">${icon(n.icon, n.opts)}<span data-badge="${key}">${badges[key] ? badge(badges[key]) : ''}</span></span>`
      + `<span class="hub-nav-t">${esc(t(`hub.${n.text}`))}</span>`
      + `${needs ? `<span class="sr-only">${esc(t('hub.needsAccount'))}</span>` : ''}</button>`;
  };

  root.innerHTML = `<main class="hub" aria-label="${esc(t('hub.title'))}">
    <div class="hub-scene" data-hub-scene="1" aria-hidden="true"></div>
    <header class="hub-top">
      <button type="button" class="hub-user${guest ? ' hub-needs-account' : ''}" data-hub="account" data-focus-key="account" style="--pct:${ring.pct}" aria-label="${esc(accountLabel)}">
        <span class="hub-face">${icon('user', { size: 40 })}<b class="hub-lv" data-hub-lv="1" aria-hidden="true">${ring.level}</b></span>
        <span class="hub-nav-t" aria-hidden="true">${esc(t('hub.account'))}</span>
      </button>
      <h1 class="hub-logo"><img src="/logo-header.png" alt="${esc(t('hub.logoAlt'))}"></h1>
      <div class="hub-tools">
        <button type="button" class="hub-nav hub-tool" data-hub="settings" data-focus-key="settings" aria-label="${esc(t('hub.settings'))}"><span class="hub-ico">${icon('gear')}</span><span class="hub-nav-t" aria-hidden="true">${esc(t('hub.settings'))}</span></button>
        <button type="button" class="hub-nav hub-tool" data-hub="fullscreen" aria-label="${esc(t('hub.fullscreenLabel'))}"><span class="hub-ico">${icon('fullscreen')}</span><span class="hub-nav-t" aria-hidden="true">${esc(t('hub.fullscreen'))}</span></button>
      </div>
    </header>
    <nav class="hub-mid" aria-label="${esc(t('hub.title'))}">
      <div class="hub-col">${nav('ranking')}${nav('achievements')}</div>
      <div class="hub-col">${nav('skins')}${nav('friends')}</div>
    </nav>
    <footer class="hub-bottom">
      ${nav('maps', 'hub-nav hub-a')}
      <button type="button" class="hub-play" data-hub="play" data-focus-key="play">${esc(t('hub.play'))}</button>
      ${nav('practice', 'hub-nav hub-c')}
    </footer>
  </main>`;

  // Referencias guardadas al montar: con el hub tapado su DOM está fuera de la raíz y root.querySelector ya no lo ve.
  const refs = {
    friends: root.querySelector('[data-badge="friends"]'),
    achievements: root.querySelector('[data-badge="achievements"]'),
    user: root.querySelector('[data-hub="account"]'),
    lv: root.querySelector('[data-hub-lv="1"]'),
  };
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
  };

  const go = (id) => { ctx.sfx?.tap?.(); router.push(id); };
  const ACTIONS = { play: () => go('tables'), account: () => go('account'), settings: () => go('settings'), fullscreen: () => ctx.actions.toggleFullscreen() };
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
      drop();
      if (scope.win?.__gcbHub) delete scope.win.__gcbHub;
    },
  };
}
