// Salto de la intro de cámara con un toque (tarea F5-B). Pura. En vivo nunca se salta.
/** @returns {'skip'|'none'} 'skip' = termina la intro y consume el toque. */
export function introSkipAction({ live, intro, skipEnabled }) {
  return skipEnabled && !live && intro < 1 ? 'skip' : 'none';
}
