import { InsufficientFundsError } from '../wallet/WalletService.js';
import { rpcError } from '../backend/supabase.js';

/**
 * Misma API que MatchService, pero la partida vive en Supabase: el servidor
 * elige los hoyos, cobra la entrada, guarda cada hoyo y reparte el bote.
 */
export class SupabaseMatchService {
  constructor(db, wallet) {
    this.db = db;
    this.wallet = wallet;
  }

  async #rpc(fn, args) {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) {
      const e = rpcError(error);
      if (e.code === 'insufficient_funds') throw new InsufficientFundsError();
      throw e;
    }
    return data;
  }

  async join(tier) {
    let data;
    try {
      data = await this.#rpc('join_match', { p_tier: tier.id });
    } catch (e) {
      if (e.code !== 'active_match') throw e;
      // quedó una partida a medias (se cerró la pestaña): se abandona y se entra en la nueva
      const old = await this.#rpc('active_match');
      if (old) await this.#rpc('abandon_match', { p_match: old.id });
      data = await this.#rpc('join_match', { p_tier: tier.id });
    }
    await this.wallet.getBalance();
    return { id: data.id, tier, players: data.players.map(toPlayer), courses: data.courses, holes: data.courses.length };
  }

  async recordHole(match, holeIndex, par, myStrokes, botStrokesById = {}) {
    const data = await this.#rpc('submit_hole', {
      p_match: match.id,
      p_hole: holeIndex,
      p_strokes: myStrokes,
      p_bot_strokes: botStrokesById,
    });
    match.players = data.players.map(toPlayer);
    const ranked = [...match.players].sort((a, b) => a.total - b.total);
    return ranked.map((p) => ({ ...p, position: ranked.findIndex((q) => q.total === p.total) + 1 }));
  }

  /** tiebreak: { idJugador: distancia } del hoyo de desempate, si lo hubo. */
  async finish(match, tiebreak = {}) {
    const byUuid = Object.fromEntries(Object.entries(tiebreak).map(([id, d]) => [match.players.find((p) => p.id === id)?.uuid ?? id, d]));
    const data = await this.#rpc('finish_match_tb', { p_match: match.id, p_tiebreak: byUuid });
    await this.wallet.getBalance();
    const ranking = data.players.map(toPlayer).sort((a, b) => a.position - b.position);
    return {
      pot: Number(data.pot),
      commission: Number(data.commission),
      prize: Number(data.prize),
      ranking,
      me: ranking.find((p) => p.id === 'me'),
    };
  }

  async cancel(match) {
    await this.#rpc('abandon_match', { p_match: match.id });
    await this.wallet.getBalance();
  }
}

function toPlayer(p) {
  return {
    id: p.is_me ? 'me' : p.id,
    uuid: p.id,
    name: p.name,
    isBot: p.is_bot,
    color: p.color,
    skill: Number(p.skill ?? 0.5),
    scores: p.scores ?? [],
    total: p.total ?? 0,
    position: p.position ?? undefined,
    payout: Number(p.payout ?? 0),
    tiebreak: p.tiebreak == null ? undefined : Number(p.tiebreak),
  };
}
