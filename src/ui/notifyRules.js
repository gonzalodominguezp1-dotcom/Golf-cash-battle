// Reglas puras de los avisos emergentes: qué es nuevo entre dos consultas al servidor.

/** Tiempo máximo en pantalla de un aviso (ms). */
export const NOTIFY_MS = 5000;
/** Avisos visibles a la vez; los más antiguos se cierran al llegar otros. */
export const NOTIFY_MAX = 3;
/** Cada cuánto se pregunta por avisos nuevos (ms). */
export const NOTIFY_POLL_MS = 5000;

const key = (kind, id) => `${kind}:${String(id).toLowerCase()}`;

/** Claves de todo lo pendiente ahora mismo: peticiones de amistad recibidas e invitaciones a grupo. */
export function pendingKeys(friends, party) {
  const out = new Map();
  for (const r of friends?.incoming ?? []) out.set(key('friend', r.name), { kind: 'friend', from: r.name });
  for (const i of party?.invites ?? []) out.set(key('invite', i.party), { kind: 'invite', from: i.from, party: i.party });
  return out;
}

/**
 * Avisos nuevos respecto a lo ya visto. `seen` es un Set que se actualiza aquí.
 * La primera consulta solo siembra `seen` (lo que ya estaba pendiente no se anuncia de golpe al abrir).
 */
export function newNotices(seen, friends, party, { seed = false } = {}) {
  const now = pendingKeys(friends, party);
  const fresh = [];
  for (const [k, v] of now) {
    if (!seen.has(k)) {
      seen.add(k);
      if (!seed) fresh.push(v);
    }
  }
  // lo que ya no está pendiente se olvida: si vuelve a llegar, vuelve a avisar
  for (const k of [...seen]) if (!now.has(k)) seen.delete(k);
  return fresh;
}
