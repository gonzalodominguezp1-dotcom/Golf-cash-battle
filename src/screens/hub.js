// NOTA: el logo ya no está en la barra; vuelve como banderín en la escena (tarea aparte). Queda un h1 sr-only con el nombre del juego.
// Hub: pantalla raíz con la composición C10 (usuario · saldo · Ajustes y pantalla completa arriba; Ranking/Logros a la
// izquierda, Skins/Amigos a la derecha; Mapas · JUGAR · Práctica abajo). Fondo: escena 3D precargada (ctx.hubScene) o, sin ella, la imagen fija del CSS.
// El CSS (hub.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { CHALLENGES } from '../progress/skins.js';
import { esc, avatarHtml } from './shared.js';
import { badge, reasonDialog } from './components.js';
import { levelRing, badgeFor, achievementsBadge, computeLocks, nudgeVars } from './hubRules.js';
import { seenSet } from './achievementsRules.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/hub.js';

// clave -> { ruta | acción, icono, texto }; la columna decide dónde se pinta
const NAV = {
  ranking: { go: 'ranking', icon: 'trophy', text: 'ranking' },
  achievements: { go: 'achievements', icon: 'medal', text: 'achievements', opts: { tone: 'gold' } },
  skins: { go: 'skins', icon: 'skins', text: 'skins' },
  friends: { go: 'friends', icon: 'users', text: 'friends' },
  maps: { go: 'maps', icon: 'map', text: 'maps' },
  practice: { act: 'startPractice', icon: 'robot', text: 'practice' }, // práctica = partida contra bots
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
  // La sesión se lee siempre al momento: al volver de Cuenta puede haber cambiado (invitado -> cuenta).
  const isGuest = () => { const a = ctx.backend?.account; return !a || !!a.profile?.is_anonymous; };
  const lockNow = () => computeLocks({ guest: isGuest(), hasBackend: !!ctx.backend?.account, hasName: !!ctx.backend?.account?.profile?.username });
  let locks = lockNow(); // { clave: { reasonKey, shortKey, actionKey?, go? } } de los accesos bloqueados
  const guest = isGuest();
  const userId = ctx.backend?.user?.id ?? 'local';
  const storage = ctx.storage ?? globalThis.localStorage;

  const ring = levelRing(progress.level);
  // Foto de perfil y marco dentro del anillo de XP. Sin foto ni marco se queda el icono de siempre.
  const picHtml = () => {
    const av = ctx.avatar?.get?.() ?? null;
    const frame = progress.prestige?.frame ?? null;
    if (!av && !frame) return icon('user', { size: 40 });
    return avatarHtml({ size: 'sm', frame, av, initial: ctx.backend?.account?.profile?.username ?? '?' });
  };
  const accountLabel = t(guest ? 'hub.accountGuestLabel' : 'hub.accountLabel', { level: ring.label });

  const friendsNow = (c) => badgeFor((c?.friendRequests || 0) + (c?.partyInvites || 0));
  const achievementsNow = () => {
    const states = CHALLENGES.map((c) => ({ id: c.id, done: !!progress.challenge(c.id).done }));
    return achievementsBadge(states, seenSet(storage, userId));
  };
  const badges = { friends: friendsNow(notifier?.counts), achievements: achievementsNow() };

  // Un acceso bloqueado se ve igual que los demás; encima lleva las cadenas en X y el candado, y el nombre accesible dice el requisito.
  const lockName = (key) => t(`hub.lock.name.${key}`);
  const lockedAria = (key) => t('hub.lockedLabel', { name: lockName(key), reason: t(locks[key].shortKey) });
  const lockLayer = (key) => (locks[key]
    ? `<span class="hub-chains" style="${nudgeVars('chains')}">${icon('chains')}</span><span class="hub-padlock" style="${nudgeVars('lock')}">${icon('lock')}</span>`
    : '');
  const nav = (key, cls = 'hub-nav') => {
    const n = NAV[key];
    const lk = locks[key];
    return `<button type="button" class="${cls}" data-hub="${key}" data-focus-key="${key}"${lk ? ` aria-disabled="true" data-locked="1" aria-label="${esc(lockedAria(key))}"` : ''}>`
      + `<span class="hub-ico hub-ico--${key}" style="${nudgeVars(n.icon)}">${icon(n.icon, n.opts)}<span class="hub-lock" data-lock="${key}" aria-hidden="true">${lockLayer(key)}</span><span data-badge="${key}">${badges[key] ? badge(badges[key]) : ''}</span></span>`
      + `<span class="hub-nav-t">${esc(t(`hub.${n.text}`))}</span></button>`;
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
        <button type="button" class="hub-user" data-hub="account" data-focus-key="account" style="--pct:${ring.pct}" aria-label="${esc(accountLabel)}">
          <span class="hub-face" style="${nudgeVars('user')}"><span class="hub-pic" data-hub-pic="1">${picHtml()}</span><b class="hub-lv" data-hub-lv="1" aria-hidden="true">${ring.level}</b></span>
        </button>
        ${ctx.wallet ? `<button type="button" class="hub-wallet" data-hub="wallet" data-focus-key="wallet" aria-label="${esc(t('hub.wallet'))}">
          <span class="hub-wallet-ico" aria-hidden="true" style="${nudgeVars('coins')}">${icon('coins', { size: 26 })}</span>
          <b class="hub-wallet-n" data-hub-balance="1" aria-hidden="true">${esc(t('hub.walletEmpty'))}</b>
        </button>` : ''}
      </div>
      <div class="hub-tools">
        <button type="button" class="hub-nav hub-tool" data-hub="settings" data-focus-key="settings" aria-label="${esc(t('hub.settings'))}"><span class="hub-ico hub-ico--tool" style="${nudgeVars('gear')}">${icon('gear')}</span></button>
        <div class="hub-tools-col">
          <button type="button" class="hub-nav hub-tool" data-hub="fullscreen" aria-label="${esc(t('hub.fullscreenLabel'))}"><span class="hub-ico hub-ico--tool" style="${nudgeVars('fullscreen')}">${icon('fullscreen')}</span></button>
          <button type="button" class="hub-nav hub-tool" data-hub="news" data-focus-key="news" aria-label="${esc(t('hub.newsLabel'))}"><span class="hub-ico hub-ico--tool" style="${nudgeVars('news')}">${icon('news')}</span></button>
        </div>
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
    pic: root.querySelector('[data-hub-pic="1"]'),
    wallet: root.querySelector('[data-hub="wallet"]'),
    balance: root.querySelector('[data-hub-balance="1"]'),
    nav: Object.fromEntries(Object.keys(NAV).filter((k) => root.querySelector(`[data-lock="${k}"]`)).map((k) => [k, { btn: root.querySelector(`[data-hub="${k}"]`), layer: root.querySelector(`[data-lock="${k}"]`) }])),
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
  // Bloqueos: se pintan sobre los nodos guardados al montar (con el hub tapado su DOM está fuera de la raíz).
  // `painted` guarda el motivo ya pintado en cada acceso: si no cambió, no se vuelve a generar el svg (pesa decenas de KB).
  const painted = Object.fromEntries(Object.keys(NAV).map((k) => [k, locks[k]?.reasonKey ?? '']));
  const paintLocks = () => {
    locks = lockNow();
    for (const [key, r] of Object.entries(refs.nav)) {
      const now = locks[key]?.reasonKey ?? '';
      if (now === painted[key]) continue;
      painted[key] = now;
      if (locks[key]) {
        r.btn.setAttribute('aria-disabled', 'true');
        r.btn.setAttribute('data-locked', '1');
        r.btn.setAttribute('aria-label', lockedAria(key));
      } else {
        r.btn.removeAttribute?.('aria-disabled');
        r.btn.removeAttribute?.('data-locked');
        r.btn.removeAttribute?.('aria-label');
      }
      r.layer.innerHTML = lockLayer(key);
    }
  };
  // Al destapar se recalcula todo: pudo cambiar el notifier, los logros vistos o el nivel mientras estaba tapado.
  const repaintAll = () => {
    const r = levelRing(progress.level);
    badges.friends = friendsNow(notifier?.counts);
    badges.achievements = achievementsNow();
    paintBadge('friends');
    paintBadge('achievements');
    paintLocks();
    if (refs.user) {
      refs.user.style?.setProperty?.('--pct', String(r.pct));
      refs.user.setAttribute?.('aria-label', t(isGuest() ? 'hub.accountGuestLabel' : 'hub.accountLabel', { level: r.label }));
    }
    if (refs.lv) refs.lv.textContent = String(r.level);
    if (refs.pic) refs.pic.innerHTML = picHtml();
    fresh = false;
    readBalance();
  };

  const go = (id) => { ctx.sfx?.tap?.(); router.push(id); };
  const ACTIONS = { play: () => go('tables'), account: () => go('account'), wallet: () => { ctx.sfx?.tap?.(); router.push('wallet'); }, settings: () => go('settings'), news: () => go('novedades'), fullscreen: () => ctx.actions.toggleFullscreen() };
  for (const [key, n] of Object.entries(NAV)) ACTIONS[key] = n.go ? () => go(n.go) : () => { ctx.sfx?.tap?.(); ctx.actions[n.act](); };
  // Popup con el requisito de un acceso bloqueado; solo uno a la vez y se cierra con el hub.
  let dlg = null;
  const openReason = (key, from) => {
    const lk = locks[key];
    if (!lk || dlg || gone) return;
    dlg = reasonDialog({
      title: lockName(key), body: t(lk.reasonKey), closeLabel: t('hub.understood'), iconHtml: icon('lock', { size: 30 }),
      actions: lk.actionKey ? [{ label: t(lk.actionKey), onClick: () => go(lk.go) }] : [],
      returnTo: from, scope, onClose: () => { dlg = null; },
    });
  };
  for (const el of root.querySelectorAll('[data-hub]')) {
    const key = el.dataset.hub;
    scope.on(el, 'click', (ev) => {
      if (locks[key]) { ev?.preventDefault?.(); openReason(key, el); return; } // bloqueado: no navega, explica por qué
      ACTIONS[key]?.();
    });
  }

  if (notifier) {
    scope.sub(notifier.subscribe((c) => { badges.friends = friendsNow(c); paintBadge('friends'); }));
  }
  // Escena 3D de fondo. Es del contexto (la libera la partida), no del hub: aquí solo se coloca, se pausa y se suelta.
  // Si no hay (sin WebGL, omitida por el margen, three bloqueado, liberada por una partida) se ve la imagen fija.
  const box = root.querySelector('[data-hub-scene="1"]');
  const doc = scope.doc;
  let scene = null, attached = false, covered = false;
  // dueño de la escena: el host monta el hub nuevo antes de destruir el viejo y ambos comparten la misma escena.
  // Solo el dueño actual la pausa o reanuda; si no, el viejo la pausaría justo después de que el nuevo la reanudara.
  const owner = {};
  const sync = () => {
    if (!scene || scene.hubOwner !== owner) return;
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
    if (scene && scene.hubOwner === owner) {
      try { scene.pause(); } catch { /* ya liberada */ }
      scene.hubOwner = null;
    }
    scene = null; attached = false;
    if (box) box.innerHTML = '';
  };
  const adopt = (sc) => {
    if (sc === scene) return;
    if (scene) drop();
    scene = sc || null;
    if (scene) scene.hubOwner = owner;
    place();
  };
  const reviveScene = () => { try { ctx.actions.reviveHubScene?.(); } catch (err) { console.warn('hubScene.revive', err?.message ?? err); } };
  adopt(ctx.getHubScene ? ctx.getHubScene() : ctx.hubScene);
  if (ctx.watchHubScene) scope.sub(ctx.watchHubScene(adopt));
  scope.on(doc, 'visibilitychange', () => { sync(); if (!doc?.hidden && !scene && !covered) reviveScene(); });
  scope.on(scope.win, 'resize', () => { if (!covered) scene?.resize?.(); });
  if (import.meta.env?.DEV && scope.win) scope.win.__gcbHub = { get stats() { return scene?.stats; } };

  ctx.actions.claimRewards();
  // llegada al hub sin escena (tras una partida): se recrea en segundo plano; el hub ya está pintado con la imagen fija
  if (!scene) reviveScene();

  return {
    title: t('hub.title'),
    onCover() { covered = true; dlg?.close({ restoreFocus: false }); sync(); },
    onUncover(from) {
      covered = false;
      repaintAll();
      const cur = ctx.getHubScene ? ctx.getHubScene() : ctx.hubScene;
      if (cur !== scene) adopt(cur); else place();
      if (!cur) reviveScene();
      if (from) root.querySelector?.(`[data-focus-key="${from}"]`)?.focus?.();
      ctx.actions.claimRewards();
    },
    destroy() { // los listeners y la suscripción los libera el scope del host
      gone = true;
      dlg?.close({ restoreFocus: false });
      drop();
      if (scope.win?.__gcbHub) delete scope.win.__gcbHub;
    },
  };
}
