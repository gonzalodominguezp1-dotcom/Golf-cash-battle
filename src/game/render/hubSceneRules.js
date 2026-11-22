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

// ---- Viento del banderín ----
// Segmentos del plano, amplitud (m), frecuencia del ondeo y balanceo del mástil por calidad.
// Todas las frecuencias (con su 2.º armónico) quedan por debajo de 2 Hz. low y reduced-motion: sin ondeo.
const WIND = {
  medium: { segW: 12, segH: 6, amp: 0.09, freqHz: 0.8, poleLeanDeg: 1.0, poleFreqHz: 0.35 },
  high:   { segW: 18, segH: 8, amp: 0.11, freqHz: 0.85, poleLeanDeg: 1.4, poleFreqHz: 0.35 },
};

export function flagWindSpec(quality, reduced) {
  if (reduced || quality === 'low') return null;
  return { ...WIND[Object.hasOwn(WIND, quality) ? quality : 'medium'] };
}

const safeT = (t) => (Number.isFinite(t) ? t : 0);

/** Ráfaga lenta: multiplica la amplitud entre 0.6 y 1. */
export function windGust(t) {
  const x = safeT(t);
  return 0.8 + 0.12 * Math.sin(TAU * 0.13 * x) + 0.08 * Math.sin(TAU * 0.31 * x + 1.3);
}

/**
 * Desplazamiento de un vértice del banderín. u ∈ [0,1] va del mástil a la punta, v ∈ [0,1] de abajo arriba.
 * El borde del mástil (u=0) no se mueve; la onda viaja hacia la punta (z = ondeo, y = caída, x = acortamiento).
 */
export function flagWaveOffset(u, v, t, spec) {
  if (!spec) return { x: 0, y: 0, z: 0 };
  const uu = Math.min(1, Math.max(0, Number(u) || 0));
  const vv = Math.min(1, Math.max(0, Number(v) || 0));
  const time = safeT(t);
  const f = spec.freqHz;
  const phase = TAU * (f * time - 0.9 * uu + 0.25 * vv);
  const wave = Math.sin(phase) + 0.35 * Math.sin(2 * phase + 1);
  const grow = uu ** 1.3;
  const a = spec.amp * windGust(time) * grow;
  return { x: -0.35 * a * Math.abs(wave) + 0, y: -0.25 * a * (0.5 + 0.5 * Math.sin(phase + 0.8)) + 0, z: a * wave + 0 }; // «+ 0» evita -0
}

/** Inclinación del mástil con el viento (rad, rotación en z): pequeña y lenta. */
export function poleLean(t, spec) {
  if (!spec) return 0;
  const time = safeT(t);
  const max = (spec.poleLeanDeg * Math.PI) / 180;
  return -max * windGust(time) * (0.7 * Math.sin(TAU * spec.poleFreqHz * time) + 0.3 * Math.sin(TAU * spec.poleFreqHz * 2 * time + 0.9));
}

/**
 * Matriz (column-major, para Matrix4.fromArray) que proyecta sobre el plano y = planeY siguiendo la luz del sol
 * (sunDir apunta hacia el sol). null si el sol está en el horizonte o por debajo.
 */
export function planarShadowMatrix(sunDir, planeY = 0) {
  const [sx, sy, sz] = sunDir ?? [];
  if (![sx, sy, sz].every(Number.isFinite) || !(sy > 1e-4)) return null;
  const kx = sx / sy, kz = sz / sy;
  return [1, 0, 0, 0, -kx, 0, -kz, 0, 0, 0, 1, 0, kx * planeY, planeY, kz * planeY, 1];
}
