import * as THREE from 'three';

// Dibuja la textura de una skin (proyección esférica: x = longitud, y = latitud).
export function paintBall(g, n, skin) {
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
function skinCanvas(skin) {
  if (!cache.has(skin.id)) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    paintBall(c.getContext('2d'), 256, skin);
    cache.set(skin.id, c);
  }
  return cache.get(skin.id);
}

/** Material 3D: cuanto más rara la skin, más brillo (metal, iridiscencia). */
export function skinMaterial(skin) {
  const map = new THREE.CanvasTexture(skinCanvas(skin));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const r = skin.rarity;
  const mat = skin.material || {};
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: mat.roughness ?? (r === 'bronze' ? 0.35 : r === 'silver' ? 0.25 : 0.15),
    metalness: mat.metalness ?? (r === 'gold' ? 0.45 : 0),
    clearcoat: mat.clearcoat ?? 1,
    clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
    iridescence: mat.iridescence ?? (r === 'diamond' || r === 'emerald' ? 1 : 0),
    iridescenceIOR: mat.iridescenceIOR ?? 1.6,
    emissive: mat.emissive ? new THREE.Color(mat.emissive) : (r === 'emerald' ? new THREE.Color(skin.accent) : new THREE.Color(0)),
    emissiveIntensity: mat.emissiveIntensity ?? (r === 'emerald' ? 0.25 : 0),
  });
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
