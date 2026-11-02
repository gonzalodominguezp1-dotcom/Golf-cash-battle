// Prestigio: marcos de perfil que se consiguen al llegar a ciertos niveles. Solo cosmético.
// Los ids ('p25'...) los valida también el servidor (set_frame, get_ranking): si cambian, hay que migrar.

export const FRAMES = [
  { id: 'p25', level: 25, name: 'Bronce', color: '#cd7f32', glow: '#ffb067' },
  { id: 'p50', level: 50, name: 'Plata', color: '#c9d3df', glow: '#ffffff' },
  { id: 'p75', level: 75, name: 'Oro', color: '#ffc83d', glow: '#fff1a8' },
  { id: 'p100', level: 100, name: 'Platino', color: '#7fe3d6', glow: '#d6fff9' },
  { id: 'p125', level: 125, name: 'Diamante', color: '#6ab7ff', glow: '#c7e5ff' },
  { id: 'p150', level: 150, name: 'Maestro', color: '#c46bff', glow: '#ffd0ff' },
];

export const frameById = (id) => FRAMES.find((f) => f.id === id) ?? null;

/** Marcos que se han alcanzado con ese nivel, del más bajo al más alto. */
export const framesUnlocked = (level) => FRAMES.filter((f) => level >= f.level);

/** Marco que se luce: el elegido si está alcanzado; si no, el más alto alcanzado (o null). */
export function frameFor(level, pick = null) {
  const open = framesUnlocked(level);
  return open.find((f) => f.id === pick) ?? open.at(-1) ?? null;
}

/** HTML del marco de un avatar: un aro de color. Sin marco, cadena vacía. */
export const frameStyle = (frame) => (frame ? `--frame:${frame.color};--frame-glow:${frame.glow}` : '');
