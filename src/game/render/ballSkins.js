import * as THREE from 'three';
import { createSkinMaterial as buildSkinMaterial } from './skins/skinMaterial.js';
import { ballPreview, fbm3D, paintBall, skinCanvas, uvToSphere } from './ballPaint.js';

// El pintado 2D vive en ballPaint.js (sin three.js); se reexporta por compatibilidad.
export { ballPreview, paintBall };

const cache = new Map(); // mapas emisivos horneados por skin

function kintsugiEmissiveCanvas(skin) {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const imgData = g.createImageData(w, h);
  const data = imgData.data;
  const cAccent = new THREE.Color(skin.accent || '#e205ff');
  const cShimmer = new THREE.Color(skin.shimmer || '#ffffff');

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const p = uvToSphere(u, v);
      const idx = (y * w + x) * 4;
      const fFracture = Math.abs(fbm3D(p.x * 2.8, p.y * 2.8, p.z * 2.8, 3) - 0.48);
      if (fFracture < 0.035) {
        const goldIntensity = 1 - fFracture / 0.035;
        const t = goldIntensity * 0.8;
        const cr = cAccent.r + (cShimmer.r - cAccent.r) * t;
        const cg = cAccent.g + (cShimmer.g - cAccent.g) * t;
        const cb = cAccent.b + (cShimmer.b - cAccent.b) * t;
        data[idx] = Math.floor(Math.min(1, Math.max(0, cr)) * 255);
        data[idx + 1] = Math.floor(Math.min(1, Math.max(0, cg)) * 255);
        data[idx + 2] = Math.floor(Math.min(1, Math.max(0, cb)) * 255);
        data[idx + 3] = 255;
      } else {
        // Fondo 100% negro en el mapa emisivo: cero emisión en la base de carbono
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }
  }
  g.putImageData(imgData, 0, 0);
  return c;
}

/** Animación heredada por skin (hasta que cada una tenga su patrón de shader, P3). Devuelve update(t, dt) o null. */
function setupSkinAnimation(material, skin, map, disposables = []) {
  const id = skin.id;
  let update = null;

  switch (id) {
    case 'galaxy': {
      material.emissive = new THREE.Color(skin.accent || '#b26bff');
      update = (t, dt) => {
        map.offset.x = (map.offset.x + dt * 0.035) % 1;
        map.offset.y = Math.sin(t * 0.5) * 0.02;
        material.emissiveIntensity = 0.25 + Math.sin(t * 2.2) * 0.18;
      };
      break;
    }

    case 'supernova_solar': {
      material.emissive = new THREE.Color(skin.base || '#ed450c');
      update = (t, dt) => {
        map.offset.x = (map.offset.x + dt * 0.045) % 1;
        map.offset.y = Math.cos(t * 0.6) * 0.025;
        material.emissiveIntensity = 0.42 + Math.sin(t * 3.2) * 0.22;
      };
      break;
    }

    case 'crimson_dragon': {
      material.emissive = new THREE.Color(skin.accent || '#e11d48');
      update = (t, dt) => {
        const beat = Math.pow(Math.max(0, Math.sin(t * 2.4)), 4);
        material.emissiveIntensity = 0.15 + beat * 0.45;
        map.offset.y = Math.sin(t * 1.1) * 0.012;
      };
      break;
    }

    case 'kintsugi_neon': {
      const emCanvas = cache.has(skin.id + '_emissive')
        ? cache.get(skin.id + '_emissive')
        : kintsugiEmissiveCanvas(skin);
      cache.set(skin.id + '_emissive', emCanvas);
      const emTex = new THREE.CanvasTexture(emCanvas);
      emTex.wrapS = THREE.RepeatWrapping;
      emTex.wrapT = THREE.RepeatWrapping;
      disposables.push(emTex);
      material.emissiveMap = emTex;
      material.emissive = new THREE.Color(0xffffff);
      update = (t, dt) => {
        const surge = Math.sin(t * 3.5) * 0.35 + (Math.sin(t * 14.0) > 0.82 ? 0.3 : 0);
        material.emissiveIntensity = 0.5 + surge;
      };
      break;
    }

    case 'lava': {
      material.emissive = new THREE.Color(skin.accent || '#ff5a1f');
      update = (t, dt) => {
        map.offset.y = (map.offset.y + dt * 0.038) % 1;
        map.offset.x = Math.sin(t * 0.5) * 0.015;
        material.emissiveIntensity = 0.32 + Math.sin(t * 2.1) * 0.18;
      };
      break;
    }

    case 'streak': {
      material.emissive = new THREE.Color(skin.accent || '#ff3d00');
      update = (t, dt) => {
        map.offset.y = (map.offset.y + dt * 0.065) % 1;
        map.offset.x = Math.sin(t * 4.0) * 0.012;
        material.emissiveIntensity = 0.25 + Math.sin(t * 6.0) * 0.16;
      };
      break;
    }

    case 'holo': {
      update = (t, dt) => {
        map.offset.x = (map.offset.x + dt * 0.035) % 1;
        material.iridescence = 0.8 + Math.sin(t * 1.6) * 0.2;
        material.iridescenceIOR = 1.35 + Math.sin(t * 1.1) * 0.28;
      };
      break;
    }

    case 'damascus_imperial': {
      material.emissive = new THREE.Color(skin.accent || '#10b981');
      update = (t, dt) => {
        material.emissiveIntensity = 0.14 + Math.sin(t * 2.0) * 0.1;
        material.iridescence = 0.45 + Math.sin(t * 1.5) * 0.15;
      };
      break;
    }

    case 'zephyr_nacre': {
      update = (t, dt) => {
        material.iridescence = 0.88 + Math.sin(t * 1.5) * 0.12;
        map.offset.y = Math.sin(t * 0.8) * 0.015;
      };
      break;
    }

    default: {
      update = null;
      break;
    }
  }  return update;
}

const deps = { canvas: skinCanvas, legacy: setupSkinAnimation };

/**
 * Material premium de bola: `{ material, update(t, dt, { speed, impact, state }), dispose(), ... }`.
 * Opciones: `quality` ('low'|'medium'|'high', por defecto la guardada), `instance` ({ seed }),
 * `theme` (para elegir el env de estudio claro u oscuro).
 */
export function createSkinMaterial(skin, opts = {}) {
  return buildSkinMaterial(skin, opts, deps);
}

/**
 * Compatibilidad: devuelve solo el material (con `userData.update(t, dt, ctx)` y `userData.handle`).
 * `material.dispose()` libera también mapas propios; el normal de hoyuelos y los env son compartidos.
 */
export function skinMaterial(skin, opts = {}) {
  const handle = createSkinMaterial(skin, opts);
  const { material } = handle;
  material.userData.handle = handle;
  material.userData.update = handle.update;
  material.dispose = handle.dispose;
  return material;
}
