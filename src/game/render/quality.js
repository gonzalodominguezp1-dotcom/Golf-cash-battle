// Calidad gráfica: Bajo, Medio o Alto. Solo cambia cómo se dibuja, nunca la
// física. Se guarda en este dispositivo; por defecto Medio en el móvil y Alto
// en el ordenador.

const KEY = 'gcb.quality';
export const QUALITY_LEVELS = ['low', 'medium', 'high'];
export const QUALITY_NAMES = { low: 'Bajo', medium: 'Medio', high: 'Alto' };

// Presupuesto de render por calidad.
// - skinFx: nivel máximo de los FX de skin ('low'|'medium'|'high'); el gobernador
//   (perfGovernor.js) puede bajarlo en caliente, nunca subirlo por encima de aquí.
// - ballSegments: segmentos {w, h} de la esfera de la bola.
// - dimpleRes: resolución {w, h} del mapa normal de hoyuelos.
// - rain: gotas de la lluvia del hoyo 15 (cyber2078); 0 = sin lluvia (una sola malla).
// - puddles: charcos estáticos sobre el suelo del campo del hoyo 15 (0 = ninguno; una sola malla).
// - minPixelRatio: hasta dónde puede bajar la resolución el gobernador si el móvil no llega
//   (resolutionGovernor.js); pixelRatio es el máximo.
// - msaa: muestras de antialias de la imagen intermedia del resplandor (0 = sin).
// - softShadows: sombras PCF suaves (caras) o PCF normales.
// - grass: densidad de las briznas de hierba instanciadas (0 = ninguna); flora.js.
// - lod: detalle de árboles y rocas lisos (0 bajo, 1 medio, 2 alto); de lejos siempre bajan un punto.
// - terrainSeg: factor de subdivisión del terreno de fondo.
// Ni la física ni `quality()` cambian la simulación.
const PRESETS = {
  low: {
    pixelRatio: 1, minPixelRatio: 0.65, shadows: false, shadowRes: 1024, softShadows: false, bloom: false, msaa: 0,
    decor: 0.45, texScale: 0.5, maxLights: 0, env: false, grass: 0.3, lod: 0, terrainSeg: 0.55,
    skinFx: 'low', ballSegments: { w: 24, h: 16 }, dimpleRes: { w: 512, h: 256 }, rain: 0, puddles: 0,
  },
  medium: {
    pixelRatio: 1.5, minPixelRatio: 0.8, shadows: true, shadowRes: 1024, softShadows: false, bloom: true, msaa: 2,
    decor: 0.75, texScale: 1, maxLights: 3, env: true, grass: 0.65, lod: 1, terrainSeg: 0.75,
    skinFx: 'medium', ballSegments: { w: 48, h: 32 }, dimpleRes: { w: 1024, h: 512 }, rain: 900, puddles: 4,
  },
  high: {
    pixelRatio: 2, minPixelRatio: 1, shadows: true, shadowRes: 4096, softShadows: true, bloom: true, msaa: 4,
    decor: 1, texScale: 2, maxLights: 8, env: true, grass: 1, lod: 2, terrainSeg: 1,
    skinFx: 'high', ballSegments: { w: 64, h: 48 }, dimpleRes: { w: 1024, h: 512 }, rain: 2200, puddles: 9,
  },
};

/** Ajustes de un nivel concreto (sin mirar lo guardado). */
export function qualityPreset(level) {
  return PRESETS[QUALITY_LEVELS.includes(level) ? level : 'medium'];
}

function isDesktop() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 900 && (window.matchMedia?.('(pointer: fine)').matches ?? true);
}

/** Móvil modesto (Android con poca memoria o pocos núcleos): mejor empezar en Bajo. */
function isWeakMobile() {
  if (typeof navigator === 'undefined') return false;
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  const android = /Android/i.test(navigator.userAgent ?? '');
  return (mem != null && mem <= 3) || (android && cores != null && cores <= 4);
}

export function defaultQuality() {
  if (isDesktop()) return 'high';
  return isWeakMobile() ? 'low' : 'medium';
}

export function getQuality() {
  try {
    const q = localStorage.getItem(KEY);
    if (QUALITY_LEVELS.includes(q)) return q;
  } catch {}
  return defaultQuality();
}

export function setQuality(q) {
  if (!QUALITY_LEVELS.includes(q)) return;
  try {
    localStorage.setItem(KEY, q);
  } catch {}
}

// En el móvil, Medio sin resplandor ni antialias de la imagen intermedia: en las GPU de
// móvil cada pasada a una imagen intermedia (bloom, MSAA) cuesta mucho más que en un PC,
// y el resplandor se nota poco en una pantalla pequeña. Quien lo quiera tiene Alto.
export const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const MOBILE_MEDIUM = { ...PRESETS.medium, bloom: false, msaa: 0 };

/** Ajustes de la calidad elegida. */
export function quality() {
  const q = getQuality();
  return IS_TOUCH && q === 'medium' ? MOBILE_MEDIUM : PRESETS[q];
}
