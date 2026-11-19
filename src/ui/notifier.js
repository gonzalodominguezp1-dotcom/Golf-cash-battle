// Notificador con ciclo de vida: sondea amigos y grupo, avisa de lo nuevo y publica los contadores.
import { NOTIFY_POLL_MS, newNotices } from './notifyRules.js';

export function createNotifier({ account, parties, timers = globalThis, isHidden = () => false, onNotice = () => {} }) {
  const subs = new Set();
  const seen = new Set();
  const notifier = { counts: { friendRequests: 0, partyInvites: 0 } };
  let running = false;
  let first = true;
  let handle = null;
  let gen = 0;

  function setCounts(friends, party) {
    const c = notifier.counts;
    // si una fuente falla (null) se conserva su contador anterior
    const next = {
      friendRequests: friends ? (friends.incoming?.length ?? 0) : c.friendRequests,
      partyInvites: party ? (party.invites?.length ?? 0) : c.partyInvites,
    };
    if (next.friendRequests === c.friendRequests && next.partyInvites === c.partyInvites) return;
    notifier.counts = next;
    for (const fn of [...subs]) fn(next);
  }

  async function tick(myGen) {
    try {
      if (!isHidden() && account?.profile?.username) {
        const [friends, party] = await Promise.all([
          account.friends().catch(() => null),
          parties ? parties.mine().catch(() => null) : null,
        ]);
        if (myGen !== gen) return;
        if (friends || party) {
          for (const n of newNotices(seen, friends, party, { seed: first })) onNotice(n);
          first = false;
          setCounts(friends, party);
        }
      }
    } catch { }
    if (myGen === gen && running) handle = timers.setTimeout(() => tick(myGen), NOTIFY_POLL_MS);
  }

  notifier.start = () => {
    if (running || !account) return;
    running = true;
    first = true;
    seen.clear();
    tick(++gen);
  };
  notifier.stop = () => {
    running = false;
    gen++;
    if (handle != null) timers.clearTimeout(handle);
    handle = null;
  };
  notifier.subscribe = (fn) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };
  return notifier;
}
