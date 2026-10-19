import { HOLES_PER_MATCH, MAX_STROKES_PER_HOLE, PLATFORM_COMMISSION, PLAYERS_PER_MATCH, potFor, round2 } from '../config.js';

const BOT_NAMES = ['Lucía', 'Marco', 'Sofía', 'Diego', 'Valen', 'Hugo', 'Nora', 'Iker', 'Alba', 'Leo', 'Carla', 'Mateo', 'Vera', 'Pablo'];

/**
 * Reparto del bote: gana quien menos golpes totales haga (pura habilidad,
 * sin elementos de azar en el resultado). Si hay empate en cabeza, decide el
 * hoyo de desempate (distancia al objetivo, menor gana); si aun así siguen
 * empatados, el premio se divide.
 */
export function settle(players, tier, tiebreak = {}) {
  const pot = potFor(tier);
  const commission = round2(pot * PLATFORM_COMMISSION);
  const prize = round2(pot - commission);
  const td = (p) => tiebreak[p.id] ?? Infinity;
  const key = (p) => [p.total, p.total === best ? td(p) : 0];
  const best = Math.min(...players.map((p) => p.total));
  const same = (a, b) => key(a)[0] === key(b)[0] && key(a)[1] === key(b)[1];
  const ranked = [...players].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  const winners = ranked.filter((p) => same(p, ranked[0]));
  const share = round2(prize / winners.length);
  return {
    pot,
    commission,
    prize,
    ranking: ranked.map((p) => ({
      ...p,
      tiebreak: tiebreak[p.id],
      position: ranked.findIndex((q) => same(q, p)) + 1,
      payout: winners.includes(p) ? share : 0,
    })),
  };
}

/** Jugadores empatados en cabeza (necesitan desempate si son 2 o más). */
export function leaders(players) {
  const best = Math.min(...players.map((p) => p.total));
  return players.filter((p) => p.total === best);
}

/** Oponentes simulados para la demo; en producción son jugadores reales. */
export const PLAYER_COLORS = ['#ff4d4d', '#4d8dff', '#ffb020', '#3ecf6e', '#b46cff', '#ff7ac6', '#2ed3d3', '#f2f2f2'];

function makeBots(rng) {
  const names = [...BOT_NAMES].sort(() => rng() - 0.5);
  return names
    .slice(0, PLAYERS_PER_MATCH - 1)
    .map((name, i) => ({ id: `bot${i}`, name, skill: 0.25 + rng() * 0.7, isBot: true, color: PLAYER_COLORS[i + 1] }));
}

function pickCourses(total, n, rng) {
  const idx = [...Array(total).keys()].sort(() => rng() - 0.5).slice(0, Math.min(n, total));
  return idx.sort((a, b) => a - b);
}

function botStrokes(par, skill, rng) {
  const r = rng();
  let delta;
  if (r < 0.04 * skill) delta = -2;
  else if (r < 0.3 * skill) delta = -1;
  else if (r < 0.3 * skill + 0.45) delta = 0;
  else if (r < 0.85) delta = 1;
  else delta = 2;
  return Math.min(MAX_STROKES_PER_HOLE, Math.max(1, par + delta));
}

export class MatchService {
  constructor(wallet, rng = Math.random, courseCount = 1) {
    this.wallet = wallet;
    this.rng = rng;
    this.courseCount = courseCount;
  }

  /** Cobra la entrada y monta la mesa de 8 jugadores. */
  async join(tier, playerName = 'Tú') {
    const id = crypto.randomUUID().slice(0, 8);
    if (tier.entryFee > 0) await this.wallet.chargeEntry(tier.entryFee, `Entrada ${tier.name} #${id}`);
    const players = [{ id: 'me', name: playerName, isBot: false, color: PLAYER_COLORS[0] }, ...makeBots(this.rng)].map((p) => ({ ...p, scores: [] }));
    // mismos hoyos para todos, elegidos al crear la partida
    const courses = pickCourses(this.courseCount, HOLES_PER_MATCH, this.rng);
    return { id, tier, players, courses, holes: courses.length };
  }

  /**
   * Registra los golpes de un hoyo. botStrokes trae lo que hicieron los
   * rivales en el campo; si falta alguno se estima por su nivel.
   */
  recordHole(match, holeIndex, par, myStrokes, botStrokesById = {}) {
    for (const p of match.players) {
      const s = p.isBot ? (botStrokesById[p.id] ?? botStrokes(par, p.skill, this.rng)) : myStrokes;
      p.scores[holeIndex] = Math.min(s, MAX_STROKES_PER_HOLE);
      p.total = p.scores.reduce((a, b) => a + b, 0);
    }
    const ranked = [...match.players].sort((a, b) => a.total - b.total);
    return ranked.map((p) => ({ ...p, position: ranked.findIndex((q) => q.total === p.total) + 1 }));
  }

  /** Cierra la partida y paga al ganador (o ganadores en empate). */
  async finish(match, tiebreak = {}) {
    const result = settle(match.players, match.tier, tiebreak);
    const me = result.ranking.find((p) => p.id === 'me');
    if (me.payout > 0) await this.wallet.payPrize(me.payout, `Premio ${match.tier.name} #${match.id}`);
    return { ...result, me };
  }

  /** Abandono antes de empezar a jugar: se devuelve la entrada. */
  async cancel(match) {
    if (match.tier.entryFee > 0) await this.wallet.refund(match.tier.entryFee, `Devolución #${match.id}`);
  }
}
