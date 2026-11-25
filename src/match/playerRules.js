// Jugador de una partida en vivo tal como lo pinta la app. Pura (sin red ni Vite): se prueba en Node.
import { fromWire } from '../progress/avatar.js';
import { frameById } from '../progress/prestige.js';

/** Fila de `players` del servidor -> jugador del cliente. Avatar y marco llegan públicos; sin ellos, por defecto. */
export function toPlayer(p) {
  return {
    id: p.is_me ? 'me' : p.id,
    seat: p.seat,
    name: p.name,
    color: p.color,
    // avatar y marco públicos (el servidor los manda; tu propio jugador usa lo equipado en el cliente)
    avatar: fromWire(p.avatar),
    frame: frameById(p.frame),
    holesPlayed: p.holes_played,
    started: !!p.started,
    online: p.online !== false,
    finished: p.finished,
    // las puntuaciones de los demás llegan vacías hasta que terminas tu ronda
    scores: p.scores ?? null,
    total: p.total ?? null,
    tiebreak: p.tiebreak == null ? undefined : Number(p.tiebreak),
    position: p.position ?? undefined,
    payout: Number(p.payout ?? 0),
  };
}

/**
 * Avatar y marco con los que se pinta un jugador en un asiento. Tú (id 'me' o me: true): lo que tienes equipado
 * ahora en el cliente (`mine`), porque el servidor puede ir un paso por detrás. Los demás: lo que manda el servidor.
 * Bots: nada (se pinta su inicial).
 * @param {object|null} p jugador (de toPlayer, de buildRoster o de la práctica)
 * @param {{ avatar?: object|null, frame?: object|null }} [mine] lo equipado por el jugador propio
 */
export function seatLook(p, mine = {}) {
  if (!p || p.isBot) return { avatar: null, frame: null };
  if (p.id === 'me' || p.me === true) return { avatar: mine.avatar ?? null, frame: mine.frame ?? null };
  return { avatar: p.avatar ?? null, frame: p.frame ?? null };
}
