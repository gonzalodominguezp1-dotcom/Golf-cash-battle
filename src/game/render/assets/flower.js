import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, smooth, treeLevel, withRim, TriBuilder, tube } from './treeKit.js';

// Flores del estilo liso (paso 6 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// Sustituto de makeFlower (environment.js): una flor suelta con ~60 mallas pequeñas.
// Solo es dibujo: la física del hoyo no lo ve.
// - 3 especies (FLOWER_SPECIES): margarita (disco y pétalos radiales), tulipán (copa
//   cerrada de pétalos con hojas largas) y campanilla (tallo arqueado con campanas
//   colgando).
// - Instanciadas: una InstancedMesh por especie presente (como mucho FLOWER_MAX_CALLS = 3
//   llamadas de dibujo por campo) y un solo material para todas.
// - El color de los pétalos NO va en la geometría: cada instancia lleva su color (atributo
//   flowerColor) y cada vértice un peso fMask (1 = pétalo, 0 = tallo, hojas y botón), de
//   modo que el tallo sigue verde y el botón amarillo sea cual sea la flor. La paleta sale
//   del tema (flowerPaletteOf).
// - Tallo que se dobla con el viento: capa flower de wind.js con la altura local del
//   vértice (source 'y'; la fase sale del sitio de la flor). Las flores viejas no se movían.
// - Estilo liso: pocos triángulos con la oclusión pintada en el color de vértice (base más
//   oscura), luz de borde a contraluz como los árboles, normales suavizadas.
// - Tres calidades: más lados en el tallo, más pétalos y hojas con más tramos; más flores por
//   campo (FLOWER_MAX).
//
// Zonas libres como el césped (GRASS_CLEAR): ninguna raíz a menos de FLOWER_CLEAR.course
// de la pista, ninguna hoja o pétalo a menos de FLOWER_CLEAR.leaf (raíz - alcance de la
// especie x escala) y lo que diga ok(x, z, y, d) (agua, tee...).
//
// Determinismo: del rng del hoyo se toma UNA tirada (FLOWER_RNG_DRAWS = 1, la semilla del
// campo) tenga el tema flores o no y sea cual sea la calidad o la densidad; el resto sale de
// un rng propio con 8 tiradas fijas por candidato. Las flores de Bajo son las primeras de
// Medio y las de Medio las primeras de Alto (mismo sitio, especie y color).
//
// Compatible con bakeStatic: las mallas llevan userData.keep (bakeStatic las salta; no
// puede juntar instancias).

// ---------- presupuesto ----------

/** Triángulos máximos de UNA flor por calidad (cualquier especie). Medido en tests/flower.test.js. */
export const FLOWER_BUDGET = { low: 24, medium: 70, high: 110 };
/** Tope de flores por campo y calidad (la densidad del tema lo recorta). */
export const FLOWER_MAX = { low: 200, medium: 320, high: 420 };
/** Triángulos máximos de un campo entero (FLOWER_MAX x FLOWER_BUDGET). */
export const FLOWER_FIELD_TRIS = { low: 4800, medium: 22400, high: 46200 };
/** Llamadas de dibujo máximas por campo (una malla por especie). */
export const FLOWER_MAX_CALLS = 3;
/** Tiradas que el campo toma del rng del hoyo (siempre las mismas). */
export const FLOWER_RNG_DRAWS = 1;
/** Distancias mínimas a la pista (m): la raíz y cualquier pétalo u hoja (cubre lo que tumba el viento). */
export const FLOWER_CLEAR = { course: 0.45, leaf: 0.25 };
/** Altura de referencia del viento (m de la altura local del tallo). */
export const FLOWER_WIND_HEIGHT = 0.4;
/** Distancia (m) a la que el campo deja de dibujarse por calidad (las flores son diminutas). */
export const FLOWER_FAR = { low: 28, medium: 40, high: 55 };

export const FLOWER_SPECIES = ['daisy', 'tulip', 'bell'];

// proporciones de cada variante: alto y ancho de la flor (más de un 12 % entre ellas)
const VARIANTS = [
  { y: 1, xz: 1 },
  { y: 1.18, xz: 0.86 },
  { y: 0.84, xz: 1.14 },
];

/**
 * Por especie: label, h = altura del tallo (m, sin escalar), reach = radio máximo horizontal
 * de la flor sin escalar (m; lo usan las zonas libres; tests/flower.test.js lo mide en las tres
 * calidades), leaf = largo de sus hojas.
 */
export const FLOWER_INFO = {
  daisy: { label: 'margarita', h: 0.26, reach: 0.11, leaf: 0.11 },
  tulip: { label: 'tulipán', h: 0.32, reach: 0.2, leaf: 0.22 },
  bell: { label: 'campanilla', h: 0.3, reach: 0.15, leaf: 0.13 },
};

// ---------- paletas por tema ----------

/**
 * Paletas (hex sRGB) por especie: los colores de los pétalos; weights = reparto de especies.
 * theme.flowerPalette (nombre) fija la del tema; si no, flowerPaletteOf la elige.
 */
export const FLOWER_PALETTES = {
  day: { daisy: [0xffffff, 0xfff4d6, 0xffd9e8], tulip: [0xe8394d, 0xff6fa5, 0xffd23f, 0xff8a3d], bell: [0x8c6cff, 0x5b8cff, 0xc08aff], weights: { daisy: 0.4, tulip: 0.3, bell: 0.3 } },
  jungle: { daisy: [0xffd23f, 0xff8a3d, 0xffffff], tulip: [0xff3d7f, 0xff6b1a, 0xe02f6f], bell: [0xb14dff, 0x3dc7ff, 0xff7ad9], weights: { daisy: 0.3, tulip: 0.4, bell: 0.3 } },
  sunset: { daisy: [0xffd8a8, 0xffb703, 0xfff1c9], tulip: [0xff4fa3, 0xff7a18, 0xd6336c], bell: [0xa56bff, 0xff7ad9, 0x7b6bff], weights: { daisy: 0.34, tulip: 0.33, bell: 0.33 } },
  night: { daisy: [0xffffff, 0xd6ff7a], tulip: [0xff4fd8, 0x3dd8ff, 0xd6ff7a], bell: [0x8a5cff, 0x38bdf8, 0xff4fd8], weights: { daisy: 0.34, tulip: 0.33, bell: 0.33 } },
};

const lumOf = (hex) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/**
 * Nombre de la paleta de flores de un tema de escena (THEMES) o null si el tema no lleva
 * flores: sin theme.flowers, con theme.flora.flowers = 0 (floraOf), neón, ciudad, lava o
 * caldera. Sin tema: 'day'.
 */
export function flowerPaletteName(theme) {
  if (!theme) return 'day';
  if (!theme.flowers || theme.neon || theme.cyberCity || theme.lava || theme.caldera) return null;
  if (theme.flora?.flowers === 0) return null;
  if (theme.flowerPalette && FLOWER_PALETTES[theme.flowerPalette]) return theme.flowerPalette;
  if (theme.lowClouds && theme.stoneWalls) return 'jungle';
  if (theme.stars) return 'night';
  if (theme.lanterns === true) return 'sunset';
  if (theme.skyTop != null && lumOf(theme.skyTop) < 0.05) return 'night';
  return 'day';
}

export const flowerPaletteOf = (theme) => {
  const name = flowerPaletteName(theme);
  return name ? { name, ...FLOWER_PALETTES[name] } : null;
};

// ---------- geometría (sin rng: la misma flor siempre) ----------

const STEM_SIDES = { low: 3, medium: 4, high: 5 };
const STEM_RINGS = { low: 1, medium: 2, high: 2 };
const STEM = [0x2b7b35, 0x58b44a]; // base oscura, punta clara
const HEART = 0xffc93d;
const UP = new THREE.Vector3(0, 1, 0);

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const vx = (p, n, c, w = 0) => ({ p, n: n.clone().normalize(), c, w });
const tone = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const grey = (k) => new THREE.Color(k, k, k);

const quad = (p0, t, p1, p2) => vec(0, 0, 0).addScaledVector(p0, (1 - t) * (1 - t)).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
const curveOf = (p0, p1, p2) => ({
  at: (t) => quad(p0, t, p1, p2),
  tangent: (t, o) => o.set(0, 0, 0).addScaledVector(p1.clone().sub(p0), 2 * (1 - t)).addScaledVector(p2.clone().sub(p1), 2 * t).normalize(),
});

/** Tallo: tubo cónico verde, base oscura. */
function stem(b, level, curve, r0, r1) {
  tube(b, curve, (t) => lerp(r0, r1, t), STEM_SIDES[level], STEM_RINGS[level], (p, t) => new THREE.Color(STEM[0]).lerp(new THREE.Color(STEM[1]), t * 0.8), () => false);
}

/** Dos hojas en la base del tallo: 1 triángulo (Bajo), 2 (Medio) o 4 (Alto) cada una. */
function leaves(b, level, L, W, az0) {
  const segs = level === 'low' ? 0 : level === 'medium' ? 1 : 2;
  for (let k = 0; k < 2; k++) {
    const az = az0 + k * Math.PI * 0.92;
    const d = vec(Math.cos(az), 0, Math.sin(az)), e = vec(-Math.sin(az), 0, Math.cos(az));
    const at = (s, side) => vec(0, 0.012, 0).addScaledVector(d, L * 0.85 * s).addScaledVector(UP, L * (0.7 * s - 0.45 * s * s)).addScaledVector(e, side * W * Math.sin(Math.PI * Math.pow(s, 0.8)));
    const nrm = UP.clone().addScaledVector(d, -0.2);
    const v = (s, side) => vx(at(s, side), nrm, new THREE.Color(STEM[0]).lerp(new THREE.Color(STEM[1]), s * 0.9).multiplyScalar(0.95));
    if (segs === 0) {
      b.tri(vx(at(0, 0).addScaledVector(e, -W * 0.3), nrm, tone(STEM[0], 0.9)), vx(at(0, 0).addScaledVector(e, W * 0.3), nrm, tone(STEM[0], 0.9)), v(1, 0), 0, UP);
    } else if (segs === 1) {
      const B = v(0, 0), ml = v(0.45, 1), mr = v(0.45, -1), T = v(1, 0);
      b.tri(B, ml, mr, 0, UP);
      b.tri(ml, mr, T, 0, UP);
    } else {
      const B = v(0, 0), l1 = v(0.3, 1), r1 = v(0.3, -1), l2 = v(0.65, 1), r2 = v(0.65, -1), T = v(1, 0);
      b.tri(B, l1, r1, 0, UP);
      b.tri(l1, l2, r1, 0, UP);
      b.tri(r1, l2, r2, 0, UP);
      b.tri(l2, r2, T, 0, UP);
    }
  }
}

/** Anillo de vértices alrededor de `axis` por el punto `c` (radio r, `n` lados, desfase `off` en pasos). */
function ring(c, axis, r, n, off, normal, color) {
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? vec(1, 0, 0) : UP).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = ((k + off) / n) * TAU;
    const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    out.push(vx(c.clone().addScaledVector(d, r), normal(d), typeof color === 'function' ? color(k) : color, 1));
  }
  return out;
}
const strip = (b, r0, r1) => {
  const n = r0.length;
  for (let k = 0; k < n; k++) {
    const a = r0[k], bb = r0[(k + 1) % n], c = r1[k], d = r1[(k + 1) % n];
    b.tri(a, bb, c, 0);
    b.tri(bb, d, c, 0);
  }
};
const fan = (b, apex, r) => {
  for (let k = 0; k < r.length; k++) b.tri(r[k], r[(k + 1) % r.length], apex, 0);
};

function daisy(b, level) {
  const h = FLOWER_INFO.daisy.h;
  const H = vec(0.014, h, 0.006);
  stem(b, level, curveOf(vec(0, 0, 0), vec(0.004, h * 0.55, 0.002), H), 0.009, 0.006);
  leaves(b, level, 0.11, 0.022, 0.5);
  const cs = level === 'low' ? 4 : level === 'medium' ? 6 : 8;
  // botón amarillo (no lleva el color de la flor: mask 0)
  const rc = 0.022;
  const rim = ring(H.clone().add(vec(0, 0.004, 0)), UP, rc, cs, 0, (d) => d.clone().multiplyScalar(0.7).addScaledVector(UP, 0.7), tone(HEART, 0.82)).map((q) => ((q.w = 0), q));
  fan(b, vx(H.clone().add(vec(0, 0.016, 0)), UP, tone(HEART, 1.1)), rim);
  // pétalos: triángulo (Bajo) o rombo (Medio, Alto) que salen del botón
  const np = level === 'low' ? 6 : level === 'medium' ? 8 : 12;
  for (let k = 0; k < np; k++) {
    const a = (k / np) * TAU + 0.2;
    const d = vec(Math.cos(a), 0, Math.sin(a)), e = vec(-Math.sin(a), 0, Math.cos(a));
    const P = (r, side, y) => H.clone().addScaledVector(d, r).addScaledVector(e, side).add(vec(0, y, 0));
    const nrm = UP.clone().multiplyScalar(0.9).addScaledVector(d, 0.3);
    const base = (side) => vx(P(0.016, side, 0.003), nrm, grey(0.72), 1);
    const tip = vx(P(0.088, 0, 0.012), nrm, grey(1), 1);
    if (level === 'low') b.tri(base(-0.016), base(0.016), tip, 0, UP);
    else {
      const l = vx(P(0.046, -0.02, 0.009), nrm, grey(0.92), 1), r = vx(P(0.046, 0.02, 0.009), nrm, grey(0.92), 1);
      b.tri(base(-0.006), base(0.006), l, 0, UP);
      b.tri(base(0.006), r, l, 0, UP);
      b.tri(l, r, tip, 0, UP);
    }
  }
}

function tulip(b, level) {
  const h = FLOWER_INFO.tulip.h;
  const H = vec(0.006, h, 0.002);
  stem(b, level, curveOf(vec(0, 0, 0), vec(0.002, h * 0.55, 0), H), 0.01, 0.0075);
  leaves(b, level, 0.22, 0.034, 1.9);
  // copa: anillos de pétalos que se cierran; el 2.º y el 3.º desfasados (se ven las puntas)
  const s = level === 'low' ? 4 : level === 'medium' ? 5 : 6;
  const rings = level === 'low' ? [[0.0, 0.012], [0.038, 0.03]] : [[0.0, 0.012], [0.03, 0.028], [0.06, 0.025]];
  const apexY = level === 'low' ? 0.075 : 0.085;
  const shade = (k, j) => grey((0.66 + 0.34 * (j / Math.max(1, rings.length))) * (k % 2 ? 0.92 : 1));
  const rs = rings.map(([dy, r], j) => ring(H.clone().add(vec(0, dy, 0)), UP, r, s, j >= 1 ? 0.5 * (j % 2) : 0, (d) => d.clone().multiplyScalar(0.9).setY(0.35), (k) => shade(k, j)));
  for (let j = 0; j + 1 < rs.length; j++) strip(b, rs[j], rs[j + 1]);
  fan(b, vx(H.clone().add(vec(0, apexY, 0)), UP, grey(1), 1), rs[rs.length - 1]);
}

function bell(b, level) {
  const h = FLOWER_INFO.bell.h;
  const p2 = vec(0.1, h * 0.84, 0);
  const curve = curveOf(vec(0, 0, 0), vec(0.004, h * 0.92, 0), p2);
  stem(b, level, curve, 0.0085, 0.0045);
  leaves(b, level, 0.13, 0.02, 2.6);
  const nb = level === 'low' ? 2 : level === 'medium' ? 3 : 4;
  const s = level === 'low' ? 4 : level === 'medium' ? 5 : 6;
  for (let i = 0; i < nb; i++) {
    // las campanas cuelgan de la parte arqueada, alternando lados
    const t = nb === 2 ? 0.7 + 0.3 * i : 0.58 + (0.42 * i) / (nb - 1);
    const at = curve.at(t);
    const side = i % 2 ? 1 : -1;
    const out = vec(0.0, 0, side * 0.018);
    const apex = at.clone().add(out);
    const axis = vec(0.15, -1, side * 0.2).normalize();
    const L = 0.052 * lerp(1, 0.82, i / Math.max(1, nb - 1));
    const nrm = (d) => d.clone().multiplyScalar(0.8).addScaledVector(axis, -0.2);
    const col = (k) => grey(0.86 + 0.14 * (k % 2));
    const mid = ring(apex.clone().addScaledVector(axis, L * 0.4), axis, 0.013, s, 0, nrm, col);
    const lip = ring(apex.clone().addScaledVector(axis, L), axis, 0.027, s, 0, (d) => d.clone().multiplyScalar(0.8).addScaledVector(axis, 0.3), (k) => grey(1 - 0.06 * (k % 2)));
    mid.forEach((q) => (q.c = grey(0.74)));
    const top = vx(apex, axis.clone().multiplyScalar(-1), grey(0.7), 1);
    if (level === 'low') fan(b, top, lip); // Bajo: un cono de una sola tira
    else {
      fan(b, top, mid);
      strip(b, mid, lip);
    }
  }
}

const BUILD = { daisy, tulip, bell };
const GEOS = new Map();

/**
 * Geometría de una flor (cacheada; clónala si vas a añadirle atributos): position, normal,
 * color (verde del tallo y botón; blanco con oclusión en los pétalos) y fMask (1 = recibe el
 * color de la instancia). Base en el origen, sin índice.
 */
export function flowerGeometry(level, species = 'daisy') {
  level = treeLevel(level);
  if (!BUILD[species]) throw new Error(`flor: especie desconocida (${species})`);
  const key = `${level}:${species}`;
  if (!GEOS.has(key)) {
    const b = new TriBuilder(0);
    BUILD[species](b, level);
    const g = b.geometry();
    g.setAttribute('fMask', g.getAttribute('windFlutter'));
    for (const n of ['sway', 'windPhase', 'windFlutter']) g.deleteAttribute(n);
    GEOS.set(key, g);
  }
  return GEOS.get(key);
}

export const flowerTriangles = (level, species) => flowerGeometry(level, species).attributes.position.count / 3;

// ---------- material (uno para todas las flores) ----------

let MAT = null;
/**
 * Lambert liso de dos caras, color de vértice teñido por el color de cada instancia
 * (flowerColor x fMask), luz de borde y viento (capa flower, altura local). Compartido por
 * todas las flores y calidades.
 */
export function flowerMaterial() {
  if (MAT) return MAT;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  withRim(m, 0.35, true);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.call(m);
  m.onBeforeCompile = function (sh, renderer) {
    prev?.call(this, sh, renderer);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 flowerColor;\nattribute float fMask;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\n  vColor.rgb = mix(vColor.rgb, vColor.rgb * flowerColor, fMask);\n#endif');
  };
  m.customProgramCacheKey = () => `gcb-flower1|${prevKey}`;
  applyWind(m, { layer: 'flower', source: 'y', height: FLOWER_WIND_HEIGHT });
  MAT = m;
  return m;
}

// ---------- campo ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const DRAWS_PER_FLOWER = 8; // x, z, densidad, giro, escala, color, especie, variante
const MAX_TRIES = 10; // candidatos por flor pedida, como mucho
const fract = (v) => v - Math.floor(v);
const noFlowers = (group, stats) => ({ group, mesh: null, meshes: [], stats });

/**
 * Siembra las flores alrededor de la pista en manchas (la densidad sigue un ruido de ~7 m y
 * cada mancha favorece una especie). Opciones como makeGrassField: bounds, heightAt(x, z),
 * ok(x, z, y, d), rng (del hoyo: una sola tirada), density (0..1, recorta FLOWER_MAX; se
 * multiplica por theme.flora.flowers si es un número), reach (m), level (nombre, preset o lod),
 * theme (elige la paleta con flowerPaletteOf; sin flores → ninguna), palette (nombre de
 * FLOWER_PALETTES o paleta; manda sobre theme) y only (una sola especie, para el laboratorio:
 * mismos sitios y colores). Devuelve { group, mesh, meshes, stats }: una InstancedMesh por
 * especie presente (mesh = meshes[0]; null y [] si no hay flores).
 */
export function makeFlowerField({ bounds, heightAt = () => 0, ok = () => true, rng, density = 1, reach = 15, level, theme, palette, only }) {
  level = treeLevel(level);
  const seed = Math.floor(rng() * 4294967296); // la única tirada del rng del hoyo
  const r = mulberry32(seed ^ 0x5bd1e995);
  const P = typeof palette === 'string' ? (FLOWER_PALETTES[palette] ? { name: palette, ...FLOWER_PALETTES[palette] } : null) : palette ?? flowerPaletteOf(theme);
  const solo = FLOWER_SPECIES.includes(only) ? only : null;
  const mult = typeof theme?.flora?.flowers === 'number' ? theme.flora.flowers : 1;
  const want = P ? Math.round(FLOWER_MAX[level] * Math.min(1, Math.max(0, (Number(density) || 0) * mult))) : 0;
  const group = new THREE.Group();
  group.name = 'flowers';
  const stats = { level, flowers: 0, triangles: 0, vertices: 0, calls: 0, seed, palette: P?.name ?? null, species: {} };
  group.userData.flowers = stats;
  if (want <= 0) return noFlowers(group, stats);

  const weights = FLOWER_SPECIES.map((s) => P.weights?.[s] ?? 1);
  const wsum = weights.reduce((a, c) => a + c, 0);
  const pickSpecies = (u) => {
    let acc = 0;
    for (let i = 0; i < FLOWER_SPECIES.length; i++) {
      acc += weights[i] / wsum;
      if (u < acc) return FLOWER_SPECIES[i];
    }
    return FLOWER_SPECIES[FLOWER_SPECIES.length - 1];
  };
  const minX = bounds.minX - reach, maxX = bounds.maxX + reach, minZ = bounds.minZ - reach, maxZ = bounds.maxZ + reach;
  const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
  const items = [];
  for (let tries = 0; items.length < want && tries < want * MAX_TRIES; tries++) {
    // siempre las mismas DRAWS_PER_FLOWER tiradas por candidato, se use o no
    const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
    const keep = r(), rot = r() * TAU, size = r(), colorRoll = r(), spRoll = r(), varRoll = r();
    const d = distBox(x, z);
    if (d < FLOWER_CLEAR.course || d > reach) continue;
    // manchas: la densidad sigue un ruido de ~7 m (claros entre medias) y se aclara hacia fuera
    const patch = smooth(0.38, 0.72, vnoise(x / 7 + 11.3, z / 7 - 4.1));
    if (keep > 0.08 + 0.92 * patch * (1 - 0.5 * (d / reach))) continue;
    const y = heightAt(x, z);
    if (!ok(x, z, y, d)) continue;
    // cada mancha favorece una especie (ruido de ~11 m) con algo de mezcla
    const drift = Math.min(1, Math.max(0, (vnoise(x / 11 - 2.7, z / 11 + 8.3) - 0.5) * 2.4 + 0.5));
    const sp = solo ?? pickSpecies(0.65 * drift + 0.35 * spRoll);
    const info = FLOWER_INFO[sp];
    const variant = Math.min(VARIANTS.length - 1, Math.floor(varRoll * VARIANTS.length));
    const s = lerp(0.8, 1.2, size), V = VARIANTS[variant];
    const sxz = s * V.xz, sy = s * V.y;
    // ningún pétalo ni hoja sobre la pista: la raíz menos el alcance de la especie escalado
    if (d - info.reach * sxz < FLOWER_CLEAR.leaf) continue;
    items.push({ x, y, z, rot, sxz, sy, sp, variant, colorRoll, tilt: fract(size * 9.13), tiltDir: fract(colorRoll * 7.7) });
  }
  if (!items.length) return noFlowers(group, stats);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const mat = flowerMaterial();
  const meshes = [];
  for (const sp of FLOWER_SPECIES) {
    const list = items.filter((t) => t.sp === sp);
    if (!list.length) continue;
    // copia propia por campo: borrar un campo no toca los búferes de otro
    const geo = flowerGeometry(level, sp).clone();
    const colors = new Float32Array(list.length * 3);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = `flowers-${sp}`;
    const pal = P[sp];
    list.forEach((t, i) => {
      // un ligero giro del tallo (hasta ~9°): ninguna flor idéntica a su vecina
      const lean = t.tilt * 0.16, a = t.tiltDir * TAU;
      e.set(Math.sin(a) * lean, t.rot, Math.cos(a) * lean, 'YXZ');
      q.setFromEuler(e);
      m4.compose(v.set(t.x, t.y - 0.01, t.z), q, sc.set(t.sxz, t.sy, t.sxz));
      mesh.setMatrixAt(i, m4);
      const k = t.colorRoll * pal.length;
      c.set(pal[Math.min(pal.length - 1, Math.floor(k))]).multiplyScalar(0.93 + 0.14 * fract(k));
      colors[i * 3] = Math.min(1, c.r);
      colors[i * 3 + 1] = Math.min(1, c.g);
      colors[i * 3 + 2] = Math.min(1, c.b);
    });
    geo.setAttribute('flowerColor', new THREE.InstancedBufferAttribute(colors, 3));
    mesh.userData.species = sp;
    mesh.userData.variants = list.map((t) => t.variant);
    mesh.userData.keep = true; // bakeStatic no puede juntar instancias
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = false; // como hoy: las flores no proyectan sombra
    mesh.receiveShadow = false;
    group.add(mesh);
    meshes.push(mesh);
    stats.species[sp] = list.length;
    stats.triangles += list.length * (geo.attributes.position.count / 3);
    stats.vertices += list.length * geo.attributes.position.count;
  }
  stats.flowers = items.length;
  stats.calls = meshes.length;
  return { group, mesh: meshes[0], meshes, stats };
}

/**
 * Como makeFlowerField, añadiendo el campo a `scene`. Devuelve { mesh, meshes, stats,
 * update(cam), dispose() } o null si no hay flores. update esconde cada malla si la cámara
 * queda más lejos que FLOWER_FAR; dispose quita el campo y libera sus InstancedMesh y
 * geometrías clonadas (el material compartido no se toca).
 */
export function addFlowers(scene, opts) {
  const { group, mesh, meshes, stats } = makeFlowerField(opts);
  if (!mesh) return null;
  scene.add(group);
  const far = FLOWER_FAR[stats.level];
  const spheres = meshes.map((m) => ({ m, center: m.boundingSphere.center.clone(), radius: m.boundingSphere.radius }));
  return {
    mesh,
    meshes,
    stats,
    update(cam) {
      for (const s of spheres) s.m.visible = s.center.distanceTo(cam) - s.radius < far;
    },
    dispose() {
      scene.remove(group);
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    },
  };
}
