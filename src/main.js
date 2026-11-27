import './style.css';
import './screens/screens.css';
import './screens/hub.css';
import './screens/tables.css';
import './screens/friends.css';
import './screens/ranking.css';
import './screens/novedades.css';
import './screens/skins.css';
import './screens/skinInspect.css';
import './screens/account.css';
import './screens/maps.css';
import './screens/achievements.css';
import { HOLE_TIME_LIMIT, PLAYERS_PER_MATCH, TIERS, maxStrokesOf } from './config.js';
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
import { mountAuth } from './ui/authScreen.js';
import { LiveRoom } from './match/LiveRoom.js';
import { buildRoster, humanLeaders, liveStandings, roundComplete, roundReady, seededRng } from './match/liveRules.js';
import { notify } from './ui/notifyPopup.js';
import { createNotifier } from './ui/notifier.js';
import { createPartyWatch } from './match/partyWatch.js';
import { startPresence } from './account/presence.js';
import { createScope } from './screens/lifecycle.js';
import { icon, iconUrl } from './ui/icons.js';
import { mountMatchmakingBanner } from './ui/matchmakingBanner.js';
import { installDocHidden } from './ui/matchmakingView.js';
import { activeSearch, createSearch } from './match/matchmakingController.js';
import { errorRef } from './backend/rpcError.js';
import { coin, createBall, esc, fmt, h } from './screens/shared.js';
import { createRouter } from './screens/router.js';
import { createRoutes } from './screens/routes.js';
import { defaultInfo } from './screens/matchmaking.js';
import { t } from './screens/texts/index.js';
import './screens/texts/matchmaking.js';
import { createHost } from './screens/host.js';
import { createContext } from './screens/context.js';
import { createNavigator } from './screens/navigate.js';
import { createGoHome } from './screens/playLifecycle.js';
import { createThumbs } from './screens/skinThumbsHook.js';
import { getQuality } from './game/render/quality.js';
import { PERF, fitCourses, forcedCourses, perf } from './game/perfProbe.js';
import { PREFETCH_DECISION, shouldIdlePrefetch } from './game/prefetchRules.js';
import { isSkinLabRequested } from './game/render/perfGovernor.js';
import { createBoot, createHubPreloader, trackProgress, waitPainted } from './ui/splashBridge.js';
import { createGamePreloader, makeHiddenHolder } from './game/gamePreloader.js';
import { roomDelays } from './game/roomTiming.js';
import { HOLD_LIVE_MS, HOLD_PRACTICE_MS, NEXT_HOLE_PREBUILD, PERSISTENT_LIVE, PERSISTENT_RENDERER, ROOM_MIN_MS, WARM_IN_ROOM, WARM_LIVE, urlOff } from './game/loadingFlags.js';
import { keyOf, withCap } from './game/warmupRules.js';
import { NEXT_WAIT_MS, canReuseGame, nextToPrepare } from './game/holeWindowRules.js';
import { mountNetStats } from './ui/netStats.js';
import { startVersionCheck } from './ui/versionCheck.js';
import { lobbyButton } from './screens/components.js';
import { chestReadyAt, markChestOpened } from './chest.js';
import { IS_PORTAL, gameplayStart, gameplayStop, initPortal, loadingStart, loadingStop, midgameAd, rewardedAd } from './portal.js';
import { installI18n } from './i18n.js';
import { startTutorial, tutorialPending } from './tutorial.js';

// build de portal: nombre GolfitoBattle e interfaz en inglés si el navegador no está en español
installI18n();

// hitos del arranque hacia el splash (no-op si no hay #splash: ?skinlab=1)
// margen de 3 s: la portada no espera más que eso al motor de partida (la descarga sigue en segundo plano)
const boot = createBoot({ marginMs: 3000 });
boot.bundle();
let backend, wallet, matches;
// práctica forzada con #hoyoN: siempre local, no toca el servidor
const practice = new MatchService(new LocalWallet(), Math.random, COURSES.length);
const progress = new Progress();
// miniaturas de skins guardadas (IndexedDB) a memoria cuanto antes: las <img> salen ya con su imagen
warmThumbs();
// three.js (partida, inspector 3D) se carga solo cuando hace falta: lobby y pantalla de skins no lo pagan
// la partida usa su propio renderer: se libera la escena del hub precargada (T026 la recreará si la necesita)
// ahorro de datos o red lenta: la portada no descarga el motor por adelantado
const lowData = () => {
  const c = navigator.connection;
  return !!c && (c.saveData === true || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''));
};
let golfGameP = null;
const importGolfGame = () => (golfGameP ??= (() => {
  perf.mark('import:start');
  return import('./game/GolfGame.js').then((m) => { perf.mark('import:end'); return m.GolfGame; });
})().catch((e) => { golfGameP = null; throw e; }));
const loadGolfGame = () => {
  perf.mark('hub:release');
  hubPreloader.release();
  return importGolfGame();
};
// F2: el hoyo 1 se prepara oculto durante la sala (src/game/gamePreloader.js). WARM_IN_ROOM = false o ?warm=0 lo apagan.
// Antes de crear su renderer libera la partida y la escena del hub: como mucho un contexto WebGL de partida.
const gamePreloader = createGamePreloader({
  importGame: importGolfGame,
  releaseHub: () => { perf.mark('hub:release'); hubPreloader.release(); },
  releaseCurrentGame: () => { if (game) releasePlay(); },
  makeHolder: () => makeHiddenHolder(document),
  enabled: () => WARM_IN_ROOM && !urlOff('warm'),
  probe: perf,
});
/** Lo que se prepara: el primer hoyo de la partida con la skin equipada y la calidad de ahora. */
const warmRequest = (courseIndex, ghosts) => ({
  course: COURSES[courseIndex],
  courseIndex,
  skin: progress.skin,
  instance: progress.instance(progress.skin.id),
  ghosts,
  quality: getQuality(),
});
const warmKey = (course) => keyOf(course, progress.skin, progress.instance(progress.skin.id), getQuality());
// ?perf=1: sonda de medición y su panel (con otro valor, nada de esto existe: ver src/game/perfProbe.js)
if (PERF) {
  perf.setQuality(getQuality);
  import('./ui/perfPanel.js').then((m) => m.mountPerfPanel(perf.probe));
}
const loadSkinInspector = () => import('./ui/skinInspector.js');

// "móvil" en pantallas táctiles, "equipo" en PC
const DEVICE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'móvil' : 'equipo';

// sonido según los ajustes guardados (settings.js), ahora y cada vez que cambien
// silencio efectivo: ajuste del jugador, silencio del portal (CrazyGames muteAudio) o anuncio en curso
let portalMuted = false;
let adMuted = false;
const syncMute = () => setMuted(adMuted || portalMuted || settings.peek().sound.muted);
function applySound(s) {
  setMuted(adMuted || portalMuted || s.sound.muted);
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
  // en la sala de espera «atrás» es como «Volver al lobby»: la búsqueda sigue (aviso flotante)
  if (currentLive && !currentLive.finished && !currentLive.searching) {
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

// libera todo lo de la partida y de las pantallas heredadas (la usan paintApp() y goHome())
function releasePlay() {
  gameplayStop();
  game?.dispose();
  game = null;
  playScope?.dispose();
  playScope = null;
  gameGuard = null;
  partyWatch?.stop();
}

// F3: entre hoyos de la misma partida la canvas se suelta de la pantalla pero el juego (y su contexto WebGL) sigue
function keepPlay() {
  game?.detach();
  playScope?.dispose();
  playScope = null;
  gameGuard = null;
  partyWatch?.stop();
}

// F3: renderer persistente (PERSISTENT_RENDERER; `?persist=0` vuelve al camino de F2) y hoyo siguiente preparado
// (NEXT_HOLE_PREBUILD; `?next=0` lo apaga). El vivo queda fuera con PERSISTENT_LIVE = false.
const persistOn = () => PERSISTENT_RENDERER && !urlOff('persist');
// con la calidad cambiada a/desde Bajo el antialias ya no es el del contexto: juego nuevo, como antes
const reusableGame = ({ reuse = false, live = false, prepared = null } = {}) =>
  canReuseGame({ reuse, enabled: persistOn(), live, persistentLive: PERSISTENT_LIVE, prepared: !!prepared, game })
  && game.antialias === (getQuality() !== 'low');

/** Empieza a construir el hoyo siguiente (o el desempate) en el juego en curso mientras se ve el resultado. */
function prepareNextHole(course, ghosts) {
  if (!persistOn() || !NEXT_HOLE_PREBUILD || urlOff('next') || !course) return;
  if (!game || game.disposed || !game.prepareNext) return;
  game.prepareNext(course, { ghosts }).catch(() => {});
}

/** Al pulsar «Siguiente hoyo»: espera al hoyo preparado con tope (NEXT_WAIT_MS); si no llega, load() hace el camino de siempre. */
async function waitNextHole() {
  const p = reusableGame({ reuse: true }) ? game.whenNextReady?.() : null;
  if (!p) return;
  if (PERF) perf.mark('next:wait:start');
  const r = await withCap(p, NEXT_WAIT_MS).catch(() => ({ ok: false }));
  if (PERF) perf.mark('next:wait:end', { ready: r.ok && r.value === true });
}

// pinta una pantalla de partida (juego, sala en vivo, resultados) a pantalla completa: sin cabecera ni barras del HUD anterior.
// keepGame (F3, hoyo siguiente de la misma partida): el juego no se libera, solo se suelta su canvas.
function paintApp(content, { keepGame = false } = {}) {
  if (keepGame && persistOn() && game && !game.disposed) keepPlay();
  else releasePlay();
  app.innerHTML = '';
  window.scrollTo(0, 0);
  app.append(content);
  bindHolo(app);
}

// Lobby flotante de las pantallas de partida: sale igual que «atrás» (pide confirmación si la partida en vivo no ha acabado)
function leaveToLobby() {
  if (backGuard()) return;
  goHome();
}

/** Resultados en vivo: su volver es el botón Lobby flotante (lobbyButton) enlazado a leaveToLobby. (La sala de espera es la pantalla 'matchmaking'.) */
function paintLive(view) {
  paintApp(view);
  view.querySelector('[data-lobby]')?.addEventListener('click', leaveToLobby);
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
  if (currentLive && !currentLive.finished && !currentLive.searching) return;
  if (game) releasePlay();
  hubPreloader.reload().then((scene) => {
    if (scene && hubPreloader.current() === scene && startCtx) startCtx.setHubScene(scene);
  });
}
const goHomeBase = createGoHome({ leaveFinale: () => leaveFinale(), stopLive: () => stopLive(), releasePlay, go: (to) => go(to) });
// volver al hub descarta el hoyo preparado (el hub recrea su escena 3D como siempre; la búsqueda sigue)
const goHome = (...args) => {
  gamePreloader.release();
  if (PERF) { perf.mark('home'); perf.persist(); }
  return goHomeBase(...args);
};

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

/**
 * Con una búsqueda ya en marcha no se empieza otra: se vuelve a su sala (la búsqueda es única, ver
 * src/match/matchmakingController.js). Devuelve true si había una.
 */
function resumeSearch() {
  const s = activeSearch();
  if (!s) return false;
  notify({ kind: 'info', icon: 'hourglass', title: t('matchmaking.already'), text: t('matchmaking.alreadyText') });
  showSearch();
  return true;
}

// lleva a la sala de emparejamiento desde donde esté el usuario (si estaba jugando en libre, esa partida se libera)
function showSearch() {
  if (game) releasePlay();
  go('matchmaking');
}

async function startMatch(tier, rematchOf = null) {
  importGolfGame().catch(() => {});
  if (resumeSearch()) return;
  leaveFinale();
  // #hoyo3 en la URL: la práctica empieza por ese hoyo (útil para probar);
  // #hoyo3-empate además fuerza el desempate al final
  const forced = tier.entryFee === 0 && testHole;
  // con servidor, las mesas de pago son torneos contra jugadores reales y la
  // práctica se juega en el móvil contra rivales simulados
  if (!forced && tier.entryFee > 0 && backend.tournaments) return startTournament(tier, rematchOf);
  perf.setContext({});
  perf.mark('click');
  const clickAt = performance.now();
  const service = forced || backend.tournaments ? practice : matches;
  let match;
  try {
    match = await service.join(tier);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return go('wallet');
    return alertMsg('No se ha podido crear la partida. Prueba otra vez.');
  }
  if (resumeSearch()) return service.cancel(match).catch(() => { }); // doble toque mientras se unía
  match.service = service;
  match.myHoles = [];
  perf.mark('join:end');
  if (PERF && !forced) {
    // ?perfcourses=3,7,11: mapas forzados solo en práctica (nunca en mesas de pago ni en vivo)
    const fc = forcedCourses(location.search, tier, COURSES.length);
    if (fc) match.courses = fitCourses(fc, match.courses.length);
  }
  if (forced) Object.assign(match, { courses: [forced.hole - 1], holes: 1, forceTie: forced.tie });
  // primera partida en el portal: tutorial en el primer hoyo, que es el más sencillo
  if (IS_PORTAL && !forced && !tier.entryFee && tutorialPending()) {
    match.tutorial = true;
    match.courses = [0, ...match.courses.filter((c) => c !== 0)].slice(0, match.courses.length);
  }
  let warm = null;
  // la búsqueda vive fuera de la pantalla: la sala (src/screens/matchmaking.js) y el aviso flotante la pintan,
  // y sigue aunque se vuelva al lobby; aquí solo se van rellenando los asientos
  const search = createSearch({
    tier,
    mode: tier.entryFee ? 'local' : 'practice',
    seats: Math.max(PLAYERS_PER_MATCH, match.players.length),
    info: defaultInfo(tier),
    show: showSearch,
    onCancel: () => { warm?.cancel(); return match.service.cancel(match); },
  });
  go('matchmaking');
  perf.mark('room:shown');
  // F2: el hoyo 1 se prepara oculto mientras se llenan los asientos (con la sala ya tapando el hub)
  warm = gamePreloader.warm(warmRequest(match.courses[0], match.players.filter((p) => p.isBot).length));
  const quit = () => { warm.cancel(); };
  // F5: la sala dura al menos ROOM_MIN_MS desde el clic (`?room=old` o ROOM_MIN_MS = 0: tiempos de antes)
  const roomMin = new URLSearchParams(location.search).get('room') === 'old' ? 0 : ROOM_MIN_MS;
  const { seatWaits, launchWaitMs } = roomDelays({ players: match.players.length, rnd: Math.random, elapsedMs: performance.now() - clickAt, minMs: roomMin });
  for (let i = 0; i < match.players.length; i++) {
    await wait(seatWaits[i]);
    if (search.ended) return quit();
    const p = match.players[i];
    search.setSeat(i, { name: p.name, color: p.color, me: p.id === 'me' }); // el tic suena al pintar el asiento
  }
  await wait(launchWaitMs);
  if (search.ended) return quit();
  perf.mark('room:launching');
  search.setPhase('launching');
  await search.present(); // desde otra pantalla: vuelve a la sala para la salida
  if (search.ended) return quit();
  // si el hoyo aún no está listo, «Preparando el campo…» con tope (HOLD_PRACTICE_MS)
  await gamePreloader.hold(warm, search, HOLD_PRACTICE_MS);
  if (search.ended) return quit();
  perf.mark('room:go');
  search.go(); // «¡YA!» y salida animada (la pinta la sala)
  await wait(650);
  if (search.ended) return quit();
  await search.leave();
  perf.mark('room:end');
  if (search.ended) return quit();
  search.finish();
  const first = COURSES[match.courses[0]];
  playHole(match, 0, { prepared: gamePreloader.take(warm, warmKey(first)) });
}

// ---------- juego ----------

/**
 * Pantalla de juego. mode 'hole' es un hoyo normal; 'tiebreak' es el hoyo
 * sin agujero del desempate (un tiro, gana el más cercano).
 */
function playScreen(match, { course, title, subtitle, players, onDone, firstSunkTick = null, timeLimit = HOLE_TIME_LIMIT, freePlay = false, onRestartHole = null, onSelectMap = null, rivals = null, live = false, onGame = null, onShots = null, prepared = null, reuse = false }) {
  const tiebreak = !!course.noCup;
  gameplayStart();
  // F3: hoyo siguiente de la misma partida (o Modo Libre siguiente/repetir): mismo juego, mismo renderer
  const keep = reusableGame({ reuse, live, prepared });
  // sin hoyo preparado (otro hoyo, Modo Libre, desempate…) no queda ninguno a medias: un solo contexto de partida
  if (!prepared) gamePreloader.release();
  // en partida el HUD solo lleva FPS · latencia, Ajustes y Pantalla completa:
  // ni golpes de cada rival en directo ni avisos menores (sí el «¡Birdie!» al embocar)
  const lean = !freePlay;
  const view = h(`
    <main class="play-screen ${tiebreak ? 'is-tiebreak' : ''} ${freePlay ? 'is-freeplay' : ''}">
      <div class="stage"></div>
      <div class="vignette"></div>
      <div class="hud ${freePlay ? 'hud-freeplay' : 'hud-lean'}">
        ${lean ? '<div class="pill net-stats" title="Fotogramas por segundo · latencia con el servidor">— FPS · — ms</div>' : `
        <div class="pill hl freeplay-pill">Modo Libre</div>
        <div class="pill">${course.name}</div>
        <div class="pill">Par ${course.par}</div>
        <div class="pill strokes">Golpes <b>0</b></div>
        <div class="pill dist">— m</div>`}
        ${freePlay ? `
        <button class="pill restart-btn hud-freeplay-btn" aria-label="Reiniciar hoyo" title="Reiniciar hoyo al tee (R)">${icon('restart')}Reiniciar <kbd class="kbd-hint">R</kbd></button>
        <button class="pill map-select-btn hud-freeplay-btn" aria-label="Elegir otro mapa" title="Elegir otro mapa">${icon('map')}Mapas</button>
        ` : ''}
        ${lean ? '' : `<button class="pill mute mobile-only" aria-label="Sonido">${soundLabel()}</button>`}
        <button class="pill fullscreen ${lean ? '' : 'mobile-only'}" aria-label="Pantalla completa" title="Pantalla completa (F11)">${icon('fullscreen')}Pantalla</button>
        <button class="pill settings-btn-hud mobile-only" aria-label="Ajustes" title="Ajustes (Esc)">${icon('gear')}Ajustes</button>
        <button class="pill desktop-esc-hint" aria-label="Ajustes">${icon('gear')}Ajustes <kbd class="kbd-hint">Esc</kbd></button>
      </div>
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
  paintApp(view, { keepGame: keep });
  gameClass.then((GolfGame) => {
    if (!view.isConnected) { prepared?.dispose(); return; } // se salió de la pantalla mientras cargaba el motor
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
    const showDistance = () => distEl && (distEl.textContent = `${game.distanceToCup().toFixed(tiebreak ? 2 : 1)} m`);
    const netEl = view.querySelector('.net-stats');
    if (netEl) mountNetStats(netEl, { ping: backend?.ping });
    // avisos menores (lava, agua, rivales…): solo en Modo Libre
    const notify = (text, color) => !lean && toast(text, color);
    const banner = (text) => {
      cupBanner.textContent = text;
      cupBanner.classList.add('show');
    };
    const finish = (strokes) => {
      if (finished) return;
      finished = true;
      game.locked = true;
      game?.exitPointerLock?.();
      perf.stopFrames(`hole${perf.hole()}`);
      perf.mark('hole:done', { gl: perf.gl(game?.renderer, 'hole:done') });
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
          else go('freeplay');
        });
      }

      view.append(overlay);
    }

    const handlers = {
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
        if (st.sunk) notify(`${esc(p.name)} ha embocado en ${st.strokes}`, p.color);
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
        if (distEl) distEl.textContent = '0 m';
      },
      onSunk: finish,
      onTimer: (left) => {
        if (left == null) return (timerEl.hidden = true);
        if (timerEl.hidden) notify(`¡${left} s para embocar o quedas descalificado!`, '#ff5a5a');
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
      onLip: () => notify('¡Uy! Demasiado fuerte para entrar', '#ffffff'),
      onLava: () => notify(`${icon('fire')} ¡A la lava! Vuelves al sitio del golpe`, '#ff8a3a'),
      onWater: () => notify(`${icon('drop')} ¡Al agua! Vuelves al sitio del golpe`, '#7fdcff'),
      onOut: () => notify(`${icon('palm')} ¡Fuera del campo! Vuelves al sitio del golpe`, '#b8f07a'),
      onFall: () => notify(`${icon('pit')} ¡Al agujero! Vuelves al sitio del golpe`, '#ffc400'),
      onRest: (n) => {
        showDistance();
        if (tiebreak) {
          setChip('me', `${game.distanceToCup().toFixed(2)}m`, true);
          setTimeout(() => finish(n), 900);
        } else if (!freePlay && n >= maxStrokesOf(course)) finish(n);
      },
    };
    // hoyo preparado en la sala: se le dan los avisos y su canvas pasa a la pantalla (load toma el camino rápido).
    // F3: con el juego de la partida en curso, igual: sus avisos y su canvas a esta pantalla; load intercambia la escena
    const kept = keep && game && !game.disposed ? game : null;
    game = prepared ?? kept ?? new GolfGame(stageEl, handlers);
    if (prepared || kept) {
      game.setHandlers(handlers);
      game.attach(stageEl);
    }
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
        else go('freeplay');
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
    if (isMuted()) notify('Sonido silenciado · actívalo en Ajustes', '#ffffff');
    view.querySelector('.mute')?.addEventListener('click', toggleMute);
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

function playHole(match, index, { prepared = null, reuse = false } = {}) {
  const course = COURSES[match.courses[index]];
  perf.setContext({ hole: index, course: course.name, courseIndex: match.courses[index] });
  let tutorial = null;
  const guided = match.tutorial && index === 0 ? {
    onGame: (_g, { view }) => { tutorial = startTutorial(view); },
    onShots: () => tutorial?.stroke(1),
  } : {};
  playScreen(match, {
    ...guided,
    course,
    prepared,
    reuse,
    title: `Hoyo ${index + 1}/${match.holes}`,
    subtitle: `Hoyo ${index + 1}`,
    players: match.players,
    onDone: (g, strokes) => {
      const bots = g.finishBots();
      const dq = g.timedOut;
      // F3: el hoyo siguiente se construye mientras se ve el resultado de este (nunca durante el hoyo)
      const nxt = nextToPrepare({ mode: match.service === practice ? 'practice' : 'local', index, holes: match.holes });
      if (nxt?.kind === 'hole') prepareNextHole(COURSES[match.courses[nxt.index]], match.players.filter((p) => p.isBot).length);
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
  let going = false;
  overlay.querySelector('.next').addEventListener('click', async () => {
    if (going) return;
    going = true;
    if (last) return afterLastHole(match);
    perf.mark('hole:next:click');
    await waitNextHole(); // hoyo siguiente preparado (F3): como mucho NEXT_WAIT_MS
    if (!overlay.isConnected) return; // se salió mientras tanto
    playHole(match, index + 1, { reuse: true });
  });
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
  // F3: el desempate se construye mientras se ve este aviso (solo si lo juegas tú)
  const nxt = nextToPrepare({ mode: match.service === practice ? 'practice' : 'local', index: match.holes - 1, holes: match.holes, tied: meTied });
  if (nxt?.kind === 'tiebreak') prepareNextHole(TIEBREAK_COURSE, tied.filter((p) => p.isBot).length);
  let going = false;
  overlay.querySelector('.next').addEventListener('click', async () => {
    if (going) return;
    going = true;
    if (!meTied) return simulateTiebreak(match, tied);
    await waitNextHole();
    if (!overlay.isConnected) return;
    playTiebreak(match, tied);
  });
  app.append(overlay);
}

function playTiebreak(match, tied) {
  perf.setContext({ tiebreak: true });
  playScreen(match, {
    course: TIEBREAK_COURSE,
    reuse: true,
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
  showEndOverlay({
    onRematch: () => startMatch(match.tier),
    won,
    position: result.me.position,
    total: PLAYERS_PER_MATCH,
    prize: match.tier.entryFee ? (won ? `Premio ${coin(result.me.payout)}` : `Bote ${coin(result.pot)} para el ganador`) : IS_PORTAL ? 'Partida rápida' : 'Partida de práctica',
    ranking: result.ranking,
    legal: match.tier.entryFee ? `Bote ${fmt(result.pot)} · comisión ${fmt(result.commission)} · premio ${fmt(result.prize)}` : '',
    holes: match.myHoles.filter(Boolean),
    gained,
  });
}

// ---------- cofre (solo portal) ----------
async function openChest() {
  if (chestReadyAt() > Date.now()) return { state: 'wait' };
  const r = await rewardedAd();
  if (r === 'adblock') return { state: 'adblock' };
  markChestOpened();
  const res = progress.openChest();
  if (res.skin) { claimRewards(); return { state: 'skin', skin: res.skin }; }
  return { state: 'xp', xp: res.xp };
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
        ${gained.drop ? `<p class="reward-note drop-note"><i></i>✦ ¡Premio raro! Te ha tocado ${esc(gained.drop.name)}</p>` : ''}
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
    gameplayStop();
    midgameAd().then(onRematch);
  });
  overlay.querySelector('.next').addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    gameplayStop();
    midgameAd().then(() => goHome());
  });
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
const LIVE_NEXT_MS = 1500; // pausa entre hoyos (sin marcador)
const LIVE_GRACE_TICKS = 120 * 6; // margen tras acabarse el contador del hoyo
const LIVE_HOLE_CAP_MS = 150000; // como mucho se espera esto a los demás en un hoyo

let currentLive = null;

/**
 * Para la partida en vivo (latido, canal, temporizadores) y, si no ha acabado, la abandona en el servidor.
 * Mientras se espera en la sala (live.searching) NO hace nada salvo con force: «Volver al lobby», goHome() y las
 * entradas a Mesas/Ajustes/Mapas no deben matar la búsqueda en segundo plano; cancelarla sí (force).
 * Devuelve la promesa del abandono (o undefined).
 */
function stopLive({ force = false } = {}) {
  const live = currentLive;
  if (!live) return;
  if (live.searching && !force) return;
  app.querySelector('.overlay')?.remove();
  currentLive = null;
  live.stopped = true;
  live.warm?.cancel();
  live.warm = null;
  clearTimeout(live.beat);
  clearInterval(live.timer);
  live.room?.close();
  live.search?.abort(); // sin efecto si ya se canceló o empezó
  // salir a mitad de partida cuenta como abandono (lo que falte, con el máximo)
  if (!live.finished) {
    live.finished = true; // una sola llamada a leave, venga de donde venga
    return backend.tournaments.leave(live.match).catch(() => { });
  }
}

const liveNow = (match) => Date.now() + (match.clockOffset ?? 0);

async function startTournament(tier, rematchOf = null) {
  importGolfGame().catch(() => {});
  stopLive();
  perf.setContext({});
  perf.mark('click');
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
  perf.mark('join:end');
  enterLive(match);
}

/** Entra en una partida: a la sala si aún no ha empezado, o al hoyo por el que vas. */
function enterLive(match) {
  importGolfGame().catch(() => {});
  // la misma mesa en la que ya esperas (doble toque, o el aviso del grupo de una partida que ya tienes): a su sala
  if (currentLive?.searching && currentLive.match.id === match.id) return showSearch();
  // otra búsqueda en marcha (p. ej. el grupo entra en un torneo mientras buscabas solo): se cancela
  // (recupera esa entrada) antes de entrar en esta
  const prev = activeSearch();
  if (prev && currentLive?.search !== prev) prev.cancel();
  stopLive({ force: true });
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

/**
 * Sala de espera en vivo. La búsqueda (src/match/matchmakingController.js) sigue aunque se salga de la sala:
 * el latido (enterLive) le pasa jugadores y hora de arranque, y al llegar a 0 lanza la partida desde donde esté.
 */
function showLiveRoom(live) {
  const { match } = live;
  const { tier } = match;
  live.fast = true;
  live.searching = true;
  const legal = `${match.rematchOf ? `<p>${esc(t('matchmaking.rematchLegal'))}</p>` : ''}<p>${esc(t('matchmaking.liveLegal'))}</p>`;
  const search = createSearch({
    tier,
    mode: 'live',
    seats: match.seats,
    now: () => liveNow(match),
    info: {
      kicker: `${esc(tier.name)} · ${esc(t('matchmaking.liveKicker'))}`,
      title: esc(t(match.rematchOf ? 'matchmaking.rematchTitle' : 'matchmaking.liveTitle')),
      potNote: esc(t('matchmaking.livePotNote')),
      infoHtml: legal,
    },
    show: showSearch,
    // cancelar (sala o aviso): sale de la mesa y recupera la entrada; stopLive llama a leave una sola vez
    onCancel: () => stopLive({ force: true }),
    onLaunch: () => launchLive(live),
  });
  live.search = search;
  const sync = () => {
    for (let i = 0; i < match.seats; i++) {
      const p = match.players.find((q) => q.seat === i);
      search.setSeat(i, p ? { name: p.id === 'me' ? 'Tú' : p.name, color: p.color, me: p.id === 'me' } : null);
    }
    if (match.startsAt) search.setStartsAt(match.startsAt);
  };
  live.onStatus = () => {
    if (search.phase === 'search') sync();
  };
  sync();
  go('matchmaking');
  perf.mark('room:shown');
}

/** Cuenta atrás a 0: bots en los huecos, arranque en el servidor, salida animada y primer hoyo. */
async function launchLive(live) {
  const { match } = live;
  const { search } = live;
  if (live.stopped || search.ended) return;
  perf.mark('room:launching');
  search.setPhase('launching');
  const shown = search.present(); // desde otra pantalla: vuelve a la sala para ver el arranque
  search.setStatus(t('matchmaking.fillingBots'));
  try {
    await backend.tournaments.status(match);
  } catch { }
  await shown;
  if (live.stopped) return;
  live.roster = buildRoster(match);
  // F2 en vivo: apagado (WARM_LIVE = false) hasta tener un entorno de pruebas; con false no se prepara nada
  if (WARM_LIVE) live.warm = gamePreloader.warm(warmRequest(match.courses[0], live.roster.length - 1));
  for (const r of live.roster) {
    if (r.isBot) continue;
    search.setSeat(r.seat, { name: r.name, color: r.color, me: r.id === 'me' });
  }
  for (const r of live.roster) {
    if (!r.isBot) continue;
    await wait(140);
    if (live.stopped) return;
    search.setSeat(r.seat, { name: r.name, color: r.color, isBot: true });
  }
  try {
    await backend.tournaments.start(match);
  } catch {
    if (live.stopped) return;
    search.setPhase('error');
    search.setStatus('No se ha podido empezar la partida.');
    return retryMsg('No se ha podido empezar la partida.', () => {
      search.setPhase('launching');
      return launchLive(live);
    }, {
      cancelLabel: 'Cancelar y salir',
      onCancel: () => {
        search.cancel();
        goHome();
      },
    });
  }
  if (live.stopped) return;
  if (live.warm) {
    await gamePreloader.hold(live.warm, search, HOLD_LIVE_MS);
    if (live.stopped) return;
  }
  perf.mark('room:go');
  search.go();
  await wait(380);
  if (live.stopped) return;
  await search.leave();
  perf.mark('room:end');
  if (!live.stopped) beginLive(live);
}

async function beginLive(live) {
  const { match } = live;
  live.fast = false;
  live.onStatus = null;
  live.searching = false; // ya en partida: salir cuenta como abandono (stopLive vuelve a actuar)
  live.search?.finish();
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
  perf.setContext({ hole: index, course: course.name, courseIndex: match.courses[index] });
  live.hole = index;
  live.game = null;
  live.check = null;
  const me = live.roster.find((r) => r.id === 'me');
  const rivals = live.roster
    .filter((r) => r.id !== 'me')
    .map((r) => (r.isBot ? { ...r, rng: seededRng(`${match.id}:${index}:${r.seat}`) } : { ...r, remote: live.room.feed(r.seat, index) }));
  // hoyo 1 preparado en la sala (solo con WARM_LIVE; si no, live.warm no existe)
  const prepared = index === 0 && live.warm ? gamePreloader.take(live.warm, warmKey(course)) : null;
  live.warm = null;
  playScreen(match, {
    course,
    prepared,
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
  // sin marcador entre hoyos: la clasificación sale solo al final de la partida.
  // Una pausa corta para ver el «¡Birdie!» del hoyo y se pasa al siguiente.
  const last = index + 1 >= match.holes;
  clearTimeout(live.timer);
  live.timer = setTimeout(() => {
    if (live.stopped || live.hole !== index) return;
    if (last) liveAfterRound(live);
    else {
      perf.mark('hole:next:click', { auto: true }); // en vivo el paso al siguiente hoyo es automático
      playLiveHole(live, index + 1);
    }
  }, LIVE_NEXT_MS);
}

/**
 * Tras el último hoyo: no decides hasta que todos los jugadores reales hayan cerrado
 * su ronda (o se hayan desconectado). Así el que acaba primero también ve si empata.
 */
function liveAfterRound(live) {
  app.querySelector('.overlay')?.remove();
  live.roundWait = null;
  live.decided = false;
  live.fast = true;
  live.onStatus = () => decideAfterRound(live);
  decideAfterRound(live);
}

async function decideAfterRound(live) {
  if (live.stopped || live.decided) return;
  const { match } = live;
  if (match.status !== 'open') {
    live.decided = true;
    return showLiveResults(live);
  }
  if (!roundReady(match.players, match.holes)) return showRoundWait(live);
  live.decided = true;
  live.roundWait?.remove();
  live.roundWait = null;
  const tied = humanLeaders(match.players, match.holes);
  // si empatas y aún no has jugado el desempate, lo juegas (el servidor solo lo admite con la partida abierta)
  if (tied.length >= 2 && tied.some((p) => p.id === 'me') && match.me.tiebreak === undefined) {
    live.onStatus = null;
    return liveTiebreak(live, tied);
  }
  live.finished = true;
  try {
    await backend.tournaments.finish(match);
  } catch { }
  showLiveResults(live);
}

/** Mientras esperamos al resto: quién falta por cerrar su ronda. */
function showRoundWait(live) {
  const { match } = live;
  live.fast = true;
  const left = match.players.filter((p) => p.id !== 'me' && p.online && !roundComplete(p, match.holes)).map((p) => p.name);
  if (!live.roundWait) {
    live.roundWait = h(`
      <div class="overlay">
        <div class="card">
          <h2>Esperando a los demás</h2>
          <p class="sub"></p>
          <p class="legal">Si hay empate, jugáis el desempate.</p>
        </div>
      </div>`);
    app.append(live.roundWait);
  }
  live.roundWait.querySelector('.sub').textContent = left.length ? `Están terminando: ${left.join(', ')}` : 'Cerrando la partida…';
}

function liveTiebreak(live, tied) {
  const { match } = live;
  const label = (p) => (p.id === 'me' ? 'Tú' : p.name);
  const overlay = h(`
    <div class="overlay">
      <div class="card tiebreak-card">
        <div class="vs">${tied.map((p) => `<span class="avatar" style="--c:${p.color}">${esc(label(p)[0])}</span>`).join('<em>VS</em>')}</div>
        <h2 class="score-title">¡Empate a ${tied[0].total}!</h2>
        <p class="sub">${tied.map((p) => esc(label(p))).join(', ')} vais al desempate. Hoyo sin agujero: un solo tiro y gana quien deje la bola más cerca de la diana.</p>
        <button class="primary next">Jugar desempate${icon('next')}</button>
      </div>
    </div>`);
  const play = () => {
    clearTimeout(auto);
    if (live.stopped || !overlay.isConnected) return;
    const hole = match.holes;
    live.hole = hole;
    const me = live.roster.find((r) => r.id === 'me');
    // los rivales salen de los empatados: si falta alguno en el roster, se monta con sus datos del servidor
    const rivals = tied
      .filter((p) => p.id !== 'me')
      .map((p) => ({
        ...(live.roster.find((r) => r.id === p.id) ?? { id: p.id, seat: p.seat, name: p.name, color: p.color, human: true }),
        remote: live.room.feed(p.seat, hole),
      }));
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
  const { me, tier } = match;
  const open = match.status === 'open';
  const cancelled = match.status === 'cancelled';
  const { all, rows } = liveRanking(live);
  if (!open) {
    const gained = recordOnce(match, all);
    if (gained) {
      const mine = all.find((r) => r.id === 'me');
      const won = cancelled ? mine?.position === 1 : me.position === 1 || me.payout > 0;
      // antes del overlay: stopLive quita cualquier .overlay abierto y se llevaría el resultado recién pintado
      stopLive();
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
      ${open ? '' : `<div class="row"><button class="primary again">${icon('restart')}Revancha</button></div>`}
      ${lobbyButton()}
    </main>`);
  view.querySelector('.again')?.addEventListener('click', () => startMatch(tier, match.id));
  const key = `${match.status}:${waiting.length}`;
  paintLive(view);
  if (!open) return stopLive();
  live.fast = true;
  live.onStatus = () => {
    if (!view.isConnected) return;
    const now = `${match.status}:${match.players.filter((p) => !p.finished && p.online).length}`;
    if (now !== key) showLiveResults(live);
  };
}

function retryMsg(text, retry, { onCancel, cancelLabel = 'Cancelar y salir' } = {}) {
  app.querySelector('.overlay')?.remove();
  const cancelBtnHtml = onCancel
    ? `<button type="button" class="ghost cancel">${icon('close')}${esc(cancelLabel)}</button>`
    : '';
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>Sin conexión</h2>
        <p class="sub">${text}</p>
        <button type="button" class="primary">${icon('restart')}Reintentar</button>
        ${cancelBtnHtml}
      </div>
    </div>`);
  overlay.querySelector('button.primary').addEventListener('click', () => {
    overlay.remove();
    retry();
  });
  if (onCancel) {
    overlay.querySelector('button.cancel')?.addEventListener('click', () => {
      overlay.remove();
      onCancel();
    });
  }
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

// reuse (F3): siguiente o repetir desde el resultado reutilizan el juego (sin preparar nada: no hay sala).
// «Reiniciar» (botón, R y Ajustes) sigue igual que antes: juego nuevo.
export function playFreePlay(courseIndex, { reuse = false } = {}) {
  importGolfGame().catch(() => {});
  const isTiebreak = courseIndex === 'tiebreak';
  const course = isTiebreak ? TIEBREAK_COURSE : COURSES[courseIndex];
  const holeNum = isTiebreak ? 'Extra' : courseIndex + 1;
  const totalHoles = COURSES.length;

  playScreen(null, {
    course,
    reuse,
    freePlay: true,
    title: isTiebreak ? 'Desempate' : `Hoyo ${holeNum}/${totalHoles}`,
    subtitle: isTiebreak ? 'Práctica de Precisión' : `Modo Libre · Hoyo ${holeNum}`,
    players: [{ id: 'me', name: 'Tú', color: '#00f076', isBot: false }],
    timeLimit: null,
    onRestartHole: () => playFreePlay(courseIndex),
    onSelectMap: () => go('freeplay'),
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
    playFreePlay(courseIndex, { reuse: true });
  });
  if (nextIndex != null) {
    overlay.querySelector('.next-btn').addEventListener('click', () => {
      overlay.remove();
      playFreePlay(nextIndex, { reuse: true });
    });
  }
  overlay.querySelector('.select-map-btn').addEventListener('click', () => {
    overlay.remove();
    go('freeplay');
  });
  overlay.querySelector('.to-lobby-btn').addEventListener('click', () => {
    overlay.remove();
    goHome();
  });

  app.append(overlay);
  sfx.cup();
}

installThumbObserver(app, (id) => progress.instance(id));
const skinLab = isSkinLabRequested();
if (skinLab) {
  app.innerHTML = '';
  loadSkinInspector().then(({ mountSkinLab }) => mountSkinLab(app));
} else {
  app.innerHTML = '<main class="screen loading"><h1>Golf Cash Battle</h1><p class="sub">Conectando…</p></main>';
  // en portales: el SDK silencia el juego durante los anuncios sin tocar la preferencia del jugador
  const portalReady = IS_PORTAL ? initPortal({
    mute: () => { adMuted = true; syncMute(); },
    unmute: () => { adMuted = false; syncMute(); },
    setMuted: (m) => {
      portalMuted = m;
      syncMute();
      document.querySelectorAll('.pill.mute').forEach((b) => (b.innerHTML = soundLabel()));
    },
  }).then(loadingStart) : Promise.resolve();
  portalReady.then(createBackend).then(async (b) => {
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
      progress.attach(b.user.id, b.account.profile?.progress, (s) => b.account.saveProgress(s), async (id) => {
        // los marcos de reto se validan con las estadísticas guardadas en el servidor: se sincronizan antes
        await b.account.saveProgress(progress.state).catch(() => {});
        return b.account.setFrame(id);
      });
      // hitos de ranking y marco elegido: pueden desbloquear bolas, que se ofrecen al acabar la próxima partida
      b.account.myRanking().then((r) => progress.setServerStats(r)).catch(() => {});
    }
    startNotices(b);
    startPartyWatch(b);
    // aviso de versión nueva: una sola vez por carga (ver ui/versionCheck.js)
    if (!IS_PORTAL) startVersionCheck();
    // el saldo no frena el arranque: `progress` se marca al llegar o a los 3 s
    trackProgress(boot, () => wallet.getBalance());
    // el hub usa vídeo de fondo: no se carga three; el rechazo marca los hitos three/escena y sigue el splash
    // el hub usa vídeo de fondo: la portada precarga el motor de partida (three incluido) en vez de la escena 3D del hub
    const hubScene = boot.preloadScene({
      importScene: () => (lowData() ? Promise.reject(new Error('ahorro de datos')) : importGolfGame()),
      createScene: () => null,
      onScene() {},
      onDiscard() {},
    });
    startRouting(b);
    hubScene.then((scene) => { if (scene && hubPreloader.current() === scene) startCtx.setHubScene(scene); });
    // `hub` espera al lobby pintado y a que la escena llegue o se omita (margen de 8 s)
    const maxMs = Number(document.getElementById('splash')?.dataset.maxMs) || 15000;
    Promise.all([hubScene, waitPainted(app, { maxMs })]).then(([, painted]) => {
      // un lobby que no se pinta es un fallo de arranque: «Reintentar» (splash.js no lo da solo con `session` marcada)
      if (painted) boot.hub(); else boot.fail('lobby sin pintar');
      loadingStop();
      // textura de hoyuelos de la bola (451 KB) en reposo, con el hub ya visible; no en calidad baja ni con ahorro de datos
      const warmDimples = () => { if (!lowData() && getQuality() !== 'low') fetch(`${import.meta.env.BASE_URL}skins/dimples-normal.png`, { priority: 'low' }).catch(() => {}); };
      if ('requestIdleCallback' in window) window.requestIdleCallback(warmDimples, { timeout: 4000 }); else setTimeout(warmDimples, 1500);
      // el motor del juego se baja en reposo para que no esté en el camino crítico tras la sala (no libera el hub)
      if (painted && shouldIdlePrefetch({
        saveData: navigator.connection?.saveData,
        effectiveType: navigator.connection?.effectiveType,
        decision: PREFETCH_DECISION,
      })) {
        const run = () => {
          perf.mark('prefetch:start');
          importGolfGame().catch(() => {}).finally(() => perf.mark('prefetch:end'));
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 8000 });
        else setTimeout(run, 4000);
      }
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
    backend: b, wallet: IS_PORTAL ? null : wallet, progress, avatar, settings, router, sfx, notify, icon, ball,
    portal: IS_PORTAL,
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
      // llegar al hub (también con la búsqueda activa) descarta el hoyo preparado antes de que el hub recree su escena 3D
      reviveHubScene: () => { gamePreloader.release(); reviveHubScene(); },
      playFreePlay: (i) => playFreePlay(i),
      chest: () => openChest(),
    },
    // al entrar en Mesas, Ajustes o Mapas: cerrar el final y la sala en vivo, y liberar la partida
    leavePlay: () => { leaveFinale(); stopLive(); releasePlay(); },
  });
  screenHost = createHost({ router, routes, root: app, ctx, notify, win: window, doc: document });
  const navigate = createNavigator({ router, host: screenHost, rootId: ROOT_SCREEN });
  go = (to) => {
    // portal: sin mesas de pago, monedero, cuenta, ranking ni amigos; todo eso vuelve al inicio
    if (IS_PORTAL && ['lobby', 'tables', 'wallet', 'account', 'ranking', 'friends', 'novedades'].includes(to)) to = 'home';
    return navigate(to === 'lobby' ? 'tables' : to); // «lobby» (Jugar, tecla 1) = Mesas
  };
  startCtx = ctx;
  screenHost.attach();
  testHole = router.start().testHole;
  ctx.testHole = testHole;
  ctx.notifier = notifier;
  ctx.partyWatch = partyWatch;
  router.setBackGuard(backGuard);
  // aviso flotante de la búsqueda en segundo plano: tocarlo vuelve a la sala; su X cancela (como en la sala)
  installDocHidden();
  mountMatchmakingBanner({ onOpen: () => showSearch(), sound: () => sfx.tick() });
}

// ---------- avisos emergentes ----------
// Cada pocos segundos se mira si llegó una petición de amistad o una invitación a grupo
// y se enseña un aviso de 5 s. (notify() sirve para cualquier otro aviso.)

// TODO(F3): notifier y partyWatch sondean ambos parties.mine() con el lobby abierto; compartir el resultado cuando el hub unifique el sondeo.
let stopPresence = null; // latido de conexión: lo usa Mesas para invitar solo a amigos conectados
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
  stopPresence?.();
  stopPresence = startPresence(b.account);
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

// ---------- avisos emergentes ----------
// Cada pocos segundos se mira si llegó una petición de amistad o una invitación a grupo
// y se enseña un aviso de 5 s. (notify() sirve para cualquier otro aviso.)

function startNotifier(b) {
  if (!b.account) return;
  const seen = new Set();
  let first = true;
  const tick = async () => {
    try {
      if (!document.hidden && b.account.profile?.username) {
        const [friendsData, partyData] = await Promise.all([
          b.account.friends().catch(() => null),
          b.parties ? b.parties.mine().catch(() => null) : null,
        ]);
        if (friendsData || partyData) {
          for (const n of newNotices(seen, friendsData, partyData, { seed: first })) {
            sfx.tick();
            if (n.kind === 'friend') {
              notify({ kind: 'friend', icon: 'user-plus', title: 'Petición de amistad', text: `${n.from} quiere ser tu amigo`, onClick: () => go('account') });
            } else {
              notify({ kind: 'invite', icon: 'users', title: 'Invitación a grupo', text: `${n.from} te invita a su grupo`, onClick: () => go('lobby') });
            }
          }
          first = false;
        }
      }
    } catch { }
    setTimeout(tick, NOTIFY_POLL_MS);
  };
  tick();
}
