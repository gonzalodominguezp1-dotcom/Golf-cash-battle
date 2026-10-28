// Reglas puras de los efectos de skin (sin three): topes por skin (E1) y
// reducción de movimiento en partida (E2). Separadas de skinFx.js para poder
// probarlas con node --test.

/** Hora fija con la que se dibuja la bola con «reducir movimiento» (= miniaturas, skinThumbRender.js). */
export const STILL_TIME = 1.2;

// ---------------------------------------------------------------- E2
const QUERY = '(prefers-reduced-motion: reduce)';
let mql = null;
let reduced = false;
let override = null; // para tests
let started = false;

function start() {
  if (started) return;
  started = true;
  const mm = globalThis.matchMedia;
  if (typeof mm !== 'function') return;
  try {
    mql = mm.call(globalThis, QUERY);
    reduced = !!mql.matches;
    const on = (e) => { reduced = !!e.matches; };
    if (mql.addEventListener) mql.addEventListener('change', on);
    else mql.addListener?.(on);
  } catch {
    mql = null;
  }
}

/** Bandera global de solo lectura: true si el usuario pide reducir movimiento. */
export function reducedMotion() {
  if (override !== null) return override;
  start();
  return reduced;
}

/** Solo para tests: fuerza la bandera (null = volver a la del navegador). */
export function setReducedMotionForTests(v) {
  override = v;
}

/** Ráfagas con la bandera activa: n × 0,5 (mínimo 1). */
export function reducedCount(n) {
  return Math.max(1, Math.round(n * 0.5));
}
export const REDUCED_SPEED = 0.6;

// ---------------------------------------------------------------- E1
/**
 * Límite efectivo de partículas: el del nivel de calidad o, si la skin define
 * `fx.maxParticles`, el menor de ambos (y la mitad, redondeada hacia arriba, en baja).
 */
export function particleLimit(levelParticles, levelName, maxParticles) {
  if (!(maxParticles > 0)) return levelParticles;
  const cap = levelName === 'low' ? Math.ceil(maxParticles / 2) : maxParticles;
  return Math.min(levelParticles, cap);
}

/**
 * ¿Pueden emitir los emisores continuos? Solo en skins con `maxParticles`:
 * mientras haya menos de la mitad del límite ocupadas, para dejar sitio a los eventos.
 */
export function continuousOpen(count, limit, maxParticles) {
  if (!(maxParticles > 0)) return true;
  return count < limit / 2;
}

/** Partículas por segundo de la estela: `fx.trailRate` o el ritmo actual 10 + 2·speed. */
export function trailRate(trailRateFx, speed) {
  return trailRateFx > 0 ? trailRateFx : 10 + speed * 2;
}

// ---------------------------------------------------------------- E2 (puntos finos)
/** Ruido de la cinta: 0 con reducción de movimiento (la cinta se mantiene, pero recta); si no, el de su estilo. */
export function ribbonNoise(style, rm) {
  if (rm) return 0;
  return style === 'shaped' ? 0.6 : style === 'ribbon_particles' ? 0.25 : 0;
}

/** Emisores de golpe sin los de las celdas `drop` (p. ej. 'soft', 'glyph'). Sin `drop` devuelve la misma lista. */
export function withoutCells(specs, drop) {
  if (!drop || !drop.length) return specs;
  return specs.filter((s) => !drop.includes(s.cell));
}

/** Lista de golpe a usar: la filtrada con la bandera activa y la original si no. */
export function hitList(full, calm, rm) {
  return rm ? calm : full;
}

/** ¿Se emite la ráfaga extra de la embocada? Las skins con `rmNoSinkBurst` la omiten con la bandera. */
export function sinkBurstAllowed(sig, rm) {
  return !(rm && sig?.rmNoSinkBurst);
}

/** ¿Se dibuja la mancha de la embocada? Las skins con `rmNoSinkDecal` la omiten con la bandera. */
export function sinkDecalAllowed(sig, rm) {
  return !(rm && sig?.rmNoSinkDecal);
}

// ---------------------------------------------------------------- ajustes a las referencias
/**
 * Lista «tranquila» para la bandera: sin las celdas `drop` y sin los destellos
 * marcados con `flash: true` (estrellas de rayos del golpe o del rebote).
 * Si no hay nada que quitar devuelve la misma lista.
 */
export function calmList(specs, drop) {
  const hasFlash = specs.some((s) => s.flash);
  if (!hasFlash && !(drop && drop.length)) return specs;
  return withoutCells(specs, drop).filter((s) => !s.flash);
}

/** Amplitud de la onda lateral de la cinta: 0 con la bandera o si la skin no la define. */
export function ribbonWave(wave, rm) {
  return rm || !wave ? 0 : wave.amp;
}

/** Anillo de eco retrasado (golpe o embocada): ninguno con la bandera (como mucho 1 anillo por evento). */
export function echoRing(echo, rm) {
  return rm || !echo ? null : echo;
}

/** Partículas que lanza una lista de emisores a potencia 1 (o con la bandera, cada uno a la mitad). */
export function burstCount(specs, rm = false) {
  let n = 0;
  for (const s of specs) n += rm ? reducedCount(s.n) : s.n;
  return n;
}
