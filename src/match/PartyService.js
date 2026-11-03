import { rpcError } from '../backend/supabase.js';

/**
 * Grupos de amigos: se invitan, el líder elige la mesa y cada uno pulsa
 * «Listo» (acepta pagar esa entrada). Cuando están todos, el servidor los
 * mete juntos en el mismo torneo y apunta su id en party.tournament_id.
 *
 * Todas las llamadas devuelven { party: {...} | null, invites: [{ party, from }] }.
 */
export class PartyService {
  constructor(db) {
    this.db = db;
  }

  async #rpc(fn, args) {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw rpcError(error);
    return data;
  }

  mine() {
    return this.#rpc('my_party');
  }

  invite(username) {
    return this.#rpc('party_invite', { p_username: username });
  }

  respond(partyId, accept) {
    return this.#rpc('party_respond', { p_party: partyId, p_accept: accept });
  }

  leave() {
    return this.#rpc('party_leave');
  }

  setTier(tierId) {
    return this.#rpc('party_set_tier', { p_tier: tierId });
  }

  ready(on) {
    return this.#rpc('party_ready', { p_ready: on });
  }
}
