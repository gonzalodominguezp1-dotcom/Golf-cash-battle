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
  return { pixelRatio: qualityPreset(key).pixelRatio, ...SCENE[key] };
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
