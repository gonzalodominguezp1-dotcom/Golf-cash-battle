import * as THREE from 'three';
import { applyWind, WIND_LAYERS } from './wind.js';

// Árbol redondo del estilo liso (paso 1 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// - Tronco curvo (curva de Bézier) con raíces abiertas y 2-4 ramas principales.
// - Copa de varios racimos lisos (icosaedros con abolladura suave), uno en la
//   punta de cada rama y uno encima del tronco; las caras de un racimo que
//   quedan dentro de otro se quitan (no se ven y cuestan).
// - Normales «esferizadas»: cada vértice mira desde el centro de su racimo,
//   mezclado con el centro de toda la copa. La luz cae suave, sin pliegues
//   oscuros entre racimos (estilo cartoon).
// - Oclusión en el color de vértice: más oscuro abajo y hacia dentro de la copa.
// - Luz de borde a contraluz en el sombreador (un pow por píxel, sin texturas).
// - En Alto: tarjetas de hojas recortadas (textura pintada en canvas) que
//   asoman por el borde de la copa y rompen la silueta.
// - Viento de tres capas (assets/wind.js): el tronco se dobla, cada racimo se
//   balancea con su fase y las hojas aletean. Los atributos de viento ya vienen
//   escritos: bakeStatic y prepareWind los respetan.
//
// Móvil primero: tres materiales compartidos por todos los árboles (tronco,
// copa, tarjetas) con el color de la paleta en el vértice. Tras bakeStatic, todo
// el bosque son tres llamadas de dibujo. Presupuesto por árbol en ROUND_TREE_BUDGET.
// Todo sale del rng recibido: misma semilla, mismo árbol. Las tiradas no dependen
// de la calidad, así que la misma semilla da el mismo árbol en Bajo, Medio y Alto.

export const ROUND_TREE_BUDGET = { low: 250, medium: 600, high: 1200 };
export const ROUND_TREE_VARIANTS = 4;
export const ROUND_TREE_DEFAULTS = { leaves: [0x4caf3c, 0x3f9f45, 0x66bd3f, 0x2f8f3f], bark: 0x7a4e2c };

const LEVELS = ['low', 'medium', 'high'];
const TAU = Math.PI * 2;

// detalle por calidad: tronco/rama [lados, tramos], icosaedro de los racimos,
// racimos de relleno (extras) y tarjetas de hojas por racimo de radio 0,55 m
const DETAIL = {
  low: { trunk: [5, 3], branch: [4, 2], ico: 1, topIco: 1, minIco: 1, extras: false, cards: 0 },
  medium: { trunk: [7, 5], branch: [5, 3], ico: 2, topIco: 2, minIco: 1, extras: true, cards: 0 },
  high: { trunk: [9, 7], branch: [6, 4], ico: 2, topIco: 3, minIco: 1, extras: true, cards: 9 },
};

const BUMP = 0.06; // abolladura de los racimos (fracción del radio)
const CULL = 0.8; // una cara se quita si está dentro del 80 % de otro racimo (margen para abolladura, facetas y viento)
const CARD_POOL = 14; // tarjetas candidatas por racimo (se tiran siempre, se usan según la calidad)
const PHASE_SPREAD = 0.9; // diferencia máxima de fase entre racimos (rad): se mueven parecido y no se abren huecos

/** Calidad como nombre ('low'...), preset del laboratorio ({ level }), lod (0/1/2) o número. */
export function roundTreeLevel(q) {
  if (typeof q === 'string') return LEVELS.includes(q) ? q : 'medium';
  if (typeof q === 'number' && Number.isFinite(q)) return LEVELS[Math.max(0, Math.min(2, Math.round(q)))];
  if (q && typeof q === 'object') {
    if (LEVELS.includes(q.level)) return q.level;
    if (Number.isFinite(q.lod)) return LEVELS[Math.max(0, Math.min(2, Math.round(q.lod)))];
  }
  return 'medium';
}

// ---------- materiales (compartidos por todos los árboles) ----------

/**
 * Luz de borde a contraluz: el borde de la copa se enciende con el color del sol
 * teñido por la hoja (como si la luz la atravesara), más cuando el sol está detrás.
 * unflip: en materiales de dos caras la normal no se da la vuelta por detrás
 * (las tarjetas se iluminan igual por las dos caras, como la copa que las rodea).
 */
function withRim(material, strength, unflip = false) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.call(material);
  const rim = [
    '#if NUM_DIR_LIGHTS > 0',
    '{',
    '  float gcbRim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);',
    '  float gcbBack = saturate(-dot(directionalLights[0].direction, geometryViewDir));',
    `  outgoingLight += diffuseColor.rgb * directionalLights[0].color * gcbRim * (0.3 + 0.7 * gcbBack) * ${strength.toFixed(3)};`,
    '}',
    '#endif',
  ].join('\n');
  material.onBeforeCompile = function (sh, renderer) {
    prev?.call(this, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `${rim}\n#include <opaque_fragment>`);
    if (unflip) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif',
      );
    }
  };
  material.customProgramCacheKey = () => `rim:${strength}:${unflip ? 1 : 0}|${prevKey}`;
  return material;
}

/** Ramillete de hojas en blanco y gris (el color lo pone el vértice), fondo transparente. */
function leafCardTexture() {
  if (typeof document === 'undefined') return null; // tests en node: sin canvas
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 9;
  for (let i = 0; i < n; i++) {
    // abanico hacia arriba desde la base (abajo en el centro): la base queda dentro de la copa
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2 + (rnd() - 0.5) * 0.25;
    const len = size * (0.27 + rnd() * 0.12);
    const w = len * (0.38 + rnd() * 0.1);
    const r0 = size * (0.1 + rnd() * 0.08);
    g.save();
    g.translate(size / 2 + Math.cos(a) * r0, size * 0.66 + Math.sin(a) * r0);
    g.rotate(a + Math.PI / 2);
    const grad = g.createLinearGradient(0, 0, 0, -len);
    grad.addColorStop(0, '#aebaa9');
    grad.addColorStop(1, '#ffffff');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w, -len * 0.45, 0, -len);
    g.quadraticCurveTo(-w, -len * 0.45, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(110,125,105,0.85)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -len * 0.85);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let MATS = null;
/** { trunk, canopy, cards }: los mismos para todos los árboles redondos. */
export function roundTreeMaterials() {
  if (MATS) return MATS;
  const base = (extra = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, ...extra });
  const trunk = applyWind(withRim(base(), 0.15), { layer: 'trunk' });
  const canopy = applyWind(withRim(base(), 0.6), { layer: 'canopy' });
  const cards = base({ side: THREE.DoubleSide, alphaTest: 0.5, map: leafCardTexture() });
  // bakeStatic borra las uv salvo que el material lo pida (las tarjetas las necesitan)
  cards.userData.keepUv = true;
  // se balancean como su racimo (no se despegan) y aletean como hojas
  applyWind(withRim(cards, 0.7, true), { layer: 'leaf', sway: WIND_LAYERS.canopy.sway });
  MATS = { trunk, canopy, cards };
  return MATS;
}

// ---------- plan: todas las tiradas del rng (no dependen de la calidad) ----------

const lerp = (a, b, t) => a + (b - a) * t;
const range = (rng, [a, b]) => lerp(a, b, rng());
const smooth = (e0, e1, x) => THREE.MathUtils.smoothstep(x, e0, e1);
const UP = new THREE.Vector3(0, 1, 0);

// forma de cada variante: altura del tronco h, inclinación lean, radio r0, ramas
// (número nb, dónde salen bt, elevación be, largo bl, radio del racimo br, aplastado sy),
// racimo de encima (top) y, en la alta, otro más arriba (crown)
const VARIANTS = [
  // 0 · redondo: copa de bola con tres ramas
  { name: 'redondo', h: [1.2, 1.4], lean: [0.05, 0.14], r0: [0.13, 0.16], nb: 3, bt: [0.72, 0.86], be: [0.6, 0.85], bl: [0.5, 0.65], br: [0.5, 0.6], sy: [0.85, 0.95], top: { up: 0.5, r: [0.68, 0.78], sy: 0.92 } },
  // 1 · alto: copa ovalada y estrecha, racimos apilados
  { name: 'alto', h: [1.55, 1.8], lean: [0.03, 0.1], r0: [0.12, 0.14], nb: 3, bt: [0.55, 0.8], be: [1.0, 1.2], bl: [0.35, 0.45], br: [0.38, 0.45], sy: [1.05, 1.2], top: { up: 0.45, r: [0.5, 0.56], sy: 1.2 }, crown: { up: 1.1, r: [0.4, 0.46], sy: 1.15 } },
  // 2 · ancho: tronco corto y copa en paraguas
  { name: 'ancho', h: [0.95, 1.1], lean: [0.04, 0.1], r0: [0.15, 0.18], nb: 4, bt: [0.78, 0.94], be: [0.3, 0.5], bl: [0.75, 0.92], br: [0.46, 0.55], sy: [0.68, 0.78], top: { up: 0.32, r: [0.62, 0.7], sy: 0.7 } },
  // 3 · inclinado: tronco que se curva a un lado, una rama larga y otra corta
  { name: 'inclinado', h: [1.15, 1.35], lean: [0.55, 0.7], r0: [0.13, 0.16], nb: 2, bt: [0.55, 0.75], be: [0.3, 0.45], bl: [0.95, 1.1], br: [0.48, 0.56], sy: [0.8, 0.9], top: { up: 0.38, r: [0.6, 0.68], sy: 0.85 }, asym: true },
];

function bezier(p0, p1, p2, t, out = new THREE.Vector3()) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u).addScaledVector(p1, 2 * u * t).addScaledVector(p2, t * t);
}

function bezierTangent(p0, p1, p2, t, out = new THREE.Vector3()) {
  return out
    .set(0, 0, 0)
    .addScaledVector(p1.clone().sub(p0), 2 * (1 - t))
    .addScaledVector(p2.clone().sub(p1), 2 * t)
    .normalize();
}

function makeCluster(rng, c, r, sy, p0, extra = false) {
  const waves = Array.from({ length: 4 }, () => ({
    d: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
    f: 2.4 * (0.7 + rng() * 0.8),
    ph: rng() * TAU,
  }));
  const phase = p0 + (rng() - 0.5) * PHASE_SPREAD;
  const tint = { h: (rng() - 0.5) * 0.03, l: (rng() - 0.5) * 0.07 };
  const cards = Array.from({ length: CARD_POOL }, () => ({ az: rng() * TAU, y: lerp(-0.25, 0.95, rng()), rot: rng() * TAU, tilt: lerp(0.45, 0.95, rng()), size: rng() }));
  return { c, r, sy, waves, phase, tint, cards, extra, branch: -1, top: false };
}

function planTree(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % ROUND_TREE_VARIANTS) + ROUND_TREE_VARIANTS) % ROUND_TREE_VARIANTS : Math.floor(vr * ROUND_TREE_VARIANTS);
  const V = VARIANTS[variant];
  const p0 = rng() * TAU;
  const leafPick = rng();
  const barkTint = (rng() - 0.5) * 0.06;

  // tronco
  const h = range(rng, V.h);
  const lean = range(rng, V.lean);
  const la = rng() * TAU;
  const leanDir = new THREE.Vector3(Math.cos(la), 0, Math.sin(la));
  const side = new THREE.Vector3(-leanDir.z, 0, leanDir.x);
  const curl = (rng() - 0.5) * 0.18;
  const trunk = {
    p0: new THREE.Vector3(0, -0.05, 0),
    p1: new THREE.Vector3().addScaledVector(leanDir, lean * (V.asym ? -0.1 : 0.2)).addScaledVector(side, curl).setY(h * 0.5),
    p2: new THREE.Vector3().addScaledVector(leanDir, lean).setY(h),
    r0: range(rng, V.r0),
  };
  const trunkAt = (t) => bezier(trunk.p0, trunk.p1, trunk.p2, t);

  // ramas y su racimo en la punta
  const branches = [];
  const clusters = [];
  const a0 = rng() * TAU;
  for (let i = 0; i < V.nb; i++) {
    let az, el, len, br;
    if (V.asym) {
      // una rama larga hacia donde cae el tronco y otra corta al otro lado
      const long = i === 0;
      az = la + (long ? 0 : Math.PI) + (rng() - 0.5) * 0.6;
      el = long ? range(rng, V.be) : range(rng, [0.85, 1.05]);
      len = long ? range(rng, V.bl) : range(rng, [0.35, 0.45]);
      br = long ? range(rng, V.br) : range(rng, [0.4, 0.46]);
    } else {
      az = a0 + (i / V.nb) * TAU + (rng() - 0.5) * 0.6;
      el = range(rng, V.be);
      len = range(rng, V.bl);
      br = range(rng, V.br);
    }
    const t0 = range(rng, V.bt);
    const sy = range(rng, V.sy);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const s = trunkAt(t0);
    const tip = s.clone().addScaledVector(dir, len);
    const mid = s.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, len * 0.06, 0));
    branches.push({ t0, s, mid, tip });
    const cl = makeCluster(rng, tip.clone().addScaledVector(dir, br * 0.2).add(new THREE.Vector3(0, br * 0.15, 0)), br, sy, p0);
    cl.branch = i;
    clusters.push(cl);
  }
  // racimo encima del tronco (siempre) y, en la variante alta, otro más arriba
  const topC = trunk.p2.clone().addScaledVector(leanDir, lean * 0.15).add(new THREE.Vector3(0, V.top.up, 0));
  const top = makeCluster(rng, topC, range(rng, V.top.r), V.top.sy, p0);
  top.top = true;
  clusters.push(top);
  if (V.crown) {
    const cc = trunk.p2.clone().add(new THREE.Vector3((rng() - 0.5) * 0.12, V.crown.up, (rng() - 0.5) * 0.12));
    clusters.push(makeCluster(rng, cc, range(rng, V.crown.r), V.crown.sy, p0));
  }
  // relleno entre racimos vecinos (Medio y Alto): la copa sale más llena y menos regular
  const core = clusters.slice();
  const center = canopyCenter(core);
  for (let k = 0; k < 2; k++) {
    const a = core[Math.floor(rng() * core.length)];
    let b = core[Math.floor(rng() * core.length)];
    if (b === a) b = core[(core.indexOf(a) + 1) % core.length];
    const out = a.c.clone().lerp(b.c, 0.5).sub(center);
    out.y = Math.max(out.y, 0) + 0.15;
    const c = a.c.clone().lerp(b.c, 0.5).addScaledVector(out.normalize(), 0.22 * Math.min(a.r, b.r));
    clusters.push(makeCluster(rng, c, Math.min(a.r, b.r) * range(rng, [0.62, 0.75]), (a.sy + b.sy) / 2, p0, true));
  }
  return { variant, name: V.name, p0, leafPick, barkTint, trunk, branches, clusters };
}

function canopyCenter(clusters) {
  const c = new THREE.Vector3();
  let w = 0;
  for (const cl of clusters) {
    const k = cl.r ** 3;
    c.addScaledVector(cl.c, k);
    w += k;
  }
  return c.divideScalar(w || 1);
}

// ---------- construcción de la geometría ----------

const ICO = new Map();
function unitIco(detail) {
  if (!ICO.has(detail)) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    ICO.set(detail, g.attributes.position.array.slice());
    g.dispose();
  }
  return ICO.get(detail);
}

// count: solo cuenta triángulos (el ajuste al presupuesto prueba varias veces sin calcular color ni normales)
class Builder {
  constructor(p0, uv = false, count = false) {
    this.p0 = p0;
    this.count = count;
    this.n = 0;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.sway = [];
    this.ph = [];
    this.fl = [];
    this.uv = uv ? [] : null;
  }
  vert(p, n, c, phase, flutter, uv) {
    this.n++;
    if (this.count) return;
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.sway.push(Math.max(0, p.y));
    this.ph.push(this.p0, phase);
    this.fl.push(flutter);
    if (this.uv) this.uv.push(uv[0], uv[1]);
  }
  get tris() {
    return this.n / 3;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('windPhase', new THREE.Float32BufferAttribute(this.ph, 2));
    g.setAttribute('windFlutter', new THREE.Float32BufferAttribute(this.fl, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** ¿Está p dentro del racimo cl (encogido a `shrink`)? */
function inside(p, cl, shrink) {
  const x = (p.x - cl.c.x) / cl.r, y = (p.y - cl.c.y) / (cl.r * cl.sy), z = (p.z - cl.c.z) / cl.r;
  return x * x + y * y + z * z < shrink * shrink;
}

/** Un triángulo se quita si sus tres vértices caen dentro de un mismo racimo (la copa es convexa por racimo: no se ve). */
const hidden = (tri, clusters, skip) => clusters.some((cl) => cl !== skip && tri.every((v) => inside(v.p, cl, CULL)));

/**
 * Tubo a lo largo de una curva (tronco o rama). radial lados, rings tramos.
 * Marco por transporte paralelo: los anillos no se retuercen.
 */
function tube(b, curve, radius, radial, rings, shade, clusters) {
  const ringsPts = [];
  let n = null;
  const T = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = curve.at(t);
    curve.tangent(t, T);
    if (!n) {
      const ref = Math.abs(T.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      n = new THREE.Vector3().crossVectors(T, ref).normalize();
    } else n.addScaledVector(T, -n.dot(T)).normalize();
    const bn = new THREE.Vector3().crossVectors(T, n);
    const r = radius(t);
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
      const p = c.clone().addScaledVector(d, r);
      ring.push({ p, n: d, c: shade(p, t, a) });
    }
    ringsPts.push(ring);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = ringsPts[i][k], bb = ringsPts[i][(k + 1) % radial], c = ringsPts[i + 1][k], d = ringsPts[i + 1][(k + 1) % radial];
      for (const tri of [[a, bb, c], [bb, d, c]]) {
        if (hidden(tri, clusters, null)) continue;
        for (const v of tri) b.vert(v.p, v.n, v.c, b.p0, 0);
      }
    }
  }
}

function build(plan, level, palette, state, count = false) {
  const D = DETAIL[level];
  const mats = roundTreeMaterials();
  const clusters = plan.clusters.filter((_, i) => state.include[i]);
  const cc = canopyCenter(clusters);
  let yMin = Infinity, yMax = -Infinity, R = 0;
  for (const cl of clusters) {
    yMin = Math.min(yMin, cl.c.y - cl.r * cl.sy);
    yMax = Math.max(yMax, cl.c.y + cl.r * cl.sy);
    R = Math.max(R, cl.c.distanceTo(cc) + cl.r);
  }

  // colores (lineales): hoja elegida de la paleta, con un tono por racimo
  const leaves = palette.leaves.length ? palette.leaves : ROUND_TREE_DEFAULTS.leaves;
  const leafBase = new THREE.Color(leaves[Math.floor(plan.leafPick * leaves.length) % leaves.length]);
  const bark = new THREE.Color(palette.bark).offsetHSL(0, 0, plan.barkTint);

  // ---- tronco y ramas ----
  const tb = new Builder(plan.p0, false, count);
  const { trunk } = plan;
  const H = trunk.p2.y;
  const trunkShade = count ? () => null : (p) => {
    // pie oscuro (toca el suelo) y arriba oscuro (a la sombra de la copa)
    const ao = (0.62 + 0.38 * smooth(0, 0.35, p.y)) * (1 - 0.35 * smooth(H * 0.45, H * 1.05, p.y));
    return bark.clone().multiplyScalar(ao);
  };
  const [tr, trr] = D.trunk;
  tube(
    tb,
    { at: (t) => bezier(trunk.p0, trunk.p1, trunk.p2, t), tangent: (t, o) => bezierTangent(trunk.p0, trunk.p1, trunk.p2, t, o) },
    (t) => trunk.r0 * (1 - 0.45 * t) * (1 + 0.75 * Math.max(0, 1 - t / 0.18) ** 2),
    tr,
    trr,
    trunkShade,
    clusters,
  );
  const [br, brr] = D.branch;
  plan.branches.forEach((bra, i) => {
    if (!state.include[plan.clusters.findIndex((cl) => cl.branch === i)]) return;
    const rs = trunk.r0 * (1 - 0.45 * bra.t0) * 0.62;
    tube(
      tb,
      { at: (t) => bezier(bra.s, bra.mid, bra.tip, t), tangent: (t, o) => bezierTangent(bra.s, bra.mid, bra.tip, t, o) },
      (t) => rs * (1 - 0.6 * t),
      br,
      brr,
      count ? trunkShade : (p) => trunkShade(p).multiplyScalar(0.85),
      clusters,
    );
  });

  // ---- copa ----
  const leafColor = (cl) => leafBase.clone().offsetHSL(cl.tint.h, 0, cl.tint.l);
  const topTint = (base) => base.clone().offsetHSL(-0.025, 0.02, 0.09);
  const shadeLeaf = (p, n, base) => {
    const h = (p.y - yMin) / Math.max(1e-6, yMax - yMin);
    const dc = Math.min(1.2, p.distanceTo(cc) / Math.max(1e-6, R));
    // oclusión: abajo y dentro, más oscuro; la cara de abajo un poco más
    let ao = 0.36 + 0.4 * smooth(0, 1, h) + 0.24 * smooth(0.35, 0.95, dc);
    if (n.y < 0) ao *= 1 + 0.25 * n.y;
    const c = base.clone().lerp(topTint(base), 0.6 * smooth(0.55, 1, h));
    return { c: c.multiplyScalar(Math.max(0.22, Math.min(1, ao))), w: 0.25 + 0.75 * smooth(0.45, 1, dc) };
  };
  const spherize = (p, cl, out = new THREE.Vector3()) => {
    // normal de la elipsoide del racimo mezclada con la dirección desde el centro de la copa
    out.set((p.x - cl.c.x) / (cl.r * cl.r), (p.y - cl.c.y) / (cl.r * cl.sy) ** 2, (p.z - cl.c.z) / (cl.r * cl.r)).normalize();
    const g = p.clone().sub(cc);
    if (g.lengthSq() > 1e-8) out.multiplyScalar(0.7).addScaledVector(g.normalize(), 0.3);
    return out.normalize();
  };

  const lb = new Builder(plan.p0, false, count);
  plan.clusters.forEach((cl, i) => {
    if (!state.include[i]) return;
    const unit = unitIco(state.ico[i]);
    const base = leafColor(cl);
    const d = new THREE.Vector3();
    for (let f = 0; f < unit.length; f += 9) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        d.fromArray(unit, f + k * 3);
        let bump = 0;
        for (const w of cl.waves) bump += Math.sin(d.dot(w.d) * w.f + w.ph);
        const s = 1 + (bump / cl.waves.length) * BUMP;
        const p = new THREE.Vector3(cl.c.x + d.x * cl.r * s, cl.c.y + d.y * cl.r * cl.sy * s, cl.c.z + d.z * cl.r * s);
        tri.push({ p });
      }
      if (hidden(tri, clusters, cl)) continue;
      if (count) {
        lb.n += 3;
        continue;
      }
      for (const v of tri) {
        const n = spherize(v.p, cl);
        const { c, w } = shadeLeaf(v.p, n, base);
        lb.vert(v.p, n, c, cl.phase, w);
      }
    }
  });

  // ---- tarjetas de hojas (Alto) ----
  let cb = null;
  if (state.cards > 0) {
    cb = new Builder(plan.p0, true, count);
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    plan.clusters.forEach((cl, i) => {
      if (!state.include[i]) return;
      const want = Math.min(CARD_POOL, Math.round(state.cards * (cl.r / 0.55) ** 2));
      const base = leafColor(cl);
      let made = 0;
      for (const cand of cl.cards) {
        if (made >= want) break;
        const sr = Math.sqrt(1 - cand.y * cand.y);
        const d = new THREE.Vector3(sr * Math.cos(cand.az), cand.y, sr * Math.sin(cand.az));
        const P = new THREE.Vector3(cl.c.x + d.x * cl.r, cl.c.y + d.y * cl.r * cl.sy, cl.c.z + d.z * cl.r);
        // dentro de otro racimo no se vería; mirando hacia el centro de la copa tampoco
        if (clusters.some((o) => o !== cl && inside(P, o, 1))) continue;
        if (P.clone().sub(cc).dot(d) < 0) continue;
        made++;
        if (count) {
          cb.n += 6;
          continue;
        }
        const nrm = spherize(P, cl);
        const t1 = new THREE.Vector3().crossVectors(Math.abs(nrm.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP, nrm).normalize();
        const t2 = new THREE.Vector3().crossVectors(nrm, t1);
        const a = t1.clone().multiplyScalar(Math.cos(cand.rot)).addScaledVector(t2, Math.sin(cand.rot));
        // el lado de fuera (v = 1) se levanta hacia la normal: asoma por la silueta
        const bdir = new THREE.Vector3().crossVectors(nrm, a).multiplyScalar(Math.cos(cand.tilt)).addScaledVector(nrm, Math.sin(cand.tilt)).normalize();
        const half = (cl.r * (0.42 + 0.22 * cand.size)) / 2;
        const v = corners.map(([sa, sb, u, vv]) => {
          const p = P.clone().addScaledVector(a, sa * half).addScaledVector(bdir, sb * half);
          const n = spherize(p, cl);
          const { c } = shadeLeaf(p, n, base);
          return { p, n, c: c.multiplyScalar(1.06), w: vv ? 1 : 0.5, uv: [u, vv] };
        });
        for (const k of [0, 1, 2, 0, 2, 3]) cb.vert(v[k].p, v[k].n, v[k].c, cl.phase, v[k].w, v[k].uv);
      }
    });
  }

  const tris = tb.tris + lb.tris + (cb ? cb.tris : 0);
  return {
    tris,
    make() {
      const g = new THREE.Group();
      const add = (b, mat) => {
        if (!b || !b.tris) return;
        const m = new THREE.Mesh(b.geometry(), mat);
        m.castShadow = true;
        g.add(m);
      };
      add(tb, mats.trunk);
      add(lb, mats.canopy);
      add(cb, mats.cards);
      return g;
    },
  };
}

/**
 * Ajusta el árbol al presupuesto de su calidad sin tirar más del rng: primero baja
 * el detalle de los racimos pequeños, luego quita relleno, luego tarjetas y, en
 * último caso, racimos de rama (con su rama). El de encima del tronco no se quita.
 */
function fit(plan, level, palette) {
  const D = DETAIL[level];
  const budget = ROUND_TREE_BUDGET[level];
  const state = {
    include: plan.clusters.map((cl) => !cl.extra || D.extras),
    ico: plan.clusters.map((cl) => (cl.top ? D.topIco : D.ico)),
    cards: D.cards,
  };
  const smallest = (ok) => {
    let best = -1;
    plan.clusters.forEach((cl, i) => {
      if (state.include[i] && ok(cl, i) && (best < 0 || cl.r < plan.clusters[best].r)) best = i;
    });
    return best;
  };
  for (let guard = 0; guard < 64; guard++) {
    if (build(plan, level, palette, state, true).tris <= budget) break;
    const maxIco = Math.max(...state.ico.filter((_, i) => state.include[i]));
    const down = maxIco > D.minIco ? smallest((_, i) => state.ico[i] === maxIco) : -1;
    if (down >= 0) {
      state.ico[down]--;
      continue;
    }
    const extra = smallest((cl) => cl.extra);
    if (extra >= 0) {
      state.include[extra] = false;
      continue;
    }
    if (state.cards > 3) {
      state.cards--;
      continue;
    }
    const core = smallest((cl) => !cl.top);
    if (core < 0) break;
    state.include[core] = false;
  }
  return { built: build(plan, level, palette, state), state };
}

/**
 * Árbol redondo liso. Devuelve un Group en el origen (base en y = 0, ~2-3,3 m de alto)
 * con userData.swayRoot; quien lo usa lo coloca, gira y escala.
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level }), { lod } o 0/1/2
 * - opts: { variant?: 0..3, leaves?: [hex], bark?: hex, theme?: { leaves, bark } }
 *   (sin paleta: ROUND_TREE_DEFAULTS)
 */
export function makeRoundTree(rng, quality = 'medium', opts = {}) {
  const level = roundTreeLevel(quality);
  const palette = {
    leaves: opts.leaves ?? opts.theme?.leaves ?? ROUND_TREE_DEFAULTS.leaves,
    bark: opts.bark ?? opts.theme?.bark ?? ROUND_TREE_DEFAULTS.bark,
  };
  const plan = planTree(rng, opts);
  const { built, state } = fit(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.roundTree = {
    variant: plan.variant,
    name: plan.name,
    level,
    triangles: built.tris,
    clusters: plan.clusters.filter((_, i) => state.include[i]).map((cl) => ({ center: cl.c.toArray(), r: cl.r, sy: cl.sy })),
  };
  return g;
}
