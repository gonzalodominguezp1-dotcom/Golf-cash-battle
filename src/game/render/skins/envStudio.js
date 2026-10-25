import * as THREE from 'three';

// Env maps propios de la bola, independientes de `scene.environment`: así los metales reflejan
// siempre, también en escenarios de noche/neón. Son texturas equirrectangulares float (HDR) que
// three convierte a PMREM al asignarlas a `material.envMap`. Se cachean y se comparten:
// NO se liberan al hacer dispose de un material (usa disposeEnvStudio() al cerrar todo).

const W = 256, H = 128;
const cache = new Map();

/** Cajas de luz: [longitud, latitud, semi-ancho, semi-alto, intensidad, tinte(0..1)] en radianes. */
const LIGHT_BOXES = [
  [0.0, 0.7, 0.9, 0.35, 5, 0], // softbox superior frontal (key)
  [2.2, 0.25, 0.28, 0.7, 3, 0], // tira lateral
  [-2.2, 0.25, 0.28, 0.7, 3, 0], // tira lateral opuesta
  [3.14, 0.5, 0.8, 0.3, 3, 0], // contraluz trasero
];
const RIM_BOXES = [
  [1.1, 0.1, 0.18, 0.9, 6, 1],
  [-1.1, 0.1, 0.18, 0.9, 6, 1],
  [3.14, 0.3, 0.7, 0.18, 4, 1],
];

function bake(dark, tint) {
  const data = new Float32Array(W * H * 4);
  const tr = tint.r, tg = tint.g, tb = tint.b;
  const boxes = dark ? RIM_BOXES : LIGHT_BOXES;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI; // +π/2 arriba
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      // fondo: gradiente de estudio
      const up = Math.sin(lat) * 0.5 + 0.5;
      let r, g, b;
      if (dark) {
        const f = 0.02 + 0.05 * up;
        r = f; g = f; b = f * 1.15;
      } else {
        const f = 0.06 + 0.22 * up;
        r = f; g = f; b = f * 1.03;
      }
      for (const [bl, bla, hw, hh, inten, tinted] of boxes) {
        let dl = Math.abs(lon - bl);
        if (dl > Math.PI) dl = Math.PI * 2 - dl;
        const dla = Math.abs(lat - bla);
        // borde suave
        const kx = Math.max(0, 1 - Math.pow(dl / hw, 4));
        const ky = Math.max(0, 1 - Math.pow(dla / hh, 4));
        const k = kx * ky * inten;
        if (k > 0) {
          if (tinted) { r += tr * k; g += tg * k; b += tb * k; }
          else { r += k; g += k; b += k; }
        }
      }
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Env de estudio. `kind`: 'light' (estudio claro, temas de día) o 'dark' (estudio oscuro con rim
 * del color `tint`, noche/neón). Cacheado por kind+tinte.
 */
export function getStudioEnv(kind = 'light', tint = '#ffffff') {
  const dark = kind === 'dark';
  const c = new THREE.Color(tint);
  const key = dark ? `dark:${c.getHexString()}` : 'light';
  let tex = cache.get(key);
  if (!tex) {
    tex = bake(dark, c);
    cache.set(key, tex);
  }
  return tex;
}

export function disposeEnvStudio() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
