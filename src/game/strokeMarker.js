// Marcador de golpes propio (abajo a la derecha). Solo cuenta tus golpes: nunca los de los rivales.
// Lógica pura (sin DOM) para poder probarla con node --test.

/** Tono según vayas respecto al par. El número manda; el tono solo acompaña. */
export const STROKE_TONE = Object.freeze({ GOOD: 'good', WARN: 'warn', BAD: 'bad', NEUTRAL: 'neutral' });

/** «golpe» en singular, «golpes» en el resto de casos. */
export function strokeWord(n) {
  return n === 1 ? 'golpe' : 'golpes';
}

/** Igual o menos que el par: verde · +1: amarillo · +2 o más: rojo · sin par conocido: neutro. */
export function strokeTone(strokes, par) {
  if (!Number.isFinite(par)) return STROKE_TONE.NEUTRAL;
  const over = strokes - par;
  if (over <= 0) return STROKE_TONE.GOOD;
  if (over === 1) return STROKE_TONE.WARN;
  return STROKE_TONE.BAD;
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
  const parLine = Number.isFinite(par) ? `Par ${par}` : '';
  return {
    hidden: !!tiebreak,
    number: n,
    word: strokeWord(n),
    parLine: last ? `${parLine ? `${parLine} · ` : ''}último golpe` : parLine,
    tone: strokeTone(n, par),
    last,
    text: `Golpes: ${n}${Number.isFinite(par) ? `. Par ${par}` : ''}${last ? '. Último golpe' : ''}`,
  };
}
