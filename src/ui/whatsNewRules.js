// Reglas puras de las novedades: si hay que mostrar el modal de una versión y cómo se guarda «no volver a mostrar».

/** Clave de localStorage: última versión cuyas novedades el jugador marcó como vistas. */
export const WHATS_NEW_KEY = 'gcb.whatsNew.seen';

/** Notas de la versión indicada, o null si no hay ninguna con puntos. */
export function notesFor(notes, version) {
  const hit = (notes ?? []).find((n) => n?.version === version);
  return hit && Array.isArray(hit.items) && hit.items.length ? hit : null;
}

/**
 * ¿Se muestra el modal? Sí si hay notas para la versión actual y el jugador no la marcó como vista.
 * `storageOk` false (localStorage no disponible): no se puede recordar, así que solo una vez por sesión (`shownNow`).
 */
export function shouldShow({ seen, current, notes, storageOk = true, shownNow = false }) {
  if (!current || !notesFor(notes, current)) return false;
  if (storageOk && seen === current) return false;
  if (!storageOk && shownNow) return false;
  return true;
}

/** Lee la última versión vista. Devuelve { seen, ok }: ok false si el almacenamiento falla. */
export function readSeen(storage) {
  try {
    return { seen: storage?.getItem(WHATS_NEW_KEY) ?? null, ok: true };
  } catch {
    return { seen: null, ok: false };
  }
}

/** Guarda la versión vista. Devuelve false si el almacenamiento falla (entonces vale la regla de una vez por sesión). */
export function writeSeen(storage, version) {
  try {
    storage.setItem(WHATS_NEW_KEY, String(version));
    return true;
  } catch {
    return false;
  }
}
