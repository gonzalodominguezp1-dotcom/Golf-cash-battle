// Reglas puras de la ventana entre hoyos (F3, plan carga-partida): qué se prepara mientras se ve el resultado
// del hoyo y cuándo se reutiliza el renderer. Sin three ni DOM.

/** Espera máxima a que el hoyo siguiente termine de prepararse al pulsar «Siguiente hoyo» (ms). */
export const NEXT_WAIT_MS = 1000;

/**
 * Qué preparar al acabar el hoyo `index` (0-based) de `holes`.
 * mode: 'practice' | 'local' | 'live' | 'freeplay' | 'tiebreak'.
 * tied: el jugador está en el empate final (solo cuenta tras el último hoyo).
 * Devuelve { kind: 'hole', index } | { kind: 'tiebreak' } | null. Nunca más de un hoyo por delante.
 */
export function nextToPrepare({ mode, index, holes, tied = false, persistentLive = false } = {}) {
  if (mode === 'live' ? !persistentLive : mode !== 'practice' && mode !== 'local') return null;
  if (!Number.isInteger(index) || !Number.isInteger(holes) || index < 0 || index >= holes) return null;
  if (index + 1 < holes) return { kind: 'hole', index: index + 1 };
  return tied ? { kind: 'tiebreak' } : null;
}

/**
 * ¿La pantalla siguiente reutiliza el juego en curso (su renderer y su contexto WebGL)?
 * Solo si se pidió (reuse), el interruptor está puesto y no apagado por URL, no es vivo (salvo persistentLive)
 * y hay un juego vivo. Un hoyo preparado en la sala (F2) manda sobre esto.
 */
export function canReuseGame({ reuse = false, enabled = false, off = false, live = false, persistentLive = false, prepared = false, game = null } = {}) {
  if (!reuse || !enabled || off || prepared) return false;
  if (live && !persistentLive) return false;
  return !!game && !game.disposed;
}
