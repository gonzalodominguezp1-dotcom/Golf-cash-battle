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
