/**
 * Pasa los errores de las funciones SQL (raise exception 'x') a algo legible.
 * Si el mensaje no es un código simple (p. ej. una violación de unicidad de Postgres) el
 * código queda en 'unknown', pero se conserva el mensaje y el código SQL en e.detail y
 * e.sqlState para poder diagnosticarlo (consola y pantalla de error).
 */
export function rpcError(error) {
  const message = error?.message ?? '';
  const code = /^[a-z_]+$/.test(message) ? message : 'unknown';
  const e = new Error(code);
  e.code = code;
  e.sqlState = error?.code ?? null;
  e.detail = [message, error?.details].filter(Boolean).join(' · ') || null;
  return e;
}

/** Texto corto para pegar al final de un aviso al jugador cuando el error no se esperaba. */
export function errorRef(e) {
  if (!e || e.code !== 'unknown') return '';
  const ref = [e.sqlState, e.detail].filter(Boolean).join(' ').slice(0, 140);
  return ref ? ` (${ref})` : '';
}
