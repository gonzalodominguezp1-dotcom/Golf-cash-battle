// Reglas puras de la escena 3D del hub (AC13, AC14): órbita, apariciones al azar,
// presupuesto por calidad y cuándo dibujar. Sin three ni document: se prueba con node:test.
import { qualityPreset } from './quality.js';

const TAU = Math.PI * 2;

/** Ángulo de la cámara: una vuelta completa (2π) por periodo, continuo. */
export function orbitAngle(tSeconds, periodS = 90) {
  if (!(periodS > 0) || !Number.isFinite(tSeconds) || tSeconds < 0) return 0;
  return (tSeconds / periodS) * TAU;
}

// Presupuesto de la escena por calidad: partículas, árboles del anillo y hueco mínimo entre apariciones.
const SCENE = {
  low:    { particles: 24,  trees: 14, minGapMs: 14000 },
  medium: { particles: 60,  trees: 26, minGapMs: 9000 },
  high:   { particles: 120, trees: 40, minGapMs: 6000 },
};

export function scenePreset(quality) {
  const key = Object.hasOwn(SCENE, quality) ? quality : 'medium';
  const q = qualityPreset(key);
  return { pixelRatio: q.pixelRatio, minPixelRatio: q.minPixelRatio, shadows: q.shadows, ...SCENE[key] };
}

const KINDS = ['particles', 'butterfly', 'ballIn'];

/**
 * Próxima aparición al azar: qué y cuándo. null con reduced-motion (sin apariciones).
 * `rng` devuelve [0, 1); se consume dos veces (tipo y espera).
 */
export function ambientPlan(rng, quality, reduced) {
  if (reduced) return null;
  const { minGapMs } = scenePreset(quality);
  const r = (v) => Math.min(0.999999, Math.max(0, Number(v) || 0));
  const kind = KINDS[Math.floor(r(rng()) * KINDS.length)];
  const nextInMs = Math.round(minGapMs * (1 + r(rng())));
  return { nextInMs, kind };
}

/** Solo se dibuja si la escena se ve: ni tapada por otra pantalla ni con la pestaña oculta. */
export function shouldRender(state) {
  const { covered = false, hidden = false } = state ?? {};
  return !covered && !hidden;
}

// Tamaño de cada aparición por calidad: chispas, duración de la mariposa y de la bola (segundos).
const AMBIENT = {
  low:    { sparks: 8,  butterflyS: 8,  ballS: 4 },
  medium: { sparks: 20, butterflyS: 10, ballS: 5 },
  high:   { sparks: 36, butterflyS: 12, ballS: 6 },
};

export function ambientSpec(quality) {
  return { ...AMBIENT[Object.hasOwn(AMBIENT, quality) ? quality : 'medium'] };
}

/**
 * Bola que entra en la copa. u ∈ [0,1] es el progreso:
 * `remaining` (1 → 0) es la fracción de distancia que le queda (frena al llegar),
 * `sink` (0 → 1) es lo hundida que está en la copa (solo el último 10 %).
 */
export function ballRollState(u) {
  const x = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  const run = Math.min(1, x / 0.9);
  const remaining = (1 - run) * (1 - run); // ease-out cuadrático
  const sink = x <= 0.9 ? 0 : x >= 1 ? 1 : (x - 0.9) / 0.1;
  return { remaining: x >= 0.9 ? 0 : remaining, sink };
}

export const AMBIENT_KINDS = KINDS;
export const AMBIENT_MAX_DT = 0.1; // tras una pausa o un frame lento el reloj de las apariciones no salta

/** Paso de reloj válido: 0 si no es un número finito > 0; acotado a AMBIENT_MAX_DT. */
export function clampDt(dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, AMBIENT_MAX_DT);
}

/**
 * Rotación de tipos: antes de repetir uno salen los tres. `seen` no se muta.
 * @returns {{kind: string, seen: Set<string>}} la ronda se reinicia (seen vacío) al completar los tres
 */
export function nextAmbientKind(seen, asked) {
  let kind = asked;
  if (seen.has(kind)) kind = KINDS.find((x) => !seen.has(x)) ?? kind;
  const next = new Set(seen).add(kind);
  return { kind, seen: next.size >= KINDS.length ? new Set() : next };
}
