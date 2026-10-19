import { InsufficientFundsError } from '../wallet/WalletService.js';
import { rpcError } from '../backend/supabase.js';

/**
 * Torneos asíncronos contra jugadores reales. Cada uno juega los mismos hoyos
 * a su ritmo; el cliente solo manda sus tiros (cuándo, hacia dónde y con qué
 * fuerza) y el servidor los repite con la física para contar los golpes.
 */
// por qué una cuenta no puede entrar en mesas de pago (ver _paid_block)
export const PAID_BLOCKS = ['account_required', 'kyc_required', 'underage', 'account_review'];

export class TournamentService {
  constructor(db, wallet) {
    this.db = db;
    this.wallet = wallet;
  }

  async #rpc(fn, args) {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) {
      const e = rpcError(error);
      if (e.code === 'insufficient_funds') throw new InsufficientFundsError();
      if (PAID_BLOCKS.includes(e.code)) e.blocked = true;
      throw e;
    }
    return data;
  }

  /** Entra en el torneo abierto de esa mesa. Si tenías uno a medias, lo devuelve para seguir. */
  async join(tier, tiers) {
    let data;
    try {
      data = await this.#rpc('join_tournament', { p_tier: tier.id });
    } catch (e) {
      if (e.code !== 'active_match') throw e;
      const open = (await this.mine(tiers)).find((m) => m.status === 'open' && !m.me.finished);
      if (!open) throw e;
      return { ...open, resumed: true };
    }
    await this.wallet.getBalance();
    return toMatch(data, tier);
  }

  async start(match) {
    return update(match, await this.#rpc('start_round', { p_t: match.id }));
  }

  /**
   * Manda los tiros de un hoyo (hole = número de hoyos es el desempate). aim
   * es el gesto de cada tiro ({ d, t }), que mira el antibots.
   */
  async submitHole(match, hole, shots, aim = []) {
    const { data, error } = await this.db.functions.invoke('submit-hole', { body: { tournament: match.id, hole, shots, aim } });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      const e = new Error(body?.error ?? 'network');
      e.code = e.message;
      e.reason = body?.reason;
      throw e;
    }
    update(match, data.tournament);
    if (match.status !== 'open') await this.wallet.getBalance();
    return { strokes: data.strokes, distance: data.distance };
  }

  async status(match) {
    const was = match.status;
    update(match, await this.#rpc('tournament_status', { p_t: match.id }));
    if (was === 'open' && match.status !== 'open') await this.wallet.getBalance();
    return match;
  }

  /** Antes de empezar devuelve la entrada; después cuenta como abandono. */
  async leave(match) {
    update(match, await this.#rpc('leave_tournament', { p_t: match.id }));
    await this.wallet.getBalance();
    return match;
  }

  async mine(tiers) {
    const list = await this.#rpc('my_tournaments');
    return list.map((t) => toMatch(t, tiers.find((x) => x.id === t.tier_id)));
  }
}

function update(match, data) {
  return Object.assign(match, toMatch(data, match.tier));
}

export function toMatch(t, tier) {
  const players = (t.players ?? []).map(toPlayer);
  return {
    id: t.id,
    online: true,
    tier,
    status: t.status,
    courses: t.courses,
    holes: t.courses.length,
    seats: t.seats,
    closesAt: new Date(t.closes_at),
    pot: Number(t.pot),
    commission: Number(t.commission),
    prize: Number(t.prize),
    players,
    me: players.find((p) => p.id === 'me'),
  };
}

function toPlayer(p) {
  return {
    id: p.is_me ? 'me' : p.id,
    seat: p.seat,
    name: p.name,
    color: p.color,
    holesPlayed: p.holes_played,
    finished: p.finished,
    // las puntuaciones de los demás llegan vacías hasta que terminas tu ronda
    scores: p.scores ?? null,
    total: p.total ?? null,
    tiebreak: p.tiebreak == null ? undefined : Number(p.tiebreak),
    position: p.position ?? undefined,
    payout: Number(p.payout ?? 0),
  };
}
