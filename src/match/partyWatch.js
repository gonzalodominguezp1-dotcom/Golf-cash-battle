// Sondeo del grupo con ciclo de vida: estado del grupo, acciones y torneos nuevos del grupo.
import { newPartyMatch, partyMessage } from './partyRules.js';

export const PARTY_POLL_MS = 3000;
const PARTY_SEEN = 'gcb.party.seen';

export function createPartyWatch({ parties, tournaments, tiers, timers = globalThis, storage }) {
  const subs = new Set();
  const matchSubs = new Set();
  const watch = { state: null };
  let running = false;
  let busy = false;
  let handle = null;
  let gen = 0;

  // el almacenamiento se resuelve al usarlo: con el acceso bloqueado, `localStorage` lanza
  const store = () => storage ?? globalThis.localStorage;
  const seen = () => { try { return store().getItem(PARTY_SEEN); } catch { return null; } };
  const markSeen = (id) => { try { store().setItem(PARTY_SEEN, id); } catch { } };
  const emit = (msg = '') => { for (const fn of [...subs]) fn(watch.state, { msg }); };

  // si el grupo acaba de entrar en un torneo, se avisa a quien escuche (sala o seguir jugando)
  async function openIfNew(state) {
    const id = newPartyMatch(state?.party, seen());
    // sin nadie que lo abra no se marca como visto: se abrirá cuando alguien se suscriba
    if (!id || matchSubs.size === 0) return false;
    const myGen = gen;
    markSeen(id);
    let match;
    try { match = await tournaments.get(id, tiers); } catch { return false; }
    if (myGen !== gen) return false;
    if (match.status !== 'open' || !match.me || match.me.finished) return false;
    for (const fn of [...matchSubs]) await fn(match);
    return true;
  }

  watch.apply = async (job, okMsg = '') => {
    if (busy) return;
    busy = true;
    try {
      const state = await job();
      if (await openIfNew(state)) return;
      watch.state = state;
      emit(okMsg);
    } catch (e) {
      emit(partyMessage(e.code));
    } finally {
      busy = false;
    }
  };

  watch.pickTier = (tier) =>
    watch.apply(async () => {
      if (!watch.state.party.leader) {
        // un miembro solo puede confirmar la mesa que ya eligió el líder
        if (watch.state.party.tier_id !== tier.id) throw Object.assign(new Error(), { code: 'not_leader' });
        return parties.ready(true);
      }
      await parties.setTier(tier.id);
      return parties.ready(true);
    });

  async function poll(myGen) {
    if (!busy) {
      try {
        const state = await parties.mine();
        if (myGen !== gen) return;
        if (!(await openIfNew(state)) && JSON.stringify(state) !== JSON.stringify(watch.state)) {
          watch.state = state;
          emit('');
        }
      } catch { }
    }
    if (myGen === gen && running) handle = timers.setTimeout(() => poll(myGen), PARTY_POLL_MS);
  }

  watch.start = () => {
    if (running || !parties) return;
    running = true;
    poll(++gen);
  };
  watch.stop = () => {
    running = false;
    gen++;
    if (handle != null) timers.clearTimeout(handle);
    handle = null;
  };
  watch.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  watch.onNewMatch = (fn) => { matchSubs.add(fn); return () => matchSubs.delete(fn); };
  return watch;
}
