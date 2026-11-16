import './style.css';
import './screens/screens.css';
import './screens/hub.css';
import './screens/tables.css';
import './screens/friends.css';
import './screens/ranking.css';
import './screens/skins.css';
import './screens/skinInspect.css';
import './screens/account.css';
import { HOLE_TIME_LIMIT, PLAYERS_PER_MATCH, TIERS, maxStrokesOf, potFor } from './config.js';
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
import { AvatarStore, toWire } from './progress/avatar.js';
import { framesUnlocked, frameStyle } from './progress/prestige.js';
import { ballPreview } from './game/render/ballPaint.js';
import { showSkinReveal } from './ui/skinReveal.js';
import { installThumbObserver, thumbCached, upgradeImg, warmThumbs } from './ui/skinThumbs.js';
import { getCourseDistance, staticCoursePreview } from './game/render/coursePreviewStatic.js';
import { mountAuth } from './ui/authScreen.js';
import { LiveRoom } from './match/LiveRoom.js';
import { buildRoster, humanLeaders, liveStandings, seededRng } from './match/liveRules.js';
import { notify } from './ui/notifyPopup.js';
import { createNotifier } from './ui/notifier.js';
import { createPartyWatch } from './match/partyWatch.js';
import { createScope } from './screens/lifecycle.js';
import { icon, iconUrl } from './ui/icons.js';
import { errorRef } from './backend/rpcError.js';
import { coin, createBall, esc, fmt, h } from './screens/shared.js';
import { createRouter } from './screens/router.js';
import { createRoutes } from './screens/routes.js';
import { createHost } from './screens/host.js';
import { createContext } from './screens/context.js';
import { createNavigator } from './screens/navigate.js';
import { createGoHome } from './screens/playLifecycle.js';
import { createThumbs } from './screens/skinThumbsHook.js';
import { getQuality } from './game/render/quality.js';
import { createBoot, createHubPreloader, trackProgress, waitPainted } from './ui/splashBridge.js';

// hitos del arranque hacia el splash (no-op si no hay #splash: ?skinlab=1)
const boot = createBoot();
boot.bundle();
let backend, wallet, matches;
// práctica forzada con #hoyoN: siempre local, no toca el servidor
const practice = new MatchService(new LocalWallet(), Math.random, COURSES.length);
const progress = new Progress();
// miniaturas de skins guardadas (IndexedDB) a memoria cuanto antes: las <img> salen ya con su imagen
warmThumbs();
// three.js (partida, inspector 3D) se carga solo cuando hace falta: lobby y pantalla de skins no lo pagan
// la partida usa su propio renderer: se libera la escena del hub precargada (T026 la recreará si la necesita)
const loadGolfGame = () => { hubPreloader.release(); return import('./game/GolfGame.js').then((m) => m.GolfGame); };
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

const soundLabel = () => `${icon(isMuted() ? 'mute' : 'sound')}${isMuted() ? 'Mudo' : 'Sonido'}`;
applySound(settings.get());
settings.subscribe(applySound);
// miniatura estática en caché o marcador 2D (ver screens/shared.js)
const { ball } = { ball: createBall(progress) };

let avatar = new AvatarStore(null);

// router de pila (src/screens): la raíz es el lobby hasta que llegue el hub (F3)
const ROOT_SCREEN = 'hub'; // el hub es la raíz; el lobby de hoy es la ruta «Mesas» (tables)
let router = null;
let screenHost = null;
let testHole = null; // #hoyoN / #hoyoN-empate capturado al arrancar (el router reescribe el hash)

// guarda de «atrás»: en partida abre la pausa; en una mesa en vivo pide confirmación (T011)
let gameGuard = null;
let playScope = null; // listeners y timers de la partida en curso; se libera al salir o cambiar de hoyo
let notifier = null;
let partyWatch = null;

function backGuard() {
  if (gameGuard) return gameGuard();
  if (currentLive && !currentLive.finished) {
    if (!confirm('¿Seguro que quieres salir de la partida en vivo? Cuenta como abandono.')) return true; // cancelar conserva la pila
    // aceptar = lo mismo que el botón de salir: abandona (stopLive -> leave) y vuelve a la raíz con la pila coherente
    stopLive();
    releasePlay();
    router.reset(ROOT_SCREEN);
    return true;
  }
  return false;
}

let game = null;
let screen = 'lobby';

// libera todo lo de la partida y de las pantallas heredadas (la usan shell() y goHome())
function releasePlay() {
  game?.dispose();
  game = null;
  playScope?.dispose();
  playScope = null;
  gameGuard = null;
  partyWatch?.stop();
}

async function shell(content, { hideHeader = false, nav = true } = {}) {
  releasePlay();
  const balance = await wallet.getBalance();
  app.innerHTML = '';
  window.scrollTo(0, 0);
  if (!hideHeader) {
    const { level, into, need } = progress.level;
    app.append(
      h(`
      <header class="topbar game-hud-topbar">
        <div class="topbar-left">
          <button class="brand-btn desktop-brand-btn" data-go="home" aria-label="Golf Cash Battle">
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
          <button class="brand-btn mobile-brand-btn" data-go="home" aria-label="Golf Cash Battle">
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
  else if (e.code === 'Escape') router?.back();
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  else document.documentElement.requestFullscreen().catch(() => { });
}

// fachada sobre el router (src/screens/navigate.js): los `data-go` y los atajos 1-6 siguen igual
let go = () => {};
// fin de partida o salida: libera la partida (final, sala en vivo, renderer, guard) y vuelve al hub (la raíz)
// tras una partida el hub recrea su escena 3D (T026 la libera al empezar). El disparador es la LLEGADA al hub
// (hub.js llama a ctx.actions.reviveHubScene al montar y al destapar sin escena), así vale cualquier vía de vuelta.
// Si el juego sigue vivo se libera primero (su contexto WebGL), así nunca coexisten dos; sin esperarla: el hub
// se pinta con la imagen fija y la escena entra al llegar. Nada si hay sala en vivo sin acabar.
function reviveHubScene() {
  if (currentLive && !currentLive.finished) return;
  if (game) releasePlay();
  hubPreloader.reload().then((scene) => {
    if (scene && hubPreloader.current() === scene && startCtx) startCtx.setHubScene(scene);
  });
}
const goHome = createGoHome({ leaveFinale: () => leaveFinale(), stopLive: () => stopLive(), releasePlay, go: (to) => go(to) });

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

// ---------- cuenta ----------

const BLOCK_TEXT = {
  account_required: 'Para jugar con créditos necesitas una cuenta con email. Crea tu cuenta para conservar tu saldo, nivel y skins.',
  kyc_required: 'Antes de jugar con créditos tienes que verificar tu edad e identidad. Solo se hace una vez.',
  underage: 'Las mesas con entrada son solo para mayores de 18 años. Puedes seguir jugando en Práctica.',
  account_review: 'Tu cuenta está en revisión por el sistema antitrampas. Mientras tanto puedes jugar en Práctica.',
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
  overlay.querySelector('.go')?.addEventListener('click', () => go('account'));
  overlay.querySelector('.back').addEventListener('click', () => overlay.remove());
  app.append(overlay);
}

// ---------- ranking de victorias ----------

/** Aviso de marco nuevo si la partida hizo cruzar un nivel de prestigio. */
const prestigeNote = (gained) => {
  const now = framesUnlocked(gained.level.level);
  if (now.length <= framesUnlocked(gained.levelBefore).length) return '';
  const f = now.at(-1);
  return `<p class="reward-note prestige-note" style="${frameStyle(f)}"><i></i>¡Marco de prestigio ${esc(f.name)} desbloqueado!</p>`;
};

// ---------- matchmaking ----------

async function startMatch(tier, rematchOf = null) {
  leaveFinale();
  // #hoyo3 en la URL: la práctica empieza por ese hoyo (útil para probar);
  // #hoyo3-empate además fuerza el desempate al final
  const forced = tier.entryFee === 0 && testHole;
  // con servidor, las mesas de pago son torneos contra jugadores reales y la
  // práctica se juega en el móvil contra rivales simulados
  if (!forced && tier.entryFee > 0 && backend.tournaments) return startTournament(tier, rematchOf);
  const service = forced || backend.tournaments ? practice : matches;
  let match;
  try {
    match = await service.join(tier);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return go('wallet');
    return alertMsg('No se ha podido crear la partida. Prueba otra vez.');
  }
  match.service = service;
  match.myHoles = [];
  if (forced) Object.assign(match, { courses: [forced.hole - 1], holes: 1, forceTie: forced.tie });
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
    goHome();
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
    playScope?.dispose();
    playScope = createScope();
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

    gameGuard = () => { openSettingsMenu(); return true; };
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
          goHome();
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
      playScope.on(window, 'keydown', onKeyR);
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
      playScope.on(document, 'fullscreenchange', () => {
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
      playScope.timeout(() => el.remove(), 2600);
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
  overlay.querySelector('.next').addEventListener('click', () => goHome());
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
    if (e instanceof InsufficientFundsError) return go('wallet');
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
    goHome();
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
  if (!live || live.stopped) return goHome();
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
        <button class="${open ? 'primary' : 'ghost'}" data-go="home">${icon('back')}Lobby</button>
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
  overlay.querySelector('button').addEventListener('click', () => goHome());
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
        <button class="ghost back-to-lobby" data-go="home">${icon('back')}Volver al Menú Principal</button>
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
    goHome();
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
  createBackend().then(async (b) => {
    if (b.mode === 'auth') {
      // sin sesión: pantallas de entrada. Al entrar se recarga para arrancar limpio con la cuenta
      mountAuth(app, b.auth, { recovery: b.recovery, guest: b.guest, onDone: () => location.replace(location.origin + location.pathname + location.hash) });
      boot.noSession();
      return;
    }
    boot.session();
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
    startNotices(b);
    startPartyWatch(b);
    // el saldo no frena el arranque: `progress` se marca al llegar o a los 3 s
    trackProgress(boot, () => wallet.getBalance());
    const hubScene = hubPreloader.preload();
    startRouting(b);
    hubScene.then((scene) => { if (scene && hubPreloader.current() === scene) startCtx.setHubScene(scene); });
    // `hub` espera al lobby pintado y a que la escena llegue o se omita (margen de 8 s)
    const maxMs = Number(document.getElementById('splash')?.dataset.maxMs) || 15000;
    Promise.all([hubScene, waitPainted(app, { maxMs })]).then(([, painted]) => {
      // un lobby que no se pinta es un fallo de arranque: «Reintentar» (splash.js no lo da solo con `session` marcada)
      if (painted) boot.hub(); else boot.fail('lobby sin pintar');
    });
  }).catch((err) => {
    // solo backend/sesión (y el lobby sin pintar) pueden bloquear el splash con «Reintentar»
    boot.fail(String(err?.message ?? err));
    throw err;
  });
}

// three y la escena del hub se piden con import() dinámico durante el splash (nunca en la carga inicial) y se montan
// en un contenedor oculto; el hub la reclama de ctx.hubScene (T026), que debe llamar a resume(): llega pausada.
let startCtx = null;
const hubPreloader = createHubPreloader({
  boot,
  importScene: () => import('./game/render/hubScene.js').then((m) => ({ createHubScene: m.createHubScene })),
  quality: () => getQuality(),
  reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  onReleased: (sc) => { if (startCtx && startCtx.hubScene === sc) startCtx.setHubScene(null); },
});

// ---------- navegación ----------
// El router y el host llevan la pila de pantallas; las pantallas aún no migradas se pintan con sus show* de siempre.
function startRouting(b) {
  const routes = createRoutes({ root: ROOT_SCREEN });
  router = createRouter({ routes, root: ROOT_SCREEN, win: window, isBusy: () => screenHost?.isBusy() ?? false });
  const ctx = createContext({
    backend: b, wallet, progress, avatar, settings, router, sfx, notify, icon, ball,
    quality: () => getQuality(),
    // miniaturas de skins (canvas y observador) aisladas de la pantalla
    // visor 3D del inspector de skin: three.js solo se descarga al abrir la pantalla (import() dinámico)
    loadViewer: () => loadSkinInspector().then((m) => m.createSkinInspector),
    thumbs: createThumbs({ upgrade: upgradeImg, cached: thumbCached, preview: ballPreview, warm: warmThumbs }),
    actions: {
      startMatch: (tier) => startMatch(tier),
      startPractice: () => startMatch(TIERS.find((x) => x.entryFee === 0) ?? TIERS[0]),
      claimRewards: () => claimRewards(),
      toggleFullscreen: () => toggleFullscreen(),
      toggleMute: () => toggleMute(),
      reviveHubScene: () => reviveHubScene(),
    },
    legacy: {
      // Mesas (T028): lo que la pantalla necesita de main.js
      enterTables: () => { leaveFinale(); stopLive(); screen = 'lobby'; releasePlay(); },
      enterSettings: () => { leaveFinale(); stopLive(); screen = 'settings'; releasePlay(); },
      maps: () => showFreePlayCourseSelect(),
    },
  });
  screenHost = createHost({ router, routes, root: app, ctx, notify, win: window, doc: document });
  const navigate = createNavigator({ router, host: screenHost, rootId: ROOT_SCREEN });
  go = (to) => navigate(to === 'lobby' ? 'tables' : to); // «lobby» (Jugar, tecla 1) = Mesas
  startCtx = ctx;
  screenHost.attach();
  testHole = router.start().testHole;
  ctx.testHole = testHole;
  ctx.notifier = notifier;
  ctx.partyWatch = partyWatch;
  router.setBackGuard(backGuard);
}

// ---------- avisos emergentes ----------
// Cada pocos segundos se mira si llegó una petición de amistad o una invitación a grupo
// y se enseña un aviso de 5 s. (notify() sirve para cualquier otro aviso.)

// TODO(F3): notifier y partyWatch sondean ambos parties.mine() con el lobby abierto; compartir el resultado cuando el hub unifique el sondeo.
function startNotices(b) {
  if (!b.account) return;
  notifier = createNotifier({
    account: b.account,
    parties: b.parties,
    isHidden: () => document.hidden,
    onNotice: (n) => {
      sfx.tick();
      if (n.kind === 'friend') {
        notify({ kind: 'friend', icon: 'user-plus', title: 'Petición de amistad', text: `${n.from} quiere ser tu amigo`, onClick: () => go('friends') });
      } else {
        notify({ kind: 'invite', icon: 'users', title: 'Invitación a grupo', text: `${n.from} te invita a su grupo`, onClick: () => go('lobby') });
      }
    },
  });
  notifier.start();
}

function startPartyWatch(b) {
  if (!b.parties) return;
  partyWatch = createPartyWatch({ parties: b.parties, tournaments: b.tournaments, tiers: TIERS });
  // el grupo entra en un torneo: a su sala (o a seguir jugando), como antes
  partyWatch.onNewMatch(async (match) => {
    await wallet.getBalance();
    sfx.tick();
    enterLive(match);
  });
}
