// Emparejamiento (buscar rivales antes de la partida): solo el contenido de la pantalla, sin cabecera ni barras del HUD anterior.
// main.js abre la sesión (createMatchmaking) y va rellenando los asientos; esta pantalla solo la pinta y reacciona.
// El diseño (radar, bote, tarjetas, salida animada) es src/ui/matchmakingView.js, compartido con la sala en vivo.
// No lee el servidor: el join lo hace main.js (startMatch), así que no necesita tope de red propio.
import { PLAYERS_PER_MATCH, prizeFor } from '../config.js';
import { createMatchmakingView } from '../ui/matchmakingView.js';
import { bindLobby, lobbyButton } from './components.js';
import { coin, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/matchmaking.js';

let current = null; // sesión abierta por main.js (la que muestra esta pantalla)

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Abre la sesión de emparejamiento. `cancel()` sale y recupera la entrada (navega al hub); `abandon()` deja la búsqueda
 * sin navegar (lo usa el botón de lobby, que ya navega por su cuenta).
 */
export function createMatchmaking({ tier, cancel, abandon }) {
  const subs = new Set();
  const notify = () => { for (const fn of [...subs]) fn(); };
  const session = {
    tier,
    seats: PLAYERS_PER_MATCH,
    players: [],
    phase: 'search', // 'search' → 'go' (mesa llena) → 'leaving' (salida animada)
    leaving: null, // la pantalla registra aquí su animación de salida
    cancel: () => cancel?.(),
    abandon: () => abandon?.(),
    fill(i, p) {
      session.players[i] = { name: p.name, color: p.color, me: p.id === 'me' };
      notify();
    },
    /** Mesa llena: «¡YA!» y salida animada. Resuelve cuando la pantalla ha terminado. */
    async finish() {
      session.phase = 'go';
      notify();
      await wait(650);
      if (current !== session) return;
      session.phase = 'leaving';
      notify();
      await session.leaving?.();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  current = session;
  return session;
}

/** La sesión que se está mostrando (o null). */
export function currentMatchmaking() {
  return current;
}

/** Cierra la sesión: la próxima vez que se monte la pantalla no habrá nada que mostrar. */
export function closeMatchmaking() {
  current = null;
}

export function mount(root, ctx) {
  const scope = ctx.scope.child(); // todo cuelga de aquí: destroy lo libera entero
  const session = currentMatchmaking();

  if (!session) {
    root.innerHTML = `<main class="screen matchmaking"><p class="scr-state">${esc(t('matchmaking.none'))}</p>${lobbyButton()}</main>`;
    bindLobby(root, { ...ctx, scope });
    return { destroy() { scope.dispose(); } };
  }

  const { tier } = session;
  const room = (ctx.matchmakingView ?? createMatchmakingView)({
    tier,
    mode: tier.entryFee ? 'local' : 'practice',
    seats: session.seats,
    ballHtml: ctx.ball ? ctx.ball(ctx.progress?.skin, 72) : '',
    coin,
    kicker: tier.entryFee ? `${esc(tier.name)} · ${esc(t('matchmaking.table'))}` : esc(t('matchmaking.practiceKicker')),
    title: esc(t('matchmaking.title')),
    potNote: tier.entryFee ? `${esc(t('matchmaking.prize'))} ${coin(prizeFor(tier))}` : esc(t('matchmaking.practiceNote')),
    cancelLabel: esc(t('matchmaking.cancel')),
    footHtml: lobbyButton(),
  });
  root.replaceChildren(room.view);

  // los asientos y el bote salen de la sesión; setSeat solo toca el DOM si algo cambia
  const sync = () => {
    let filled = 0;
    for (let i = 0; i < session.seats; i++) {
      const p = session.players[i];
      if (p) filled++;
      room.setSeat(i, p ?? null);
    }
    room.setPot(tier.entryFee * filled);
    if (session.phase !== 'search') room.cancelButton.disabled = true;
    if (session.phase === 'go' && !room.view.classList.contains('is-go')) room.go();
  };
  session.leaving = () => room.leave();
  sync();

  const cancelBtn = room.cancelButton;
  scope.on(cancelBtn, 'click', () => { cancelBtn.disabled = true; session.cancel(); });
  const lobbyBtn = root.querySelector('[data-lobby]');
  // el lobby navega (bindLobby) y además deja la búsqueda, para que la partida no arranque debajo del hub
  if (lobbyBtn) scope.on(lobbyBtn, 'click', () => session.abandon());
  bindLobby(root, { ...ctx, scope });
  scope.sub(session.subscribe(sync));

  return {
    destroy() {
      room.stop();
      if (session.leaving) session.leaving = null;
      scope.dispose();
    },
  };
}
