// Hub: pantalla raíz con la composición C10 (usuario · logo · Ajustes y pantalla completa arriba; Ranking/Logros a la
// izquierda, Skins/Amigos a la derecha; Mapas · JUGAR · Práctica abajo). Fondo: imagen fija (la escena 3D es T026).
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
  const icon = (n, o = {}) => ctx.icon(n, { size: 28, ...o });
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
      + `${icon(n.icon, n.opts)}<span class="hub-nav-t">${esc(t(`hub.${n.text}`))}</span>`
      + `${needs ? `<span class="sr-only">${esc(t('hub.needsAccount'))}</span>` : ''}`
      + `<span data-badge="${key}">${badges[key] ? badge(badges[key]) : ''}</span></button>`;
  };

  root.innerHTML = `<main class="hub" aria-label="${esc(t('hub.title'))}">
    <header class="hub-top">
      <button type="button" class="hub-user${guest ? ' hub-needs-account' : ''}" data-hub="account" data-focus-key="account" style="--pct:${ring.pct}" aria-label="${esc(accountLabel)}">
        <span class="hub-face">${icon('user', { size: 24 })}<b class="hub-lv" aria-hidden="true">${ring.level}</b></span>
        <span class="hub-nav-t" aria-hidden="true">${esc(t('hub.account'))}</span>
      </button>
      <h1 class="hub-logo"><img src="/logo-header.png" alt="${esc(t('hub.logoAlt'))}"></h1>
      <div class="hub-tools">
        <button type="button" class="hub-nav hub-tool" data-hub="settings" data-focus-key="settings" aria-label="${esc(t('hub.settings'))}">${icon('gear')}<span class="hub-nav-t" aria-hidden="true">${esc(t('hub.settings'))}</span></button>
        <button type="button" class="hub-nav hub-tool" data-hub="fullscreen" aria-label="${esc(t('hub.fullscreenLabel'))}">${icon('fullscreen')}<span class="hub-nav-t" aria-hidden="true">${esc(t('hub.fullscreen'))}</span></button>
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

  const paintBadge = (key) => {
    const el = root.querySelector(`[data-badge="${key}"]`);
    if (el) el.innerHTML = badges[key] ? badge(badges[key]) : '';
  };

  const go = (id) => { ctx.sfx?.tap?.(); router.push(id); };
  const ACTIONS = { play: () => go('tables'), account: () => go('account'), settings: () => go('settings'), fullscreen: () => ctx.actions.toggleFullscreen() };
  for (const [key, n] of Object.entries(NAV)) ACTIONS[key] = n.go ? () => go(n.go) : () => { ctx.sfx?.tap?.(); ctx.actions[n.act](); };
  for (const el of root.querySelectorAll('[data-hub]')) scope.on(el, 'click', ACTIONS[el.dataset.hub]);

  if (notifier) {
    scope.sub(notifier.subscribe((c) => { badges.friends = friendsNow(c); paintBadge('friends'); }));
  }
  // TODO(T026): sin keepAlive, claimRewards() se repite en cada visita al hub (lo protege `rewardsOpen` en main.js).
  ctx.actions.claimRewards();

  return {
    title: t('hub.title'),
    destroy() {}, // los listeners y la suscripción los libera el scope del host
  };
}
