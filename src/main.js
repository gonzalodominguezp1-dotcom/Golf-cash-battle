import './style.css';
import { HOLES_PER_MATCH, HOLE_TIME_LIMIT, MAX_STROKES_PER_HOLE, PLATFORM_COMMISSION, PLAYERS_PER_MATCH, TIERS, potFor, prizeFor } from './config.js';
import { LocalWallet } from './wallet/LocalWallet.js';
import { InsufficientFundsError } from './wallet/WalletService.js';
import { MatchService, leaders } from './match/MatchService.js';
import { createBackend } from './backend/index.js';
import { COURSES, TIEBREAK_COURSE } from './game/courses.js';
import { GolfGame } from './game/GolfGame.js';
import { Bot } from './game/bots.js';
import { segmentsOf } from './game/physics.js';
import { isMuted, setMuted, sfx, unlockAudio } from './game/audio.js';
import { Progress } from './progress/Progress.js';
import { CHALLENGES, TIERS as SKIN_TIERS, SKINS } from './progress/skins.js';
import { ballPreview } from './game/render/ballSkins.js';
import { createSkinInspector, isSkinLabRequested, mountSkinLab } from './ui/skinInspector.js';
import { hoverLoop, installThumbObserver, upgradeImg } from './ui/skinThumbs.js';
import { rarePatternOf, wearName } from './progress/inventory.js';
import { getCoursePreview, getCourseDistance } from './game/render/coursePreview.js';
import { QUALITY_LEVELS, QUALITY_NAMES, getQuality, setQuality } from './game/render/quality.js';

let backend, wallet, matches;
// práctica forzada con #hoyoN: siempre local, no toca el servidor
const practice = new MatchService(new LocalWallet(), Math.random, COURSES.length);
const progress = new Progress();

// clave nueva: quien silenció sin querer cuando no se oía nada vuelve a tener sonido
const MUTE_KEY = 'gcb.muted.v2';
try {
  setMuted(localStorage.getItem(MUTE_KEY) === '1');
} catch { }

// el audio solo puede arrancar con un gesto: cualquier toque o tecla vale
for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

// sonido suave en todos los botones
document.addEventListener('click', (e) => {
  if (!e.target.closest('button')) return;
  unlockAudio();
  sfx.tap();
});
const app = document.getElementById('app');

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const coin = (n) => `<span class="coin"></span>${fmt(n)}`;
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
// placeholder 2D al instante; installThumbObserver lo cambia por la miniatura 3D (data-skin-id)
const ball = (skin, size = 96, cls = '') => `<img class="ball-img ${cls}" src="${ballPreview(skin, size * 2)}" data-skin-id="${skin.id}" width="${size}" height="${size}" alt="">`;

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
            <button data-go="lobby" class="${screen === 'lobby' ? 'on' : ''}">Jugar <kbd>1</kbd></button>
            <button data-go="freeplay" class="${screen === 'freeplay' ? 'on' : ''}">Juego Libre <kbd>2</kbd></button>
            <button data-go="skins" class="${screen === 'skins' ? 'on' : ''}">Skins <kbd>3</kbd></button>
            <button data-go="wallet" class="${screen === 'wallet' ? 'on' : ''}">Wallet <kbd>4</kbd></button>
            <button data-go="account" class="${screen === 'account' ? 'on' : ''}">Cuenta <kbd>5</kbd></button>
          </nav>
        </div>
        <div class="topbar-right">
          <button class="balance" data-go="wallet" title="Tu saldo">${coin(balance)}<span class="plus">+</span></button>
          <button class="pill mute topbar-sound-btn" aria-label="Sonido" title="Silenciar / Activar sonido (M)">${isMuted() ? 'Mudo' : 'Sonido'}</button>
        </div>
      </header>`),
    );
    const topMute = app.querySelector('.topbar-sound-btn');
    if (topMute) {
      topMute.addEventListener('click', () => {
        setMuted(!isMuted());
        topMute.textContent = isMuted() ? 'Mudo' : 'Sonido';
        try { localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0'); } catch { }
      });
    }
  }
  app.append(content);
  if (!hideHeader && nav) {
    app.append(
      h(`
      <nav class="tabbar">
        <button data-go="lobby" class="${screen === 'lobby' ? 'on' : ''}">Jugar</button>
        <button data-go="freeplay" class="${screen === 'freeplay' ? 'on' : ''}">Libre</button>
        <button data-go="skins" class="${screen === 'skins' ? 'on' : ''}">Skins</button>
        <button data-go="wallet" class="${screen === 'wallet' ? 'on' : ''}">Wallet</button>
        <button data-go="account" class="${screen === 'account' ? 'on' : ''}">Cuenta</button>
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
  else if (isNum(4)) triggerNav('wallet');
  else if (isNum(5)) triggerNav('account');
  else if (e.code === 'KeyM') {
    setMuted(!isMuted());
    const topMute = document.querySelector('.topbar-sound-btn');
    if (topMute) topMute.textContent = isMuted() ? 'Mudo' : 'Sonido';
    try { localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0'); } catch { }
  }
});

function go(to) {
  if (to === 'wallet') return showWallet();
  if (to === 'skins') return showSkins();
  if (to === 'account') return showAccount();
  if (to === 'freeplay') return showFreePlayCourseSelect();
  return showLobby();
}

// cartas holográficas: se inclinan y el brillo sigue al dedo
function bindHolo(root) {
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
      ${backend.mode === 'local' ? '<p class="offline">Modo sin conexión: el saldo se guarda solo en este móvil</p>' : ''}
      ${backend.account?.profile?.paid_block ? `<button class="notice account-hint" data-go="account">${{ account_required: 'Guarda tu cuenta con email para jugar mesas con entrada →', kyc_required: 'Verifica tu edad e identidad para jugar mesas con entrada →', account_review: 'Tu cuenta está en revisión: de momento solo Práctica', underage: 'Mesas con entrada solo para mayores de 18' }[backend.account.profile.paid_block]}</button>` : ''}
      <div class="my-tournaments"></div>
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
      <p class="legal">Créditos de demostración sin valor real. ${backend.tournaments ? 'Las mesas de pago son torneos contra jugadores reales: cada uno juega los mismos hoyos a su ritmo y el servidor repite cada golpe para validarlo. La práctica es contra rivales simulados. ' : ''}El resultado depende solo de la habilidad: mismo campo para todos y sin elementos aleatorios. En empate, tiro de desempate: gana quien deje la bola más cerca. Comisión de la plataforma: ${Math.round(PLATFORM_COMMISSION * 100)}% del bote.</p>
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
    card.querySelector('.play').addEventListener('click', () => startMatch(tier));
    list.append(card);
  }
  await shell(view);
  if (backend.tournaments) showMyTournaments(view.querySelector('.my-tournaments'));
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
          ${FILTER_TIERS.map((id) => `<button type="button" class="sk-fchip rarity-${id}" data-tier="${id}"><i>${SKIN_TIERS[id].icon}</i>${SKIN_TIERS[id].name}</button>`).join('')}
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
    const float = open && inst ? Math.min(1, Math.max(0, inst.float ?? 0)) : null;
    const card = h(`
      <button type="button" class="sk-card holo rarity-${skin.tier} ${open ? '' : 'locked'}" data-skin-id="${skin.id}" style="--sk-a:${skin.palette.base};--sk-b:${skin.palette.accent}">
        <div class="shine"></div>
        <div class="sk-scene">
          <span class="sk-ico" title="${tier.name}">${tier.icon}</span>
          <span class="sk-eq">Equipada</span>
          <img class="sk-thumb" src="${ballPreview(skin, 152)}" width="76" height="76" alt="" draggable="false">
          ${open && inst?.counter?.enabled ? '<span class="sk-chip">Marcador</span>' : ''}
          ${rare ? '<span class="sk-chip sk-chip-rare">✦ Patrón raro</span>' : ''}
        </div>
        <div class="sk-strip">
          <b>${skin.name}</b>
          <small>${tier.name}${float !== null ? ` · ${wearName(float)}` : ''}</small>
          ${float !== null
    ? `<span class="sk-wear" title="Desgaste ${float.toFixed(3)}"><i style="width:${Math.max(3, float * 100)}%;background:hsl(${Math.round((1 - float) * 120)} 70% 50%)"></i></span>`
    : `<small class="req">${req.text}</small><span class="bar"><i style="width:${req.ratio * 100}%"></i></span>`}
        </div>
      </button>`);
    const img = card.querySelector('.sk-thumb');
    img.dataset.thumb = '1';
    jobs.push({ img, skin, inst, open });
    card.addEventListener('click', () => openInspect(skin, card));
    if (open) hoverLoop(card, img, skin, inst);
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
    const { overlay, inspector, onKey, from } = view3d;
    view3d = null;
    document.removeEventListener('keydown', onKey, true);
    try { inspector?.destroy(); } catch { }
    overlay.remove();
    document.body.classList.remove('sk-noscroll');
    if (from?.isConnected) from.focus({ preventScroll: true });
  };
  function openInspect(skin, from) {
    closeInspect();
    const tier = SKIN_TIERS[skin.tier];
    const overlay = h(`
      <div class="sk-view rarity-${skin.tier}" role="dialog" aria-modal="true" aria-label="Inspeccionar ${skin.name}">
        <div class="sk-view-bar">
          <button type="button" class="sk-view-back" aria-label="Cerrar inspección">‹ Skins</button>
          <span class="sk-view-title">${tier.icon} ${skin.name}</span>
        </div>
        <div class="sk-view-stage"></div>
        <div class="sk-view-actions">
          <div class="sk-view-req"></div>
          <button type="button" class="primary sk-equip"></button>
        </div>
      </div>`);
    document.body.append(overlay);
    document.body.classList.add('sk-noscroll');
    const equipBtn = overlay.querySelector('.sk-equip');
    const reqBox = overlay.querySelector('.sk-view-req');
    const syncAction = () => {
      const req = progress.requirement(skin);
      const open = req.ratio >= 1;
      const isEq = progress.skin.id === skin.id;
      equipBtn.disabled = isEq || !open;
      equipBtn.textContent = isEq ? '✓ Equipada' : open ? 'Equipar' : 'Bloqueada';
      reqBox.hidden = open;
      reqBox.innerHTML = open ? '' : `<small>${req.text}</small><span class="bar"><i style="width:${req.ratio * 100}%"></i></span>`;
    };
    syncAction();
    equipBtn.addEventListener('click', () => {
      if (progress.equip(skin.id)) {
        refreshEquipped();
        syncAction();
      }
    });
    overlay.querySelector('.sk-view-back').addEventListener('click', closeInspect);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeInspect();
    };
    document.addEventListener('keydown', onKey, true);
    let inspector = null;
    try {
      inspector = createSkinInspector(overlay.querySelector('.sk-view-stage'), { skin, instance: progress.instance(skin.id) ?? undefined, mode: 'fullscreen' });
    } catch (err) {
      console.warn('inspector no disponible', err);
    }
    view3d = { overlay, inspector, onKey, from };
    overlay.querySelector('.sk-view-back').focus({ preventScroll: true });
  }

  refreshEquipped();
  applyFilters();
  await shell(view);
  // shell() destruye el inspector anterior: el nuevo se registra después
  activeSkinInspector = { destroy: closeInspect };

  // miniaturas 3D progresivas: primero lo desbloqueado (la equipada, la primera), luego lo bloqueado
  const eqId = progress.skin.id;
  jobs.sort((a, b) => (b.open - a.open) || ((b.skin.id === eqId) - (a.skin.id === eqId)));
  for (const j of jobs) upgradeImg(j.img, j.skin, j.inst, { size: 76, priority: j.skin.id === eqId });
}

// ---------- cuenta ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const BLOCK_TEXT = {
  account_required: 'Para jugar con créditos necesitas una cuenta con email. Así no pierdes tu saldo si cambias de móvil.',
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
        ${code === 'account_required' || code === 'kyc_required' ? '<button class="primary go">Ir a mi cuenta</button>' : ''}
        <button class="ghost back">Volver</button>
      </div>
    </div>`);
  overlay.querySelector('.go')?.addEventListener('click', () => showAccount());
  overlay.querySelector('.back').addEventListener('click', () => overlay.remove());
  app.append(overlay);
}

async function showAccount(note = '') {
  screen = 'account';
  const account = backend.account;
  if (!account) {
    await shell(
      h(`<main class="screen account"><div class="section-head"><h1>Cuenta</h1></div>
        <p class="offline">Sin conexión con el servidor: las cuentas no están disponibles en este modo.</p></main>`),
    );
    return;
  }
  const p = await account.load().catch(() => account.profile);
  const guest = p.is_anonymous || !p.email_confirmed;
  const kyc = p.kyc_status;
  const name = p.username ?? 'Sin nombre';
  const lvl = progress.level;
  const unlockedSkins = SKINS.filter((s) => progress.isUnlocked(s)).length;
  const completedChallenges = CHALLENGES.filter((c) => progress.challenge(c.id).done).length;
  const view = h(`
    <main class="screen account">
      <div class="profile-card passport-card holo">
        <div class="shine"></div>
        <div class="passport-header">
          <div class="avatar-wrap">
            <span class="avatar big">${p.username ? esc(name[0]) : '?'}</span>
            <span class="avatar-lvl-badge">Nv.${lvl.level}</span>
          </div>
          <div class="passport-info">
            <div class="passport-tag-row">
              <span class="passport-status ${guest ? 'guest' : 'vip'}">${guest ? 'Pase Invitado' : 'Jugador Oficial'}</span>
              <span class="kyc-mini-pill ${kyc === 'verified' ? 'verified' : ''}">${KYC_TEXT[kyc]}</span>
            </div>
            <strong class="passport-name">${esc(name)}</strong>
            <button class="chip-btn rename">Cambiar nombre</button>
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
      ${note ? `<p class="notice">${note}</p>` : ''}
      ${p.in_review ? `<p class="offline">Tu cuenta está en revisión por el sistema antitrampas.${p.held > 0 ? ` Tienes ${coin(Number(p.held))} en premios retenidos hasta que termine.` : ''}</p>` : ''}

      <div class="account-card-panel">
        <div class="panel-head">
          <h2>Email</h2>
          <span class="panel-badge ${guest ? 'pending' : 'verified'}">${guest ? 'Sin vincular' : 'Vinculado'}</span>
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
      ${guest ? '' : '<button class="ghost logout">Cerrar sesión</button>'}
    </main>`);

  view.querySelector('.rename').addEventListener('click', () => renameForm(view, name));

  const emailBox = view.querySelector('.email-box');
  if (!guest) {
    emailBox.innerHTML = `<p class="field-ok">${esc(p.email)}</p>`;
  } else {
    emailBox.append(
      emailForm({
        intro: p.pending_email
          ? `Te enviamos un email a <b>${esc(p.pending_email)}</b>. Pulsa el enlace para confirmarlo, o escribe otro email.`
          : 'Juegas como invitado. Añade tu email para guardar tu saldo, nivel y skins y poder entrar desde otro móvil.',
        button: 'Guardar mi cuenta',
        send: (email) => account.register(email),
        codeType: 'email_change',
      }),
    );
    const other = h('<button class="link">¿Ya tienes cuenta? Entrar</button>');
    other.addEventListener('click', () => {
      other.replaceWith(
        emailForm({
          intro: 'Entra en tu cuenta. El saldo de este invitado se queda en este móvil.',
          button: 'Enviarme el enlace',
          send: (email) => account.signIn(email),
          codeType: 'email',
        }),
      );
    });
    emailBox.append(other);
  }

  const kycBox = view.querySelector('.kyc-box');
  if (guest) {
    kycBox.innerHTML = '<p class="sub">Primero guarda tu cuenta con email.</p>';
  } else if (kyc === 'verified') {
    kycBox.innerHTML = `<p class="field-ok">Identidad verificada${p.adult ? ' · mayor de 18' : ''}</p>`;
  } else {
    kycBox.innerHTML = `
      ${kyc === 'rejected' ? `<p class="sub">${KYC_REASON[p.kyc_reason] ?? KYC_REASON.provider_declined}</p>` : ''}
      ${kyc === 'pending' ? '<p class="sub">Estamos esperando el resultado. Si no terminaste, vuelve a empezar.</p>' : ''}
      <button class="primary kyc-start">${kyc === 'none' ? 'Verificar identidad' : 'Volver a verificar'}</button>
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

// formulario de email que, tras enviar, deja escribir el código del correo
function emailForm({ intro, button, send, codeType }) {
  const box = h(`
    <form class="form">
      <p class="sub">${intro}</p>
      <input type="email" name="email" required autocomplete="email" placeholder="tu@email.com">
      <button class="primary">${button}</button>
    </form>`);
  let sentTo = null;
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = box.querySelector('button');
    btn.disabled = true;
    if (sentTo) {
      try {
        await backend.account.verifyCode(sentTo, box.code.value.trim(), codeType);
        // si cambia de usuario la app se recarga sola; si es el mismo, se refresca
        showAccount('Cuenta guardada');
      } catch {
        btn.disabled = false;
        alertMsg('El código no es válido o ha caducado.');
      }
      return;
    }
    const email = box.email.value.trim();
    try {
      await send(email);
    } catch (err) {
      btn.disabled = false;
      const msg = {
        email_taken: 'Ese email ya tiene cuenta. Usa “¿Ya tienes cuenta? Entrar”.',
        no_account: 'No hay ninguna cuenta con ese email.',
        rate_limited: 'Espera un minuto antes de pedir otro email.',
      }[err.code];
      return alertMsg(msg ?? 'No se ha podido enviar el email. Prueba otra vez.');
    }
    sentTo = email;
    box.innerHTML = `
      <p class="sub">Te hemos enviado un email a <b>${esc(email)}</b>. Pulsa el enlace desde este móvil, o escribe aquí el código si viene uno.</p>
      <input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Código">
      <button class="secondary">Confirmar código</button>`;
  });
  return box;
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

async function showWallet() {
  screen = 'wallet';
  const [balance, txs] = await Promise.all([wallet.getBalance(), wallet.getTransactions()]);
  const prizeTotal = txs.filter((t) => t.type === 'prize' && t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const matchesPlayed = txs.filter((t) => t.type === 'entry').length;
  const view = h(`
    <main class="screen wallet">
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
            <button class="primary deposit-btn" data-add="50"><span>+50</span> Créditos</button>
            <button class="primary deposit-btn" data-add="200"><span>+200</span> Créditos</button>
          </div>
        </div>
        ${wallet.depositCrypto
      ? `<div class="crypto-section">
          <h3>Depositar en Cripto <small class="tag">pruebas</small></h3>
          <div class="row">
            <button class="secondary" data-crypto="10">10 USD</button>
            <button class="secondary" data-crypto="25">25 USD</button>
            <button class="secondary" data-crypto="50">50 USD</button>
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
    </main>`);
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
      showWallet();
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
  await shell(view);
}

// ---------- matchmaking ----------

async function startMatch(tier) {
  // #hoyo3 en la URL: la práctica empieza por ese hoyo (útil para probar);
  // #hoyo3-empate además fuerza el desempate al final
  const forced = tier.entryFee === 0 && /^#hoyo(\d+)(-empate)?$/.exec(location.hash);
  // con servidor, las mesas de pago son torneos contra jugadores reales y la
  // práctica se juega en el móvil contra rivales simulados
  if (!forced && tier.entryFee > 0 && backend.tournaments) return startTournament(tier);
  const service = forced || backend.tournaments ? practice : matches;
  let match;
  try {
    match = await service.join(tier);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return showWallet();
    return alertMsg('No se ha podido crear la partida. Prueba otra vez.');
  }
  match.service = service;
  match.myHoles = [];
  if (forced) Object.assign(match, { courses: [Number(forced[1]) - 1], holes: 1, forceTie: !!forced[2] });
  const view = h(`
    <main class="screen matchmaking tier--${tier.id}">
      <div class="radar"><span></span><span></span><span></span>${ball(progress.skin, 64)}</div>
      <h1>Buscando rivales…</h1>
      <p class="sub">${tier.entryFee ? `${tier.name} · bote ${coin(potFor(tier))}` : 'Práctica contra rivales simulados'}</p>
      <div class="seats"></div>
      <button class="ghost cancel">Cancelar y recuperar entrada</button>
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
function playScreen(match, { course, title, subtitle, players, onDone, firstSunkTick = null, timeLimit = HOLE_TIME_LIMIT, freePlay = false, onRestartHole = null, onSelectMap = null }) {
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
        <button class="pill restart-btn hud-freeplay-btn" aria-label="Reiniciar hoyo" title="Reiniciar hoyo al tee (R)">Reiniciar <kbd class="kbd-hint">R</kbd></button>
        <button class="pill map-select-btn hud-freeplay-btn" aria-label="Elegir otro mapa" title="Elegir otro mapa">Mapas</button>
        ` : ''}
        <button class="pill mute mobile-only" aria-label="Sonido">${isMuted() ? 'Mudo' : 'Sonido'}</button>
        <button class="pill fullscreen mobile-only" aria-label="Pantalla completa" title="Pantalla completa (F11)">Pantalla</button>
        <button class="pill settings-btn-hud mobile-only" aria-label="Ajustes" title="Ajustes (Esc)">Ajustes</button>
        <button class="pill desktop-esc-hint" aria-label="Ajustes">Ajustes <kbd class="kbd-hint">Esc</kbd></button>
      </div>
      <div class="rivals ${freePlay ? 'rivals-hidden' : ''}">${freePlay ? '' : players
      .map((p) => `<div class="chip ${p.id === 'me' ? 'me' : ''}" data-id="${p.id}" style="--c:${p.color}"><i>${p.name[0]}</i><b>${tiebreak ? '·' : 0}</b></div>`)
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
      <div class="power"><div class="fill"></div><span>0%</span></div>
      <button class="map-btn" aria-label="Ver el hoyo completo">Ver mapa <kbd class="kbd-hint">Espacio</kbd></button>
    </main>`);
  shell(view, { hideHeader: true }).then(() => {
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
              <button class="close-settings-btn" aria-label="Cerrar ajustes">Cerrar</button>
            </div>

            <div class="settings-modal-body">
              <div class="settings-row">
                <div class="settings-label">
                  <strong>Sonido</strong>
                  <small>Efectos ambientales y de golpe</small>
                </div>
                <button class="settings-btn toggle-sound-btn ${isMuted() ? 'muted' : ''}">
                  <span class="btn-text">${isMuted() ? 'Silenciado' : 'Activado'}</span>
                </button>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Pantalla</strong>
                  <small>Modo inmersivo de pantalla completa</small>
                </div>
                <button class="settings-btn toggle-fs-btn">
                  <span class="btn-text">${document.fullscreenElement ? 'Ventana' : 'Pantalla Completa'}</span>
                </button>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Calidad gráfica</strong>
                  <small>Baja si el móvil va lento o se calienta</small>
                </div>
                <div class="quality-picker">
                  ${QUALITY_LEVELS.map((q) => `<button class="settings-btn quality-btn ${q === getQuality() ? 'on' : ''}" data-q="${q}">${QUALITY_NAMES[q]}</button>`).join('')}
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <strong>Vista de Campo</strong>
                  <small>Ver todo el terreno en 3D</small>
                </div>
                <button class="settings-btn toggle-overview-btn">
                  <span class="btn-text">${game.overview ? 'Volver a la bola' : 'Ver todo el terreno'}</span>
                </button>
              </div>

              <div class="settings-controls-card">
                <div class="card-title">Controles Activos</div>
                <div class="controls-grid">
                  <div class="c-item"><kbd>Ratón</kbd><span>Apuntar y calcular fuerza (pulsar/arrastrar y soltar)</span></div>
                  <div class="c-item"><kbd>Clic Der</kbd><span>Rotar cámara alrededor de la bola</span></div>
                  <div class="c-item"><kbd>Rueda</kbd><span>Zoom de cámara / Ajuste fino de fuerza</span></div>
                  <div class="c-item"><kbd>Espacio</kbd><span>Visión general y completa del mapa</span></div>
                  <div class="c-item"><kbd>Esc</kbd><span>Abrir / Cerrar este menú de ajustes</span></div>
                </div>
              </div>
            </div>

            <div class="settings-modal-footer">
              <button class="primary resume-btn">Reanudar partida</button>
              ${freePlay ? '<button class="secondary restart-settings-btn">Reiniciar Hoyo</button><button class="secondary map-settings-btn">Cambiar de Mapa</button>' : ''}
              <button class="danger quit-btn">Salir al Lobby</button>
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

      const soundBtn = overlay.querySelector('.toggle-sound-btn');
      soundBtn.addEventListener('click', () => {
        setMuted(!isMuted());
        const muted = isMuted();
        soundBtn.classList.toggle('muted', muted);
        soundBtn.querySelector('.btn-text').textContent = muted ? 'Silenciado' : 'Activado';
        muteBtn.textContent = muted ? 'Mudo' : 'Sonido';
        try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { }
      });

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

      overlay.querySelectorAll('.quality-btn').forEach((btn) =>
        btn.addEventListener('click', () => {
          setQuality(btn.dataset.q);
          overlay.querySelectorAll('.quality-btn').forEach((b) => b.classList.toggle('on', b === btn));
          game.refreshQuality?.();
        }),
      );

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
          mapBtn.innerHTML = isOverview ? 'Volver a la bola <kbd class="kbd-hint">Espacio</kbd>' : 'Ver mapa <kbd class="kbd-hint">Espacio</kbd>';
          mapBtn.classList.toggle('on', isOverview);
        }
      },
      onAim: (p) => {
        power.querySelector('.fill').style.height = `${p * 100}%`;
        power.querySelector('span').textContent = `${Math.round(p * 100)}%`;
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
        if (st.sunk) toast(`${p.name} ha embocado en ${st.strokes}`, p.color);
      },
      onStroke: (n) => {
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
        setTimeout(() => finish(MAX_STROKES_PER_HOLE), 1600);
      },
      onLip: () => toast('¡Uy! Demasiado fuerte para entrar', '#ffffff'),
      onRest: (n) => {
        showDistance();
        if (tiebreak) {
          setChip('me', `${game.distanceToCup().toFixed(2)}m`, true);
          setTimeout(() => finish(n), 900);
        } else if (!freePlay && n >= MAX_STROKES_PER_HOLE) finish(n);
      },
    });
    game.load(course, { bots: freePlay ? [] : players.filter((p) => p.isBot), skin: progress.skin, instance: progress.instance(progress.skin.id), firstSunkTick, timeLimit: freePlay ? null : timeLimit });
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
    const muteBtn = view.querySelector('.mute');
    muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      muteBtn.textContent = isMuted() ? 'Mudo' : 'Sonido';
      try {
        localStorage.setItem(MUTE_KEY, isMuted() ? '1' : '0');
      } catch { }
    });
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
        fsBtn.textContent = document.fullscreenElement ? 'Ventana' : 'Pantalla';
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
        .then(() => match.service.recordHole(match, index, course.par, strokes, bots))
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
        <span class="pos">${p.position ?? i + 1}</span>
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
        <button class="primary next">${last ? 'Ver resultado' : 'Siguiente hoyo'}</button>
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
        <button class="primary next">${meTied ? 'Jugar desempate' : 'Ver desempate'}</button>
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
        <button class="primary next">Ver resultado</button>
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
  const levelUp = gained.level.level > gained.levelBefore;
  screen = 'lobby';
  const view = h(`
    <main class="screen results ${won ? 'won' : ''}">
      ${won ? '<div class="rays"></div>' : ''}
      <div class="trophy">${won ? 'Victoria' : `Puesto #${result.me.position}`}</div>
      <h1 class="score-title">${won ? '¡Has ganado!' : `Posición ${result.me.position} de ${PLAYERS_PER_MATCH}`}</h1>
      <p class="sub">${match.tier.entryFee ? (won ? `Premio ${coin(result.me.payout)}` : `Bote ${coin(result.pot)} para el ganador`) : 'Partida de práctica'}</p>
      <div class="xp-card">
        <div class="xp-head"><b>+${gained.xp} XP</b><span>${levelUp ? `¡Nivel ${gained.level.level}!` : `Nivel ${gained.level.level}`}</span></div>
        <span class="bar"><i style="--to:${(gained.level.into / gained.level.need) * 100}%"></i></span>
      </div>
      ${gained.newSkins.length
      ? `<h2 class="unlock-title">¡Skin desbloqueada!</h2><div class="unlocks">${gained.newSkins
        .map(
          (s) => `<div class="skin-card holo reveal rarity-${s.rarity}"><div class="shine"></div><span class="rarity">${SKIN_TIERS[s.rarity].name}</span>${ball(s, 76, 'float')}<b>${s.name}</b></div>`,
        )
        .join('')}</div>`
      : ''
    }
      ${standingsTable(result.ranking, true)}
      ${match.tier.entryFee ? `<p class="legal">Bote ${fmt(result.pot)} · comisión ${fmt(result.commission)} · premio ${fmt(result.prize)}</p>` : ''}
      <div class="row">
        <button class="primary again">Revancha</button>
        <button class="ghost" data-go="lobby">Lobby</button>
      </div>
    </main>`);
  view.querySelector('.again').addEventListener('click', () => startMatch(match.tier));
  await shell(view, { nav: false });
  if (won || gained.newSkins.length) sfx.coins();
}

// ---------- torneos contra jugadores reales ----------
//
// Asíncronos: cada jugador juega los mismos hoyos cuando quiere y el bote se
// reparte cuando han terminado todos. Los golpes los cuenta el servidor.

const POLL_MS = 5000;

async function startTournament(tier) {
  let match;
  try {
    match = await backend.tournaments.join(tier, TIERS);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return showWallet();
    if (e.blocked) {
      backend.account?.load().catch(() => { });
      return showBlocked(e.code);
    }
    return alertMsg('No se ha podido entrar en el torneo. Prueba otra vez.');
  }
  if (match.resumed && match.me.holesPlayed > 0) return continueRound(match);
  showTournamentLobby(match);
}

function continueRound(match) {
  const i = match.me.holesPlayed;
  if (i < match.holes) playOnlineHole(match, i);
  else offerTiebreak(match);
}

const minutesLeft = (date) => Math.max(0, Math.ceil((date - Date.now()) / 60000));

function showTournamentLobby(match) {
  const { tier } = match;
  const view = h(`
    <main class="screen matchmaking tier--${tier.id}">
      <div class="radar"><span></span><span></span><span></span>${ball(progress.skin, 64)}</div>
      <h1>Torneo ${tier.name}</h1>
      <p class="sub count"></p>
      <div class="seats"></div>
      <p class="legal">Todos jugáis los mismos ${match.holes} hoyos, cada uno a su ritmo. Cuando terminéis todos (o se cierre la inscripción) gana quien menos golpes haga y se reparte el bote. El servidor repite cada golpe para que nadie pueda hacer trampas.</p>
      <button class="primary start">Empezar a jugar</button>
      <button class="ghost cancel">Salir y recuperar entrada</button>
    </main>`);
  const seats = view.querySelector('.seats');
  const render = () => {
    const n = match.players.length;
    view.querySelector('.count').innerHTML = `${n}/${match.seats} jugadores · bote ${coin(tier.entryFee * n)} · cierra en ${minutesLeft(match.closesAt)} min`;
    seats.innerHTML = '';
    for (let i = 0; i < match.seats; i++) {
      const p = match.players.find((q) => q.seat === i) ?? match.players[i];
      const s = h(`<div class="seat"><span>…</span></div>`);
      if (p) {
        s.classList.add('filled', ...(p.id === 'me' ? ['me'] : []));
        s.style.setProperty('--c', p.color);
        s.innerHTML = `<span class="avatar">${p.name[0]}</span><span>${p.id === 'me' ? 'Tú' : p.name}</span>`;
      }
      seats.append(s);
    }
  };
  render();
  const poll = async () => {
    if (!view.isConnected) return;
    const before = match.players.length;
    try {
      await backend.tournaments.status(match);
      if (match.players.length > before) sfx.tick();
      if (view.isConnected) render();
    } catch { }
    setTimeout(poll, POLL_MS);
  };
  setTimeout(poll, POLL_MS);
  view.querySelector('.start').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await backend.tournaments.start(match);
    } catch {
      return alertMsg('No se ha podido empezar. Prueba otra vez.');
    }
    playOnlineHole(match, 0);
  });
  view.querySelector('.cancel').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await backend.tournaments.leave(match).catch(() => { });
    showLobby();
  });
  shell(view, { nav: false });
}

function playOnlineHole(match, index) {
  const course = COURSES[match.courses[index]];
  playScreen(match, {
    course,
    title: `Hoyo ${index + 1}/${match.holes}`,
    subtitle: `Torneo ${match.tier.name} · hoyo ${index + 1}`,
    players: [match.me],
    firstSunkTick: match.firstTicks?.[index] ?? null,
    timeLimit: match.timeLimit,
    onDone: (g) => submitOnline(match, index, g, (r) => showOnlineHoleResult(match, index, course, r.strokes, r.timedOut)),
  });
}

async function submitOnline(match, hole, g, then) {
  const { shots, aim, endTick } = g;
  try {
    then(await backend.tournaments.submitHole(match, hole, shots, aim, endTick));
  } catch (e) {
    if (e.code === 'invalid_shots') return alertMsg('El servidor no ha podido validar los golpes de este hoyo.');
    if (['time_up', 'match_closed', 'wrong_hole'].includes(e.code)) return showOnlineResults(match);
    retryMsg('Se ha perdido la conexión con el servidor. Tus golpes siguen guardados en el móvil.', () => submitOnline(match, hole, { shots, aim, endTick }, then));
  }
}

function showOnlineHoleResult(match, index, course, strokes, dq = false) {
  const last = index + 1 >= match.holes;
  const done = match.players.filter((p) => p.finished && p.id !== 'me').length;
  const overlay = h(`
    <div class="overlay">
      <div class="card ${!dq && strokes <= course.par ? 'good' : ''}">
        ${holeHeader(strokes, course.par, dq)}
        <p class="sub">Tu ronda: <b>${match.me.scores.join(' · ')}</b> · total <b>${match.me.total}</b></p>
        <p class="legal">${match.players.length} jugadores en el torneo${done ? ` · ${done} ya han terminado` : ''}. Verás sus golpes cuando acabes.</p>
        <button class="primary next">${last ? 'Tiro de desempate' : 'Siguiente hoyo'}</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => (last ? offerTiebreak(match) : playOnlineHole(match, index + 1)));
  app.append(overlay);
}

// en asíncrono no se sabe aún si habrá empate: todos tiran una vez y solo
// cuenta para desempatar en cabeza
function offerTiebreak(match) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card tiebreak-card">
        <h2 class="score-title">Tiro de desempate</h2>
        <p class="sub">Un solo tiro en un hoyo sin agujero: deja la bola lo más cerca posible de la diana. Solo cuenta si empatas en cabeza.</p>
        <button class="primary next">Tirar</button>
        <button class="ghost skip">Saltar</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => playOnlineTiebreak(match));
  overlay.querySelector('.skip').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await backend.tournaments.leave(match).catch(() => { });
    showOnlineResults(match);
  });
  app.append(overlay);
}

function playOnlineTiebreak(match) {
  playScreen(match, {
    course: TIEBREAK_COURSE,
    title: 'Desempate',
    subtitle: 'Un tiro',
    players: [match.me],
    onDone: (g, _strokes, banner) =>
      submitOnline(match, match.holes, g, (r) => {
        banner(`${r.distance.toFixed(2)} m`);
        setTimeout(() => showOnlineResults(match), 1400);
      }),
  });
}

function recordOnce(match) {
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
  const won = me.position === 1 || me.payout > 0;
  const leaders = match.players.filter((p) => p.total === me.total).length;
  return progress.recordMatch({
    position: me.position ?? match.players.length,
    won,
    entryFee: match.tier.entryFee,
    holes: me.scores.map((strokes, i) => ({ strokes, par: COURSES[match.courses[i]].par })),
    tiebreakWon: won && leaders > 1,
  });
}

async function showOnlineResults(match) {
  app.querySelector('.overlay')?.remove();
  try {
    await backend.tournaments.status(match);
  } catch { }
  screen = 'lobby';
  const { me, tier } = match;
  const open = match.status === 'open';
  const cancelled = match.status === 'cancelled';
  const won = !open && (me.position === 1 || me.payout > 0);
  const waiting = match.players.filter((p) => !p.finished).length;
  const gained = match.status === 'settled' ? recordOnce(match) : null;
  const ranking = [...match.players].sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || (a.total ?? 999) - (b.total ?? 999));
  let title, sub;
  if (open) {
    title = 'Esperando a los demás';
    sub = waiting ? `Faltan ${waiting} jugador${waiting === 1 ? '' : 'es'} por terminar · la inscripción cierra en ${minutesLeft(match.closesAt)} min` : 'Cerrando el torneo…';
  } else if (cancelled) {
    title = 'No hubo rivales';
    sub = 'Te hemos devuelto la entrada';
  } else {
    title = won ? '¡Has ganado!' : `Posición ${me.position} de ${match.players.length}`;
    sub = won ? `Premio ${coin(me.payout)}` : `Bote ${coin(match.pot)} para el ganador`;
  }
  const view = h(`
    <main class="screen results ${won ? 'won' : ''}">
      ${won ? '<div class="rays"></div>' : ''}
      <div class="trophy">${open ? 'En espera' : won ? 'Victoria' : cancelled ? 'Cancelado' : `Puesto #${me.position}`}</div>
      <h1 class="score-title">${title}</h1>
      <p class="sub">${sub}</p>
      ${gained
      ? `<div class="xp-card">
        <div class="xp-head"><b>+${gained.xp} XP</b><span>${gained.level.level > gained.levelBefore ? `¡Nivel ${gained.level.level}!` : `Nivel ${gained.level.level}`}</span></div>
        <span class="bar"><i style="--to:${(gained.level.into / gained.level.need) * 100}%"></i></span>
      </div>`
      : ''
    }
      ${gained?.newSkins.length
      ? `<h2 class="unlock-title">¡Skin desbloqueada!</h2><div class="unlocks">${gained.newSkins
        .map((s) => `<div class="skin-card holo reveal rarity-${s.rarity}"><div class="shine"></div><span class="rarity">${SKIN_TIERS[s.rarity].name}</span>${ball(s, 76, 'float')}<b>${s.name}</b></div>`)
        .join('')}</div>`
      : ''
    }
      ${standingsTable(ranking, !open)}
      ${match.status === 'settled' ? `<p class="legal">Bote ${fmt(match.pot)} · comisión ${fmt(match.commission)} · premio ${fmt(match.prize)}</p>` : ''}
      ${open ? '<p class="legal">Puedes salir: el resultado y el premio aparecerán en el lobby, en «Tus torneos».</p>' : ''}
      <div class="row">
        <button class="primary again">${open ? 'Jugar otro' : 'Revancha'}</button>
        <button class="ghost" data-go="lobby">Lobby</button>
      </div>
    </main>`);
  view.querySelector('.again').addEventListener('click', () => startMatch(tier));
  await shell(view, { nav: false });
  if (won && gained) sfx.coins();
  if (open) {
    const key = `${match.status}:${waiting}`;
    const poll = async () => {
      if (!view.isConnected) return;
      try {
        await backend.tournaments.status(match);
      } catch { }
      if (!view.isConnected) return;
      if (`${match.status}:${match.players.filter((p) => !p.finished).length}` !== key) showOnlineResults(match);
      else setTimeout(poll, POLL_MS);
    };
    setTimeout(poll, POLL_MS);
  }
}

async function showMyTournaments(box) {
  let list;
  try {
    list = await backend.tournaments.mine(TIERS);
  } catch {
    return;
  }
  if (!list.length || !box.isConnected) return;
  const label = (m) => {
    if (m.status === 'cancelled') return 'Sin rivales · entrada devuelta';
    if (m.status === 'settled') return m.me.payout > 0 ? `Ganaste ${coin(m.me.payout)}` : `Posición ${m.me.position} de ${m.players.length}`;
    if (!m.me.finished) return `Sin terminar · ${m.me.holesPlayed}/${m.holes} hoyos`;
    return `Esperando · ${m.players.filter((p) => p.finished).length}/${m.players.length} han terminado`;
  };
  box.append(h(`<div class="section-head"><h2>Tus torneos</h2></div>`));
  const ul = h('<ul class="txs"></ul>');
  for (const m of list.slice(0, 5)) {
    const li = h(`<li class="tap"><div><b>${m.tier?.name ?? m.id}</b><small>${m.players.length} jugadores · bote ${fmt(m.tier ? m.tier.entryFee * m.players.length : m.pot)}</small></div><span>${label(m)}</span></li>`);
    li.addEventListener('click', () => {
      if (m.status === 'open' && !m.me.finished) return m.me.holesPlayed > 0 ? continueRound(m) : showTournamentLobby(m);
      showOnlineResults(m);
    });
    ul.append(li);
  }
  box.append(ul);
}

function retryMsg(text, retry) {
  app.querySelector('.overlay')?.remove();
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>Sin conexión</h2>
        <p class="sub">${text}</p>
        <button class="primary">Reintentar</button>
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
        <button class="primary">Volver al lobby</button>
      </div>
    </div>`);
  overlay.querySelector('button').addEventListener('click', () => showLobby());
  app.append(overlay);
}

// ---------- juego libre en solitario ----------

const THEME_INFO = {
  meadow: { name: 'Pradera', icon: '', color: '#5cc24a' },
  beach: { name: 'Playa', icon: '', color: '#2fe0ff' },
  sunset: { name: 'Atardecer', icon: '', color: '#ff9a5c' },
  snow: { name: 'Nieve', icon: '', color: '#90d7ff' },
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
        <button class="ghost back-to-lobby" data-go="lobby">← Volver al Menú Principal</button>
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
            <img class="course-preview-img" src="${getCoursePreview(course)}" alt="Vista previa de ${course.name}" loading="lazy" />
            <div class="course-preview-glow"></div>
            <div class="course-preview-badges">
              <span class="preview-badge dist-badge">~${dist}m</span>
              ${feats[0] ? `<span class="preview-badge feat-badge">${feats[0]}</span>` : ''}
            </div>
            <div class="course-preview-action-overlay">
              <span class="preview-play-icon"></span>
              <span class="preview-play-text">Entrenar Hoyo ${idx + 1}</span>
            </div>
          </div>
        </div>
        <div class="course-card-body">
          <h3 class="course-name">${course.name}</h3>
          ${course.tip ? `<p class="course-tip">${course.tip}</p>` : ''}
          ${feats.length ? `<div class="course-feats">${feats.map((f) => `<span class="feat-tag">${f}</span>`).join('')}</div>` : ''}
        </div>
        <button class="primary play-course-btn">Jugar Hoyo ${idx + 1}</button>
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
          <img class="course-preview-img" src="${getCoursePreview(TIEBREAK_COURSE)}" alt="Vista previa de Desempate" loading="lazy" />
          <div class="course-preview-glow"></div>
          <div class="course-preview-badges">
            <span class="preview-badge dist-badge">~${tbDist}m</span>
            <span class="preview-badge feat-badge">Diana</span>
          </div>
          <div class="course-preview-action-overlay">
            <span class="preview-play-icon"></span>
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
      <button class="primary play-course-btn">Jugar Desempate</button>
    </div>
  `);
  const launchTbPlay = () => playFreePlay('tiebreak');
  tbCard.querySelector('.play-course-btn').addEventListener('click', launchTbPlay);
  tbCard.querySelector('.course-card-preview-wrap').addEventListener('click', launchTbPlay);
  grid.append(tbCard);

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
          <button class="primary retry-btn">Repetir este hoyo</button>
          ${nextIndex != null ? `<button class="primary next-btn">Siguiente hoyo (${nextIndex + 1})</button>` : ''}
          <button class="secondary select-map-btn">Elegir otro mapa</button>
          <button class="ghost to-lobby-btn">Lobby principal</button>
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
if (isSkinLabRequested()) {
  app.innerHTML = '';
  mountSkinLab(app);
} else {
  app.innerHTML = '<main class="screen loading"><h1>Golf Cash Battle</h1><p class="sub">Conectando…</p></main>';
  createBackend().then((b) => {
    backend = b;
    ({ wallet, matches } = b);
    if (b.account) progress.attach(b.user.id, b.account.profile?.progress, (s) => b.account.saveProgress(s));
    wallet.subscribe((n) => {
      const el = app.querySelector('.balance');
      if (el) el.innerHTML = `${coin(n)}<span class="plus">+</span>`;
    });
    showLobby();
  });
}
