import * as THREE from 'three';
import { treeLevel } from './treeKit.js';
import { addAsciiNeon } from './asciiNeon.js';

// Ciudad lejana de los temas neón (neon, neonPink, cyber2078 / hoyo 15), N2 2026-11-23. Solo dibujo y solo lejos:
// la física no la ve, no toca la pista, las atracciones ni el suelo de juego.
//
// - Torres escalonadas (1-3 cuerpos que se estrechan) con cima afilada (aguja), antena con baliza o helipuerto
//   volado con borde de neón. Franjas de neón en las fachadas: coronas en lo alto de cada cuerpo, aristas y franja
//   central. Ventanas en rejilla con la fachada determinista de N0 (`drawSkyscraperFacade`).
// - Fachada: DataTexture de 128 x 128 pintada en JS (sin canvas, también en node) con la misma fachada de N0; una
//   por paleta y compartida entre hoyos (el dispose del hoyo no la libera).
// - Todo va ya junto: una malla por material (fachadas + agujas/antenas/helipuertos, neón, balizas, carteles holo).
//   Llamadas por calidad en CITY_BUDGET.calls; bakeStatic no la toca (userData.keep).
// - Reparto: rng propio de semilla fija (CITY_SEED): 0 tiradas del rng del hoyo. La ciudad vieja tiraba 3 veces por
//   torre (12 torres = CITY_LEGACY_DRAWS); esas tiradas se siguen haciendo en cyberpunkEnvironment.js para que el
//   resto del decorado neón salga en el mismo sitio.
// - Sitio: anillo de 69-87 m alrededor del centro del hoyo (>= CITY_LAYOUT.minGap de la pista), detrás de los
//   letreros del hoyo 15 (52-62 m), por delante del anillo de pilares ASCII (>= 96 m) y fuera de sus ángulos (los
//   pilares se ven entre las torres). Todo por debajo de CITY_LAYOUT.maxY: bajo el tráfico aéreo y bajo las nubes y
//   naves ASCII. Recibe la niebla del hoyo (cyberFog en el hoyo 15).

// ---------- constantes ----------

/** Por calidad (Medio = el del móvil): torres, llamadas de dibujo y tope de triángulos (medido en los tests). */
export const CITY_BUDGET = {
  towers: { low: 9, medium: 14, high: 20 },
  // Bajo: fachadas + neón. Medio: + balizas que parpadean. Alto: + carteles holográficos.
  calls: { low: 2, medium: 3, high: 4 },
  // medido (los 4 hoyos neón, cualquier paleta): Bajo 432, Medio 856, Alto 1363. La ciudad vieja: ~1540 y 17
  // llamadas (3 tras bakeStatic + 12 balizas + 2 carteles).
  tris: { low: 500, medium: 1000, high: 1600 },
};
/** Anillo (m, alrededor del centro del hoyo) y alturas (m). */
export const CITY_LAYOUT = {
  r: [69, 87],
  baseY: -6, // bajo el terreno: ninguna torre flota
  maxY: 30, // tráfico aéreo desde 33 m; nubes ASCII desde 32 m; naves ASCII desde 36 m
  top: [18, 30],
  footprint: [4.4, 7],
  minGap: 45, // a la pista
  spacing: 1.5, // entre torres
  pillarClear: 3, // por delante del anillo de pilares ASCII
  pillarMargin: 0.05, // rad a cada lado del pilar
};
export const CITY_SEED = 0xc17e2a;
/** Tiradas del rng del hoyo que hacía la ciudad vieja (12 torres x 3): se conservan fuera de este módulo. */
export const CITY_LEGACY_DRAWS = 36;

const FACADE_SIZE = 128;
/** Una tesela de fachada (8 x 16 ventanas) cubre 8 m de ancho y 14 m de alto. */
const TILE = { w: 8, h: 14 };
const EPS = 0.06; // franjas de neón despegadas de la fachada
const STANDOFF = 0.6; // margen del radio de una torre (franjas y carteles salen de la fachada)
const LEVEL_I = { low: 0, medium: 1, high: 2 };

// ---------- utilidades ----------

/** Semilla estable a partir de una clave (FNV-1a). */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, [a, b]) => a + (b - a) * r();
const angDiff = (a, b) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

// ---------- fachada (N0) ----------

/** Dibuja la fachada en un contexto 2D de 256x256. Determinista: la semilla sale de los dos colores (misma textura en cada carga). */
export function drawSkyscraperFacade(ctx, c1, c2) {
  const rnd = mulberry32(hashSeed(`sky_${c1}_${c2}`));

  // Fondo obsidiana arquitectónico
  ctx.fillStyle = '#090b16';
  ctx.fillRect(0, 0, 256, 256);

  // Columnas estructurales
  ctx.strokeStyle = '#141728';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }

  // Ventanas de datos tenues (sin sobreiluminar para no disparar el bloom)
  const cols = 8;
  const rows = 16;
  const w = 256 / cols;
  const h = 256 / rows;

  for (let r = 0; r < rows; r++) {
    const floorLit = (r % 3 === 0);
    for (let c = 0; c < cols; c++) {
      const isLit = floorLit ? rnd() < 0.6 : rnd() < 0.2;
      if (isLit) {
        ctx.fillStyle = rnd() < 0.6 ? c1 : c2;
        ctx.fillRect(c * w + 6, r * h + 4, w - 12, h - 8);
      } else {
        ctx.fillStyle = '#101322';
        ctx.fillRect(c * w + 6, r * h + 4, w - 12, h - 8);
      }
    }
  }
}

/**
 * Contexto 2D mínimo que pinta en píxeles (lo justo para drawSkyscraperFacade: fillRect y trazos rectos). Las
 * coordenadas son las de un lienzo de 256 x 256, escaladas a `size`. Fila 0 del resultado = abajo (v = 0).
 */
function pixelContext(size) {
  const data = new Uint8Array(size * size * 4);
  const S = size / 256;
  const parse = (css) => {
    const n = parseInt(String(css).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rect = (x0, y0, x1, y1, c) => {
    const ax = Math.max(0, Math.floor(x0 * S)), bx = Math.min(size, Math.max(ax + 1, Math.round(x1 * S)));
    const ay = Math.max(0, Math.floor(y0 * S)), by = Math.min(size, Math.max(ay + 1, Math.round(y1 * S)));
    for (let y = ay; y < by; y++) {
      const row = size - 1 - y;
      for (let x = ax; x < bx; x++) {
        const i = (row * size + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
    }
  };
  let fill = [0, 0, 0], stroke = [0, 0, 0], path = [], at = [0, 0];
  return {
    data,
    lineWidth: 1,
    set fillStyle(v) { fill = parse(v); },
    set strokeStyle(v) { stroke = parse(v); },
    fillRect(x, y, w, h) { rect(x, y, x + w, y + h, fill); },
    beginPath() { path = []; },
    moveTo(x, y) { at = [x, y]; },
    lineTo(x, y) { path.push([at[0], at[1], x, y]); at = [x, y]; },
    stroke() {
      const hw = this.lineWidth / 2;
      for (const [x0, y0, x1, y1] of path) {
        if (x0 === x1) rect(x0 - hw, Math.min(y0, y1), x0 + hw, Math.max(y0, y1), stroke);
        else if (y0 === y1) rect(Math.min(x0, x1), y0 - hw, Math.max(x0, x1), y0 + hw, stroke);
      }
    },
  };
}

const facadeCache = new Map();
/** Fachada de ventanas (N0) de la paleta [c1, c2, ...]: DataTexture 128 x 128 sRGB, una por paleta, compartida. */
export function facadeTexture(themeColors) {
  const [c1, c2] = themeColors.map((c) => '#' + new THREE.Color(c).getHexString());
  const key = `sky_${c1}_${c2}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const ctx = pixelContext(FACADE_SIZE);
  drawSkyscraperFacade(ctx, c1, c2);
  const tex = new THREE.DataTexture(ctx.data, FACADE_SIZE, FACADE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true; // 128: potencia de dos
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.name = `neon-facade-${c1}-${c2}`;
  tex.needsUpdate = true;
  facadeCache.set(key, tex);
  return tex;
}
/** Un punto de fondo oscuro de la fachada (entre la columna y la primera ventana): agujas, antenas, techos. */
const DARK_UV = [2.5 / FACADE_SIZE, 1 - 0.5 / FACADE_SIZE];

// ---------- geometría ----------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Acumulador de caras con normal hacia fuera (el orden de los vértices se corrige solo). */
class Buf {
  constructor({ uv = false, color = false } = {}) {
    this.p = [];
    this.n = [];
    this.uv = uv ? [] : null;
    this.c = color ? [] : null;
    this.idx = [];
  }
  push(ps, order, n, uvs, col) {
    const o = this.p.length / 3;
    for (const k of order) {
      this.p.push(...ps[k]);
      this.n.push(...n);
      if (this.uv) this.uv.push(...(uvs ? uvs[k] : DARK_UV));
      if (this.c) this.c.push(...(Array.isArray(col[0]) ? col[k] : col));
    }
    return o;
  }
  /** Cuadrilátero (esquinas en orden alrededor); n = normal hacia fuera. */
  quad(ps, n, uvs, col) {
    const order = dot(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])), n) >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
    const o = this.push(ps, order, n, uvs, col);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  /** Triángulo; out = hacia dónde mira la cara por fuera. */
  tri(ps, out, uvs, col) {
    let n = norm(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])));
    let order = [0, 1, 2];
    if (dot(n, out) < 0) {
      n = [-n[0], -n[1], -n[2]];
      order = [0, 2, 1];
    }
    const o = this.push(ps, order, n, uvs, col);
    this.idx.push(o, o + 1, o + 2);
  }
  get tris() {
    return this.idx.length / 3;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Marco de una torre: (s, y, q) = (a lo ancho, altura, hacia fuera del centro del hoyo) → punto local de la ciudad.
 * La cara q < 0 mira al hoyo.
 */
function frame(x, z, a) {
  const d = [Math.cos(a), 0, Math.sin(a)], t = [-Math.sin(a), 0, Math.cos(a)];
  return {
    d,
    t,
    at: (s, y, q) => [x + t[0] * s + d[0] * q, y, z + t[2] * s + d[2] * q],
  };
}

/** Las 4 caras laterales de un cuerpo (centro os/oq, medio ancho hw/hq): origen, eje a lo largo, normal, ancho. */
function boxFaces(F, os, oq, hw, hq) {
  const neg = (v) => [-v[0], -v[1], -v[2]];
  return [
    { o: F.at(os - hw, 0, oq - hq), axis: F.t, n: neg(F.d), w: hw * 2, front: true }, // al hoyo
    { o: F.at(os + hw, 0, oq - hq), axis: F.d, n: F.t, w: hq * 2 },
    { o: F.at(os + hw, 0, oq + hq), axis: neg(F.t), n: F.d, w: hw * 2 },
    { o: F.at(os - hw, 0, oq + hq), axis: neg(F.d), n: neg(F.t), w: hq * 2 },
  ];
}
const facePt = (f, along, y, out = 0) => add(add([f.o[0], y, f.o[2]], f.axis, along), f.n, out);
function faceQuad(buf, f, a0, a1, y0, y1, out, uvs, col) {
  buf.quad([facePt(f, a0, y0, out), facePt(f, a1, y0, out), facePt(f, a1, y1, out), facePt(f, a0, y1, out)], f.n, uvs, col);
}

/** Octaedro (baliza) centrado en c. */
function octa(buf, c, r) {
  const P = [add(c, [r, 0, 0]), add(c, [-r, 0, 0]), add(c, [0, r, 0]), add(c, [0, -r, 0]), add(c, [0, 0, r]), add(c, [0, 0, -r])];
  for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) buf.tri([P[x], P[y], P[z]], sub(lerp3(lerp3(P[x], P[y], 0.5), P[z], 1 / 3), c));
}

/** Aguja fina de 3 caras (antenas, mástiles) de base b, radio r, hasta la altura top. */
function spike(buf, b, r, top) {
  const P = [0, 1, 2].map((k) => add(b, [Math.cos((k * 2 * Math.PI) / 3) * r, 0, Math.sin((k * 2 * Math.PI) / 3) * r]));
  const apex = [b[0], top, b[2]];
  for (let k = 0; k < 3; k++) {
    const p = P[k], q = P[(k + 1) % 3];
    buf.tri([p, q, apex], sub(lerp3(p, q, 0.5), b));
  }
}

// ---------- reparto ----------

/** Sectores que no se tapan: los pilares ASCII (de un grupo de addAsciiNeon) y el radio de su anillo. */
export function asciiKeepOut(asciiGroup) {
  const pillars = asciiGroup?.children.find((m) => m.name === 'ascii-pillars');
  if (!pillars) return { sectors: [], pillarMinR: Infinity };
  const O = pillars.geometry.attributes.aOrbit.array, S = pillars.geometry.attributes.aShape.array;
  const sectors = [];
  let pillarMinR = Infinity;
  for (let i = 0; i < O.length; i += 16) {
    sectors.push({ a: O[i], half: S[i] / 2 / O[i + 1] });
    pillarMinR = Math.min(pillarMinR, O[i + 1]);
  }
  return { sectors, pillarMinR };
}

function tempKeepOut(bounds, theme, level) {
  const tmp = addAsciiNeon(new THREE.Scene(), { bounds, theme, level });
  const k = asciiKeepOut(tmp.group);
  tmp.dispose();
  return k;
}

/**
 * Anillo real de la ciudad para un hoyo (m, alrededor de su centro): radios de los centros de torre [rMin, rMax] y
 * radio máximo de una torre. El terreno neón (assets/neonTerrain.js) deja llano este anillo.
 */
export function cityRing(bounds) {
  const L = CITY_LAYOUT;
  const maxRadius = Math.hypot(L.footprint[1], L.footprint[1]) / 2 + STANDOFF;
  let reach = 0;
  if (bounds) {
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    reach = Math.hypot(Math.max(bounds.maxX - cx, cx - bounds.minX), Math.max(bounds.maxZ - cz, cz - bounds.minZ));
  }
  const rMin = Math.max(L.r[0], reach + L.minGap + maxRadius);
  return { rMin, rMax: Math.max(rMin, L.r[1]), maxRadius };
}

/** Huellas de las torres (local, alrededor del centro): rng propio, sin pisar pilares ni a otras torres. */
function placeTowers(level, bounds, keepOut) {
  const L = CITY_LAYOUT;
  const n = CITY_BUDGET.towers[level];
  const R = mulberry32(CITY_SEED + LEVEL_I[level]);
  const { rMin, rMax } = cityRing(bounds);
  const towers = [];
  const off = R() * Math.PI * 2;
  const tryAt = (a, rad, w, d) => {
    const radius = Math.hypot(w, d) / 2 + STANDOFF;
    if (rad + radius > keepOut.pillarMinR - L.pillarClear) return false;
    if (keepOut.sectors.some((p) => angDiff(a, p.a) < p.half + radius / rad + L.pillarMargin)) return false;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (towers.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + radius + L.spacing)) return false;
    towers.push({ a, rad, w, d, x, z, radius });
    return true;
  };
  // una por sector del anillo (reparto parejo) y, si un sector no cabe, en cualquier sitio libre
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 40; k++) if (tryAt(off + ((i + R()) / n) * Math.PI * 2, between(R, [rMin, rMax]), between(R, L.footprint), between(R, L.footprint))) break;
  }
  for (let k = 0; towers.length < n && k < 400; k++) tryAt(R() * Math.PI * 2, between(R, [rMin, rMax]), between(R, L.footprint), between(R, L.footprint));
  return towers;
}

// ---------- torres ----------

const neonOf = (theme) => (theme?.neon?.length ? theme.neon : [0x00f0ff, 0xff007f, 0xffd23f]);

/** Geometría de una torre en los acumuladores (body con uv, neon y holo con color, beacons). */
function buildTower(T, D, level, pal, bufs) {
  const L = CITY_LAYOUT;
  const { body, neon, beacons, holo } = bufs;
  const F = frame(T.x, T.z, T.a);
  const u = D();
  T.style = u < 0.4 ? 'spire' : u < 0.7 ? 'antenna' : 'helipad';
  T.top = Math.min(L.maxY, L.top[0] + (L.top[1] - L.top[0]) * (0.25 + 0.75 * D()));
  const capH = T.style === 'spire' ? 3.5 + 2.5 * D() : T.style === 'antenna' ? 4 + 3 * D() : 3.2;
  const bodyTop = T.top - capH;
  T.tiers = level === 'low' ? 1 + Math.floor(D() * 2) : 1 + Math.floor(D() * 3);
  const H = bodyTop - L.baseY;
  const cuts = T.tiers === 1 ? [] : T.tiers === 2 ? [0.62 + 0.13 * D()] : [0.5 + 0.1 * D(), 0.78 + 0.08 * D()];
  const ys = [L.baseY, ...cuts.map((c) => L.baseY + H * c), bodyTop];
  const uOff = D() * TILE.w, vOff = D() * TILE.h;
  const c0 = pal[Math.floor(D() * pal.length)], c1 = pal[Math.floor(D() * pal.length)];
  const corners = D() < 0.65, stripe = D() < 0.4;

  let hw = T.w / 2, hq = T.d / 2, os = 0, oq = 0;
  let last = null;
  for (let k = 0; k < T.tiers; k++) {
    if (k > 0) {
      const s = 0.7 + 0.14 * D();
      const nhw = hw * s, nhq = hq * (0.7 + 0.14 * D());
      // retranqueo hacia atrás (lejos del hoyo) y algo de lado: la fachada que mira al hoyo se ve escalonada
      oq += (hq - nhq) * D();
      os += (hw - nhw) * (D() * 2 - 1) * 0.5;
      hw = nhw;
      hq = nhq;
    }
    const y0 = ys[k], y1 = ys[k + 1];
    const faces = boxFaces(F, os, oq, hw, hq);
    let along = uOff;
    for (const f of faces) {
      const uv = (a, y) => [(along + a) / TILE.w, (y - L.baseY + vOff) / TILE.h];
      faceQuad(body, f, 0, f.w, y0, y1, 0, [uv(0, y0), uv(f.w, y0), uv(f.w, y1), uv(0, y1)]);
      along += f.w;
      // corona de neón en lo alto del cuerpo (en Bajo, solo el último)
      if (level !== 'low' || k === T.tiers - 1) faceQuad(neon, f, 0, f.w, y1 - 0.42, y1 - 0.08, EPS, null, k % 2 ? c1 : c0);
    }
    // techo (oscuro)
    body.quad([F.at(os - hw, y1, oq - hq), F.at(os + hw, y1, oq - hq), F.at(os + hw, y1, oq + hq), F.at(os - hw, y1, oq + hq)], [0, 1, 0]);
    const front = faces[0];
    if (k === 0 && corners) {
      faceQuad(neon, front, 0.12, 0.42, y0, y1 - 0.6, EPS, null, c1);
      faceQuad(neon, front, front.w - 0.42, front.w - 0.12, y0, y1 - 0.6, EPS, null, c1);
    }
    if (k === T.tiers - 1 && stripe) faceQuad(neon, front, front.w / 2 - 0.16, front.w / 2 + 0.16, y0 + (y1 - y0) * 0.25, y1 - 0.7, EPS, null, c0);
    last = { y0, y1, faces, hw, hq, os, oq };
  }

  // remate
  const top = last.y1, centre = F.at(last.os, top, last.oq);
  let tip;
  if (T.style === 'spire') {
    // aguja de 4 caras con aristas de neón: la cima afilada
    const ins = 0.92;
    const B = [
      F.at(last.os - last.hw * ins, top, last.oq - last.hq * ins),
      F.at(last.os + last.hw * ins, top, last.oq - last.hq * ins),
      F.at(last.os + last.hw * ins, top, last.oq + last.hq * ins),
      F.at(last.os - last.hw * ins, top, last.oq + last.hq * ins),
    ];
    const apex = [centre[0], T.top, centre[2]];
    for (let k = 0; k < 4; k++) {
      const p = B[k], q = B[(k + 1) % 4], out = sub(lerp3(p, q, 0.5), centre);
      body.tri([p, q, apex], add(out, [0, 1, 0], 0.3));
      const n = norm(cross(sub(q, p), sub(apex, p)));
      const o = dot(n, out) >= 0 ? n : [-n[0], -n[1], -n[2]];
      neon.tri([add(p, o, EPS), add(lerp3(p, q, 0.1), o, EPS), add(lerp3(p, apex, 0.97), o, EPS)], o, null, c0);
    }
    tip = [centre[0], T.top - 0.35, centre[2]];
  } else if (T.style === 'antenna') {
    spike(body, centre, 0.22, T.top - 0.6);
    tip = [centre[0], T.top - 0.6, centre[2]];
  } else {
    // helipuerto volado: plato octogonal sobre el techo, más ancho que el último cuerpo, con borde de neón
    const padR = Math.min(Math.hypot(last.hw, last.hq) * 1.12, T.radius - STANDOFF - Math.hypot(last.os, last.oq));
    const y0 = top + 0.25, y1 = top + 0.6;
    const ring = Array.from({ length: 8 }, (_, k) => {
      const a = ((k + 0.5) / 8) * Math.PI * 2;
      return [centre[0] + Math.cos(a) * padR, 0, centre[2] + Math.sin(a) * padR];
    });
    const at = (p, y) => [p[0], y, p[2]];
    for (let k = 1; k < 7; k++) {
      body.tri([at(ring[0], y0), at(ring[k], y0), at(ring[k + 1], y0)], [0, -1, 0]);
      body.tri([at(ring[0], y1), at(ring[k], y1), at(ring[k + 1], y1)], [0, 1, 0]);
    }
    for (let k = 0; k < 8; k++) {
      const p = ring[k], q = ring[(k + 1) % 8];
      const out = norm(sub(lerp3(p, q, 0.5), [centre[0], 0, centre[2]]));
      body.quad([at(p, y0), at(q, y0), at(q, y1), at(p, y1)], out);
      neon.quad([add(at(p, y0 + 0.08), out, EPS), add(at(q, y0 + 0.08), out, EPS), add(at(q, y1 - 0.06), out, EPS), add(at(p, y1 - 0.06), out, EPS)], out, null, c1);
    }
    // mástil con baliza en el borde de atrás
    const mast = F.at(last.os, y1, last.oq + padR * 0.7);
    spike(body, mast, 0.12, T.top - 0.6);
    tip = [mast[0], T.top - 0.6, mast[2]];
  }
  T.tip = tip;
  if (beacons) octa(beacons, tip, 0.3);

  // cartel holográfico vertical delante del último cuerpo, en lo alto (solo Alto): por encima de las montañas
  if (holo && T.holo) {
    const f = last.faces[0];
    const y1 = last.y1 - 1.2, ph = Math.min(7, (last.y1 - last.y0) * 0.6), pw = Math.min(2.4, f.w * 0.45);
    const a0 = f.w * (0.25 + 0.5 * D()) - pw / 2;
    const bars = 5, bh = ph / bars;
    for (let k = 0; k < bars; k++) {
      const yb = y1 - (k + 1) * bh;
      const col = (k % 2 ? c1 : pal[2] ?? c0).map((v) => v * (k % 2 ? 0.75 : 1)); // pal: [r, g, b] lineal
      faceQuad(holo, f, a0, a0 + pw * (k % 2 ? 0.7 : 1), yb + bh * 0.18, yb + bh * 0.88, 0.5, null, col);
    }
  }
}

// ---------- ciudad ----------

function cityMesh(name, buf, material) {
  material.name = name;
  const m = new THREE.Mesh(buf.geometry(), material);
  m.name = name;
  m.castShadow = m.receiveShadow = false;
  m.userData.keep = true; // ya va junta: bakeStatic no la toca
  m.raycast = () => {}; // ni suelo ni pared
  return m;
}

/**
 * Ciudad lejana (grupo local alrededor de 0,0): opts { level ('low'|'medium'|'high' o 0..2), theme, bounds?, keepOut? }.
 * keepOut = asciiKeepOut(grupo ASCII); si falta, se calcula con un ASCII de prueba del mismo nivel. Sin rng del hoyo.
 * userData.city = { towers, stats, beamBases (local) }.
 */
export function makeNeonCity({ level, theme, bounds = null, keepOut = null } = {}) {
  level = treeLevel(level);
  const th = theme?.neon ? theme : { neon: neonOf(theme) };
  keepOut ??= tempKeepOut(bounds, th, level);
  const pal = neonOf(th).map((c) => new THREE.Color(c).multiplyScalar(0.9).toArray());
  const towers = placeTowers(level, bounds, keepOut);
  const D = mulberry32(CITY_SEED ^ 0x5eed);
  towers.forEach((t, i) => (t.holo = i % 5 === 2));
  const bufs = {
    body: new Buf({ uv: true }),
    neon: new Buf({ color: true }),
    beacons: level === 'low' ? null : new Buf(),
    holo: level === 'high' ? new Buf({ color: true }) : null,
  };
  for (const t of towers) buildTower(t, D, level, pal, bufs);

  const tex = facadeTexture(neonOf(th));
  const meshes = [
    cityMesh('neon-city-body', bufs.body, new THREE.MeshLambertMaterial({ color: 0x1c1f38, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.32 })),
    cityMesh('neon-city-neon', bufs.neon, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })),
  ];
  if (bufs.beacons) {
    const c = new THREE.Color(neonOf(th)[1] ?? neonOf(th)[0]).lerp(new THREE.Color(0xffffff), 0.3);
    meshes.push(cityMesh('neon-city-beacons', bufs.beacons, new THREE.MeshBasicMaterial({ color: c })));
  }
  if (bufs.holo) {
    meshes.push(
      cityMesh('neon-city-holo', bufs.holo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    );
  }
  const group = new THREE.Group();
  group.name = 'neon-city';
  group.userData.keep = true;
  group.add(...meshes);
  // focos: de las dos torres más altas, lo más separadas posible
  const byTop = [...towers].sort((a, b) => b.top - a.top);
  const first = byTop[0];
  const second = byTop.slice(1, 6).reduce((best, t) => (!best || angDiff(t.a, first.a) > angDiff(best.a, first.a) ? t : best), null);
  const beamBases = [first, second].filter(Boolean).map((t) => ({ x: t.tip[0], y: t.tip[1], z: t.tip[2] }));
  const stats = { calls: meshes.length, triangles: Object.values(bufs).reduce((s, b) => s + (b ? b.tris : 0), 0), towers: towers.length };
  group.userData.city = { towers, stats, beamBases };
  return group;
}

const EMPTY_STATS = Object.freeze({ calls: 0, triangles: 0, towers: 0 });

/**
 * Ciudad lejana alrededor del hoyo (solo temas neón). opts: { bounds, theme, level (0..2 o nombre), animated?
 * (lista por fotograma: se le añade update), ascii? (grupo de addAsciiNeon de este hoyo) }. Devuelve
 * { group, update, dispose, stats, towers, beamBases (mundo) }. Sin rng del hoyo.
 */
export function addNeonCity(scene, { bounds, theme, level, animated, ascii } = {}) {
  const noop = () => {};
  if (!theme?.neon) return { group: null, update: noop, dispose: noop, stats: EMPTY_STATS, towers: [], beamBases: [] };
  const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0, cz = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const keepOut = ascii ? asciiKeepOut(ascii) : null;
  const group = makeNeonCity({ level, theme, bounds, keepOut });
  group.position.set(cx, 0, cz);
  scene.add(group);
  const { towers, stats } = group.userData.city;
  const beamBases = group.userData.city.beamBases.map((p) => ({ x: p.x + cx, y: p.y, z: p.z + cz }));
  group.userData.beamBases = beamBases;
  const beacons = group.children.find((m) => m.name === 'neon-city-beacons');
  // parpadeo de las balizas (todas a la vez: una sola malla); nada se crea por fotograma
  const update = beacons ? (t) => (beacons.visible = Math.sin(t * 2.6) > -0.35) : noop;
  animated?.push(update);
  let alive = true;
  return {
    group,
    update,
    stats,
    towers,
    beamBases,
    /** Quita la ciudad y libera sus geometrías y materiales; la fachada es compartida y no se toca. */
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      for (const m of group.children) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
