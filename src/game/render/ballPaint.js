// Pintado 2D de las bolas (sin three.js): textura equirrectangular de cada skin y la
// imagen sombreada `ballPreview` que usa la interfaz como marcador de posición. Vive aparte
// de ballSkins.js para que lobby, desafíos y pantalla de skins no carguen three.js.

// Colores como THREE.Color: el hex (sRGB) pasa a lineal; `mix` mezcla en lineal y vuelve a sRGB.
const s2l = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const l2s = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);
export function linearColor(hex) {
  let h = String(hex ?? '#ffffff').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (x) => x + x);
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return { r: s2l(((n >> 16) & 255) / 255), g: s2l(((n >> 8) & 255) / 255), b: s2l((n & 255) / 255) };
}
const hex2 = (c) => Math.round(Math.min(255, Math.max(0, l2s(c) * 255))).toString(16).padStart(2, '0');

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
    case 'void_cracks':
      paintVoidCracks(g, w, h, skin);
      break;
    case 'plasma':
      paintPlasma(g, w, h, skin);
      break;
    case 'spirit':
      paintSpirit(g, w, h, skin);
      break;
    case 'clockwork':
      paintClockwork(g, w, h, skin);
      break;
    case 'abyss_veins':
      paintAbyssVeins(g, w, h, skin);
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
export function uvToSphere(u, v) {
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

export function fbm3D(x, y, z, octaves = 3) {
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
  const cBase = linearColor(base);
  const cAccent = linearColor(accent);
  const cSec = linearColor(secondary);
  const cShimmer = linearColor(shimmer);

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

// ---------- skins nuevas (docs: ideas_skins/_plan/spec-skins.md) ----------
// Solo trazos de canvas (sin bucle por píxel y sin sombras): el brillo es un trazo ancho translúcido
// bajo uno fino. Cada motivo principal va centrado en (w/2, h/2), el frente de la bola (+X).

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgba(hex, a) {
  const n = parseInt(String(hex ?? '#ffffff').replace('#', '').slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Traza una polilínea una vez y la pinta con varias capas [color, ancho, opacidad]. */
function strokeLayers(g, pts, layers) {
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  for (const [color, width, alpha] of layers) {
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
  }
  g.globalAlpha = 1;
}

function paletteOf(skin) {
  const p = skin.palette;
  return { base: p?.base ?? skin.base, accent: p?.accent ?? skin.accent, secondary: p?.secondary ?? skin.secondary ?? skin.accent, glow: p?.glow ?? skin.shimmer ?? skin.accent };
}

function dots(g, rnd, n, cx, cy, radius, size, color) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
    circle(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size * (0.6 + 0.8 * rnd()));
  }
}

function hexPath(g, cx, cy, R) {
  g.beginPath();
  for (let k = 0; k < 6; k++) g[k ? 'lineTo' : 'moveTo'](cx + Math.cos((k * Math.PI) / 3) * R, cy + Math.sin((k * Math.PI) / 3) * R);
  g.closePath();
}

/** Anillos de hoyuelos (rejilla hexagonal de arcos, un solo trazo): contornos claros como en las hojas. */
function dimpleRings(g, w, h, color, alpha, R = 9, sx = 22, sy = 19, skip = null) {
  g.beginPath();
  for (let j = 0, y = sy / 2; y < h; y += sy, j++)
    for (let x = j % 2 ? sx / 2 : 0; x < w; x += sx) {
      if (skip && skip(x, y)) continue;
      g.moveTo(x + R, y);
      g.arc(x, y, R, 0, Math.PI * 2);
    }
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = 1.3;
  g.stroke();
  g.globalAlpha = 1;
}

/** Polilínea quebrada desde (x, y) con rumbo `a`: `n` tramos de largo `len`±50 % y giro aleatorio `turn`. */
function zigzag(rnd, x, y, a, n, len, turn) {
  const pts = [[x, y]];
  for (let k = 0; k < n; k++) {
    a += (rnd() - 0.5) * turn;
    const l = len * (0.5 + rnd());
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    pts.push([x, y]);
  }
  return pts;
}

/** Antimateria del Vacío: cáscara violeta con contornos de hoyuelos y 3 manchas negras dentadas de borde incandescente. */
function paintVoidCracks(g, w, h, skin) {
  const { base, accent, secondary, glow } = paletteOf(skin);
  const rnd = seeded(0x51ed);
  g.fillStyle = mix(base, accent, 0.2);
  g.fillRect(0, 0, w, h);
  dimpleRings(g, w, h, secondary, 0.3);
  // manchas: polígonos de radio irregular; de cada una salen 2 grietas finas
  const blobs = [[0.43, 0.38, 40], [0.6, 0.62, 34], [0.34, 0.7, 22]];
  for (const [bx, by, br] of blobs) {
    const cx = w * bx, cy = h * by;
    const pts = [];
    let rr = 0.8;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      rr = Math.min(1.25, Math.max(0.45, rr + (rnd() - 0.5) * 0.7)); // radio que serpentea: contorno irregular
      pts.push([cx + Math.cos(a) * br * rr * 1.3, cy + Math.sin(a) * br * rr * 0.85]);
    }
    for (let c = 0; c < 4; c++) {
      const a0 = rnd() * Math.PI * 2;
      strokeLayers(g, zigzag(rnd, cx + Math.cos(a0) * br, cy + Math.sin(a0) * br, a0, 6, 14, 1.8), [[accent, 7, 0.5], ['#000000', 2, 1], [glow, 1, 0.8]]);
    }
    pts.push(pts[0]);
    strokeLayers(g, pts, [[accent, 8, 0.4], [glow, 3, 0.9]]);
    g.beginPath();
    pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y));
    g.fillStyle = '#000000';
    g.fill();
  }
}

/** Tormenta Voltaica: cristal violeta con un núcleo claro y 8 rayos en zigzag (con ramas) hasta el borde. */
function paintPlasma(g, w, h, skin) {
  const { base, accent, secondary } = paletteOf(skin);
  const cx = w / 2, cy = h / 2;
  const rnd = seeded(0x7014);
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.56);
  gr.addColorStop(0, mix(base, accent, 0.3));
  gr.addColorStop(0.7, mix(base, accent, 0.12));
  gr.addColorStop(1, mix(secondary, accent, 0.25));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  dimpleRings(g, w, h, secondary, 0.22, 9, 22, 19, (x, y) => Math.hypot(x - cx, y - cy) < 60);
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 + 0.2 + (rnd() - 0.5) * 0.3;
    const c = Math.cos(ang), s = Math.sin(ang);
    const pts = [[cx + c * 24, cy + s * 24]];
    for (let k = 1; k <= 8; k++) {
      const r = 24 + k * 13, off = (k % 2 ? 1 : -1) * (4 + rnd() * 9);
      pts.push([cx + c * r - s * off, cy + s * r + c * off]);
    }
    strokeLayers(g, pts, [[accent, 6, 0.4], [accent, 2.6, 1], ['#ffffff', 1.1, 1]]);
    // rama corta desde el 4.º vértice
    const [bx, by] = pts[4], ba = ang + (rnd() < 0.5 ? 0.6 : -0.6);
    strokeLayers(g, zigzag(rnd, bx, by, ba, 3, 11, 1.2), [[accent, 3, 0.45], [secondary, 1, 0.9]]);
  }
  // núcleo: esfera pequeña de centro casi blanco y borde saturado
  const orb = g.createRadialGradient(cx, cy, 0, cx, cy, 28);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.55, mix(accent, '#ffffff', 0.45));
  orb.addColorStop(0.9, accent);
  orb.addColorStop(1, rgba(accent, 0));
  g.fillStyle = orb;
  circle(g, cx, cy, 28);
}

/** Ánima Errante: remolino de volutas finas cian y violeta, núcleo blanco y estrellas sobre la esfera lavanda. */
function paintSpirit(g, w, h, skin) {
  const { accent, secondary } = paletteOf(skin);
  const cx = w / 2, cy = h / 2;
  const rnd = seeded(0xa11a);
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 120);
  gr.addColorStop(0, rgba(accent, 0.75));
  gr.addColorStop(0.5, rgba(accent, 0.32));
  gr.addColorStop(1, rgba(accent, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  // 3 volutas con grosor decreciente y un leve temblor; violeta junto al núcleo, cian hacia fuera
  for (let arm = 0; arm < 3; arm++) {
    const wob = rnd() * 6, ph = rnd() * Math.PI * 2;
    let prev = null;
    for (let k = 0; k <= 22; k++) {
      const t = k / 22, th = (arm * Math.PI * 2) / 3 + t * Math.PI * 1.7, r = 8 + t * 100 + Math.sin(t * 9 + ph) * wob;
      const cur = [cx + Math.cos(th) * r, cy + Math.sin(th) * r];
      if (prev) {
        g.strokeStyle = mix(accent, secondary, Math.min(1, t * 1.6));
        g.globalAlpha = 0.3;
        g.lineWidth = 20 * (1 - t * 0.7);
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(cur[0], cur[1]);
        g.stroke();
        g.globalAlpha = 0.9;
        g.lineWidth = 7 * (1 - t * 0.75) + 1;
        g.stroke();
      }
      prev = cur;
    }
  }
  g.globalAlpha = 1;
  // estrellas violetas, cian y blancas
  dots(g, rnd, 14, cx, cy, 105, 1.9, '#ffffff');
  dots(g, rnd, 8, cx, cy, 105, 1.6, secondary);
  dots(g, rnd, 8, cx, cy, 105, 1.6, accent);
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, 22);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.4, rgba('#ffffff', 0.8));
  core.addColorStop(1, rgba('#ffffff', 0));
  g.fillStyle = core;
  circle(g, cx, cy, 22);
}

/** Engranaje de `teeth` dientes: cuerpo de radio `r` y dientes un 22 % más altos. */
function gearPath(g, cx, cy, r, teeth, rot = 0) {
  g.beginPath();
  const n = teeth * 4;
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2 + rot, rr = r + ((k >> 1) % 2 ? 0 : r * 0.22);
    g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(th) * rr, cy + Math.sin(th) * rr);
  }
  g.closePath();
}

/** Cronómetro de Latón: latón con hoyuelos de cobre y tres ventanas hexagonales con marco, remaches y mecanismo. */
function paintClockwork(g, w, h, skin) {
  const { base, accent, secondary, glow } = paletteOf(skin);
  g.fillStyle = mix(base, accent, 0.1);
  g.fillRect(0, 0, w, h);
  // hoyuelos de cobre (la hoja los muestra cobrizos sobre el latón)
  g.fillStyle = rgba(accent, 0.6);
  for (let j = 0, y = 9; y < h; y += 17, j++)
    for (let x = j % 2 ? 9.5 : 0; x < w; x += 19) circle(g, x, y, 6);
  for (const ox of [w * 0.25, w * 0.5, w * 0.75]) {
    // cada ventana se dibuja en su origen y a escala 0,86 para que las tres quepan sin pisarse en la esfera
    g.save();
    g.translate(ox, h / 2);
    g.scale(0.86, 0.86);
    const cx = 0, cy = 0;
    // grabado: contorno hexagonal alrededor del marco
    g.strokeStyle = rgba(secondary, 0.5);
    g.lineWidth = 1.6;
    hexPath(g, cx, cy, 77);
    g.stroke();
    // filete claro, marco de cobre y ventana oscura
    g.fillStyle = mix(base, glow, 0.5);
    hexPath(g, cx, cy, 70);
    g.fill();
    g.fillStyle = accent;
    hexPath(g, cx, cy, 66);
    g.fill();
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, 52);
    bg.addColorStop(0, mix(secondary, accent, 0.35));
    bg.addColorStop(1, secondary);
    g.fillStyle = bg;
    hexPath(g, cx, cy, 52);
    g.fill();
    // remaches en los vértices del marco
    g.fillStyle = glow;
    for (let k = 0; k < 6; k++) circle(g, cx + Math.cos((k * Math.PI) / 3) * 59, cy + Math.sin((k * Math.PI) / 3) * 59, 3.6);
    // engranajes: grande de 10 dientes (latón), mediano de 7 (cobre) y piñón de 6 (latón oscuro)
    g.fillStyle = accent;
    gearPath(g, cx - 17, cy - 24, 14, 7, 0.4);
    g.fill();
    g.fillStyle = mix(base, secondary, 0.35);
    gearPath(g, cx + 29, cy - 21, 9, 6, 0.2);
    g.fill();
    g.fillStyle = base;
    gearPath(g, cx + 8, cy + 6, 25, 10, 0);
    g.fill();
    g.fillStyle = secondary;
    circle(g, cx + 8, cy + 6, 12);
    g.fillStyle = base;
    circle(g, cx + 8, cy + 6, 5);
    // agujas y eje
    strokeLayers(g, [[cx, cy], [cx + 8, cy - 40]], [[glow, 3, 1]]);
    strokeLayers(g, [[cx, cy], [cx - 22, cy - 6]], [[glow, 4.5, 1]]);
    g.fillStyle = glow;
    circle(g, cx, cy, 4);
    g.restore();
  }
}

/** Marea Abisal: cristal azul con venas turquesa finas y ramificadas, motas en bloque y reflejo nacarado arriba. */
function paintAbyssVeins(g, w, h, skin) {
  const { base, accent, secondary, glow } = paletteOf(skin);
  const rnd = seeded(0xabb5);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, mix(base, secondary, 0.3));
  gr.addColorStop(0.55, mix(base, secondary, 0.22));
  gr.addColorStop(1, mix(base, secondary, 0.38));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  dimpleRings(g, w, h, secondary, 0.25);
  const sp = [];
  for (let i = 0; i < 9; i++) {
    const x0 = ((i + 0.5) * w) / 9 + (rnd() - 0.5) * 20, amp = 8 + rnd() * 12, fr = 0.03 + rnd() * 0.03, ph = rnd() * Math.PI * 2;
    const pts = [];
    for (let y = h * 0.1; y <= h; y += 8) pts.push([x0 + Math.sin(y * fr + ph) * amp, y]);
    strokeLayers(g, pts, [[accent, 5, 0.22], [accent, 2.2, 0.9], [glow, 0.8, 0.9]]);
    // 2 ramas finas que se separan de la principal
    for (let b = 0; b < 2; b++) {
      const [bx, by] = pts[2 + Math.floor(rnd() * (pts.length - 4))];
      const side = rnd() < 0.5 ? -1 : 1;
      const br = zigzag(rnd, bx, by, Math.PI / 2 + side * 0.9, 4, 14, 0.9);
      strokeLayers(g, br, [[accent, 3, 0.2], [accent, 1.3, 0.85]]);
      sp.push(...br);
    }
    sp.push(...pts.filter((_, k) => k % 2 === 0));
  }
  // motas en bloque pegadas a las venas
  g.fillStyle = glow;
  for (const [x, y] of sp) if (rnd() < 0.55) g.fillRect(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 8, 2.5 + rnd() * 2.5, 2 + rnd() * 2);
  // reflejo nacarado arriba
  const sheen = g.createRadialGradient(w / 2, h * 0.14, 0, w / 2, h * 0.14, 90);
  sheen.addColorStop(0, rgba('#e6f4ff', 0.4));
  sheen.addColorStop(1, rgba('#e6f4ff', 0));
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h * 0.5);
}

function mix(a, b, t) {
  const x = linearColor(a), y = linearColor(b);
  return '#' + hex2(x.r + (y.r - x.r) * t) + hex2(x.g + (y.g - x.g) * t) + hex2(x.b + (y.b - x.b) * t);
}

const cache = new Map();
export function skinCanvas(skin, dimples = true) {
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
