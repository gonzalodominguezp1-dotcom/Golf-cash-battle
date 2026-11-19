// Emparejamiento (buscar rivales antes de la partida): solo el contenido de la pantalla, sin cabecera ni barras del HUD.
// La búsqueda vive fuera (src/match/matchmakingController.js): main.js la crea y la va rellenando; esta pantalla la pinta
// en su estado actual y reacciona a sus eventos. Si se desmonta (Volver al lobby), la búsqueda sigue y la enseña el
// aviso flotante (src/ui/matchmakingBanner.js). El diseño (radar, bote, tarjetas) es src/ui/matchmakingView.js.
// No lee el servidor: el join, el sondeo y el arranque los hace main.js, así que no necesita tope de red propio.
import { prizeFor } from '../config.js';
import { createMatchmakingView } from '../ui/matchmakingView.js';
import { activeSearch } from '../match/matchmakingController.js';
import { coin, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/matchmaking.js';

/** Textos por defecto de la sala de práctica / mesa local (la sala en vivo trae los suyos en search.info). */
export function defaultInfo(tier) {
  return {
    kicker: tier.entryFee ? `${esc(tier.name)} · ${esc(t('matchmaking.table'))}` : esc(t('matchmaking.practiceKicker')),
    title: esc(t('matchmaking.title')),
    potNote: tier.entryFee ? `${esc(t('matchmaking.prize'))} ${coin(prizeFor(tier))}` : esc(t('matchmaking.practiceNote')),
    infoHtml: '',
  };
}

// el bote solo cuenta a los jugadores (los bots de la sala en vivo nunca suman)
const potOf = (search) => search.tier.entryFee * search.players.filter((p) => p && !p.isBot).length;

export function mount(root, ctx) {
  const scope = ctx.scope.child(); // todo cuelga de aquí: destroy lo libera entero
  const search = activeSearch();
  const home = () => ctx.router.reset();

  if (!search) {
    root.innerHTML = `<main class="screen matchmaking mm tier--practice rarity-uncommon"><p class="scr-state">${esc(t('matchmaking.none'))}</p><div class="mm-actions"><button type="button" class="mm-btn mm-btn-lobby" data-mm-lobby>${esc(t('matchmaking.lobby'))}</button></div></main>`;
    const btn = root.querySelector('[data-mm-lobby]');
    if (btn) scope.on(btn, 'click', home);
    return { destroy() { scope.dispose(); } };
  }

  const { tier } = search;
  const info = { ...defaultInfo(tier), ...search.info };
  const fresh = !search.seen; // al volver desde el aviso no se repiten las entradas animadas
  const room = (ctx.matchmakingView ?? createMatchmakingView)({
    tier,
    mode: search.mode,
    seats: search.seats,
    ballHtml: ctx.ball ? ctx.ball(ctx.progress?.skin, 72) : '',
    coin,
    kicker: info.kicker,
    title: info.title,
    potNote: info.potNote,
    infoHtml: info.infoHtml,
    infoLabel: esc(t('matchmaking.info')),
    cancelLabel: esc(t('matchmaking.cancel')),
    lobbyLabel: esc(t('matchmaking.lobby')),
    fresh,
  });
  root.replaceChildren(room.view);

  const countdown = () => {
    const c = search.countdown();
    if (c) room.setCountdown(c.msLeft, c.total);
  };
  const phase = () => {
    room.lock?.(search.phase !== 'search' && search.phase !== 'error');
    if (['go', 'leaving'].includes(search.phase)) room.go({ quiet: !live });
  };

  // estado actual, sin animar lo que ya estaba (al volver a la sala) y escalonado la primera vez
  let live = false;
  for (let i = 0; i < search.seats; i++) room.setSeat(i, search.players[i] ?? null, { sound: false, animate: fresh });
  room.settle?.();
  room.setPot(potOf(search), { instant: !fresh });
  countdown();
  if (search.status) room.setStatus(search.status);
  phase();
  live = true;

  const leaving = () => room.leave();
  search.leaving = leaving;
  scope.sub(search.attachView());
  scope.sub(search.subscribe((ev) => {
    if (ev.type === 'seat') {
      room.setSeat(ev.i, search.players[ev.i] ?? null);
      room.setPot(potOf(search));
    } else if (ev.type === 'second' || ev.type === 'count') countdown();
    else if (ev.type === 'status') room.setStatus(search.status);
    else if (ev.type === 'phase') phase();
  }));

  // Cancelar: sale de la mesa, recupera la entrada y vuelve al lobby. Volver al lobby: la búsqueda sigue.
  const cancelBtn = room.cancelButton;
  scope.on(cancelBtn, 'click', async () => {
    room.lock?.(true);
    cancelBtn.disabled = true;
    await search.cancel();
    home();
  });
  if (room.lobbyButton) scope.on(room.lobbyButton, 'click', home);

  return {
    destroy() {
      room.stop();
      if (search.leaving === leaving) search.leaving = null;
      scope.dispose();
    },
  };
}
