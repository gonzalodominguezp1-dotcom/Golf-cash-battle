// Lógica pura del laboratorio de assets (sin three ni DOM): registro de assets,
// rng con semilla y formato de contadores. Se prueba en tests/assets-lab.test.js.

const assets = new Map();

/**
 * Registra un asset del laboratorio. makeOld/makeNew devuelven un Object3D (o null si
 * aún no hay diseño nuevo) a partir de un rng con semilla y la calidad elegida.
 */
export function registerAsset({ id, label, makeOld, makeNew }) {
  if (typeof id !== 'string' || !id) throw new Error('registerAsset: falta id');
  if (typeof label !== 'string' || !label) throw new Error(`registerAsset(${id}): falta label`);
  if (typeof makeOld !== 'function') throw new Error(`registerAsset(${id}): makeOld debe ser función`);
  if (typeof makeNew !== 'function') throw new Error(`registerAsset(${id}): makeNew debe ser función`);
  if (assets.has(id)) throw new Error(`registerAsset: id repetido (${id})`);
  const asset = Object.freeze({ id, label, makeOld, makeNew });
  assets.set(id, asset);
  return asset;
}

export const getAssets = () => [...assets.values()];
export const getAsset = (id) => assets.get(id) ?? null;
export const resetAssets = () => assets.clear();

/** Generador pseudoaleatorio con semilla (mulberry32): misma semilla, misma secuencia. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 742 -> "742"; 1234 -> "1,2k"; 12500 -> "12,5k". */
export function formatCount(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  return `${(Math.round(v / 100) / 10).toString().replace('.', ',')}k`;
}

/** Coste del asset = lo medido con él menos lo medido sin él (nunca negativo). */
export function diffStats(base, total) {
  return {
    triangles: Math.max(0, (total?.triangles ?? 0) - (base?.triangles ?? 0)),
    calls: Math.max(0, (total?.calls ?? 0) - (base?.calls ?? 0)),
  };
}

export function formatStats(s) {
  if (!s) return '';
  return `${formatCount(s.triangles)} tri · ${formatCount(s.calls)} llamadas`;
}
