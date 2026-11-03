// Reglas de las partidas en vivo que no dependen del servidor ni del render:
// quién ocupa cada asiento, los bots de relleno y el marcador.

import { PLAYER_COLORS } from './MatchService.js';

const BOT_NAMES = ['Lucía', 'Marco', 'Sofía', 'Diego', 'Valen', 'Hugo', 'Nora', 'Iker', 'Alba', 'Leo', 'Carla', 'Mateo', 'Vera', 'Pablo'];

/** Número pseudoaleatorio repetible a partir de un texto (mismo texto, misma serie en todos los móviles). */
export function seededRng(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Los 8 asientos de la partida: los jugadores reales en su asiento y bots en
 * los huecos. Los bots salen del id de la partida, así que todos los
 * jugadores ven los mismos (mismo nombre, color y nivel).
 */
export function buildRoster(match) {
  const rng = seededRng(`roster:${match.id}`);
  const names = [...BOT_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const humans = new Set(match.players.map((p) => p.name));
  const freeNames = names.filter((n) => !humans.has(n));
  const roster = [];
  for (let seat = 0; seat < match.seats; seat++) {
    const p = match.players.find((q) => q.seat === seat);
    if (p) {
      roster.push({ id: p.id, seat, name: p.id === 'me' ? 'Tú' : p.name, color: p.color, human: true });
      continue;
    }
    const skill = 0.3 + rng() * 0.6;
    roster.push({ id: `bot${seat}`, seat, name: freeNames[seat % freeNames.length], color: PLAYER_COLORS[seat % PLAYER_COLORS.length], skill, isBot: true });
  }
  return roster;
}

/** Jugadores reales empatados en cabeza tras los hoyos (los bots no cuentan). */
export function humanLeaders(players, holes) {
  const done = players.filter((p) => (p.scores?.length ?? 0) >= holes);
  if (!done.length) return [];
  const best = Math.min(...done.map((p) => p.total));
  return done.filter((p) => p.total === best);
}

/**
 * Marcador entre hoyos: jugadores reales con lo que dice el servidor y bots
 * con lo que han hecho en este móvil. Los bots van marcados y sin posición
 * de premio.
 */
export function liveStandings(match, roster, botScores) {
  const rows = roster.flatMap((r) => {
    if (r.isBot) {
      const scores = botScores.map((h) => h?.[r.id]).filter((s) => s != null);
      return [{ id: r.id, name: `${r.name} · bot`, color: r.color, isBot: true, scores, total: scores.reduce((a, b) => a + b, 0) }];
    }
    // quien se fue antes de empezar ya no está en la partida
    const p = match.players.find((q) => q.id === r.id);
    if (!p) return [];
    return [{ ...p, name: r.name, isBot: false, scores: p.scores ?? [], total: p.total ?? 0 }];
  });
  rows.sort((a, b) => a.total - b.total || Number(a.isBot) - Number(b.isBot));
  let pos = 0, last = null;
  rows.forEach((r, i) => {
    if (r.total !== last) pos = i + 1;
    last = r.total;
    r.position = pos;
  });
  return rows;
}
