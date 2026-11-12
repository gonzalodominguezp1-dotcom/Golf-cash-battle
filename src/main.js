import './style.css';
import { HOLES_PER_MATCH, HOLE_TIME_LIMIT, PLATFORM_COMMISSION, PLAYERS_PER_MATCH, TIERS, maxStrokesOf, potFor, prizeFor } from './config.js';
import { LocalWallet } from './wallet/LocalWallet.js';
import { InsufficientFundsError } from './wallet/WalletService.js';
import { MatchService, leaders } from './match/MatchService.js';
import { createBackend } from './backend/index.js';
import { COURSES, TIEBREAK_COURSE } from './game/courses.js';
import { Bot } from './game/bots.js';
import { segmentsOf } from './game/physics.js';
import { enterFinale, isMuted, leaveFinale, setAmbientVolume, setMuted, setVolume, sfx, unlockAudio } from './game/audio.js';
import { settings } from './settings/settings.js';
import { lastSection, mountSettingsPanel } from './ui/settingsPanel.js';
import { Progress } from './progress/Progress.js';
import { AVATAR_ICONS, AvatarStore, checkAvatarFile, fromWire, iconById, imageToAvatar, toWire } from './progress/avatar.js';
import { FRAMES, frameById, framesUnlocked, frameStyle } from './progress/prestige.js';
import { CHALLENGES, TIERS as SKIN_TIERS, SKINS } from './progress/skins.js';
import { ballPreview } from './game/render/ballPaint.js';
import { showSkinReveal } from './ui/skinReveal.js';
import { installThumbObserver, thumbCached, upgradeImg, warmThumbs } from './ui/skinThumbs.js';
import { rarePatternOf } from './progress/inventory.js';
import { getCourseDistance, staticCoursePreview } from './game/render/coursePreviewStatic.js';
import { mountAuth } from './ui/authScreen.js';
import { validatePassword, authMessage } from './account/authRules.js';
import { addedMessage, cleanFriendName, friendMessage } from './account/friendRules.js';
import { newPartyMatch, partyErrorText, partyMessage, readyLabel } from './match/partyRules.js';
import { LiveRoom } from './match/LiveRoom.js';
import { buildRoster, humanLeaders, liveStandings, seededRng } from './match/liveRules.js';
import { avatarIcon, icon, iconUrl, tierIcon } from './ui/icons.js';
import { errorRef } from './backend/rpcError.js';

let backend, wallet, matches;
// práctica forzada con #hoyoN: siempre local, no toca el servidor
const practice = new MatchService(new LocalWallet(), Math.random, COURSES.length);
const progress = new Progress();
// miniaturas de skins guardadas (IndexedDB) a memoria cuanto antes: las <img> salen ya con su imagen
warmThumbs();
// three.js (partida, inspector 3D) se carga solo cuando hace falta: lobby y pantalla de skins no lo pagan
const loadGolfGame = () => import('./game/GolfGame.js').then((m) => m.GolfGame);
const loadSkinInspector = () => import('./ui/skinInspector.js');

// "móvil" en pantallas táctiles, "equipo" en PC
const DEVICE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'móvil' : 'equipo';

// sonido según los ajustes guardados (settings.js), ahora y cada vez que cambien
function applySound(s) {
  setMuted(s.sound.muted);
  setVolume(s.sound.master / 100);
  setAmbientVolume(s.sound.ambient / 100);
  document.querySelectorAll('.pill.mute').forEach((b) => (b.innerHTML = soundLabel()));
}
const toggleMute = () => settings.patch({ sound: { muted: !settings.peek().sound.muted } });

// el audio solo puede arrancar con un gesto: cualquier toque o tecla vale
for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

// sonido suave en todos los botones
document.addEventListener('click', (e) => {
  if (!e.target.closest('button')) return;
  unlockAudio();
  sfx.tap();
});
const app = document.getElementById('app');
// iconos que se pintan desde CSS (authScreen.css)
document.documentElement.style.setProperty('--gi-check', `url("${iconUrl('check')}")`);
document.documentElement.style.setProperty('--gi-dot', `url("${iconUrl('dot', { tone: 'gray' })}")`);

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const coin = (n) => `${icon('coin', { cls: 'coin' })}${fmt(n)}`;
const soundLabel = () => `${icon(isMuted() ? 'mute' : 'sound')}${isMuted() ? 'Mudo' : 'Sonido'}`;
applySound(settings.get());
settings.subscribe(applySound);
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
// miniatura estática si ya está en caché; si no, marcador 2D que installThumbObserver cambia por ella (data-skin-id)
const ball = (skin, size = 96, cls = '') => {
  const cached = thumbCached(skin, progress.instance(skin.id));
  return `<img class="ball-img ${cls}" src="${cached ?? ballPreview(skin, size * 2)}" data-skin-id="${skin.id}"${cached ? ' data-hd="1"' : ''} width="${size}" height="${size}" alt="">`;
};

let avatar = new AvatarStore(null);
let accountTab = 'profile';

/** Cara del avatar: imagen propia, icono elegido o la inicial del nombre. */
const avatarFace = (av, initial) =>
  av?.image ? `<img src="${av.image}" alt="">`
    : av?.icon ? `<span class="pf-glyph">${avatarIcon(iconById(av.icon).id)}</span>`
      : `<b class="pf-initial">${esc(String(initial || '?')[0])}</b>`;

/** Avatar con marco de prestigio. size: xs | sm | lg. */
const avatarHtml = ({ size = 'sm', frame = null, av = null, initial = '?' }) =>
  `<span class="pf pf-${size} ${frame ? `pf-framed pf-${frame.id}` : ''}" style="${frameStyle(frame)}"><i class="pf-halo"></i><i class="pf-wing l"></i><i class="pf-wing r"></i><i class="pf-ring"></i><span class="pf-face">${avatarFace(av, initial)}</span><i class="pf-gem"></i></span>`;

let game = null;
let screen = 'lobby';
let activeSkinInspector = null;

async function shell(content, { hideHeader = false, nav = true } = {}) {
  game?.dispose();
  game = null;
  if (activeSkinInspector) {
    try { activeSkinInspector.destroy(); } catch { }
    activeSkinInspector = null;
  }
  const balance = await wallet.getBalance();
  app.innerHTML = '';
  window.scrollTo(0, 0);
  if (!hideHeader) {
    const { level, into, need } = progress.level;
    app.append(
      h(`
      <header class="topbar game-hud-topbar">
        <div class="topbar-left">
          <button class="brand-btn desktop-brand-btn" data-go="lobby" aria-label="Golf Cash Battle">
            <img src="/logo-header.png" alt="Golf Cash Battle" class="brand-logo" />
          </button>
          <div class="m-stats">
            <button class="m-stat m-level" data-go="skins" style="--p:${(into / need) * 100}%" title="Nivel ${level}" aria-label="Nivel ${level}">
              <span class="level-ring"><b>${level}</b></span>
            </button>
            <button class="m-stat m-coins" data-go="wallet" title="Tu saldo" aria-label="Saldo">${coin(balance)}</button>
          </div>
          <button class="level" data-go="skins" style="--p:${(into / need) * 100}%" title="Nivel ${level} · ${(into / need * 100).toFixed(0)}%">
            <span class="level-ring"><b>${level}</b></span>
            <span class="level-text"><small>Nivel</small><span class="xpbar"><i></i></span></span>
          </button>
        </div>
        <div class="topbar-center">
          <button class="brand-btn mobile-brand-btn" data-go="lobby" aria-label="Golf Cash Battle">
            <img src="/logo-header.png" alt="Golf Cash Battle" class="brand-logo" />
          </button>
          <nav class="desktop-nav">
            <button data-go="lobby" class="${screen === 'lobby' ? 'on' : ''}">${icon('flag')}Jugar <kbd>1</kbd></button>
            <button data-go="freeplay" class="${screen === 'freeplay' ? 'on' : ''}">${icon('tee')}Juego Libre <kbd>2</kbd></button>
            <button data-go="skins" class="${screen === 'skins' ? 'on' : ''}">${icon('skins')}Skins <kbd>3</kbd></button>
            <button data-go="ranking" class="${screen === 'ranking' ? 'on' : ''}">${icon('trophy')}Ranking <kbd>4</kbd></button>
            <button data-go="account" class="${screen === 'account' ? 'on' : ''}">${icon('user')}Cuenta <kbd>5</kbd></button>
            <button data-go="settings" class="${screen === 'settings' ? 'on' : ''}">${icon('gear')}Ajustes <kbd>6</kbd></button>
          </nav>
        </div>
        <div class="topbar-right">
          <button class="balance" data-go="wallet" title="Tu saldo: abre el wallet de tu cuenta">${coin(balance)}<span class="plus">${icon('plus')}</span></button>
          <button class="pill mute topbar-sound-btn" aria-label="Sonido" title="Silenciar / Activar sonido (M)">${soundLabel()}</button>
          <button class="icon-btn m-settings ${screen === 'settings' ? 'on' : ''}" data-go="settings" aria-label="Ajustes" title="Ajustes">${icon('gear')}</button>
          ${document.fullscreenEnabled ? `<button class="icon-btn m-fullscreen" aria-label="Pantalla completa" title="Pantalla completa">${icon('fullscreen')}</button>` : ''}
        </div>
      </header>`),
    );
    app.querySelector('.topbar-sound-btn')?.addEventListener('click', toggleMute);
    app.querySelector('.m-fullscreen')?.addEventListener('click', toggleFullscreen);
  }
  app.append(content);
  if (!hideHeader && nav) {
    app.append(
      h(`
      <nav class="tabbar">
        <button data-go="lobby" class="${screen === 'lobby' ? 'on' : ''}">${icon('flag')}Jugar</button>
        <button data-go="freeplay" class="${screen === 'freeplay' ? 'on' : ''}">${icon('tee')}Libre</button>
        <button data-go="skins" class="${screen === 'skins' ? 'on' : ''}">${icon('skins')}Skins</button>
        <button data-go="ranking" class="${screen === 'ranking' ? 'on' : ''}">${icon('trophy')}Ranking</button>
        <button data-go="account" class="${screen === 'account' ? 'on' : ''}">${icon('user')}Cuenta</button>
      </nav>`),
    );
  }
  app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  bindHolo(app);
}

// Atajos globales de navegación por teclado en menús y modales
window.addEventListener('keydown', (e) => {
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    // dentro del panel de ajustes, Enter y las flechas son del control que tiene el foco
    if (e.target.closest?.('.sp')) return;
    if (e.code === 'Enter') {
      const btn = overlay.querySelector('.primary, .next, .confirm, button:not(.close):not(.cancel)');
      if (btn) { e.preventDefault(); btn.click(); return; }
    } else if (e.code === 'Escape') {
      const closeBtn = overlay.querySelector('.close, .cancel, .home, button');
      if (closeBtn) { e.preventDefault(); closeBtn.click(); return; }
    }
    return;
  }
  if (game || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const isNum = (n) => e.key === String(n) || e.code === `Digit${n}` || e.code === `Numpad${n}`;

  const triggerNav = (dest) => {
    e.preventDefault();
    unlockAudio();
    sfx.tap();
    const navBtn = document.querySelector(`.desktop-nav button[data-go="${dest}"]`);
    if (navBtn) {
      navBtn.classList.add('nav-key-active');
      setTimeout(() => navBtn.classList.remove('nav-key-active'), 220);
    }
    const tabBtn = document.querySelector(`.tabbar button[data-go="${dest}"]`);
    if (tabBtn) {
      tabBtn.classList.add('tab-key-active');
      setTimeout(() => tabBtn.classList.remove('tab-key-active'), 220);
    }
    go(dest);
  };

  if (isNum(1)) triggerNav('lobby');
  else if (isNum(2)) triggerNav('freeplay');
  else if (isNum(3)) triggerNav('skins');
  else if (isNum(4)) triggerNav('ranking');
  else if (isNum(5)) triggerNav('account');
  else if (isNum(6)) triggerNav('settings');
  else if (e.code === 'KeyM') toggleMute();
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  else document.documentElement.requestFullscreen().catch(() => { });
}

function go(to) {
  if (to === 'wallet') return showAccount('', 'wallet');
  if (to === 'skins') return showSkins();
  if (to === 'account') return showAccount();
  if (to === 'ranking') return showRanking();
  if (to === 'freeplay') return showFreePlayCourseSelect();
  if (to === 'settings') return showSettings();
  return showLobby();
}

// ---------- ajustes ----------

/** true si los ajustes viajan con la cuenta (no en modo local ni en cuenta de invitado). */
const settingsSynced = () => !!backend?.account && !backend.account.profile?.is_anonymous;

async function showSettings(section = lastSection()) {
  leaveFinale();
  stopLive();
  screen = 'settings';
  const view = h('<main class="screen settings-screen"><div class="settings-host"></div></main>');
  await shell(view, { nav: false });
  mountSettingsPanel(view.querySelector('.settings-host'), { layout: 'screen', section, synced: settingsSynced(), onBack: () => go('lobby') });
}

// cartas holográficas: se inclinan y el brillo sigue al dedo
function bindHolo(root) {
  // en móvil/táctil no hay inclinación ni brillo que siga al dedo: cada pointermove forzaba layout + estilos
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 899px), (pointer: coarse)').matches) return;
  root.querySelectorAll('.holo').forEach((card) => {
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 18}deg`);
      card.classList.add('active');
    };
    const leave = () => {
      card.classList.remove('active');
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('pointercancel', leave);
  });
}

// ---------- lobby ----------

async function showLobby() {
  leaveFinale();
  stopLive();
  screen = 'lobby';
  const balance = await wallet.getBalance();
  const skin = progress.skin;
  const view = h(`
    <main class="screen lobby">
      <section class="hero rarity-${skin.rarity}">
        <div class="hero-ball">
          <div class="hero-ball-aura"></div>
          ${ball(skin, 110, 'spin')}
          <div class="hero-shadow"></div>
        </div>
        <div class="hero-text">
          <div class="hero-badge-row">
            <span class="rarity-pill rarity-${skin.rarity}">${SKIN_TIERS[skin.rarity].name}</span>
            <span class="hero-level-tag">Nivel ${progress.level.level}</span>
          </div>
          <strong>${skin.name}</strong>
          <button class="chip-btn" data-go="skins">Personalizar skin</button>
        </div>
      </section>
      ${backend.mode === 'local' ? `<p class="offline">Modo sin conexión: el saldo se guarda solo en este ${DEVICE}</p>` : ''}
      ${backend.account?.profile?.paid_block ? `<button class="notice account-hint" data-go="account">${{ account_required: 'Crea tu cuenta con email para jugar mesas con entrada', kyc_required: 'Verifica tu edad e identidad para jugar mesas con entrada', account_review: 'Tu cuenta está en revisión: de momento solo Práctica', underage: 'Mesas con entrada solo para mayores de 18' }[backend.account.profile.paid_block]} ${icon('next')}</button>` : ''}
      ${backend.parties ? '<section class="party-box"></section>' : ''}
      <div class="section-head">
        <div class="section-title-row">
          <h1>Mesas de Torneo</h1>
          <span class="live-pill"><i class="pulse-dot"></i> EN VIVO</span>
        </div>
        <div class="lobby-specs">
          <span class="spec-chip">${PLAYERS_PER_MATCH} Jugadores</span>
          <span class="spec-chip">${HOLES_PER_MATCH} Hoyos</span>
          <span class="spec-chip">Determinista</span>
        </div>
      </div>
      <div class="tiers"></div>
      <p class="legal">Créditos de demostración sin valor real. ${backend.tournaments ? 'Las mesas de pago son partidas en vivo contra jugadores reales: todos jugáis los mismos hoyos a la vez y el servidor repite cada golpe para validarlo. Los huecos libres los ocupan bots, que nunca cuentan para el premio. La práctica es contra rivales simulados. ' : ''}El resultado depende solo de la habilidad: mismo campo para todos y sin elementos aleatorios. En empate, tiro de desempate: gana quien deje la bola más cerca. Comisión de la plataforma: ${Math.round(PLATFORM_COMMISSION * 100)}% del bote.</p>
    </main>`);
  const list = view.querySelector('.tiers');
  for (const tier of TIERS) {
    const free = tier.entryFee === 0;
    const enough = balance >= tier.entryFee;
    const card = h(`
      <div class="tier holo tier--${tier.id}">
        <div class="shine"></div>
        <div class="tier-ambient"></div>
        <div class="tier-top">
          <div class="gem-wrapper"><span class="gem gem--${tier.id}"></span></div>
          <div class="tier-identity">
            <span class="tier-name">${tier.name}</span>
            <span class="tier-tagline">${free ? 'Entrenamiento' : 'Torneo Esports'}</span>
          </div>
          <span class="tier-fee">${free ? 'Gratis' : `Entrada ${coin(tier.entryFee)}`}</span>
        </div>
        <div class="tier-mid">
          ${free ? '<span class="tier-prize small">Entrena sin arriesgar créditos</span>' : `<span class="tier-label">Premio Garantizado</span><span class="tier-prize">${coin(prizeFor(tier))}</span><span class="tier-pot">Bote ${fmt(potFor(tier))}</span>`}
        </div>
        <button class="play" ${enough ? '' : 'disabled'}>${!enough ? 'Saldo insuficiente' : free ? 'Practicar' : 'Jugar Torneo'}</button>
      </div>`);
    const play = card.querySelector('.play');
    play.dataset.tier = tier.id;
    play.dataset.label = play.textContent;
    play.addEventListener('click', () => (!free && party.state?.party ? party.pickTier(tier) : startMatch(tier)));
    list.append(card);
  }
  await shell(view);
  if (backend.parties) partyPanel(view.querySelector('.party-box'), list, balance);
  claimRewards();
}

// ---------- grupos ----------
// Hasta 4 amigos: el líder elige la mesa, cada uno pulsa «Listo» y el servidor
// los mete juntos en el mismo torneo. Se consulta cada pocos segundos mientras
// se ve el lobby; cuando aparece un torneo nuevo del grupo, se abre su sala.

const PARTY_POLL_MS = 3000;
const PARTY_SEEN = 'gcb.party.seen';
const party = { state: null, pickTier: () => { } };

async function partyPanel(box, tierList, balance) {
  const svc = backend.parties;
  const hasName = Boolean(backend.account?.profile?.username);
  let friends = null;
  let msg = '';
  let busy = false;

  const seen = () => {
    try { return localStorage.getItem(PARTY_SEEN); } catch { return null; }
  };
  const markSeen = (id) => {
    try { localStorage.setItem(PARTY_SEEN, id); } catch { }
  };

  // si el grupo acaba de entrar en un torneo, a su sala (o a seguir jugando)
  async function openIfNew(state) {
    const id = newPartyMatch(state?.party, seen());
    if (!id) return false;
    markSeen(id);
    let match;
    try {
      match = await backend.tournaments.get(id, TIERS);
    } catch {
      return false;
    }
    if (match.status !== 'open' || !match.me || match.me.finished) return false;
    await wallet.getBalance();
    sfx.tick();
    enterLive(match);
    return true;
  }

  async function apply(job, okMsg = '') {
    if (busy) return;
    busy = true;
    try {
      const state = await job();
      msg = okMsg;
      if (await openIfNew(state)) return;
      paint(state);
    } catch (e) {
      msg = partyMessage(e.code);
      paint(party.state);
    } finally {
      busy = false;
    }
  }

  party.pickTier = (tier) =>
    apply(async () => {
      if (!party.state.party.leader) {
        // un miembro solo puede confirmar la mesa que ya eligió el líder
        if (party.state.party.tier_id !== tier.id) throw Object.assign(new Error(), { code: 'not_leader' });
        return svc.ready(true);
      }
      await svc.setTier(tier.id);
      return svc.ready(true);
    });

  // los botones de las mesas dicen qué pasa al pulsarlos estando en grupo
  function paintTiers(p) {
    for (const b of tierList.querySelectorAll('.play')) {
      const tier = TIERS.find((t) => t.id === b.dataset.tier);
      if (!tier || tier.entryFee === 0 || balance < tier.entryFee) continue;
      b.classList.toggle('party-pick', Boolean(p) && p.tier_id === tier.id);
      if (!p) {
        b.textContent = b.dataset.label;
        b.disabled = false;
      } else if (p.leader) {
        b.textContent = p.tier_id === tier.id ? 'Mesa del grupo' : 'Jugar con el grupo';
        b.disabled = false;
      } else {
        b.textContent = p.tier_id === tier.id ? 'Mesa del grupo · Listo' : 'La elige el líder';
        b.disabled = p.tier_id !== tier.id;
      }
    }
  }

  function paint(state) {
    if (!box.isConnected) return;
    party.state = state;
    const p = state?.party ?? null;
    const invites = state?.invites ?? [];
    paintTiers(p);
    const inviteRows = invites.map((i) => `<li class="friend">
        <span class="friend-name"><b>${esc(i.from)}</b><small>te invita a su grupo</small></span>
        <span class="friend-actions"><button class="chip-btn" data-join="${esc(i.party)}">${icon('check')}Unirme</button><button class="chip-btn" data-no="${esc(i.party)}">${icon('close')}No</button></span>
      </li>`).join('');
    const inParty = new Set([...(p?.members ?? []).map((m) => m.name.toLowerCase()), ...(p?.invited ?? []).map((n) => n.toLowerCase())]);
    const room = p ? p.size - p.members.length - p.invited.length : 3;
    const candidates = (friends ?? []).filter((f) => !inParty.has(f.name.toLowerCase())).slice(0, 6);
    const friendRows = room > 0 && candidates.length
      ? `<ul class="friend-list">${candidates.map((f) => `<li class="friend">
          ${avatarHtml({ size: 'sm', frame: frameById(f.frame), av: fromWire(f.avatar), initial: f.name })}
          <span class="friend-name"><b>${esc(f.name)}</b><small>Nv. ${esc(f.level)}</small></span>
          <button class="chip-btn" data-invite="${esc(f.name)}">${icon('user-plus')}Invitar</button>
        </li>`).join('')}</ul>`
      : '';
    const tier = p?.tier_id ? TIERS.find((t) => t.id === p.tier_id) : null;
    let body;
    if (!hasName) {
      body = `<p class="sub">Ponte un nombre de usuario y añade amigos para buscar partida juntos.</p><button class="chip-btn" data-go="account">${icon('user')}Ir a la cuenta</button>`;
    } else if (!p) {
      body = `
        ${inviteRows ? `<ul class="friend-list">${inviteRows}</ul>` : ''}
        <p class="sub">Invita a tus amigos y entraréis juntos en el mismo torneo.</p>
        ${friends === null ? '<p class="sub">Cargando amigos…</p>' : friendRows || `<p class="sub">Aún no tienes amigos. Añádelos en tu cuenta.</p><button class="chip-btn" data-go="account">${icon('user-plus')}Añadir amigos</button>`}`;
    } else {
      const members = p.members.map((m) => `<li class="party-member ${m.ready ? 'ready' : ''}">
          <span class="avatar">${esc(m.name[0] ?? '?')}</span>
          <span><b>${m.me ? 'Tú' : esc(m.name)}</b><small>${m.leader ? 'Líder · ' : ''}${m.ready ? 'Listo' : 'Esperando'}</small></span>
        </li>`).join('');
      const invited = p.invited.map((n) => `<li class="party-member invited"><span class="avatar">${esc(n[0] ?? '?')}</span><span><b>${esc(n)}</b><small>Invitado</small></span></li>`).join('');
      const me = p.members.find((m) => m.me);
      const alone = p.members.length < 2;
      body = `
        <ul class="party-members">${members}${invited}</ul>
        <p class="sub">${tier ? `Mesa: <b>${tier.name}</b> · entrada ${coin(tier.entryFee)} cada uno` : p.leader ? 'Elige abajo la mesa del torneo.' : 'El líder está eligiendo la mesa.'}</p>
        ${p.last_error ? `<p class="party-err">${esc(partyErrorText(p.last_error))}</p>` : ''}
        ${tier ? `<button class="primary party-ready" ${alone && !me?.ready ? 'disabled' : ''}>${alone ? 'Espera a que entre un amigo' : icon('check') + readyLabel(p)}</button>` : ''}
        <p class="legal">Al pulsar «${p.leader ? 'Buscar partida' : 'Estoy listo'}» aceptas pagar tu entrada. Cuando estéis todos listos entráis juntos en el mismo torneo; cada uno juega su ronda y gana quien menos golpes haga.</p>
        ${inviteRows ? `<ul class="friend-list">${inviteRows}</ul>` : ''}
        ${friendRows ? `<h3 class="friends-sub">Invitar a más amigos</h3>${friendRows}` : ''}`;
    }
    box.innerHTML = `
      <div class="party-card">
        <div class="section-head party-head">
          <h2>${p ? `Tu grupo · ${p.members.length}/${p.size}` : 'Juega con amigos'}</h2>
          ${p ? `<button class="chip-btn party-leave">${icon('logout')}Salir del grupo</button>` : ''}
        </div>
        ${msg ? `<p class="party-msg" role="status">${esc(msg)}</p>` : ''}
        ${body}
      </div>`;
    box.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    box.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', () => apply(() => svc.invite(b.dataset.invite), `Invitación enviada a ${b.dataset.invite}.`)));
    box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => apply(() => svc.respond(b.dataset.join, true))));
    box.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => apply(() => svc.respond(b.dataset.no, false))));
    box.querySelector('.party-leave')?.addEventListener('click', () => apply(() => svc.leave()));
    box.querySelector('.party-ready')?.addEventListener('click', () => apply(() => svc.ready(!p.members.find((m) => m.me)?.ready)));
  }

  if (hasName) {
    backend.account.friends().then((d) => {
      friends = d.friends;
      paint(party.state);
    }).catch(() => { friends = []; });
  }

  const poll = async () => {
    if (!box.isConnected) return;
    if (!busy) {
      try {
        const state = await svc.mine();
        if (!box.isConnected) return;
        if (await openIfNew(state)) return;
        // no repintar si no ha cambiado nada (no se pierde lo que estés tocando)
        if (JSON.stringify(state) !== JSON.stringify(party.state)) {
          msg = '';
          paint(state);
        }
      } catch { }
    }
    setTimeout(poll, PARTY_POLL_MS);
  };
  party.state = null;
  if (hasName) {
    paint(null);
    poll();
  } else paint(null);
}

// ---------- skins ----------

const tierOrder = (s) => SKIN_TIERS[s.tier]?.order ?? 0;
const FILTER_TIERS = Object.keys(SKIN_TIERS).reverse();

async function showSkins() {
  screen = 'skins';
  const unlocked = SKINS.filter((s) => progress.isUnlocked(s)).length;
  const { level, into, need } = progress.level;
  const collections = [...new Set(SKINS.map((s) => s.collection))];
  const filter = { tier: 'all', owned: false, collection: 'all' };

  const view = h(`
    <main class="screen skins">
      <div class="section-head">
        <h1>Skins</h1>
        <p class="sub">${unlocked}/${SKINS.length} desbloqueadas · solo cambian el aspecto, nunca el juego</p>
      </div>
      <div class="level-card">
        <div><small>Nivel</small><strong>${level}</strong></div>
        <div class="level-progress"><span><i style="width:${(into / need) * 100}%"></i></span><small>${into} / ${need} XP</small></div>
      </div>
      <div class="sk-filters" role="toolbar" aria-label="Filtros de skins">
        <div class="sk-filter-row">
          <button type="button" class="sk-fchip on" data-tier="all">Todas</button>
          ${FILTER_TIERS.map((id) => `<button type="button" class="sk-fchip rarity-${id}" data-tier="${id}"><i>${tierIcon(id)}</i>${SKIN_TIERS[id].name}</button>`).join('')}
        </div>
        <div class="sk-filter-row">
          <button type="button" class="sk-fchip sk-fowned" aria-pressed="false">Solo desbloqueadas</button>
          ${collections.length > 1 ? `<select class="sk-fcoll" aria-label="Colección"><option value="all">Todas las colecciones</option>${collections.map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="sk-grid"></div>
      <p class="sk-empty" hidden>Ninguna skin cumple estos filtros.</p>
      <h2>Desafíos</h2>
      <ul class="challenges">
        ${CHALLENGES.map((c) => {
    const st = progress.challenge(c.id);
    const reward = SKINS.find((s) => s.unlock?.challenge === c.id);
    return `<li class="${st.done ? 'done' : ''}">
            ${ball(reward, 34)}
            <div><b>${c.name}</b><span class="bar"><i style="width:${(st.value / st.goal) * 100}%"></i></span></div>
            <small>${st.done ? 'Completado' : `${st.value}/${st.goal}`}</small>
          </li>`;
  }).join('')}
      </ul>
    </main>`);

  const grid = view.querySelector('.sk-grid');
  const empty = view.querySelector('.sk-empty');
  const cards = new Map();

  const isOpen = (s) => progress.isUnlocked(s);
  const sorted = [...SKINS].sort((a, b) => tierOrder(b) - tierOrder(a) || isOpen(b) - isOpen(a) || a.name.localeCompare(b.name, 'es'));
  const jobs = [];

  for (const skin of sorted) {
    const tier = SKIN_TIERS[skin.tier];
    const open = isOpen(skin);
    const inst = progress.instance(skin.id);
    const req = progress.requirement(skin);
    const rare = open && inst ? rarePatternOf(skin, inst.seed) : null;
    const card = h(`
      <button type="button" class="sk-card rarity-${skin.tier} ${open ? '' : 'locked'}" data-skin-id="${skin.id}" style="--sk-a:${skin.palette.base};--sk-b:${skin.palette.accent}">
        <div class="shine"></div>
        <div class="sk-scene">
          <span class="sk-ico" title="${tier.name}">${tierIcon(skin.tier)}</span>
          <span class="sk-eq">Equipada</span>
          <img class="sk-thumb" src="${(open && thumbCached(skin, inst)) || ballPreview(skin, 152)}" width="76" height="76" alt="" draggable="false">
          ${open ? '' : `<span class="sk-lock">${icon('lock')}</span>`}
          ${open && inst?.counter?.enabled ? '<span class="sk-chip">Marcador</span>' : ''}
          ${rare ? `<span class="sk-chip sk-chip-rare">${icon('sparkle')} Patrón raro</span>` : ''}
        </div>
        <div class="sk-strip">
          <b>${skin.name}</b>
          <small>${tier.name}</small>
        </div>
      </button>`);
    const img = card.querySelector('.sk-thumb');
    img.dataset.thumb = '1';
    // bloqueadas: silueta con el marcador 2D (no se renderiza nada en 3D)
    if (open) jobs.push({ img, skin, inst });
    card.addEventListener('click', () => openInspect(skin, card));
    cards.set(skin.id, { card, skin, open });
    grid.append(card);
  }

  const refreshEquipped = () => {
    for (const { card, skin } of cards.values()) card.classList.toggle('equipped', progress.skin.id === skin.id);
  };
  const applyFilters = () => {
    let shown = 0;
    for (const { card, skin, open } of cards.values()) {
      const ok = (filter.tier === 'all' || skin.tier === filter.tier) && (filter.collection === 'all' || skin.collection === filter.collection) && (!filter.owned || open);
      card.hidden = !ok;
      if (ok) shown++;
    }
    empty.hidden = shown > 0;
  };
  view.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    filter.tier = b.dataset.tier;
    view.querySelectorAll('[data-tier]').forEach((x) => x.classList.toggle('on', x === b));
    applyFilters();
  }));
  const ownedBtn = view.querySelector('.sk-fowned');
  ownedBtn.addEventListener('click', () => {
    filter.owned = !filter.owned;
    ownedBtn.classList.toggle('on', filter.owned);
    ownedBtn.setAttribute('aria-pressed', String(filter.owned));
    applyFilters();
  });
  view.querySelector('.sk-fcoll')?.addEventListener('change', (e) => {
    filter.collection = e.target.value;
    applyFilters();
  });

  // inspección a pantalla completa (también en móvil); equipar es un botón explícito
  let view3d = null;
  const closeInspect = () => {
    if (!view3d) return;
    const { overlay, onKey, from } = view3d;
    const inspector = view3d.inspector;
    view3d = null;
    document.removeEventListener('keydown', onKey, true);
    try { inspector?.destroy(); } catch { }
    overlay.remove();
    document.body.classList.remove('sk-noscroll');
    if (from?.isConnected) from.focus({ preventScroll: true });
  };
  function openInspect(skin, from) {
    closeInspect();
    const overlay = h(`
      <div class="sk-view" role="dialog" aria-modal="true">
        <div class="sk-view-bar">
          <button type="button" class="sk-view-back" aria-label="Cerrar inspección">${icon('back')}Skins</button>
          <span class="sk-view-title"></span>
        </div>
        <div class="sk-view-stage">
          <button type="button" class="sk-view-nav prev" aria-label="Skin anterior">‹</button>
          <div class="sk-view-canvas"><img class="sk-view-poster" alt="" draggable="false"></div>
          <button type="button" class="sk-view-nav next" aria-label="Skin siguiente">›</button>
          <div class="sk-view-lock" hidden>
            <span class="sk-lock sk-lock-big">${icon('lock')}</span>
            <div class="sk-view-req"><small></small><span class="bar"><i></i></span></div>
          </div>
        </div>
        <div class="sk-view-actions">
          <button type="button" class="primary sk-equip"></button>
        </div>
      </div>`);
    document.body.append(overlay);
    document.body.classList.add('sk-noscroll');
    const equipBtn = overlay.querySelector('.sk-equip');
    const lockBox = overlay.querySelector('.sk-view-lock');
    const titleEl = overlay.querySelector('.sk-view-title');
    const poster = overlay.querySelector('.sk-view-poster');
    const navBtns = overlay.querySelectorAll('.sk-view-nav');
    let current = skin;
    const mine = { overlay, inspector: null, onKey: null, from };

    // la lista de navegación es la rejilla visible (respeta los filtros de tier, colección y «solo abiertas»)
    const navList = () => [...cards.values()].filter((c) => !c.card.hidden).map((c) => c.skin);
    const canNav = () => navList().length > 1;
    const syncNav = () => {
      const show = canNav();
      for (const b of navBtns) b.hidden = !show;
    };
    const syncAction = () => {
      const req = progress.requirement(current);
      const open = req.ratio >= 1;
      const isEq = progress.skin.id === current.id;
      equipBtn.disabled = isEq || !open;
      equipBtn.innerHTML = isEq ? `${icon('check')}Equipada` : open ? 'Equipar' : 'Bloqueada';
      lockBox.hidden = open;
      lockBox.querySelector('small').textContent = req.text;
      lockBox.querySelector('.bar i').style.width = `${req.ratio * 100}%`;
    };
    /** Muestra otra skin dentro del mismo overlay (sin cerrarlo): título, equipar, candado y bola. */
    const showSkin = (next) => {
      current = next;
      overlay.className = `sk-view rarity-${next.tier}`;
      overlay.setAttribute('aria-label', `Inspeccionar ${next.name}`);
      titleEl.innerHTML = `<b>${next.name}</b><small>${SKIN_TIERS[next.tier]?.name ?? ''}</small>`;
      poster.src = thumbCached(next, progress.instance(next.id)) ?? ballPreview(next, 288);
      syncAction();
      syncNav();
      mine.inspector?.setSkin(next, progress.instance(next.id) ?? undefined);
    };
    /** Salta a la skin anterior (-1) o siguiente (+1) de la rejilla visible, dando la vuelta al final. */
    const go = (delta) => {
      const list = navList();
      if (list.length < 2) return;
      const i = list.findIndex((s) => s.id === current.id);
      const j = (Math.max(i, 0) + delta + list.length) % list.length;
      showSkin(list[j]);
    };

    showSkin(skin);
    equipBtn.addEventListener('click', () => {
      if (progress.equip(current.id)) {
        refreshEquipped();
        syncAction();
      }
    });
    overlay.querySelector('.sk-view-back').addEventListener('click', closeInspect);
    overlay.querySelector('.sk-view-nav.prev').addEventListener('click', () => go(-1));
    overlay.querySelector('.sk-view-nav.next').addEventListener('click', () => go(1));
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeInspect();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        go(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    mine.onKey = onKey;
    document.addEventListener('keydown', onKey, true);
    view3d = mine;
    overlay.querySelector('.sk-view-back').focus({ preventScroll: true });
    // el visor 3D (three.js + materiales) se descarga y crea solo ahora, al abrir
    loadSkinInspector().then(({ createSkinInspector }) => {
      if (view3d !== mine) return; // cerrado mientras cargaba
      mine.inspector = createSkinInspector(overlay.querySelector('.sk-view-canvas'), { skin: current, instance: progress.instance(current.id) ?? undefined, mode: 'fullscreen', noEnv: true });
      // el candado va sobre el visor 3D, centrado en la bola (el visor vacía el contenedor al crearse)
      overlay.querySelector('.sk-stage')?.append(lockBox);
    }).catch((err) => console.warn('inspector no disponible', err));
  }

  refreshEquipped();
  applyFilters();
  await shell(view);
  // shell() destruye el inspector anterior: el nuevo se registra después
  activeSkinInspector = { destroy: closeInspect };

  // miniaturas estáticas (caché); las que falten se renderizan una vez, en cola, la equipada primero
  const eqId = progress.skin.id;
  jobs.sort((a, b) => (b.skin.id === eqId) - (a.skin.id === eqId));
  for (const j of jobs) upgradeImg(j.img, j.skin, j.inst, { size: 76, priority: j.skin.id === eqId });
}

// ---------- cuenta ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BLOCK_TEXT = {
  account_required: 'Para jugar con créditos necesitas una cuenta con email. Crea tu cuenta para conservar tu saldo, nivel y skins.',
  kyc_required: 'Antes de jugar con créditos tienes que verificar tu edad e identidad. Solo se hace una vez.',
  underage: 'Las mesas con entrada son solo para mayores de 18 años. Puedes seguir jugando en Práctica.',
  account_review: 'Tu cuenta está en revisión por el sistema antitrampas. Mientras tanto puedes jugar en Práctica.',
};

const KYC_TEXT = {
  none: 'Sin verificar',
  pending: 'En curso',
  verified: 'Verificada',
  rejected: 'Rechazada',
};

const KYC_REASON = {
  underage: 'Hay que ser mayor de 18 años.',
  duplicate_identity: 'Ese documento ya está en otra cuenta. Solo se permite una cuenta por persona.',
  provider_declined: 'No se ha podido comprobar el documento. Prueba otra vez con buena luz.',
  missing_data: 'Faltan datos del documento. Prueba otra vez.',
};

function showBlocked(code) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>${code === 'account_review' || code === 'underage' ? 'Mesa no disponible' : 'Un paso más'}</h2>
        <p class="sub">${BLOCK_TEXT[code] ?? BLOCK_TEXT.account_required}</p>
        ${code === 'account_required' || code === 'kyc_required' ? `<button class="primary go">${icon('user')}Ir a mi cuenta</button>` : ''}
        <button class="ghost back">Volver</button>
      </div>
    </div>`);
  overlay.querySelector('.go')?.addEventListener('click', () => showAccount());
  overlay.querySelector('.back').addEventListener('click', () => overlay.remove());
  app.append(overlay);
}

// ---------- ranking de victorias ----------

const RANKING_TABS = { weekly: 'Semanal', monthly: 'Mensual', historic: 'Histórico' };
let rankingTab = 'weekly';

/** Aviso de marco nuevo si la partida hizo cruzar un nivel de prestigio. */
const prestigeNote = (gained) => {
  const now = framesUnlocked(gained.level.level);
  if (now.length <= framesUnlocked(gained.levelBefore).length) return '';
  const f = now.at(-1);
  return `<p class="reward-note prestige-note" style="${frameStyle(f)}"><i></i>¡Marco de prestigio ${esc(f.name)} desbloqueado!</p>`;
};

async function showRanking() {
  screen = 'ranking';
  const account = backend.account;
  if (!account) {
    await shell(
      h(`<main class="screen ranking"><div class="section-head"><h1>Ranking</h1></div>
        <p class="offline">El ranking de victorias necesita conexión con el servidor.</p></main>`),
    );
    return;
  }
  const view = h(`
    <main class="screen ranking">
      <div class="section-head"><h1>Ranking</h1><span class="sub">Victorias en mesas online</span></div>
      <div class="rank-tabs">${Object.entries(RANKING_TABS).map(([k, v]) => `<button data-tab="${k}" class="${k === rankingTab ? 'on' : ''}">${v}</button>`).join('')}</div>
      <p class="rank-period"></p>
      <ol class="rank-list"></ol>
      <div class="rank-me"></div>
      <p class="legal">Cuentan las mesas con jugadores reales ya liquidadas. Semana de lunes a domingo y mes natural (hora UTC). En empate gana quien llegó antes a esas victorias. Terminar un periodo entre los mejores desbloquea bolas exclusivas en Skins.</p>
    </main>`);
  const list = view.querySelector('.rank-list');
  const me = view.querySelector('.rank-me');
  const period = view.querySelector('.rank-period');
  const row = (r) => {
    const f = frameById(r.frame);
    return `<li class="rank-row ${r.me ? 'me' : ''} ${r.pos <= 3 ? `podium p${r.pos}` : ''}">
      <b class="rank-pos">${r.pos <= 3 ? icon('medal', { tone: ['gold', 'silver', 'bronze'][r.pos - 1], arg: r.pos, label: `Puesto ${r.pos}` }) : r.pos}</b>
      ${avatarHtml({ size: 'sm', frame: f, av: r.me ? avatar.get() : null, initial: (r.name ?? '?')[0] })}
      <span class="rank-name">${esc(r.name)}<small>Nv. ${r.level}${f ? ` · ${esc(f.name)}` : ''}</small></span>
      <span class="rank-wins"><b>${r.wins}</b><small>victoria${r.wins === 1 ? '' : 's'}</small></span>
    </li>`;
  };
  const load = async (tab) => {
    rankingTab = tab;
    view.querySelectorAll('.rank-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    list.innerHTML = '<li class="rank-empty">Cargando…</li>';
    me.innerHTML = '';
    try {
      const r = await account.ranking(tab);
      if (rankingTab !== tab || !view.isConnected) return;
      period.textContent = tab === 'historic' ? 'Desde el principio' : `${new Date(r.from).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(new Date(r.to) - 1).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
      list.innerHTML = r.top.length ? r.top.map(row).join('') : '<li class="rank-empty">Aún no hay victorias en este periodo. ¡Sé el primero!</li>';
      const inTop = r.top.some((x) => x.me);
      me.innerHTML = inTop ? '' : r.me
        ? `<p class="rank-mine">Tu posición: <b>#${r.me.pos}</b> · ${r.me.wins} victoria${r.me.wins === 1 ? '' : 's'}</p>`
        : '<p class="rank-mine">Aún no tienes victorias en este periodo. Gana una mesa online para entrar.</p>';
    } catch {
      if (rankingTab === tab && view.isConnected) list.innerHTML = '<li class="rank-empty">No se ha podido cargar el ranking. Prueba otra vez.</li>';
    }
  };
  view.querySelectorAll('.rank-tabs button').forEach((b) => b.addEventListener('click', () => load(b.dataset.tab)));
  await shell(view);
  load(rankingTab);
}

const accountTabs = (balance) => `
  <div class="rank-tabs acc-tabs">
    <button data-acc="profile">${icon('user')}Perfil</button>
    <button data-acc="wallet">${icon('wallet')}Wallet <small>${coin(balance)}</small></button>
  </div>`;

/** Muestra una sola pestaña de la cuenta (Perfil o Wallet) sin volver a pintar. */
function bindAccountTabs(view) {
  const apply = (tab) => {
    accountTab = tab;
    view.querySelectorAll('[data-acc]').forEach((b) => b.classList.toggle('on', b.dataset.acc === tab));
    view.querySelectorAll('[data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== tab; });
  };
  view.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => { sfx.tap(); apply(b.dataset.acc); }));
  apply(accountTab);
}

async function showAccount(note = '', tab = 'profile') {
  screen = 'account';
  accountTab = tab;
  const account = backend.account;
  const [balance, txs] = await Promise.all([wallet.getBalance(), wallet.getTransactions()]);
  if (!account) {
    const offline = h(`<main class="screen account"><div class="section-head"><h1>Cuenta</h1></div>
      ${accountTabs(balance)}
      <div data-pane="profile" class="acc-pane"><p class="offline">Sin conexión con el servidor: el perfil no está disponible en este modo.</p></div>
      <div data-pane="wallet" class="acc-pane wallet-pane">${walletPane(balance, txs)}</div></main>`);
    bindAccountTabs(offline);
    bindWallet(offline);
    await shell(offline);
    return;
  }
  const p = await account.load().catch(() => account.profile);
  const confirmed = Boolean(p.email) && p.email_confirmed && !p.is_anonymous;
  const kyc = p.kyc_status;
  const name = p.username ?? 'Sin nombre';
  const lvl = progress.level;
  const prestige = progress.prestige;
  const unlockedSkins = SKINS.filter((s) => progress.isUnlocked(s)).length;
  const completedChallenges = CHALLENGES.filter((c) => progress.challenge(c.id).done).length;
  const view = h(`
    <main class="screen account">
      <div class="profile-card passport-card holo">
        <div class="shine"></div>
        <div class="passport-header">
          <button class="avatar-wrap edit-avatar" title="Cambiar avatar" aria-label="Cambiar avatar">
            ${avatarHtml({ size: 'lg', frame: prestige.frame, av: avatar.get(), initial: p.username ? name : '?' })}
            <span class="avatar-lvl-badge">Nv.${lvl.level}</span>
            <span class="avatar-edit-tag">Editar</span>
          </button>
          <div class="passport-info">
            <div class="passport-tag-row">
              <span class="passport-status ${confirmed ? 'vip' : 'guest'}">${confirmed ? 'Jugador Oficial' : 'Email sin confirmar'}</span>
              <span class="kyc-mini-pill ${kyc === 'verified' ? 'verified' : ''}">${KYC_TEXT[kyc]}</span>
            </div>
            <strong class="passport-name">${esc(name)}</strong>
            <div class="chip-row"><button class="chip-btn rename">${icon('pencil')}Cambiar nombre</button><button class="chip-btn edit-avatar">${icon('upload')}Cambiar avatar</button></div>
          </div>
        </div>

        <div class="career-stats-row">
          <div class="stat-pill">
            <span class="stat-pill-label">Nivel</span>
            <span class="stat-pill-val">Nv. ${lvl.level}</span>
            <small class="stat-pill-sub">${lvl.into}/${lvl.need} XP</small>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Victorias</span>
            <span class="stat-pill-val">${progress.state.wins}</span>
            <small class="stat-pill-sub">${progress.state.matches} partidas</small>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Skins</span>
            <span class="stat-pill-val">${unlockedSkins}/${SKINS.length}</span>
            <small class="stat-pill-sub">colección</small>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Desafíos</span>
            <span class="stat-pill-val">${completedChallenges}/${CHALLENGES.length}</span>
            <small class="stat-pill-sub">completados</small>
          </div>
        </div>
      </div>
      ${accountTabs(balance)}
      <div data-pane="profile" class="acc-pane">
      <div class="account-card-panel frames-panel">
        <div class="panel-head">
          <h2>Marco de prestigio</h2>
          <span class="panel-badge ${prestige.frame ? 'verified' : 'pending'}">${prestige.frame ? esc(prestige.frame.name) : 'Sin marco'}</span>
        </div>
        <div class="frames">
          ${FRAMES.map((f) => {
            const open = lvl.level >= f.level;
            return `<button class="frame-opt ${open ? '' : 'locked'} ${prestige.frame?.id === f.id ? 'on' : ''}" data-frame="${f.id}" ${open ? '' : 'disabled'} style="${frameStyle(f)}" title="${open ? f.name : `Nivel ${f.level}`}">
              ${avatarHtml({ size: 'xs', frame: f, av: avatar.get(), initial: name })}<b>${f.name}</b><small>${open ? 'Nv. ' + f.level : icon('lock') + ' Nv. ' + f.level}</small>
            </button>`;
          }).join('')}
        </div>
        <p class="sub">Se muestra en tu perfil y en el ranking. Siguiente marco: ${(() => { const n = FRAMES.find((f) => f.level > lvl.level); return n ? `${n.name} en el nivel ${n.level}` : 'ya los tienes todos'; })()}.</p>
      </div>
      <div class="account-card-panel friends-panel">
        <div class="panel-head">
          <h2>Amigos</h2>
          <span class="panel-badge friends-count"></span>
        </div>
        <div class="friends-box"><p class="sub">Cargando…</p></div>
      </div>
      ${note ? `<p class="notice">${note}</p>` : ''}
      ${p.in_review ? `<p class="offline">Tu cuenta está en revisión por el sistema antitrampas.${p.held > 0 ? ` Tienes ${coin(Number(p.held))} en premios retenidos hasta que termine.` : ''}</p>` : ''}

      <div class="account-card-panel">
        <div class="panel-head">
          <h2>Email</h2>
          <span class="panel-badge ${confirmed ? 'verified' : 'pending'}">${confirmed ? 'Confirmado' : 'Sin confirmar'}</span>
        </div>
        <div class="email-box"></div>
      </div>

      <div class="account-card-panel">
        <div class="panel-head">
          <h2>Edad e identidad</h2>
          <span class="panel-badge ${kyc === 'verified' ? 'verified' : ''}">${KYC_TEXT[kyc]}</span>
        </div>
        <div class="kyc-box"></div>
      </div>

      <p class="legal">Para jugar mesas con entrada hace falta cuenta con email, ser mayor de 18 años y verificar tu identidad (una cuenta por persona). La práctica es libre.</p>
      <button class="ghost logout">${icon('logout')}Cerrar sesión</button>
      </div>
      <div data-pane="wallet" class="acc-pane wallet-pane">${walletPane(balance, txs)}</div>
    </main>`);
  bindAccountTabs(view);
  bindWallet(view);
  view.querySelectorAll('.edit-avatar').forEach((b) => b.addEventListener('click', () => avatarEditor(() => showAccount(note))));

  view.querySelector('.rename').addEventListener('click', () => renameForm(view, name));
  view.querySelectorAll('.frame-opt:not(.locked)').forEach((b) => b.addEventListener('click', () => {
    if (progress.equipFrame(b.dataset.frame)) showAccount(note);
  }));

  friendsPanel(view.querySelector('.friends-box'), view.querySelector('.friends-count'), Boolean(p.username));

  const emailBox = view.querySelector('.email-box');
  emailBox.innerHTML = `<p class="field-ok">${esc(p.email ?? '')}</p>${confirmed ? '' : '<p class="sub">Abre el enlace que te enviamos al registrarte para confirmar el email.</p>'}`;
  const changePw = h('<button class="link">Cambiar contraseña</button>');
  changePw.addEventListener('click', () => changePw.replaceWith(passwordForm()));
  emailBox.append(changePw);

  const kycBox = view.querySelector('.kyc-box');
  // TEMPORAL: verificación de identidad desactivada (ver migración 20261106120000)
  if (true) {
    kycBox.innerHTML = '<p class="sub">La verificación de identidad está desactivada temporalmente.</p>';
  } else if (!confirmed) {
    kycBox.innerHTML = '<p class="sub">Primero confirma tu email.</p>';
  } else if (kyc === 'verified') {
    kycBox.innerHTML = `<p class="field-ok">Identidad verificada${p.adult ? ' · mayor de 18' : ''}</p>`;
  } else {
    kycBox.innerHTML = `
      ${kyc === 'rejected' ? `<p class="sub">${KYC_REASON[p.kyc_reason] ?? KYC_REASON.provider_declined}</p>` : ''}
      ${kyc === 'pending' ? '<p class="sub">Estamos esperando el resultado. Si no terminaste, vuelve a empezar.</p>' : ''}
      <button class="primary kyc-start">${icon('shield')}${kyc === 'none' ? 'Verificar identidad' : 'Volver a verificar'}</button>
      <p class="legal">Necesitarás tu DNI o pasaporte y la cámara del móvil. Los datos los comprueba un proveedor externo; aquí solo guardamos tu fecha de nacimiento.</p>`;
    kycBox.querySelector('.kyc-start').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await account.startKyc();
        if (r.url) return (location.href = r.url);
        if (r.status === 'verified') return showAccount();
        kycStubForm(kycBox);
      } catch (err) {
        e.target.disabled = false;
        alertMsg(err.code === 'account_required' ? 'Primero confirma tu email.' : 'No se ha podido abrir la verificación. Prueba otra vez.');
      }
    });
  }

  view.querySelector('.logout')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await account.signOut();
  });
  await shell(view);
}

// amigos: se añaden por nombre de usuario y la otra persona acepta o rechaza
async function friendsPanel(box, badge, hasName) {
  const account = backend.account;
  const paint = (data, msg = '', isErr = false) => {
    badge.textContent = `${data.friends.length} ${data.friends.length === 1 ? 'amigo' : 'amigos'}`;
    const row = (f) => {
      const frame = frameById(f.frame);
      return `<li class="friend">
        ${avatarHtml({ size: 'sm', frame, av: fromWire(f.avatar), initial: f.name })}
        <span class="friend-name"><b>${esc(f.name)}</b><small>Nv. ${esc(f.level)}</small></span>
        <button class="chip-btn" data-remove="${esc(f.name)}">${icon('trash')}Quitar</button>
      </li>`;
    };
    const asks = (list, buttons) => list.map((r) => `<li class="friend">
        <span class="friend-name"><b>${esc(r.name)}</b></span>${buttons(esc(r.name))}
      </li>`).join('');
    box.innerHTML = `
      <form class="friend-add form">
        <div class="row"><input name="name" maxlength="17" placeholder="Nombre de usuario" autocomplete="off" autocapitalize="off" spellcheck="false" ${hasName ? '' : 'disabled'}><button class="primary" ${hasName ? '' : 'disabled'}>${icon('plus')}Añadir</button></div>
        <p class="friend-msg ${isErr ? 'err' : 'ok'}" role="status">${esc(msg || (hasName ? '' : 'Ponte primero un nombre de usuario para añadir amigos.'))}</p>
      </form>
      ${data.incoming.length ? `<h3 class="friends-sub">Peticiones recibidas</h3><ul class="friend-list">${asks(data.incoming, (n) => `<span class="friend-actions"><button class="chip-btn" data-accept="${n}">${icon('check')}Aceptar</button><button class="chip-btn" data-decline="${n}">${icon('close')}Rechazar</button></span>`)}</ul>` : ''}
      ${data.friends.length ? `<ul class="friend-list">${data.friends.map(row).join('')}</ul>` : '<p class="sub">Aún no tienes amigos. Añade a alguien por su nombre de usuario.</p>'}
      ${data.outgoing.length ? `<h3 class="friends-sub">Peticiones enviadas</h3><ul class="friend-list">${asks(data.outgoing, (n) => `<button class="chip-btn" data-remove="${n}">${icon('close')}Cancelar</button>`)}</ul>` : ''}`;
    const run = (name, job, ok) => async () => {
      try {
        await job(name);
        refresh(ok);
      } catch (err) {
        refresh(friendMessage(err.code), true);
      }
    };
    box.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', run(b.dataset.accept, (n) => account.respondFriend(n, true), `Ahora eres amigo de ${b.dataset.accept}.`)));
    box.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', run(b.dataset.decline, (n) => account.respondFriend(n, false), 'Petición rechazada.')));
    box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', run(b.dataset.remove, (n) => account.removeFriend(n), 'Hecho.')));
    box.querySelector('.friend-add').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = cleanFriendName(e.target.name.value);
      if (!name) return void refresh(friendMessage('invalid_username'), true, e.target.name.value);
      e.target.querySelector('button').disabled = true;
      try {
        refresh(addedMessage(await account.addFriend(name), name));
      } catch (err) {
        refresh(friendMessage(err.code), true, name);
      }
    });
  };
  async function refresh(msg = '', isErr = false, keep = '') {
    let data;
    try {
      data = await account.friends();
    } catch {
      return void (box.innerHTML = '<p class="sub">No se han podido cargar tus amigos.</p>');
    }
    paint(data, msg, isErr);
    if (keep) box.querySelector('[name=name]').value = keep;
  }
  await refresh();
}

// cambio de contraseña desde la cuenta: pide la actual antes de aceptar la nueva
function passwordForm() {
  const pw = (label, name, ac) => `<label>${label}<input type="password" name="${name}" required autocomplete="${ac}" maxlength="72" autocapitalize="off" spellcheck="false"></label>`;
  const form = h(`
    <form class="form">
      ${pw('Contraseña actual', 'current', 'current-password')}
      ${pw('Contraseña nueva', 'next', 'new-password')}
      ${pw('Repite la contraseña nueva', 'again', 'new-password')}
      <p class="sub">Mínimo 8 caracteres, con letras y números.</p>
      <p class="auth-error" role="alert"></p>
      <button class="primary">Guardar contraseña</button>
    </form>`);
  const error = form.querySelector('.auth-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    error.textContent = '';
    const bad = validatePassword(form.next.value) ?? (form.next.value !== form.again.value ? 'password_mismatch' : null);
    if (bad) return void (error.textContent = authMessage(bad));
    btn.disabled = true;
    try {
      await backend.account.changePassword(form.current.value, form.next.value);
      showAccount('Contraseña cambiada');
    } catch (err) {
      btn.disabled = false;
      error.textContent = authMessage(err.code);
    }
  });
  return form;
}

// elegir icono o subir imagen propia (máx. 2,5 MB); se guarda en este dispositivo
function avatarEditor(done) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card avatar-editor">
        <h2>Tu avatar</h2>
        <div class="ae-preview"></div>
        <div class="ae-icons">${AVATAR_ICONS.map((i) => `<button data-icon="${i.id}" title="${i.name}" aria-label="${i.name}">${avatarIcon(i.id)}</button>`).join('')}</div>
        <div class="row">
          <button class="secondary ae-upload">${icon('upload')}Subir imagen</button>
          <button class="secondary ae-clear">${icon('trash')}Quitar</button>
        </div>
        <input type="file" class="ae-file" accept="image/png,image/jpeg,image/webp" hidden>
        <p class="ae-msg legal">PNG, JPG o WebP, máximo 2,5 MB. Se recorta en cuadrado y solo se guarda en este dispositivo.</p>
        <button class="primary ae-done">${icon('check')}Listo</button>
      </div>
    </div>`);
  const msg = overlay.querySelector('.ae-msg');
  const paint = () => {
    const av = avatar.get();
    overlay.querySelector('.ae-preview').innerHTML = avatarHtml({ size: 'lg', frame: progress.prestige.frame, av, initial: backend.account?.profile?.username ?? '?' });
    overlay.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === av.icon));
  };
  overlay.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => { avatar.setIcon(b.dataset.icon); paint(); }));
  overlay.querySelector('.ae-clear').addEventListener('click', () => { avatar.clear(); paint(); });
  const file = overlay.querySelector('.ae-file');
  overlay.querySelector('.ae-upload').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const bad = checkAvatarFile(f);
    if (bad) { msg.textContent = bad === 'size' ? 'La imagen pesa más de 2,5 MB.' : 'Usa una imagen PNG, JPG o WebP.'; msg.classList.add('err'); return; }
    try {
      avatar.setImage(await imageToAvatar(f));
      msg.classList.remove('err');
      paint();
    } catch {
      msg.textContent = 'No se ha podido leer esa imagen.';
      msg.classList.add('err');
    }
  });
  overlay.querySelector('.ae-done').addEventListener('click', () => { overlay.remove(); done(); });
  paint();
  app.append(overlay);
}

function renameForm(view, current) {
  const card = view.querySelector('.profile-card');
  const form = h(`
    <form class="form">
      <input name="name" maxlength="16" autocomplete="nickname" value="${esc(current === 'Sin nombre' ? '' : current)}" placeholder="Nombre (3-16 letras, números o _)">
      <button class="primary">Guardar nombre</button>
    </form>`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await backend.account.setUsername(form.name.value.trim());
      showAccount('Nombre guardado');
    } catch (err) {
      alertMsg(err.code === 'username_taken' ? 'Ese nombre ya está cogido.' : 'Usa de 3 a 16 letras, números o _.');
    }
  });
  card.after(form);
  form.name.focus();
}

// modo pruebas: sin proveedor configurado, se pide fecha y documento a mano
function kycStubForm(box) {
  box.innerHTML = `
    <form class="form">
      <p class="sub"><small class="tag">pruebas</small> Verificación simulada: aún no hay proveedor conectado.</p>
      <label>Fecha de nacimiento<input type="date" name="birthdate" required></label>
      <label>Número de documento<input name="document" required minlength="5" maxlength="32" autocomplete="off"></label>
      <button class="primary">Verificar</button>
    </form>`;
  const form = box.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelector('button').disabled = true;
    try {
      await backend.account.stubKyc(form.birthdate.value, form.document.value);
      showAccount();
    } catch {
      form.querySelector('button').disabled = false;
      alertMsg('Revisa la fecha y el número de documento.');
    }
  });
}

// ---------- wallet ----------

const TX_LABEL = { bonus: 'Bienvenida', withdrawal: 'Retirada', deposit: 'Recarga', entry: 'Entrada', prize: 'Premio', refund: 'Devolución' };

function walletPane(balance, txs) {
  const prizeTotal = txs.filter((t) => t.type === 'prize' && t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const matchesPlayed = txs.filter((t) => t.type === 'entry').length;
  return `
    <div class="wallet-pane-inner">
      <div class="wallet-dashboard-col">
        <div class="wallet-card holo">
          <div class="shine"></div>
          <div class="card-ambient"></div>
          <div class="card-header">
            <div class="card-chip-badge"><span class="card-chip"></span><span class="card-contactless">)))</span></div>
            <span class="card-league">DIAMOND VIP</span>
          </div>
          <div class="card-balance">
            <small>Saldo Disponible</small>
            <strong>${coin(balance)}</strong>
          </div>
          <div class="card-footer">
            <div class="card-number">•••• •••• •••• ${String(Math.abs(Math.round(balance * 100)) % 9000 + 1000)}</div>
            <div class="card-holder"><small>TITULAR</small><span>GOLF CASH PRO</span></div>
          </div>
        </div>
        <div class="wallet-metrics">
          <div class="metric-card">
            <small>Premios Ganados</small>
            <b>${coin(prizeTotal)}</b>
          </div>
          <div class="metric-card">
            <small>Torneos Jugados</small>
            <b>${matchesPlayed}</b>
          </div>
        </div>
        <div class="deposit-section">
          <h3>Recarga Rápida de Créditos Demo</h3>
          <div class="row deposit-row">
            <button class="primary deposit-btn" data-add="50">${icon('coins')}<span>+50</span> Créditos</button>
            <button class="primary deposit-btn" data-add="200">${icon('coins')}<span>+200</span> Créditos</button>
          </div>
        </div>
        ${wallet.depositCrypto
      ? `<div class="crypto-section">
          <h3>Depositar en Cripto <small class="tag">pruebas</small></h3>
          <div class="row">
            <button class="secondary" data-crypto="10">${icon('coins')}10 USD</button>
            <button class="secondary" data-crypto="25">${icon('coins')}25 USD</button>
            <button class="secondary" data-crypto="50">${icon('coins')}50 USD</button>
          </div>
          <p class="legal">Pago con NOWPayments (USDT, BTC, ETH…). Modo de pruebas: no se cobra dinero real.</p>
        </div>`
      : ''
    }
      </div>
      <div class="txs-container">
        <h3>Historial de Movimientos</h3>
        <ul class="txs">
          ${txs.length
      ? txs
        .map(
          (t) => `<li>
                        <div class="tx-info">
                          <div class="tx-text">
                            <b>${TX_LABEL[t.type] ?? t.type}</b>
                            <small>${t.note} · ${new Date(t.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</small>
                          </div>
                        </div>
                        <span class="${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : ''}${fmt(t.amount)}</span>
                      </li>`,
        )
        .join('')
      : '<li class="empty"><p>Sin movimientos todavía</p></li>'
    }
        </ul>
      </div>
    </div>`;
}

function bindWallet(view) {
  view.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await wallet.deposit(Number(b.dataset.add), 'Recarga demo');
      } catch (e) {
        if (e.code === 'daily_cap') return alertMsg('Has llegado al límite de recargas demo de hoy');
        throw e;
      }
      sfx.coins();
      showAccount('', 'wallet');
    }),
  );
  view.querySelectorAll('[data-crypto]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const { invoiceUrl } = await wallet.depositCrypto(Number(b.dataset.crypto));
        location.href = invoiceUrl;
      } catch (e) {
        alertMsg(e.code === 'not_configured' ? 'Los depósitos en cripto todavía no están activados.' : 'No se ha podido crear el pago. Prueba otra vez.');
      }
    }),
  );
}

// ---------- matchmaking ----------

async function startMatch(tier, rematchOf = null) {
  leaveFinale();
  // #hoyo3 en la URL: la práctica empieza por ese hoyo (útil para probar);
  // #hoyo3-empate además fuerza el desempate al final
  const forced = tier.entryFee === 0 && /^#hoyo(\d+)(-empate)?$/.exec(location.hash);
  // con servidor, las mesas de pago son torneos contra jugadores reales y la
  // práctica se juega en el móvil contra rivales simulados
  if (!forced && tier.entryFee > 0 && backend.tournaments) return startTournament(tier, rematchOf);
  const service = forced || backend.tournaments ? practice : matches;
  let match;
  try {
    match = await service.join(tier);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return showAccount('', 'wallet');
    return alertMsg('No se ha podido crear la partida. Prueba otra vez.');
  }
  match.service = service;
  match.myHoles = [];
  if (forced) Object.assign(match, { courses: [Number(forced[1]) - 1], holes: 1, forceTie: !!forced[2] });
  const view = h(`
    <main class="screen matchmaking tier--${tier.id}">
      <div class="radar"><span></span><span></span><span></span>${ball(progress.skin, 64)}</div>
      <h1>${icon('hourglass')} Buscando rivales…</h1>
      <p class="sub">${tier.entryFee ? `${tier.name} · bote ${coin(potFor(tier))}` : 'Práctica contra rivales simulados'}</p>
      <div class="seats"></div>
      <button class="ghost cancel">${icon('close')}Cancelar y recuperar entrada</button>
    </main>`);
  const seats = view.querySelector('.seats');
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) seats.append(h(`<div class="seat"><span>…</span></div>`));
  let cancelled = false;
  view.querySelector('.cancel').addEventListener('click', async () => {
    cancelled = true;
    await match.service.cancel(match);
    showLobby();
  });
  await shell(view, { nav: false });
  for (let i = 0; i < match.players.length; i++) {
    await wait(i === 0 ? 200 : 250 + Math.random() * 350);
    if (cancelled) return;
    const p = match.players[i];
    const s = seats.children[i];
    s.classList.add('filled', ...(p.id === 'me' ? ['me'] : []));
    s.style.setProperty('--c', p.color);
    s.innerHTML = `<span class="avatar">${p.name[0]}</span><span>${p.name}</span>`;
    sfx.tick();
  }
  await wait(600);
  if (!cancelled) playHole(match, 0);
}

// ---------- juego ----------

/**
 * Pantalla de juego. mode 'hole' es un hoyo normal; 'tiebreak' es el hoyo
 * sin agujero del desempate (un tiro, gana el más cercano).
 */
function playScreen(match, { course, title, subtitle, players, onDone, firstSunkTick = null, timeLimit = HOLE_TIME_LIMIT, freePlay = false, onRestartHole = null, onSelectMap = null, rivals = null, live = false, onGame = null, onShots = null }) {
  const tiebreak = !!course.noCup;
  const view = h(`
    <main class="play-screen ${tiebreak ? 'is-tiebreak' : ''} ${freePlay ? 'is-freeplay' : ''}">
      <div class="stage"></div>
      <div class="vignette"></div>
      <div class="hud ${freePlay ? 'hud-freeplay' : ''}">
        ${freePlay ? '<div class="pill hl freeplay-pill">Modo Libre</div>' : `<div class="pill hl">${title}</div>`}
        <div class="pill">${freePlay ? course.name : tiebreak ? '1 tiro' : `Par ${course.par}`}</div>
        ${freePlay ? `<div class="pill">Par ${course.par}</div>` : ''}
        ${tiebreak ? '' : '<div class="pill strokes">Golpes <b>0</b></div>'}
        <div class="pill dist">— m</div>
        ${freePlay ? `
        <button class="pill restart-btn hud-freeplay-btn" aria-label="Reiniciar hoyo" title="Reiniciar hoyo al tee (R)">${icon('restart')}Reiniciar <kbd class="kbd-hint">R</kbd></button>
        <button class="pill map-select-btn hud-freeplay-btn" aria-label="Elegir otro mapa" title="Elegir otro mapa">${icon('map')}Mapas</button>
        ` : ''}
        <button class="pill mute mobile-only" aria-label="Sonido">${soundLabel()}</button>
        <button class="pill fullscreen mobile-only" aria-label="Pantalla completa" title="Pantalla completa (F11)">${icon('fullscreen')}Pantalla</button>
        <button class="pill settings-btn-hud mobile-only" aria-label="Ajustes" title="Ajustes (Esc)">${icon('gear')}Ajustes</button>
        <button class="pill desktop-esc-hint" aria-label="Ajustes">${icon('gear')}Ajustes <kbd class="kbd-hint">Esc</kbd></button>
      </div>
      <div class="rivals ${freePlay ? 'rivals-hidden' : ''}">${freePlay ? '' : players
      .map((p) => `<div class="chip ${p.id === 'me' ? 'me' : ''} ${live && p.isBot ? 'bot' : ''}" data-id="${p.id}" style="--c:${p.color}"><i>${p.name[0]}</i><b>${tiebreak ? '·' : 0}</b></div>`)
      .join('')}</div>
      <div class="toasts"></div>
      <div class="intro-banner">
        <small>${subtitle}</small>
        <strong>${course.name}</strong>
        <span>${freePlay ? `Modo Libre · Par ${course.par} · Sin tiempo ni rivales` : tiebreak ? 'Deja la bola lo más cerca de la diana' : `Par ${course.par}`}</span>
        ${course.tip && !tiebreak ? `<em>${course.tip}</em>` : ''}
      </div>
      <div class="overview-banner"><span class="ov-mouse">Vista General del Mapa · Mueve el ratón para orbitar · Pulsa <kbd>Espacio</kbd> para volver</span><span class="ov-touch">Vista del mapa · Desliza para girarla</span></div>
      <div class="cup-banner"></div>
      <div class="hole-timer" hidden><small>Tiempo para embocar</small><b>${timeLimit ?? ''}</b></div>
      <div class="hint">
        <span class="hint-touch">Desliza: cámara · Arrastra la bola hacia atrás: tiro</span>
        <span class="hint-mouse">Ratón para apuntar · Clic Izquierdo para calcular y disparar · <kbd>Espacio</kbd> Ver mapa · <kbd>Esc</kbd> Ajustes</span>
      </div>
      <div class="desktop-controls-bar">
        <span><kbd>Ratón</kbd> Apuntar y Disparar</span>
        <span><kbd>Clic Der</kbd> Cámara</span>
        <span><kbd>Rueda</kbd> Zoom / Fuerza</span>
        <span><kbd>Espacio</kbd> Vista mapa completo</span>
        <span><kbd>Esc</kbd> Ajustes</span>
        ${freePlay ? '<span><kbd>R</kbd> Reiniciar hoyo</span>' : ''}
      </div>
      <div class="power"><div class="fill"></div></div>
      <button class="map-btn" aria-label="Ver el hoyo completo">${icon('eye')}Ver mapa <kbd class="kbd-hint">Espacio</kbd></button>
    </main>`);
  const gameClass = loadGolfGame();
  Promise.all([gameClass, shell(view, { hideHeader: true })]).then(([GolfGame]) => {
    if (!view.isConnected) return; // se salió de la pantalla mientras cargaba el motor
    const strokesEl = view.querySelector('.strokes b');
    const distEl = view.querySelector('.dist');
    const power = view.querySelector('.power');
    const hint = view.querySelector('.hint');
    const cupBanner = view.querySelector('.cup-banner');
    const mapBtn = view.querySelector('.map-btn');
    const stageEl = view.querySelector('.stage');
    const timerEl = view.querySelector('.hole-timer');
    let finished = false;
    const showDistance = () => (distEl.textContent = `${game.distanceToCup().toFixed(tiebreak ? 2 : 1)} m`);
    const banner = (text) => {
      cupBanner.textContent = text;
      cupBanner.classList.add('show');
    };
    const finish = (strokes) => {
      if (finished) return;
      finished = true;
      game.locked = true;
      game?.exitPointerLock?.();
      onDone(game, strokes, banner);
    };
    stageEl?.addEventListener('click', () => {
      if (!game?.overview && !view.querySelector('.in-game-settings-overlay')) {
        game?.requestPointerLock?.();
      }
    });

    function openSettingsMenu() {
      const existing = view.querySelector('.in-game-settings-overlay');
      if (existing) {
        existing.remove();
        game.setPaused?.(false);
        game.requestPointerLock?.();
        return;
      }
      game.setPaused?.(true);
      game.exitPointerLock?.();
      const overlay = h(`
        <div class="overlay in-game-settings-overlay">
          <div class="in-game-settings-modal">
            <div class="settings-modal-header">
              <div class="settings-title">
                <h3>Ajustes de Partida</h3>
              </div>
              <button class="close-settings-btn" aria-label="Cerrar ajustes">${icon('close')}Cerrar</button>
            </div>

            <div class="settings-modal-body">
              <div class="settings-row">
                <div class="settings-label">
                  <strong>Pantalla</strong>
                  <small>Modo inmersivo de pantalla completa</small>
                </div>
                <button class="settings-btn toggle-fs-btn">
                  ${icon('fullscreen')}<span class="btn-text">${document.fullscreenElement ? 'Ventana' : 'Pantalla Completa'}</span>
                </button>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Vista de Campo</strong>
                  <small>Ver todo el terreno en 3D</small>
                </div>
                <button class="settings-btn toggle-overview-btn">
                  ${icon('eye')}<span class="btn-text">${game.overview ? 'Volver a la bola' : 'Ver todo el terreno'}</span>
                </button>
              </div>

              <div class="ig-settings-panel"></div>
            </div>

            <div class="settings-modal-footer">
              <button class="primary resume-btn">${icon('play')}Reanudar partida</button>
              ${freePlay ? `<button class="secondary restart-settings-btn">${icon('restart')}Reiniciar Hoyo</button><button class="secondary map-settings-btn">${icon('map')}Cambiar de Mapa</button>` : ''}
              <button class="danger quit-btn">${icon('logout')}Salir al Lobby</button>
            </div>
          </div>
        </div>
      `);

      const close = () => {
        overlay.remove();
        game.setPaused?.(false);
        game.requestPointerLock?.();
      };

      overlay.querySelector('.close-settings-btn').addEventListener('click', close);
      overlay.querySelector('.resume-btn').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      // controles, calidad y sonido: el mismo panel que la pantalla Ajustes; se aplican al momento
      mountSettingsPanel(overlay.querySelector('.ig-settings-panel'), { layout: 'modal', section: lastSection(), onQuality: () => game.refreshQuality?.() });

      const fsModalBtn = overlay.querySelector('.toggle-fs-btn');
      fsModalBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => { });
        } else {
          document.exitFullscreen().catch(() => { });
        }
        setTimeout(() => {
          const isFs = !!document.fullscreenElement;
          fsModalBtn.querySelector('.btn-text').textContent = isFs ? 'Ventana' : 'Pantalla Completa';
        }, 100);
      });

      const ovBtn = overlay.querySelector('.toggle-overview-btn');
      ovBtn.addEventListener('click', () => {
        game.setOverview(!game.overview);
        close();
      });

      overlay.querySelector('.quit-btn').addEventListener('click', () => {
        if (confirm('¿Seguro que quieres salir al menú principal?')) {
          overlay.remove();
          game.setPaused?.(false);
          game.dispose();
          showLobby();
        }
      });

      if (freePlay) {
        overlay.querySelector('.restart-settings-btn')?.addEventListener('click', () => {
          close();
          if (onRestartHole) {
            onRestartHole();
          } else if (game) {
            game.restart();
            if (strokesEl) strokesEl.textContent = '0';
            showDistance();
            toast('Hoyo reiniciado al tee', '#00f076');
          }
        });
        overlay.querySelector('.map-settings-btn')?.addEventListener('click', () => {
          overlay.remove();
          game.setPaused?.(false);
          game.dispose();
          if (onSelectMap) onSelectMap();
          else showFreePlayCourseSelect();
        });
      }

      view.append(overlay);
    }

    game = new GolfGame(view.querySelector('.stage'), {
      onOpenSettings: openSettingsMenu,
      onOverviewChange: (isOverview) => {
        view.querySelector('.overview-banner')?.classList.toggle('show', isOverview);
        if (mapBtn) {
          mapBtn.innerHTML = `${icon('eye')}${isOverview ? 'Volver a la bola' : 'Ver mapa'} <kbd class="kbd-hint">Espacio</kbd>`;
          mapBtn.classList.toggle('on', isOverview);
        }
      },
      onAim: (p) => {
        power.querySelector('.fill').style.height = `${p * 100}%`;
        power.classList.toggle('active', p > 0);
        power.classList.toggle('full', p >= 1);
      },
      onRival: (p, st) => {
        if (tiebreak) {
          if (st.done) setChip(p.id, 'OK', true);
          return;
        }
        if (st.dq) {
          setChip(p.id, 'DQ', true);
          return;
        }
        setChip(p.id, st.strokes, st.sunk);
        if (st.sunk) toast(`${esc(p.name)} ha embocado en ${st.strokes}`, p.color);
      },
      onStroke: (n) => {
        if (n > 0) onShots?.(game.shots);
        if (!tiebreak) setChip('me', n, false);
        if (strokesEl) strokesEl.textContent = n;
        hint.classList.add('gone');
        view.querySelector('.desktop-controls-bar')?.classList.add('fade-out');
      },
      onCup: (n) => {
        setChip('me', n, true);
        banner(scoreLabel(n, course.par));
        distEl.textContent = '0 m';
      },
      onSunk: finish,
      onTimer: (left) => {
        if (left == null) return (timerEl.hidden = true);
        if (timerEl.hidden) toast(`¡${left} s para embocar o quedas descalificado!`, '#ff5a5a');
        timerEl.hidden = false;
        timerEl.querySelector('b').textContent = left;
        timerEl.classList.toggle('urgent', left <= 5);
        timerEl.classList.remove('tick');
        void timerEl.offsetWidth;
        timerEl.classList.add('tick');
      },
      onTimeUp: () => {
        if (freePlay) return;
        timerEl.hidden = true;
        setChip('me', 'DQ', true);
        banner('¡Tiempo! Descalificado');
        cupBanner.classList.add('dq');
        setTimeout(() => finish(maxStrokesOf(course)), 1600);
      },
      onLip: () => toast('¡Uy! Demasiado fuerte para entrar', '#ffffff'),
      onLava: () => toast(`${icon('fire')} ¡A la lava! Vuelves al sitio del golpe`, '#ff8a3a'),
      onWater: () => toast(`${icon('drop')} ¡Al agua! Vuelves al sitio del golpe`, '#7fdcff'),
      onOut: () => toast(`${icon('palm')} ¡Fuera del campo! Vuelves al sitio del golpe`, '#b8f07a'),
      onFall: () => toast(`${icon('pit')} ¡Al agujero! Vuelves al sitio del golpe`, '#ffc400'),
      onRest: (n) => {
        showDistance();
        if (tiebreak) {
          setChip('me', `${game.distanceToCup().toFixed(2)}m`, true);
          setTimeout(() => finish(n), 900);
        } else if (!freePlay && n >= maxStrokesOf(course)) finish(n);
      },
    });
    game.load(course, { bots: freePlay ? [] : rivals ?? players.filter((p) => p.isBot), skin: progress.skin, instance: progress.instance(progress.skin.id), firstSunkTick, timeLimit: freePlay ? null : timeLimit, live });
    onGame?.(game, { toast, view });
    showDistance();
    if (freePlay) {
      view.querySelector('.restart-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onRestartHole) onRestartHole();
        else if (game) {
          game.restart();
          if (strokesEl) strokesEl.textContent = '0';
          showDistance();
          toast('Hoyo reiniciado al tee', '#00f076');
        }
      });
      view.querySelector('.map-select-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        game.locked = true;
        game.exitPointerLock?.();
        game.dispose();
        if (onSelectMap) onSelectMap();
        else showFreePlayCourseSelect();
      });
      const onKeyR = (e) => {
        if (e.code === 'KeyR' && !game?.paused && !view.querySelector('.in-game-settings-overlay')) {
          e.preventDefault();
          if (onRestartHole) onRestartHole();
          else if (game) {
            game.restart();
            if (strokesEl) strokesEl.textContent = '0';
            showDistance();
            toast('Hoyo reiniciado al tee', '#00f076');
          }
        }
      };
      window.addEventListener('keydown', onKeyR);
    }
    if (isMuted()) toast('Sonido silenciado · actívalo en Ajustes', '#ffffff');
    view.querySelector('.mute').addEventListener('click', toggleMute);
    const fsBtn = view.querySelector('.fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => { });
        } else {
          document.exitFullscreen().catch(() => { });
        }
      });
      document.addEventListener('fullscreenchange', () => {
        fsBtn.innerHTML = `${icon('fullscreen')}${document.fullscreenElement ? 'Ventana' : 'Pantalla'}`;
      });
    }
    view.querySelector('.settings-btn-hud')?.addEventListener('click', openSettingsMenu);
    view.querySelector('.desktop-esc-hint')?.addEventListener('click', openSettingsMenu);
    function setChip(id, text, done) {
      const chip = view.querySelector(`.chip[data-id="${id}"]`);
      if (!chip) return;
      chip.querySelector('b').textContent = text;
      chip.classList.toggle('sunk', done);
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    }
    function toast(text, color) {
      const el = h(`<div class="toast" style="--c:${color}">${text}</div>`);
      view.querySelector('.toasts').append(el);
      setTimeout(() => el.remove(), 2600);
    }
    mapBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      game.setOverview(!game.overview);
    });
  });
}

function playHole(match, index) {
  const course = COURSES[match.courses[index]];
  playScreen(match, {
    course,
    title: `Hoyo ${index + 1}/${match.holes}`,
    subtitle: `Hoyo ${index + 1}`,
    players: match.players,
    onDone: (g, strokes) => {
      const bots = g.finishBots();
      const dq = g.timedOut;
      match.myHoles[index] = { strokes, par: course.par };
      Promise.resolve()
        .then(() => match.service.recordHole(match, index, course.par, strokes, bots, maxStrokesOf(course)))
        .then((standings) => showHoleResult(match, index, course, strokes, standings, dq))
        .catch(() => alertMsg('Se ha perdido la conexión con el servidor. Tu partida sigue guardada.'));
    },
  });
}

function scoreLabel(strokes, par) {
  if (strokes === 1) return '¡Hoyo en uno!';
  const d = strokes - par;
  return { '-3': '¡Albatros!', '-2': '¡Eagle!', '-1': '¡Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Doble bogey' }[d] ?? `+${d}`;
}

function standingsTable(players, highlightPayout) {
  return `<ol class="standings">${players
    .map(
      (p, i) => `<li class="${p.id === 'me' ? 'me' : ''} ${(p.position ?? i + 1) === 1 ? 'first' : ''}" style="--c:${p.color}">
        <span class="pos">${(p.position ?? i + 1) === 1 ? icon('trophy') : p.position ?? i + 1}</span>
        <span class="name"><i></i>${p.name}</span>
        <span class="scores">${p.scores ? p.scores.join(' · ') : p.finished ? 'Terminado' : `Jugando · ${p.holesPlayed} hoyo${p.holesPlayed === 1 ? '' : 's'}`}${p.tiebreak !== undefined ? ` · ${p.tiebreak.toFixed(2)}m` : ''}</span>
        <b>${p.total ?? '—'}</b>
        ${highlightPayout && p.payout ? `<span class="payout">+${fmt(p.payout)}</span>` : ''}
      </li>`,
    )
    .join('')}</ol>`;
}

function holeHeader(strokes, par, dq) {
  if (dq) return `<h2 class="score-title">Descalificado</h2><p class="sub">No embocaste a tiempo · se apuntan ${strokes} golpes</p>`;
  return `<h2 class="score-title">${scoreLabel(strokes, par)}</h2><p class="sub">${strokes} golpe${strokes === 1 ? '' : 's'} · par ${par}</p>`;
}

function showHoleResult(match, index, course, strokes, standings, dq = false) {
  const last = index + 1 >= match.holes;
  const good = !dq && strokes <= course.par;
  const overlay = h(`
    <div class="overlay">
      <div class="card ${good ? 'good' : ''}">
        ${holeHeader(strokes, course.par, dq)}
        ${standingsTable(standings)}
        <button class="primary next">${last ? 'Ver resultado' : 'Siguiente hoyo'}${icon('next')}</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => (last ? afterLastHole(match) : playHole(match, index + 1)));
  app.append(overlay);
}

// ---------- desempate ----------

function afterLastHole(match) {
  app.querySelector('.overlay')?.remove();
  if (match.forceTie) {
    const best = Math.min(...match.players.map((p) => p.total));
    const me = match.players.find((p) => !p.isBot);
    const bot = match.players.find((p) => p.isBot && p.total !== best) ?? match.players.find((p) => p.isBot);
    for (const p of [me, bot]) Object.assign(p, { total: best, scores: p.scores.map(() => best) });
  }
  const tied = leaders(match.players);
  if (tied.length < 2) return showResults(match);
  const meTied = tied.some((p) => !p.isBot);
  const overlay = h(`
    <div class="overlay">
      <div class="card tiebreak-card">
        <div class="vs">${tied.map((p) => `<span class="avatar" style="--c:${p.color}">${p.name[0]}</span>`).join('<em>VS</em>')}</div>
        <h2 class="score-title">¡Empate a ${tied[0].total}!</h2>
        <p class="sub">${tied.map((p) => p.name).join(', ')} van al desempate. Hoyo sin agujero: un solo tiro y gana quien deje la bola más cerca de la diana.</p>
        <button class="primary next">${meTied ? 'Jugar desempate' : 'Ver desempate'}${icon('next')}</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => (meTied ? playTiebreak(match, tied) : simulateTiebreak(match, tied)));
  app.append(overlay);
}

function playTiebreak(match, tied) {
  playScreen(match, {
    course: TIEBREAK_COURSE,
    title: 'Desempate',
    subtitle: 'Muerte súbita',
    players: tied,
    onDone: (g, _strokes, banner) => {
      const distances = { me: g.distanceToCup(), ...g.botDistances() };
      const winner = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
      banner(winner === 'me' ? '¡El más cercano!' : 'Casi…');
      setTimeout(() => showTiebreakResult(match, tied, distances), 1400);
    },
  });
}

// si no estás en el empate, los rivales empatados tiran sin pantalla
function simulateTiebreak(match, tied) {
  const segs = segmentsOf(TIEBREAK_COURSE);
  const distances = {};
  for (const p of tied) {
    const bot = new Bot(p, TIEBREAK_COURSE, segs, Math.random);
    bot.finishInstantly(0);
    distances[p.id] = Math.hypot(bot.ball.x - TIEBREAK_COURSE.cup[0], bot.ball.z - TIEBREAK_COURSE.cup[1]);
  }
  showTiebreakResult(match, tied, distances);
}

function showTiebreakResult(match, tied, distances) {
  app.querySelector('.overlay')?.remove();
  const rows = [...tied].sort((a, b) => distances[a.id] - distances[b.id]);
  const overlay = h(`
    <div class="overlay">
      <div class="card tiebreak-card">
        <h2 class="score-title">Desempate</h2>
        <ol class="standings">${rows
      .map((p, i) => `<li class="${p.id === 'me' ? 'me' : ''} ${i === 0 ? 'first' : ''}" style="--c:${p.color}"><span class="pos">${i + 1}</span><span class="name"><i></i>${p.name}</span><span></span><b>${distances[p.id].toFixed(2)} m</b></li>`)
      .join('')}</ol>
        <button class="primary next">Ver resultado${icon('next')}</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => showResults(match, distances));
  app.append(overlay);
}

// ---------- resultados ----------

async function showResults(match, tiebreak = {}) {
  let result;
  try {
    result = await match.service.finish(match, tiebreak);
  } catch {
    return alertMsg('No se ha podido cerrar la partida. Prueba otra vez.');
  }
  const won = result.me.position === 1 || result.me.payout > 0;
  const tiebreakWon = won && tiebreak.me !== undefined;
  const gained = progress.recordMatch({ position: result.me.position, won, entryFee: match.tier.entryFee, holes: match.myHoles.filter(Boolean), tiebreakWon });
  screen = 'lobby';
  showEndOverlay({
    onRematch: () => startMatch(match.tier),
    won,
    position: result.me.position,
    total: PLAYERS_PER_MATCH,
    prize: match.tier.entryFee ? (won ? `Premio ${coin(result.me.payout)}` : `Bote ${coin(result.pot)} para el ganador`) : 'Partida de práctica',
    ranking: result.ranking,
    legal: match.tier.entryFee ? `Bote ${fmt(result.pot)} · comisión ${fmt(result.commission)} · premio ${fmt(result.prize)}` : '',
    holes: match.myHoles.filter(Boolean),
    gained,
  });
}

// Final de partida: 1) resultado con XP y aviso de recompensas, sobre el propio juego;
// 2) recompensas, ya fuera del juego, al salir hacia el menú; 3) menú principal.
let rewardsOpen = false;

async function claimRewards() {
  const list = progress.claimable;
  if (!list.length || rewardsOpen) return;
  rewardsOpen = true;
  try {
    await showSkinReveal(list, { progress });
    list.forEach((sk) => progress.claim(sk.id));
  } finally {
    rewardsOpen = false;
  }
}

function showEndOverlay({ won, position, total, prize, ranking, legal, holes, gained, onRematch }) {
  app.querySelector('.overlay')?.remove();
  const levelUp = gained.level.level > gained.levelBefore;
  const pending = progress.claimable.length;
  const overlay = h(`
    <div class="overlay end-overlay">
      <div class="card end-card ${won ? 'good' : ''}">
        <div class="trophy">${won ? 'Victoria' : `Puesto #${position}`}</div>
        <h2 class="score-title">${won ? '¡Has ganado!' : `Posición ${position} de ${total}`}</h2>
        <p class="sub">${prize}</p>
        <div class="xp-card">
          <div class="xp-head"><b>+${gained.xp} XP</b><span>${levelUp ? `¡Nivel ${gained.level.level}!` : `Nivel ${gained.level.level}`}</span></div>
          <span class="bar"><i style="--to:${(gained.level.into / gained.level.need) * 100}%"></i></span>
        </div>
        ${prestigeNote(gained)}
        ${pending ? `<p class="reward-note"><i></i>${pending === 1 ? 'Tienes 1 recompensa por reclamar' : `Tienes ${pending} recompensas por reclamar`}</p>` : ''}
        ${statsGrid(holes)}
        ${standingsTable(ranking, true)}
        ${legal ? `<p class="legal">${legal}</p>` : ''}
        <div class="row">
          <button class="primary again">${icon('restart')}Revancha</button>
          <button class="ghost next">${pending ? `${icon('coins')}Reclamar y salir` : `${icon('back')}Salir`}</button>
        </div>
      </div>
    </div>`);
  overlay.querySelector('.again').addEventListener('click', (e) => {
    e.target.disabled = true;
    overlay.remove();
    onRematch();
  });
  overlay.querySelector('.next').addEventListener('click', () => showLobby());
  app.append(overlay);
  enterFinale();
  sfx.endJingle(won, position);
}

function statsGrid(holes) {
  if (!holes.length) return '';
  const strokes = holes.reduce((a, x) => a + x.strokes, 0);
  const diff = strokes - holes.reduce((a, x) => a + x.par, 0);
  const birdies = holes.filter((x) => x.strokes < x.par).length;
  const best = holes.reduce((a, x) => (x.strokes - x.par < a.strokes - a.par ? x : a));
  const cell = (k, v) => `<div><b>${v}</b><span>${k}</span></div>`;
  return `<div class="stats-grid">
    ${cell('Golpes', strokes)}
    ${cell('Vs par', diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff)}
    ${cell('Birdies', birdies)}
    ${cell('Mejor hoyo', scoreLabel(best.strokes, best.par).replace('¡', '').replace('!', ''))}
  </div>`;
}

// ---------- partidas en vivo contra jugadores reales ----------
//
// Al entrar en una mesa de pago se espera unos segundos en la sala a que entre
// más gente y la partida arranca a la vez para todos. Los huecos libres los
// ocupan bots (los mismos en todos los móviles) que nunca cuentan para el
// premio. Las bolas de los demás se ven en directo: llegan sus tiros por el
// canal en tiempo real y se repiten con la misma física. Los golpes que
// cuentan los sigue calculando el servidor.

const LIVE_BEAT_MS = 4000; // latido: estado de la partida (y "sigo conectado")
const LIVE_NEXT_S = 6; // pausa entre hoyos
const LIVE_GRACE_TICKS = 120 * 6; // margen tras acabarse el contador del hoyo
const LIVE_HOLE_CAP_MS = 150000; // como mucho se espera esto a los demás en un hoyo

let currentLive = null;

function stopLive() {
  const live = currentLive;
  if (!live) return;
  currentLive = null;
  live.stopped = true;
  clearTimeout(live.beat);
  clearInterval(live.timer);
  live.room?.close();
  // salir a mitad de partida cuenta como abandono (lo que falte, con el máximo)
  if (!live.finished) backend.tournaments.leave(live.match).catch(() => { });
}

const liveNow = (match) => Date.now() + (match.clockOffset ?? 0);

async function startTournament(tier, rematchOf = null) {
  stopLive();
  let match;
  try {
    // revancha: el servidor junta en la misma sala a quienes la piden; si ya no vale, mesa normal
    match = await backend.tournaments.join(tier, TIERS, rematchOf).catch((e) => {
      if (e.code === 'rematch_invalid') return backend.tournaments.join(tier, TIERS);
      throw e;
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) return showAccount('', 'wallet');
    if (e.blocked) {
      backend.account?.load().catch(() => { });
      return showBlocked(e.code);
    }
    console.error('join_tournament', e);
    return alertMsg(`No se ha podido entrar en la partida. Prueba otra vez.${esc(errorRef(e))}`);
  }
  enterLive(match);
}

/** Entra en una partida: a la sala si aún no ha empezado, o al hoyo por el que vas. */
function enterLive(match) {
  stopLive();
  const live = { match, botScores: [], finished: false, hole: -1 };
  currentLive = live;
  const beat = async () => {
    if (live.stopped) return;
    try {
      await backend.tournaments.status(match);
    } catch { }
    if (live.stopped) return;
    live.onStatus?.();
    live.beat = setTimeout(beat, live.fast ? 1500 : LIVE_BEAT_MS);
  };
  live.beat = setTimeout(beat, 1500);
  if (match.me.finished) return showLiveResults(live);
  if (match.me.started || !match.startsAt || liveNow(match) >= match.startsAt) return beginLive(live);
  showLiveRoom(live);
}

function seatHtml(p) {
  if (!p) return '<span>…</span>';
  return `<span class="avatar">${esc(p.name[0])}</span><span>${esc(p.name)}</span>${p.isBot ? '<em class="bot-tag">BOT</em>' : ''}`;
}

function showLiveRoom(live) {
  const { match } = live;
  const { tier } = match;
  live.fast = true;
  const view = h(`
    <main class="screen matchmaking live-room tier--${tier.id}">
      <div class="radar"><span></span><span></span><span></span>${ball(progress.skin, 64)}</div>
      <h1>${icon('hourglass')} ${tier.name} · en vivo</h1>
      <p class="sub count"></p>
      <div class="seats"></div>
      ${match.rematchOf ? '<p class="legal">Revancha: quienes pidan revancha como tú entrarán juntos en esta sala.</p>' : ''}
      <p class="legal">Empezáis todos a la vez y verás las bolas de los demás en directo. Los huecos libres los ocupan bots: juegan contigo, pero nunca cuentan para el premio (el bote es solo de los jugadores reales). Si no entra nadie más, juegas contra bots y se te devuelve la entrada.</p>
      <button class="ghost cancel">${icon('close')}Salir y recuperar entrada</button>
    </main>`);
  const seats = view.querySelector('.seats');
  let launching = false;
  const render = () => {
    const n = match.players.length;
    const secs = match.startsAt ? Math.max(0, Math.ceil((match.startsAt - liveNow(match)) / 1000)) : 0;
    view.querySelector('.count').innerHTML = launching
      ? 'Rellenando los huecos con bots…'
      : `${n}/${match.seats} jugadores · empieza en <b>${secs} s</b> · bote ${coin(tier.entryFee * n)}`;
    if (launching) return;
    seats.innerHTML = '';
    for (let i = 0; i < match.seats; i++) {
      const p = match.players.find((q) => q.seat === i);
      const s = h(`<div class="seat">${seatHtml(p && { name: p.id === 'me' ? 'Tú' : p.name })}</div>`);
      if (p) {
        s.classList.add('filled', ...(p.id === 'me' ? ['me'] : []));
        s.style.setProperty('--c', p.color);
      }
      seats.append(s);
    }
  };
  let count = match.players.length;
  live.onStatus = () => {
    if (!view.isConnected || launching) return;
    if (match.players.length > count) sfx.tick();
    count = match.players.length;
    render();
  };
  const launch = async () => {
    launching = true;
    clearInterval(live.timer);
    view.querySelector('.cancel').disabled = true;
    try {
      await backend.tournaments.status(match);
    } catch { }
    if (live.stopped) return;
    live.roster = buildRoster(match);
    render();
    for (const r of live.roster) {
      if (!r.isBot) continue;
      const s = seats.children[r.seat];
      if (!s) continue;
      await wait(140);
      s.classList.add('filled', 'bot');
      s.style.setProperty('--c', r.color);
      s.innerHTML = seatHtml(r);
      sfx.tick();
    }
    try {
      await backend.tournaments.start(match);
    } catch {
      if (live.stopped) return;
      return retryMsg('No se ha podido empezar la partida.', launch);
    }
    await wait(500);
    if (!live.stopped) beginLive(live);
  };
  live.timer = setInterval(() => {
    if (!view.isConnected) return clearInterval(live.timer);
    render();
    if (!launching && match.startsAt && liveNow(match) >= match.startsAt) launch();
  }, 250);
  view.querySelector('.cancel').addEventListener('click', async (e) => {
    e.target.disabled = true;
    clearInterval(live.timer);
    live.finished = true;
    await backend.tournaments.leave(match).catch(() => { });
    showLobby();
  });
  render();
  shell(view, { nav: false });
}

async function beginLive(live) {
  const { match } = live;
  live.fast = false;
  live.onStatus = null;
  // volviendo a una partida que ya arrancó sin haber pulsado nada
  if (!match.me.started) await backend.tournaments.start(match).catch(() => { });
  if (live.stopped) return;
  live.roster ??= buildRoster(match);
  const others = live.roster.filter((r) => !r.isBot && r.id !== 'me').map((r) => r.seat);
  live.room ??= new LiveRoom(backend.db, match.id, match.me.seat, others);
  live.room.onDone = (_seat, hole, final) => {
    if (hole === live.hole && final.sunk) live.game?.noteRemoteSunk(final.sunkTick);
    live.check?.();
  };
  const i = match.me.holesPlayed;
  if (i < match.holes) playLiveHole(live, i);
  else liveAfterRound(live);
}

function playLiveHole(live, index) {
  const { match } = live;
  app.querySelector('.overlay')?.remove();
  const course = COURSES[match.courses[index]];
  live.hole = index;
  live.game = null;
  live.check = null;
  const me = live.roster.find((r) => r.id === 'me');
  const rivals = live.roster
    .filter((r) => r.id !== 'me')
    .map((r) => (r.isBot ? { ...r, rng: seededRng(`${match.id}:${index}:${r.seat}`) } : { ...r, remote: live.room.feed(r.seat, index) }));
  playScreen(match, {
    course,
    title: `Hoyo ${index + 1}/${match.holes}`,
    subtitle: `${match.tier.name} · en vivo`,
    players: [me, ...rivals],
    rivals,
    live: true,
    timeLimit: match.timeLimit,
    onGame: (g, ui) => {
      live.game = g;
      live.ui = ui;
      // si alguien ya embocó antes de que cargara este hoyo, su contador ya corre
      for (const r of rivals) if (r.remote?.final?.sunk) g.noteRemoteSunk(r.remote.final.sunkTick);
    },
    onShots: (shots) => live.room.sendShots(index, shots),
    onDone: (g, strokes) => {
      live.room.sendDone(index, { shots: g.shots, strokes, sunk: g.sunk, sunkTick: g.sunkTick, dq: g.timedOut });
      submitOnline(match, index, g, (r) => waitLiveHole(live, index, course, r));
    },
  });
}

async function submitOnline(match, hole, g, then) {
  const { shots, aim, endTick } = g;
  try {
    then(await backend.tournaments.submitHole(match, hole, shots, aim, endTick));
  } catch (e) {
    if (currentLive?.match !== match) return;
    if (e.code === 'invalid_shots') return alertMsg('El servidor no ha podido validar los golpes de este hoyo.');
    if (['time_up', 'match_closed', 'wrong_hole', 'match_not_found'].includes(e.code)) return showLiveResults(currentLive);
    retryMsg(`Se ha perdido la conexión con el servidor. Tus golpes siguen guardados en este ${DEVICE}.`, () => submitOnline(match, hole, { shots, aim, endTick }, then));
  }
}

/**
 * Ya has terminado el hoyo: sigues viendo cómo juegan los demás hasta que
 * acaben todos los jugadores reales, se acabe el contador o pase demasiado
 * tiempo (quien se desconecta no bloquea a nadie).
 */
function waitLiveHole(live, index, course, result) {
  if (live.stopped || live.hole !== index) return;
  const { match } = live;
  const g = live.game;
  const since = Date.now();
  const panel = h('<div class="live-wait"><b>Esperando a los demás…</b><small></small></div>');
  live.ui?.view?.append(panel);
  const pending = () =>
    live.roster.filter((r) => {
      if (r.isBot || r.id === 'me') return false;
      const p = match.players.find((q) => q.id === r.id);
      if (!p || p.finished || !p.online || p.holesPlayed > index) return false;
      return !live.room.feed(r.seat, index).final;
    });
  let closed = false;
  const check = () => {
    if (closed || live.stopped || live.hole !== index) return;
    const left = pending();
    const secs = g?.deadlineTick != null ? Math.max(0, Math.ceil((g.deadlineTick - g.tick) / 120)) : null;
    const timeUp = g?.deadlineTick != null && g.tick > g.deadlineTick + LIVE_GRACE_TICKS;
    if (left.length && !timeUp && Date.now() - since < LIVE_HOLE_CAP_MS) {
      panel.querySelector('b').textContent = `Esperando a ${left.map((r) => r.name).join(', ')}`;
      panel.querySelector('small').textContent = secs != null ? (secs > 0 ? `${secs} s para que acabe el hoyo` : 'Se acabó el tiempo') : 'Mira cómo juegan en directo';
      return;
    }
    closed = true;
    clearInterval(iv);
    panel.remove();
    finishLiveHole(live, index, course, result);
  };
  live.check = check;
  live.onStatus = check;
  const iv = setInterval(check, 500);
  check();
}

async function finishLiveHole(live, index, course, result) {
  const { match } = live;
  live.check = null;
  live.onStatus = null;
  live.botScores[index] = live.game ? live.game.finishBots() : {};
  try {
    await backend.tournaments.status(match);
  } catch { }
  if (live.stopped || live.hole !== index) return;
  if (match.status !== 'open') return showLiveResults(live);
  const last = index + 1 >= match.holes;
  const standings = liveStandings(match, live.roster, live.botScores);
  const overlay = h(`
    <div class="overlay">
      <div class="card ${!result.timedOut && result.strokes <= course.par ? 'good' : ''}">
        ${holeHeader(result.strokes, course.par, result.timedOut)}
        ${standingsTable(standings)}
        <p class="legal">Los bots no cuentan para el premio.</p>
        <button class="primary next">${last ? 'Ver resultado' : 'Siguiente hoyo'}${icon('next')} <span class="secs">${LIVE_NEXT_S}</span></button>
      </div>
    </div>`);
  let left = LIVE_NEXT_S;
  const go = () => {
    clearInterval(live.timer);
    if (live.stopped || live.hole !== index || !overlay.isConnected) return;
    if (last) liveAfterRound(live);
    else playLiveHole(live, index + 1);
  };
  overlay.querySelector('.next').addEventListener('click', go);
  app.querySelector('.overlay')?.remove();
  app.append(overlay);
  clearInterval(live.timer);
  live.timer = setInterval(() => {
    left--;
    const el = overlay.querySelector('.secs');
    if (el) el.textContent = left;
    if (left <= 0) go();
  }, 1000);
}

/** Tras el último hoyo: desempate si empatas en cabeza con otro jugador real; si no, has terminado. */
async function liveAfterRound(live) {
  const { match } = live;
  app.querySelector('.overlay')?.remove();
  const tied = humanLeaders(match.players, match.holes);
  if (tied.length >= 2 && tied.some((p) => p.id === 'me')) return liveTiebreak(live, tied);
  live.finished = true;
  try {
    await backend.tournaments.finish(match);
  } catch { }
  showLiveResults(live);
}

function liveTiebreak(live, tied) {
  const { match } = live;
  const names = tied.map((p) => (p.id === 'me' ? 'Tú' : esc(p.name)));
  const overlay = h(`
    <div class="overlay">
      <div class="card tiebreak-card">
        <div class="vs">${tied.map((p) => `<span class="avatar" style="--c:${p.color}">${esc((p.id === 'me' ? 'Tú' : p.name)[0])}</span>`).join('<em>VS</em>')}</div>
        <h2 class="score-title">¡Empate a ${tied[0].total}!</h2>
        <p class="sub">${names.join(', ')} vais al desempate. Hoyo sin agujero: un solo tiro y gana quien deje la bola más cerca de la diana.</p>
        <button class="primary next">Jugar desempate${icon('next')}</button>
      </div>
    </div>`);
  const play = () => {
    clearTimeout(auto);
    if (live.stopped || !overlay.isConnected) return;
    const hole = match.holes;
    live.hole = hole;
    const me = live.roster.find((r) => r.id === 'me');
    const rivals = tied
      .filter((p) => p.id !== 'me')
      .map((p) => live.roster.find((r) => r.id === p.id))
      .filter(Boolean)
      .map((r) => ({ ...r, remote: live.room.feed(r.seat, hole) }));
    playScreen(match, {
      course: TIEBREAK_COURSE,
      title: 'Desempate',
      subtitle: 'Un tiro',
      players: [me, ...rivals],
      rivals,
      live: true,
      onGame: (g, ui) => {
        live.game = g;
        live.ui = ui;
      },
      onShots: (shots) => live.room.sendShots(hole, shots),
      onDone: (g, _strokes, banner) => {
        live.room.sendDone(hole, { shots: g.shots, strokes: 1, sunk: false, dq: false });
        submitOnline(match, hole, g, (r) => {
          live.finished = true;
          banner(`${r.distance.toFixed(2)} m`);
          setTimeout(() => showLiveResults(live), 1800);
        });
      },
    });
  };
  const auto = setTimeout(play, 5000);
  overlay.querySelector('.next').addEventListener('click', play);
  app.append(overlay);
}

function recordOnce(match, rows) {
  const KEY = 'gcb.tournaments.recorded';
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch { }
  if (seen.includes(match.id)) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify([match.id, ...seen].slice(0, 50)));
  } catch { }
  const me = match.me;
  // solo bots (se devolvió la entrada): cuenta como una partida de práctica
  const cancelled = match.status === 'cancelled';
  const mine = rows.find((r) => r.id === 'me');
  const position = cancelled ? mine?.position ?? 1 : me.position ?? match.players.length;
  const won = cancelled ? position === 1 : me.position === 1 || me.payout > 0;
  const leaders = match.players.filter((p) => p.total === me.total).length;
  return progress.recordMatch({
    position,
    won,
    entryFee: cancelled ? 0 : match.tier.entryFee,
    holes: me.scores.map((strokes, i) => ({ strokes, par: COURSES[match.courses[i]].par })),
    tiebreakWon: !cancelled && won && leaders > 1,
  });
}

/** Clasificación final: jugadores reales por su puesto y, aparte, los bots (sin puesto ni premio). */
function liveRanking(live) {
  const { match } = live;
  const all = liveStandings(match, live.roster ?? buildRoster(match), live.botScores);
  const humans = all
    .filter((r) => !r.isBot)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.total - b.total)
    .map((r) => ({ ...r, position: match.status === 'settled' ? match.players.find((p) => p.id === r.id)?.position : r.position }));
  const bots = all.filter((r) => r.isBot).map((r) => ({ ...r, position: '–' }));
  return { all, humans, rows: [...humans, ...bots] };
}

async function showLiveResults(live) {
  if (!live || live.stopped) return showLobby();
  const { match } = live;
  live.finished = true;
  live.check = null;
  live.onStatus = null;
  clearInterval(live.timer);
  app.querySelector('.overlay')?.remove();
  try {
    // si llegas aquí sin haber cerrado tu ronda en el servidor (p. ej. te rechazó un
    // hoyo), ciérrala: si no, tu latido la tendría abierta y nadie cobraría hasta que salieras
    if (match.status === 'open' && !match.me.finished) await backend.tournaments.finish(match);
    else await backend.tournaments.status(match);
  } catch { }
  if (live.stopped) return;
  screen = 'lobby';
  const { me, tier } = match;
  const open = match.status === 'open';
  const cancelled = match.status === 'cancelled';
  const { all, rows } = liveRanking(live);
  if (!open) {
    const gained = recordOnce(match, all);
    if (gained) {
      const mine = all.find((r) => r.id === 'me');
      const won = cancelled ? mine?.position === 1 : me.position === 1 || me.payout > 0;
      showEndOverlay({
        onRematch: () => startMatch(tier, match.id),
        won,
        position: cancelled ? mine?.position ?? 1 : me.position,
        total: cancelled ? all.length : match.players.length,
        prize: cancelled ? 'Solo jugaron bots: te hemos devuelto la entrada' : won ? `Premio ${coin(me.payout)}` : `Bote ${coin(match.pot)} para el ganador`,
        ranking: rows,
        legal: cancelled ? 'Los bots no cuentan para el premio.' : `Bote ${fmt(match.pot)} · comisión ${fmt(match.commission)} · premio ${fmt(match.prize)} · los bots no cuentan`,
        holes: me.scores.map((strokes, i) => ({ strokes, par: COURSES[match.courses[i]].par })),
        gained,
      });
      stopLive();
      if (won && !cancelled) sfx.coins();
      return;
    }
  }
  const won = !open && !cancelled && (me.position === 1 || me.payout > 0);
  const waiting = match.players.filter((p) => !p.finished && p.online);
  let title, sub;
  if (open) {
    title = 'Esperando a los demás';
    sub = waiting.length ? `Están terminando: ${waiting.map((p) => esc(p.name)).join(', ')}` : 'Cerrando la partida…';
  } else if (cancelled) {
    title = 'Solo jugaron bots';
    sub = 'Te hemos devuelto la entrada';
  } else {
    title = won ? '¡Has ganado!' : `Posición ${me.position} de ${match.players.length}`;
    sub = won ? `Premio ${coin(me.payout)}` : `Bote ${coin(match.pot)} para el ganador`;
  }
  const view = h(`
    <main class="screen results ${won ? 'won' : ''}">
      ${won ? '<div class="rays"></div>' : ''}
      <div class="trophy">${open ? icon('hourglass') : won ? icon('trophy') : ''}${open ? 'En espera' : won ? 'Victoria' : cancelled ? 'Devuelto' : `Puesto #${me.position}`}</div>
      <h1 class="score-title">${title}</h1>
      <p class="sub">${sub}</p>
      ${standingsTable(rows, !open)}
      ${match.status === 'settled' ? `<p class="legal">Bote ${fmt(match.pot)} · comisión ${fmt(match.commission)} · premio ${fmt(match.prize)} · los bots no cuentan</p>` : ''}
      ${open ? '<p class="legal">Si alguien se ha desconectado, en menos de un minuto se le da por terminado. Si sales, el premio te llega igual al saldo.</p>' : ''}
      <div class="row">
        ${open ? '' : `<button class="primary again">${icon('restart')}Revancha</button>`}
        <button class="${open ? 'primary' : 'ghost'}" data-go="lobby">${icon('back')}Lobby</button>
      </div>
    </main>`);
  view.querySelector('.again')?.addEventListener('click', () => startMatch(tier, match.id));
  const key = `${match.status}:${waiting.length}`;
  await shell(view, { nav: false });
  if (!open) return stopLive();
  live.fast = true;
  live.onStatus = () => {
    if (!view.isConnected) return;
    const now = `${match.status}:${match.players.filter((p) => !p.finished && p.online).length}`;
    if (now !== key) showLiveResults(live);
  };
}

function retryMsg(text, retry) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>Sin conexión</h2>
        <p class="sub">${text}</p>
        <button class="primary">${icon('restart')}Reintentar</button>
      </div>
    </div>`);
  overlay.querySelector('button').addEventListener('click', () => {
    overlay.remove();
    retry();
  });
  app.append(overlay);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function alertMsg(text) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>Ups</h2>
        <p class="sub">${text}</p>
        <button class="primary">${icon('back')}Volver al lobby</button>
      </div>
    </div>`);
  overlay.querySelector('button').addEventListener('click', () => showLobby());
  app.append(overlay);
}

// ---------- juego libre en solitario ----------

const THEME_INFO = {
  meadow: { name: 'Pradera', icon: '', color: '#5cc24a' },
  meadowDay: { name: 'Pradera de Día', icon: '', color: '#6fd24f' },
  beach: { name: 'Playa', icon: '', color: '#2fe0ff' },
  sunset: { name: 'Atardecer', icon: '', color: '#ff9a5c' },
  snow: { name: 'Nieve', icon: '', color: '#90d7ff' },
  glacier: { name: 'Glaciar', icon: '', color: '#9fd6ee' },
  canyon: { name: 'Cañón', icon: '', color: '#e58f4a' },
  autumn: { name: 'Otoño', icon: '', color: '#e06b3a' },
  night: { name: 'Noche', icon: '', color: '#7a8bff' },
  gardenNight: { name: 'Jardín Nocturno', icon: '', color: '#da70d6' },
  volcano: { name: 'Volcán', icon: '', color: '#ff4d2e' },
  beachNight: { name: 'Playa Nocturna', icon: '', color: '#00d2be' },
  neon: { name: 'Neón Cyberpunk', icon: '', color: '#00e5ff' },
  neonPink: { name: 'Neón Magenta', icon: '', color: '#ff2e93' },
};

function getCourseFeatures(c) {
  const feats = [];
  if (c.loops?.length) feats.push('Looping');
  if (c.windmills?.length) feats.push('Molino');
  if (c.portals?.length) {
    if (c.portals.some((p) => p.tube)) feats.push('Tubos');
    else feats.push('Portales');
  }
  if (c.tunnels?.length) feats.push('Pasadizo');
  if (c.boosts?.length) feats.push('Acelerador');
  if (c.mounds?.length) feats.push('Volcán');
  if (c.slopes?.length) feats.push('Pendiente');
  if (c.movers?.length) feats.push('Bloques');
  if (c.spinners?.length) feats.push('Aspas');
  if (c.bumpers?.length) feats.push('Setas');
  if (c.ice?.length) feats.push('Hielo');
  if (c.sand?.length) feats.push('Arena');
  return feats;
}

export async function showFreePlayCourseSelect() {
  screen = 'freeplay';
  const view = h(`
    <main class="screen freeplay-select">
      <div class="freeplay-select-hero">
        <div class="freeplay-select-badge-row">
          <span class="rarity-pill rarity-epic">Modo Práctica Libre</span>
          <span class="hero-level-tag">${COURSES.length} Hoyos</span>
        </div>
        <div class="section-title-row">
          <h1>Selector de Mapas</h1>
          <span class="live-pill solo-live-pill"><i class="pulse-dot"></i> EN SOLITARIO</span>
        </div>
        <p class="freeplay-desc">Elige cualquier hoyo para entrenar a tu propio ritmo. Sin límite de tiempo, sin desafíos ni misiones y sin oponentes.</p>
        <div class="freeplay-features-bar">
          <span class="spec-chip">Sin límite de tiempo</span>
          <span class="spec-chip">Sin rivales</span>
          <span class="spec-chip">Tiros ilimitados</span>
          <span class="spec-chip">Reinicio rápido [R]</span>
        </div>
      </div>

      <div class="courses-grid"></div>

      <div class="freeplay-footer-actions">
        <button class="ghost back-to-lobby" data-go="lobby">${icon('back')}Volver al Menú Principal</button>
      </div>
    </main>
  `);

  const grid = view.querySelector('.courses-grid');
  COURSES.forEach((course, idx) => {
    const theme = THEME_INFO[course.theme] || { name: course.theme, icon: '', color: '#00f076' };
    const feats = getCourseFeatures(course);
    const dist = getCourseDistance(course);
    const card = h(`
      <div class="course-card holo theme--${course.theme}">
        <div class="course-card-top">
          <span class="course-num-badge">Hoyo ${idx + 1}</span>
          <span class="course-theme-tag" style="--accent:${theme.color}">
            ${theme.name}
          </span>
          <span class="course-par-badge">Par ${course.par}</span>
        </div>
        <div class="course-card-preview-wrap" style="--accent:${theme.color}" title="Haga clic para jugar el Hoyo ${idx + 1}">
          <div class="course-preview-media">
            <img class="course-preview-img" src="${staticCoursePreview(course) ?? ''}" alt="Vista previa de ${course.name}" loading="lazy" />
            <div class="course-preview-glow"></div>
            <div class="course-preview-badges">
              <span class="preview-badge dist-badge">~${dist}m</span>
              ${feats[0] ? `<span class="preview-badge feat-badge">${feats[0]}</span>` : ''}
            </div>
            <div class="course-preview-action-overlay">
              <span class="preview-play-icon">${icon('play')}</span>
              <span class="preview-play-text">Entrenar Hoyo ${idx + 1}</span>
            </div>
          </div>
        </div>
        <div class="course-card-body">
          <h3 class="course-name">${course.name}</h3>
          ${course.tip ? `<p class="course-tip">${course.tip}</p>` : ''}
          ${feats.length ? `<div class="course-feats">${feats.map((f) => `<span class="feat-tag">${f}</span>`).join('')}</div>` : ''}
        </div>
        <button class="primary play-course-btn">${icon('play')}Jugar Hoyo ${idx + 1}</button>
      </div>
    `);
    const launchPlay = () => playFreePlay(idx);
    card.querySelector('.play-course-btn').addEventListener('click', launchPlay);
    card.querySelector('.course-card-preview-wrap').addEventListener('click', launchPlay);
    grid.append(card);
  });

  const tbTheme = THEME_INFO[TIEBREAK_COURSE.theme] || { name: 'Atardecer', icon: '', color: '#ff9a5c' };
  const tbDist = getCourseDistance(TIEBREAK_COURSE);
  const tbCard = h(`
    <div class="course-card holo course-card-extra theme--${TIEBREAK_COURSE.theme}">
      <div class="course-card-top">
        <span class="course-num-badge extra">Extra</span>
        <span class="course-theme-tag" style="--accent:${tbTheme.color}">
          ${tbTheme.name}
        </span>
        <span class="course-par-badge">Diana</span>
      </div>
      <div class="course-card-preview-wrap" style="--accent:${tbTheme.color}" title="Haga clic para jugar el Desempate">
        <div class="course-preview-media">
          <img class="course-preview-img" src="${staticCoursePreview(TIEBREAK_COURSE) ?? ''}" alt="Vista previa de Desempate" loading="lazy" />
          <div class="course-preview-glow"></div>
          <div class="course-preview-badges">
            <span class="preview-badge dist-badge">~${tbDist}m</span>
            <span class="preview-badge feat-badge">Diana</span>
          </div>
          <div class="course-preview-action-overlay">
            <span class="preview-play-icon">${icon('play')}</span>
            <span class="preview-play-text">Entrenar Desempate</span>
          </div>
        </div>
      </div>
      <div class="course-card-body">
        <h3 class="course-name">Desempate: Diana</h3>
        <p class="course-tip">Un solo tiro al objetivo: afina la precisión al centro de la diana sin agujero.</p>
        <div class="course-feats">
          <span class="feat-tag">Diana de precisión</span>
          <span class="feat-tag">Muerte súbita</span>
        </div>
      </div>
      <button class="primary play-course-btn">${icon('play')}Jugar Desempate</button>
    </div>
  `);
  const launchTbPlay = () => playFreePlay('tiebreak');
  tbCard.querySelector('.play-course-btn').addEventListener('click', launchTbPlay);
  tbCard.querySelector('.course-card-preview-wrap').addEventListener('click', launchTbPlay);
  grid.append(tbCard);
  // mapas sin WebP pre-renderizado: se renderizan con three.js (import() solo si hace falta)
  const missing = [...COURSES, TIEBREAK_COURSE].filter((c) => !staticCoursePreview(c));
  if (missing.length) {
    import('./game/render/coursePreview.js').then(({ getCoursePreview }) => {
      const imgs = view.querySelectorAll('.course-preview-img');
      [...COURSES, TIEBREAK_COURSE].forEach((c, i) => {
        if (!staticCoursePreview(c) && imgs[i]) imgs[i].src = getCoursePreview(c);
      });
    });
  }

  await shell(view);
}

export function playFreePlay(courseIndex) {
  screen = 'freeplay-game';
  const isTiebreak = courseIndex === 'tiebreak';
  const course = isTiebreak ? TIEBREAK_COURSE : COURSES[courseIndex];
  const holeNum = isTiebreak ? 'Extra' : courseIndex + 1;
  const totalHoles = COURSES.length;

  playScreen(null, {
    course,
    freePlay: true,
    title: isTiebreak ? 'Desempate' : `Hoyo ${holeNum}/${totalHoles}`,
    subtitle: isTiebreak ? 'Práctica de Precisión' : `Modo Libre · Hoyo ${holeNum}`,
    players: [{ id: 'me', name: 'Tú', color: '#00f076', isBot: false }],
    timeLimit: null,
    onRestartHole: () => playFreePlay(courseIndex),
    onSelectMap: () => showFreePlayCourseSelect(),
    onDone: (_g, strokes, _banner) => {
      showFreePlayHoleResult(courseIndex, course, strokes);
    },
  });
}

export function showFreePlayHoleResult(courseIndex, course, strokes) {
  const isTiebreak = courseIndex === 'tiebreak';
  const parDiff = strokes - course.par;
  const scoreName = scoreLabel(strokes, course.par);
  const nextIndex = typeof courseIndex === 'number' && courseIndex + 1 < COURSES.length ? courseIndex + 1 : null;
  const isGood = strokes <= course.par;

  const overlay = h(`
    <div class="overlay freeplay-result-overlay">
      <div class="card freeplay-result-card ${isGood ? 'good' : ''}">
        <div class="freeplay-result-badge">HOYO COMPLETADO · MODO LIBRE</div>
        <h2 class="score-title">${scoreName}</h2>
        <p class="sub">${course.name} · ${strokes} golpe${strokes === 1 ? '' : 's'} · Par ${course.par}</p>
        
        <div class="freeplay-stats-box">
          <div class="stat-item">
            <span class="stat-label">Golpes</span>
            <strong class="stat-val">${strokes}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Par del Hoyo</span>
            <strong class="stat-val">${course.par}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Balance</span>
            <strong class="stat-val ${parDiff <= 0 ? 'good' : ''}">${parDiff === 0 ? 'Par (E)' : parDiff < 0 ? `${parDiff}` : `+${parDiff}`}</strong>
          </div>
        </div>

        <div class="freeplay-actions">
          <button class="primary retry-btn">${icon('restart')}Repetir este hoyo</button>
          ${nextIndex != null ? `<button class="primary next-btn">Siguiente hoyo (${nextIndex + 1})${icon('next')}</button>` : ''}
          <button class="secondary select-map-btn">${icon('map')}Elegir otro mapa</button>
          <button class="ghost to-lobby-btn">${icon('back')}Lobby principal</button>
        </div>
      </div>
    </div>
  `);

  overlay.querySelector('.retry-btn').addEventListener('click', () => {
    overlay.remove();
    playFreePlay(courseIndex);
  });
  if (nextIndex != null) {
    overlay.querySelector('.next-btn').addEventListener('click', () => {
      overlay.remove();
      playFreePlay(nextIndex);
    });
  }
  overlay.querySelector('.select-map-btn').addEventListener('click', () => {
    overlay.remove();
    showFreePlayCourseSelect();
  });
  overlay.querySelector('.to-lobby-btn').addEventListener('click', () => {
    overlay.remove();
    showLobby();
  });

  app.append(overlay);
  sfx.cup();
}

installThumbObserver(app, (id) => progress.instance(id));
let skinLab = false;
try {
  skinLab = new URLSearchParams(location.search).get('skinlab') === '1';
} catch { }
if (skinLab) {
  app.innerHTML = '';
  loadSkinInspector().then(({ mountSkinLab }) => mountSkinLab(app));
} else {
  app.innerHTML = '<main class="screen loading"><h1>Golf Cash Battle</h1><p class="sub">Conectando…</p></main>';
  createBackend().then((b) => {
    if (b.mode === 'auth') {
      // sin sesión: pantallas de entrada. Al entrar se recarga para arrancar limpio con la cuenta
      mountAuth(app, b.auth, { recovery: b.recovery, guest: b.guest, onDone: () => location.replace(location.origin + location.pathname + location.hash) });
      return;
    }
    backend = b;
    ({ wallet, matches } = b);
    if (b.account) {
      avatar = new AvatarStore(b.user.id);
      avatar.onChange = (v) => b.account.setAvatar(toWire(v));
      avatar.hydrate(b.account.profile?.avatar);
      // ajustes: se suben un rato después del último cambio (los deslizadores cambian muchas veces)
      let settingsTimer = 0, settingsQueued = null;
      const sendSettings = () => {
        clearTimeout(settingsTimer);
        if (!settingsQueued) return;
        const v = settingsQueued;
        settingsQueued = null;
        b.account.setSettings(v).catch(() => { });
      };
      settings.onChange = (s) => {
        settingsQueued = s;
        clearTimeout(settingsTimer);
        settingsTimer = setTimeout(sendSettings, 800);
      };
      addEventListener('pagehide', sendSettings);
      settings.hydrate(b.account.profile?.settings, b.user.id);
      progress.attach(b.user.id, b.account.profile?.progress, (s) => b.account.saveProgress(s), (id) => b.account.setFrame(id));
      // hitos de ranking y marco elegido: pueden desbloquear bolas, que se ofrecen al acabar la próxima partida
      b.account.myRanking().then((r) => progress.setServerStats(r)).catch(() => {});
    }
    wallet.subscribe((n) => {
      const el = app.querySelector('.balance');
      if (el) el.innerHTML = `${coin(n)}<span class="plus">${icon('plus')}</span>`;
      const m = app.querySelector('.m-coins');
      if (m) m.innerHTML = coin(n);
    });
    showLobby();
  });
}
