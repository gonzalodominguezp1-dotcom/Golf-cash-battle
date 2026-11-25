// Marcador de golpes propio (abajo a la derecha). Solo cuenta tus golpes: nunca los de los rivales.
// Lógica pura (sin DOM) para poder probarla con node --test.

const WHITE = [255, 255, 255];
const RED = [255, 64, 64];
const DEFAULT_TOP = 8;

/** «golpe» en singular, «golpes» en el resto de casos. */
export function strokeWord(n) {
  return n === 1 ? 'golpe' : 'golpes';
}

/**
 * Color del número: blanco con 0 golpes, rojo al llegar al máximo del hoyo (`max` = maxStrokesOf(course)).
 * Va progresando de forma lineal entre ambos.
 */
export function strokeColor(strokes, max) {
  const top = Number.isFinite(max) && max > 0 ? max : DEFAULT_TOP;
  const t = Math.min(1, Math.max(0, strokes / top));
  const [r, g, b] = WHITE.map((c, i) => Math.round(c + (RED[i] - c) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

/** El siguiente golpe es el último permitido (`max` = maxStrokesOf(course)). */
export function isNextStrokeLast(strokes, max) {
  return Number.isFinite(max) && strokes === max - 1;
}

/**
 * Estado completo del marcador para pintarlo.
 * En desempate no se cuentan golpes: el marcador se oculta.
 */
export function strokeMarkerState({ strokes = 0, par, max, tiebreak = false } = {}) {
  const n = Math.max(0, Math.floor(Number(strokes) || 0));
  const last = !tiebreak && isNextStrokeLast(n, max);
  return {
    hidden: !!tiebreak,
    number: n,
    word: strokeWord(n),
    color: strokeColor(n, max),
    last,
    text: `Golpes: ${n}${Number.isFinite(par) ? `. Par ${par}` : ''}${last ? '. Último golpe' : ''}`,
  };
}
