// Reglas puras de Logros (AC11): orden y logros ya vistos.
const seenKey = (userId) => `gcb.achievements.seen.v1:${userId}`;

const pctOf = (s) => (s.goal > 0 ? s.value / s.goal : 0);

export function orderAchievements(challenges, stateOf) {
  const rows = challenges.map((c) => ({ ...c, state: stateOf(c.id) }));
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const pending = rows.filter((r) => !r.state.done).sort((a, b) => pctOf(b.state) - pctOf(a.state) || byId(a, b));
  const done = rows.filter((r) => r.state.done).sort(byId);
  return { pending, done };
}

export function seenSet(storage, userId) {
  try {
    const arr = JSON.parse(storage.getItem(seenKey(userId)));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markSeen(storage, userId, doneIds) {
  try {
    const all = seenSet(storage, userId);
    for (const id of doneIds) all.add(id);
    storage.setItem(seenKey(userId), JSON.stringify([...all]));
  } catch {
    /* sin almacenamiento: se volverán a marcar como nuevos */
  }
}
