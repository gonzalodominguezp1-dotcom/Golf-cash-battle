import { HOLES_PER_MATCH, MAX_STROKES_PER_HOLE, PLATFORM_COMMISSION, PLAYERS_PER_MATCH, potFor, round2 } from '../config.js';

const BOT_NAMES = ['Lucía', 'Marco', 'Sofía', 'Diego', 'Valen', 'Hugo', 'Nora', 'Iker', 'Alba', 'Leo', 'Carla', 'Mateo', 'Vera', 'Pablo'];

/**
 * Reparto del bote: gana quien menos golpes totales haga (pura habilidad,
 * sin elementos de azar en el resultado). Si hay empate, el premio se divide.
 */
export function settle(players, tier) {
  const pot = potFor(tier);
  const commission = round2(pot * PLATFORM_COMMISSION);
  const prize = round2(pot - commission);
  const ranked = [...players].sort((a, b) => a.total - b.total);
  const best = ranked[0].total;
  const winners = ranked.filter((p) => p.total === best);
  const share = round2(prize / winners.length);
  return {
    pot,
    commission,
    prize,
    ranking: ranked.map((p, i) => ({
      ...p,
      position: ranked.findIndex((q) => q.total === p.total) + 1,
      payout: p.total === best ? share : 0,
    })),
  };
}

/** Oponentes simulados para la demo; en producción son jugadores reales. */
function makeBots(rng) {
  const names = [...BOT_NAMES].sort(() => rng() - 0.5);
  return names.slice(0, PLAYERS_PER_MATCH - 1).map((name, i) => ({ id: `bot${i}`, name, skill: 0.25 + rng() * 0.7, isBot: true }));
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
  constructor(wallet, rng = Math.random) {
    this.wallet = wallet;
    this.rng = rng;
  }

  /** Cobra la entrada y monta la mesa de 8 jugadores. */
  async join(tier, playerName = 'Tú') {
    const id = crypto.randomUUID().slice(0, 8);
    if (tier.entryFee > 0) await this.wallet.chargeEntry(tier.entryFee, `Entrada ${tier.name} #${id}`);
    const players = [{ id: 'me', name: playerName, isBot: false }, ...makeBots(this.rng)].map((p) => ({ ...p, scores: [] }));
    return { id, tier, players, holes: HOLES_PER_MATCH };
  }

  /** Registra el resultado del jugador en un hoyo y simula el de los bots. */
  recordHole(match, holeIndex, par, myStrokes) {
    for (const p of match.players) {
      p.scores[holeIndex] = p.isBot ? botStrokes(par, p.skill, this.rng) : Math.min(myStrokes, MAX_STROKES_PER_HOLE);
      p.total = p.scores.reduce((a, b) => a + b, 0);
    }
    const ranked = [...match.players].sort((a, b) => a.total - b.total);
    return ranked.map((p) => ({ ...p, position: ranked.findIndex((q) => q.total === p.total) + 1 }));
  }

  /** Cierra la partida y paga al ganador (o ganadores en empate). */
  async finish(match) {
    const result = settle(match.players, match.tier);
    const me = result.ranking.find((p) => p.id === 'me');
    if (me.payout > 0) await this.wallet.payPrize(me.payout, `Premio ${match.tier.name} #${match.id}`);
    return { ...result, me };
  }

  /** Abandono antes de empezar a jugar: se devuelve la entrada. */
  async cancel(match) {
    if (match.tier.entryFee > 0) await this.wallet.refund(match.tier.entryFee, `Devolución #${match.id}`);
  }
}
