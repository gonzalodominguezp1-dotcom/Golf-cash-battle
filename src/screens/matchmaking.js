// Emparejamiento (buscar rivales antes de la partida): solo el contenido de la pantalla, sin cabecera ni barras del HUD anterior.
// main.js abre la sesión (createMatchmaking) y va rellenando los asientos; esta pantalla solo la pinta y reacciona.
// No lee el servidor: el join lo hace main.js (startMatch), así que no necesita tope de red propio.
import { PLAYERS_PER_MATCH, potFor } from '../config.js';
import { bindLobby, lobbyButton } from './components.js';
import { coin, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/matchmaking.js';

let current = null; // sesión abierta por main.js (la que muestra esta pantalla)

/**
 * Abre la sesión de emparejamiento. `cancel()` sale y recupera la entrada (navega al hub); `abandon()` deja la búsqueda
 * sin navegar (lo usa el botón de lobby, que ya navega por su cuenta).
 */
export function createMatchmaking({ tier, cancel, abandon }) {
  const subs = new Set();
  const session = {
    tier,
    seats: PLAYERS_PER_MATCH,
    players: [],
    cancel: () => cancel?.(),
    abandon: () => abandon?.(),
    fill(i, p) {
      session.players[i] = { name: p.name, color: p.color, me: p.id === 'me' };
      for (const fn of [...subs]) fn();
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

const seatHtml = (p) => (p
  ? `<div class="seat filled${p.me ? ' me' : ''}" style="--c:${esc(p.color ?? '')}"><span class="avatar">${esc(p.name?.[0] ?? '')}</span><span>${esc(p.name ?? '')}</span></div>`
  : `<div class="seat"><span>${esc(t('matchmaking.seatFree'))}</span></div>`);

export function mount(root, ctx) {
  const scope = ctx.scope.child(); // todo cuelga de aquí: destroy lo libera entero
  const session = currentMatchmaking();
  const icon = (n, o = {}) => ctx.icon(n, o);
  let sc = null; // scope hijo de lo pintado: se libera en cada repintado

  if (!session) {
    root.innerHTML = `<main class="screen matchmaking"><p class="scr-state">${esc(t('matchmaking.none'))}</p>${lobbyButton()}</main>`;
    bindLobby(root, { ...ctx, scope });
    return { destroy() { scope.dispose(); } };
  }

  const { tier } = session;
  const paintSeats = () => {
    const el = root.querySelector('[data-mm-seats]');
    if (!el) return;
    el.innerHTML = Array.from({ length: session.seats }, (_, i) => seatHtml(session.players[i])).join('');
  };

  const paint = () => {
    sc?.dispose();
    sc = scope.child();
    const sub = tier.entryFee ? `${esc(tier.name)} · ${esc(t('matchmaking.pot'))} ${coin(potFor(tier))}` : esc(t('matchmaking.practice'));
    root.innerHTML = `<main class="screen matchmaking tier--${esc(tier.id)}">
      <div class="radar"><span></span><span></span><span></span>${ctx.ball ? ctx.ball(ctx.progress?.skin, 64) : ''}</div>
      <h1>${icon('hourglass')} ${esc(t('matchmaking.title'))}</h1>
      <p class="sub">${sub}</p>
      <div class="seats" role="list" aria-label="${esc(t('matchmaking.seatsLabel'))}" data-mm-seats="1"></div>
      <button type="button" class="ghost cancel" data-mm-cancel="1">${icon('close')}${esc(t('matchmaking.cancel'))}</button>
      ${lobbyButton()}
    </main>`;
    paintSeats();
    const cancelBtn = root.querySelector('[data-mm-cancel]');
    if (cancelBtn) sc.on(cancelBtn, 'click', () => { cancelBtn.disabled = true; session.cancel(); });
    const lobbyBtn = root.querySelector('[data-lobby]');
    // el lobby navega (bindLobby) y además deja la búsqueda, para que la partida no arranque debajo del hub
    if (lobbyBtn) sc.on(lobbyBtn, 'click', () => session.abandon());
    bindLobby(root, { ...ctx, scope: sc });
    sc.sub(session.subscribe(paintSeats));
  };

  paint();
  return { destroy() { sc?.dispose(); scope.dispose(); } };
}
