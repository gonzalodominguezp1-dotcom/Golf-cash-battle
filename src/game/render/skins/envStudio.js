import * as THREE from 'three';

// Env maps propios de la bola, independientes de `scene.environment`: así los metales reflejan
// siempre, también en escenarios de noche/neón. Son texturas equirrectangulares float (HDR) que
// three convierte a PMREM al asignarlas a `material.envMap`. Se cachean y se comparten:
// NO se liberan al hacer dispose de un material (usa disposeEnvStudio() al cerrar todo).

const W = 256, H = 128;
const cache = new Map();

/** Cajas de luz: [longitud, latitud, semi-ancho, semi-alto, intensidad, tinte(0 neutro, 1 rim A, 2 rim B)] en radianes. */
const LIGHT_BOXES = [
  [0.0, 0.75, 0.8, 0.28, 3.2, 0], // softbox superior frontal (key)
  [2.2, 0.2, 0.2, 0.7, 2.0, 0], // tira lateral
  [-2.2, 0.2, 0.2, 0.7, 2.0, 0], // tira lateral opuesta
  [3.14, 0.55, 0.7, 0.22, 1.6, 0], // contraluz trasero
];
const DARK_BOXES = [
  [0.0, 0.75, 1.0, 0.32, 4.5, 0], // key neutro: da forma y color propio a los metales sin lavar
  [2.4, 0.25, 0.2, 0.65, 2.2, 0], // tira neutra lateral
  [-2.4, 0.25, 0.2, 0.65, 2.2, 0],
  [1.1, 0.1, 0.16, 0.85, 4.0, 1], // rim A
  [-1.1, 0.1, 0.16, 0.85, 4.0, 2], // rim B
  [3.14, 0.3, 0.6, 0.16, 2.6, 1],
];

function bake(dark, tintA, tintB) {
  const data = new Float32Array(W * H * 4);
  const boxes = dark ? DARK_BOXES : LIGHT_BOXES;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI; // +π/2 arriba
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      // fondo: gradiente de estudio
      const up = Math.sin(lat) * 0.5 + 0.5;
      let r, g, b;
      if (dark) {
        // suelo casi negro y cielo muy tenue: así el negro/carbono/obsidiana se queda profundo
        const f = lat < 0 ? 0.01 : 0.03 + 0.08 * up;
        r = f; g = f; b = f * 1.15;
      } else {
        // gradiente con suelo oscuro: los metales ganan contraste en vez de lavarse hacia blanco
        const f = lat < 0 ? 0.015 + 0.02 * up : 0.03 + 0.1 * up;
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
          if (tinted) { const t = tinted === 2 ? tintB : tintA; r += t.r * k; g += t.g * k; b += t.b * k; }
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

const toColor = (v) => {
  const x = Array.isArray(v) ? v[0] : v;
  try { return new THREE.Color(x ?? '#ffffff'); } catch { return new THREE.Color('#ffffff'); }
};

/**
 * Env de estudio. `kind`: 'light' (estudio claro, temas de día) o 'dark' (estudio oscuro con dos rims
 * tintables, `tint` y `tintB`; si `tint` es la lista `theme.rim` se usan sus dos colores). Cacheado.
 */
export function getStudioEnv(kind = 'light', tint = '#ffffff', tintB = tint) {
  const dark = kind === 'dark';
  const a = toColor(tint);
  const b = toColor(Array.isArray(tint) && tint.length > 1 && tintB === tint ? tint[1] : tintB);
  const key = dark ? `dark:${a.getHexString()}:${b.getHexString()}` : 'light';
  let tex = cache.get(key);
  if (!tex) {
    tex = bake(dark, a, b);
    cache.set(key, tex);
  }
  return tex;
}

export function disposeEnvStudio() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
