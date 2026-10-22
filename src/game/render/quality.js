// Calidad gráfica: Bajo, Medio o Alto. Solo cambia cómo se dibuja, nunca la
// física. Se guarda en este dispositivo; por defecto Medio en el móvil y Alto
// en el ordenador.

const KEY = 'gcb.quality';
export const QUALITY_LEVELS = ['low', 'medium', 'high'];
export const QUALITY_NAMES = { low: 'Bajo', medium: 'Medio', high: 'Alto' };

const PRESETS = {
  low: { pixelRatio: 1, shadows: false, shadowRes: 1024, bloom: false, decor: 0.45, texScale: 0.5, maxLights: 0, env: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowRes: 2048, bloom: true, decor: 0.75, texScale: 1, maxLights: 4, env: true },
  high: { pixelRatio: 2, shadows: true, shadowRes: 4096, bloom: true, decor: 1, texScale: 2, maxLights: 8, env: true },
};

function isDesktop() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 900 && (window.matchMedia?.('(pointer: fine)').matches ?? true);
}

export function defaultQuality() {
  return isDesktop() ? 'high' : 'medium';
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

/** Ajustes de la calidad elegida. */
export function quality() {
  return PRESETS[getQuality()];
}
