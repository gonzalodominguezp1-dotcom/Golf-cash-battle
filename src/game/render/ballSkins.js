import * as THREE from 'three';
import { createSkinMaterial as buildSkinMaterial } from './skins/skinMaterial.js';

// Dibuja la textura de una skin (proyección esférica: x = longitud, y = latitud).
// `opts.dimples === false` omite los hoyuelos pintados (Media/Alta usan el normal map horneado).
export function paintBall(g, n, skin, opts = {}) {
  const { base, accent, pattern } = skin;
  const w = n * 2, h = n;

  if (['damascus', 'kintsugi', 'feather_aero', 'solar_supernova', 'dragon_scales'].includes(pattern)) {
    paintSphericalProcedural(g, w, h, skin);
    return;
  }

  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  switch (pattern) {
    case 'stripe':
      g.fillRect(0, h * 0.42, w, h * 0.16);
      break;
    case 'dual':
      g.fillRect(0, h / 2, w, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(0, h * 0.48, w, h * 0.04);
      break;
    case 'dots':
      for (let y = h * 0.12; y < h; y += h / 6)
        for (let x = (y / (h / 6)) % 2 ? w / 24 : 0; x < w; x += w / 12) circle(g, x, y, h * 0.045);
      break;
    case 'stars':
      for (let i = 0; i < 18; i++) star(g, ((i * 0.37) % 1) * w, (0.15 + ((i * 0.61) % 0.7)) * h, h * 0.07);
      break;
    case 'gradient': {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, base);
      gr.addColorStop(1, accent);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      break;
    }
    case 'rainbow':
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `hsl(${i * 30}, 95%, 62%)`;
        g.fillRect(0, (i * h) / 12, w, h / 12 + 1);
      }
      break;
    case 'flame':
      for (let k = 0; k < 3; k++) {
        g.fillStyle = k === 0 ? accent : k === 1 ? mix(accent, '#ffd000', 0.5) : '#fff1a0';
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.55 + k * 0.12) - Math.abs(Math.sin((x / w) * Math.PI * 10 + k)) * h * 0.22);
        g.lineTo(w, h);
        g.fill();
      }
      break;
    case 'galaxy':
      for (let i = 0; i < 6; i++) {
        const x = ((i * 0.29 + 0.1) % 1) * w, y = (0.25 + ((i * 0.43) % 0.5)) * h;
        const gr = g.createRadialGradient(x, y, 0, x, y, h * 0.35);
        gr.addColorStop(0, i % 2 ? accent + 'cc' : '#3fd0ffaa');
        gr.addColorStop(1, 'transparent');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
      g.fillStyle = '#fff';
      for (let i = 0; i < 90; i++) g.fillRect(((i * 0.618) % 1) * w, ((i * 0.377) % 1) * h, 2, 2);
      break;
    case 'gem':
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 12; x++) {
          g.fillStyle = (x + y) % 2 ? accent : mix(base, accent, 0.35);
          g.globalAlpha = 0.55 + ((x * 7 + y * 3) % 5) * 0.09;
          g.beginPath();
          g.moveTo((x * w) / 12, (y * h) / 4);
          g.lineTo(((x + 1) * w) / 12, (y * h) / 4);
          g.lineTo(((x + 0.5) * w) / 12, ((y + 1) * h) / 4);
          g.fill();
        }
      g.globalAlpha = 1;
      break;
    default:
      break;
  }
  if (opts.dimples === false) return;
  // hoyuelos
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 6; y < h; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < w; x += 12) g.fillRect(x, y, 3, 3);
}

// ==========================================
// MATEMÁTICAS ESFÉRICAS 3D SIN COSTURAS
// ==========================================
function uvToSphere(u, v) {
  const theta = u * 2 * Math.PI;
  const phi = v * Math.PI;
  const sinPhi = Math.sin(phi);
  return {
    x: sinPhi * Math.cos(theta),
    y: Math.cos(phi),
    z: sinPhi * Math.sin(theta),
  };
}

function hash3(x, y, z) {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function noise3D(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;

  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = n000 + ux * (n100 - n000);
  const x10 = n010 + ux * (n110 - n010);
  const x01 = n001 + ux * (n101 - n001);
  const x11 = n011 + ux * (n111 - n011);

  const y0 = x00 + uy * (x10 - x00);
  const y1 = x01 + uy * (x11 - x01);

  return y0 + uz * (y1 - y0);
}

function fbm3D(x, y, z, octaves = 3) {
  let v = 0, amp = 0.5, freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise3D(x * freq, y * freq, z * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return v;
}

function fibonacciSpherePoints(count) {
  const pts = [];
  const phi = Math.PI * (3.0 - Math.sqrt(5.0));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    pts.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return pts;
}

function voronoiSpherical(p, points) {
  let d1 = 999, d2 = 999, cellIndex = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const dx = p.x - pt.x, dy = p.y - pt.y, dz = p.z - pt.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < d1) {
      d2 = d1;
      d1 = distSq;
      cellIndex = i;
    } else if (distSq < d2) {
      d2 = distSq;
    }
  }
  return {
    d1: Math.sqrt(d1),
    edge: Math.sqrt(d2) - Math.sqrt(d1),
    cell: cellIndex,
  };
}

const voronoiPointsHigh = fibonacciSpherePoints(96);

function paintSphericalProcedural(g, w, h, skin) {
  if (!g.createImageData) return;
  const imgData = g.createImageData(w, h);
  const data = imgData.data;
  const { base, accent, secondary = base, shimmer = '#ffffff', pattern } = skin;
  const cBase = new THREE.Color(base);
  const cAccent = new THREE.Color(accent);
  const cSec = new THREE.Color(secondary);
  const cShimmer = new THREE.Color(shimmer);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const p = uvToSphere(u, v);
      const idx = (y * w + x) * 4;

      let cr = cBase.r, cg = cBase.g, cb = cBase.b;

      switch (pattern) {
        case 'damascus': {
          const turb = fbm3D(p.x * 3.5, p.y * 3.5, p.z * 3.5, 3);
          const band = Math.sin((p.y * 14 + turb * 4.5) * Math.PI);
          const f = Math.abs(band);
          if (f > 0.8) {
            const t = (f - 0.8) * 5.0;
            cr = cBase.r + (cShimmer.r - cBase.r) * t;
            cg = cBase.g + (cShimmer.g - cBase.g) * t;
            cb = cBase.b + (cShimmer.b - cBase.b) * t;
          } else if (f > 0.4) {
            const t = (f - 0.4) * 2.5;
            cr = cBase.r + (cAccent.r - cBase.r) * t;
            cg = cBase.g + (cAccent.g - cBase.g) * t;
            cb = cBase.b + (cAccent.b - cBase.b) * t;
          } else {
            const t = f * 1.5;
            cr = cBase.r + (cSec.r - cBase.r) * t;
            cg = cBase.g + (cSec.g - cBase.g) * t;
            cb = cBase.b + (cSec.b - cBase.b) * t;
          }
          break;
        }

        case 'kintsugi': {
          const twill = (Math.sin((p.x + p.y) * 45) + Math.sin((p.y + p.z) * 45)) * 0.08;
          cr = cBase.r + twill;
          cg = cBase.g + twill;
          cb = cBase.b + twill;
          const fFracture = Math.abs(fbm3D(p.x * 2.8, p.y * 2.8, p.z * 2.8, 3) - 0.48);
          if (fFracture < 0.035) {
            const goldIntensity = 1 - fFracture / 0.035;
            const t = goldIntensity * 0.8;
            cr = cAccent.r + (cShimmer.r - cAccent.r) * t;
            cg = cAccent.g + (cShimmer.g - cAccent.g) * t;
            cb = cAccent.b + (cShimmer.b - cAccent.b) * t;
          }
          break;
        }

        case 'feather_aero': {
          const flow = Math.sin(p.y * 12 + noise3D(p.x * 4, p.y * 4, p.z * 4) * 3);
          const vane = Math.abs(flow);
          const t1 = vane * 0.65;
          const t2 = Math.pow(vane, 4) * 0.5;
          cr = cBase.r + (cAccent.r - cBase.r) * t1;
          cg = cBase.g + (cAccent.g - cBase.g) * t1;
          cb = cBase.b + (cAccent.b - cBase.b) * t1;
          cr += (cShimmer.r - cr) * t2;
          cg += (cShimmer.g - cg) * t2;
          cb += (cShimmer.b - cb) * t2;
          break;
        }

        case 'solar_supernova': {
          const vCell = voronoiSpherical(p, voronoiPointsHigh);
          const cellLight = Math.max(0, Math.min(1, 1 - vCell.d1 * 2.2));
          const flare = fbm3D(p.x * 5, p.y * 5, p.z * 5, 2);
          const flareLight = Math.max(0, flare - 0.3) * 2.2;
          cr = cBase.r + (cAccent.r - cBase.r) * cellLight;
          cg = cBase.g + (cAccent.g - cBase.g) * cellLight;
          cb = cBase.b + (cAccent.b - cBase.b) * cellLight;
          const tf = Math.min(1, flareLight);
          cr += (cShimmer.r - cr) * tf;
          cg += (cShimmer.g - cg) * tf;
          cb += (cShimmer.b - cb) * tf;
          break;
        }

        case 'dragon_scales': {
          const vCell = voronoiSpherical(p, voronoiPointsHigh);
          const scaleCenter = Math.max(0, Math.min(1, 1 - vCell.d1 * 2.6));
          if (vCell.edge < 0.04) {
            cr = cSec.r; cg = cSec.g; cb = cSec.b;
          } else {
            cr = cBase.r + (cAccent.r - cBase.r) * scaleCenter;
            cg = cBase.g + (cAccent.g - cBase.g) * scaleCenter;
            cb = cBase.b + (cAccent.b - cBase.b) * scaleCenter;
          }
          break;
        }
      }

      data[idx] = Math.floor(Math.min(1, Math.max(0, cr)) * 255);
      data[idx + 1] = Math.floor(Math.min(1, Math.max(0, cg)) * 255);
      data[idx + 2] = Math.floor(Math.min(1, Math.max(0, cb)) * 255);
      data[idx + 3] = 255;
    }
  }
  g.putImageData(imgData, 0, 0);
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function mix(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

const cache = new Map();
function skinCanvas(skin, dimples = true) {
  const key = dimples ? skin.id : `${skin.id}#flat`;
  if (!cache.has(key)) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    paintBall(c.getContext('2d'), 256, skin, { dimples });
    cache.set(key, c);
  }
  return cache.get(key);
}

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
 * Opciones: `quality` ('low'|'medium'|'high', por defecto la guardada), `instance` ({ seed, wear }),
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

/** Imagen de la bola para la interfaz (esfera sombreada con la textura). */
export function ballPreview(skin, size = 160) {
  const key = `${skin.id}@${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r * 0.96, 0, Math.PI * 2);
  g.clip();
  g.drawImage(skinCanvas(skin), 128, 0, 256, 256, 0, 0, size, size);
  const shade = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  g.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
