// Duración y tipo de la transición entre pantallas (AC6, AC7). Puro: `reduced` entra por parámetro.
export function transitionFor({ reduced = false } = {}) {
  return reduced ? { ms: 80, kind: 'fade' } : { ms: 200, kind: 'slide' };
}
