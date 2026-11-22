// Reglas puras del prefetch en reposo del motor del juego (GolfGame.js).
// Interruptor de rollback: poner PREFETCH_DECISION = 'onPlay' desactiva el prefetch en reposo del hub.
export const PREFETCH_DECISION = 'idle';

export function shouldIdlePrefetch({ saveData, effectiveType, decision } = {}) {
  if (decision === 'onPlay') return false;
  if (saveData) return false;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return false;
  return true;
}
