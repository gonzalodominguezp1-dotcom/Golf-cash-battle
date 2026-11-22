import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, smooth, treeLevel, withRim, vertexLambert, TriBuilder, tube } from './treeKit.js';

// Arbusto mediterráneo del estilo liso (paso 4 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md,
// rediseño con más detalle: hoja pequeña y puntiaguda, como la referencia del usuario).
//
// - Tronquito corto (curva de Bézier) y 3-6 ramas finas (tubos de pocos lados) que
//   sostienen varios penachos de follaje, más uno encima del tronco.
// - Cada penacho es una masa suave (icosaedro con abolladura) algo más pequeña que su
//   envolvente, y un borde de hojas que rompe la silueta:
//   · Medio/Alto: tarjetas recortadas con una ramita de hojas puntiagudas pintada en
//     canvas, que salen de la masa hacia fuera y arriba (como las del árbol redondo);
//   · Bajo: puntas (un triángulo de dos caras por punta), sin textura que leer.
// - 4 formas por semilla: alto (vertical), montículo ancho, bajo pequeño y abierto
//   (ramas a la vista y suelo entre ellas).
// - Normales «esferizadas» (luz suave, sin facetas), oclusión en el color de vértice
//   (abajo y dentro más oscuro), puntas de hoja más claras y vivas, un tono por penacho
//   y luz de borde a contraluz en el sombreador.
// - Viento suave (assets/wind.js, altura de referencia baja): las ramas solo se doblan
//   (capa trunk); el follaje se dobla igual, cada penacho se balancea con su fase y
//   las puntas aletean más que la masa (capa canopy).
//
// Móvil primero: dos materiales compartidos por todos los arbustos (follaje con sus
// tarjetas, y ramas), con la paleta en el vértice. La masa usa la misma textura que las
// tarjetas, leyendo un parche opaco: así masa y tarjetas son una sola llamada de dibujo
// y, tras bakeStatic, todo el matorral son dos. Presupuesto por arbusto en SHRUB_BUDGET.
// Todas las tiradas salen del rng recibido y no dependen de la calidad ni de la forma:
// misma semilla, mismo arbusto en Bajo, Medio y Alto.

export const SHRUB_BUDGET = { low: 160, medium: 450, high: 900 };
export const SHRUB_VARIANTS = 4;
export const SHRUB_DEFAULTS = { leaves: [0x4caf3c, 0x3f9f45, 0x66bd3f, 0x2f8f3f], bark: 0x6b5641 };
export const SHRUB_WIND_HEIGHT = 1.2; // altura de referencia del viento (m): un arbusto de ~1 m se mece unos centímetros

const MAX_BRANCHES = 6; // ramas con penacho (más el de encima del tronco)
const CARD_POOL = 16; // tarjetas candidatas por penacho (se tiran siempre, se usan según la calidad)
const SPIKE_POOL = 8; // puntas candidatas por penacho (Bajo)
const MIN_TUBES = 3; // ramas que se dibujan siempre (en Bajo, las tapadas se quitan antes que un penacho)
const BUMP = 0.08; // abolladura de la masa (fracción del radio)
const CULL = 0.8; // una cara de masa se quita si está dentro del 80 % de otra masa
const GROUND = -0.03; // una cara con los tres vértices por debajo no se ve
const REF_R = 0.22; // radio de penacho al que se refieren las tarjetas/puntas por calidad
const UV_SOLID = [0.8125, 0.5]; // centro del parche opaco de la textura (la masa lo lee)

// detalle por calidad:
// ico/minIco: icosaedro de cada masa (empieza en ico y baja hasta minIco para caber);
// vol: radio de la masa frente al de su penacho (las tarjetas/puntas llegan al borde);
// cards/minCards y spikes: por penacho de radio REF_R; twig: escalón de TWIGS donde empiezan las ramas
const DETAIL = {
  low: { ico: 1, minIco: 0, vol: 0.9, tufts: 0.45, cards: 0, minCards: 0, spikes: 6, twig: 0 },
  medium: { ico: 1, minIco: 0, vol: 0.84, cards: 8, minCards: 4, spikes: 0, twig: 2 },
  high: { ico: 2, minIco: 1, vol: 0.82, cards: 16, minCards: 8, spikes: 0, twig: 3 },
};
// ramas: [lados, tramos] del tronco y de cada rama, de menos a más detalle
const TWIGS = [
  { trunk: [3, 1], branch: [3, 1] },
  { trunk: [4, 1], branch: [3, 1] },
  { trunk: [5, 2], branch: [3, 2] },
  { trunk: [6, 3], branch: [4, 2] },
];

// forma de cada variante (metros, antes de la escala del decorado):
// nb ramas; trunk alto del tronquito; r0 radio del tronco; la masa es una elipsoide de centro hc
// y radios rx (horizontal) y ry (vertical) sobre la que se reparten los penachos (el en -1..1);
// pr radio y sy aplastado de cada penacho; top el penacho de encima del tronco
const VARIANTS = [
  // 0 · alto: vertical, penachos apilados y estirados hacia arriba, tronquito a la vista
  { name: 'alto', nb: [4, 5], trunk: [0.18, 0.26], r0: [0.03, 0.036], hc: [0.62, 0.7], rx: [0.2, 0.24], ry: [0.4, 0.46], el: [-0.55, 0.75], pr: [0.18, 0.22], sy: [1.3, 1.5], top: { up: [0.85, 1], r: [0.19, 0.22], sy: 1.45 } },
  // 1 · montículo: ancho y bajo, penachos aplastados casi hasta el suelo
  { name: 'montículo', nb: [5, 6], trunk: [0.05, 0.08], r0: [0.03, 0.038], hc: [0.27, 0.31], rx: [0.42, 0.5], ry: [0.1, 0.14], el: [-0.4, 0.6], pr: [0.25, 0.3], sy: [0.72, 0.82], top: { up: [0.9, 1.1], r: [0.3, 0.34], sy: 0.8 } },
  // 2 · bajo: pequeño y algo más ancho que alto, 3-4 ramas
  { name: 'bajo', nb: [3, 4], trunk: [0.04, 0.06], r0: [0.022, 0.028], hc: [0.2, 0.23], rx: [0.21, 0.25], ry: [0.07, 0.1], el: [-0.3, 0.6], pr: [0.16, 0.19], sy: [0.88, 1], top: { up: [0.8, 1], r: [0.19, 0.22], sy: 0.95 } },
  // 3 · abierto: ramas largas y separadas que dejan ver el suelo, penachos arriba
  { name: 'abierto', nb: [4, 5], trunk: [0.26, 0.34], r0: [0.03, 0.036], hc: [0.66, 0.72], rx: [0.34, 0.4], ry: [0.14, 0.18], el: [-0.2, 0.8], pr: [0.16, 0.19], sy: [0.85, 0.95], top: { up: [0.7, 0.9], r: [0.17, 0.2], sy: 0.9 } },
];

const UP = new THREE.Vector3(0, 1, 0);

// ---------- textura y materiales (compartidos por todos los arbustos) ----------

/**
 * 256 x 128, en blanco y gris (el color lo pone el vértice), fondo transparente.
 * Mitad izquierda: ramita con hojas pequeñas y puntiagudas que sale de abajo en el
 * centro (la base queda dentro de la masa). Mitad derecha: parche opaco que leen
 * las masas (uv fija: siempre el mismo texel, sin mezcla con la ramita).
 */
function shrubLeafTexture() {
  if (typeof document === 'undefined') return null; // tests en node: sin canvas
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  let s = 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const leaf = (x, y, a, len, w) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    const grad = g.createLinearGradient(0, 0, 0, -len);
    grad.addColorStop(0, '#a3b09c');
    grad.addColorStop(1, '#ffffff');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w, -len * 0.35, 0, -len);
    g.quadraticCurveTo(-w, -len * 0.35, 0, 0);
    g.fill();
    g.restore();
  };
  // tallos: [inicio, control, fin] en píxeles de la celda izquierda
  const stems = [
    [[64, 126], [60, 70], [66, 10]],
    [[63, 96], [44, 70], [26, 34]],
    [[64, 88], [86, 64], [102, 30]],
  ];
  const at = ([a, b, d], t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * d[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * d[1]];
  for (const st of stems) {
    g.strokeStyle = '#8a8775';
    g.lineWidth = st === stems[0] ? 2.4 : 1.8;
    g.beginPath();
    g.moveTo(...st[0]);
    g.quadraticCurveTo(...st[1], ...st[2]);
    g.stroke();
  }
  for (const [k, st] of stems.entries()) {
    const n = k === 0 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const t = (k === 0 ? 0.3 : 0.15) + (i / n) * (k === 0 ? 0.68 : 0.8);
      const [x, y] = at(st, t);
      const [x2, y2] = at(st, Math.min(1, t + 0.02));
      const dir = Math.atan2(x2 - x, -(y2 - y)); // ángulo desde arriba, horario
      const side = i % 2 ? 1 : -1;
      const len = lerp(17, 10, t) * (0.85 + rnd() * 0.3);
      leaf(x, y, dir + side * (0.55 + rnd() * 0.3), len, len * 0.24);
    }
    // hojas de la punta, en abanico corto
    const [x, y] = at(st, 1);
    for (const a of [-0.35, 0, 0.35]) leaf(x, y + 2, a + (rnd() - 0.5) * 0.2, 10 + rnd() * 3, 2.6);
  }
  g.fillStyle = '#ffffff';
  g.fillRect(176, 32, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let MATS = null;
/** { foliage, twigs }: los mismos para todos los arbustos. */
export function shrubMaterials() {
  if (MATS) return MATS;
  const foliage = vertexLambert({ side: THREE.DoubleSide, alphaTest: 0.5, map: shrubLeafTexture() });
  // bakeStatic borra las uv salvo que el material lo pida (tarjetas y parche opaco las necesitan)
  foliage.userData.keepUv = true;
  applyWind(withRim(foliage, 0.55, true), { layer: 'canopy', height: SHRUB_WIND_HEIGHT });
  // las ramas solo se doblan (misma curva y altura que el follaje: no se despegan)
  const twigs = applyWind(withRim(vertexLambert(), 0.12), { layer: 'trunk', height: SHRUB_WIND_HEIGHT });
  MATS = { foliage, twigs };
  return MATS;
}

/** El material del follaje (el que identifica al arbusto en el decorado). */
export const shrubMaterial = () => shrubMaterials().foliage;

// ---------- plan: todas las tiradas del rng (no dependen de la calidad) ----------

const rangeU = ([a, b], u) => lerp(a, b, u);

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
const curve = (c) => ({ at: (t) => bezier(c.p0, c.p1, c.p2, t), tangent: (t, o) => bezierTangent(c.p0, c.p1, c.p2, t, o) });

function planShrub(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % SHRUB_VARIANTS) + SHRUB_VARIANTS) % SHRUB_VARIANTS : Math.floor(vr * SHRUB_VARIANTS);
  const V = VARIANTS[variant];
  const p0 = rng() * TAU;
  const leafPick = rng();
  const barkTint = (rng() - 0.5) * 0.08;
  const a0 = rng() * TAU;
  const nb = V.nb[0] + Math.min(V.nb[1] - V.nb[0], Math.floor(rng() * (V.nb[1] - V.nb[0] + 1)));
  const h = rangeU(V.trunk, rng());
  const r0 = rangeU(V.r0, rng());
  const la = rng() * TAU;
  const lean = lerp(0.01, 0.05, rng());
  const hc = rangeU(V.hc, rng());
  const rx = rangeU(V.rx, rng());
  const ry = rangeU(V.ry, rng());

  const leanDir = new THREE.Vector3(Math.cos(la), 0, Math.sin(la));
  const trunk = {
    p0: new THREE.Vector3(0, -0.03, 0),
    p1: new THREE.Vector3().addScaledVector(leanDir, lean * 0.3).setY(h * 0.5),
    p2: new THREE.Vector3().addScaledVector(leanDir, lean).setY(h),
    r0,
  };

  const lumps = [];
  for (let i = 0; i <= MAX_BRANCHES; i++) {
    // siempre las mismas tiradas por hueco, haya o no penacho en esta forma
    const u = Array.from({ length: 10 }, () => rng());
    const waves = Array.from({ length: 3 }, () => ({
      d: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
      f: 2.6 * (0.7 + rng() * 0.8),
      ph: rng() * TAU,
    }));
    const cards = Array.from({ length: CARD_POOL }, () => ({ az: rng() * TAU, y: lerp(-0.3, 0.95, rng()), roll: rng() * Math.PI, up: lerp(0.25, 0.65, rng()), size: rng() }));
    const spikes = Array.from({ length: SPIKE_POOL }, () => ({ az: rng() * TAU, y: lerp(-0.15, 0.9, rng()), roll: rng() * Math.PI, len: rng() }));
    const top = i === MAX_BRANCHES;
    if (!top && i >= nb) continue;
    let c, r, sy;
    if (top) {
      r = rangeU(V.top.r, u[3]);
      sy = V.top.sy * lerp(0.92, 1.08, u[4]);
      c = new THREE.Vector3(leanDir.x * lean * 1.5 + (u[0] - 0.5) * 0.06, hc + ry * rangeU(V.top.up, u[1]), leanDir.z * lean * 1.5 + (u[2] - 0.5) * 0.06);
    } else {
      const az = a0 + (i / nb) * TAU + (u[0] - 0.5) * 0.6 * (TAU / nb);
      const k = lerp(0.85, 1.05, u[2]);
      r = rangeU(V.pr, u[3]);
      sy = rangeU(V.sy, u[4]);
      c = new THREE.Vector3(Math.cos(az) * rx * k, hc + rangeU(V.el, u[1]) * ry, Math.sin(az) * rx * k);
    }
    // rama: del tronco (o de su punta, la del penacho de encima) hasta dentro del penacho, algo arqueada
    const t0 = top ? 1 : lerp(0.6, 1, u[5]);
    const s = bezier(trunk.p0, trunk.p1, trunk.p2, t0);
    const toC = c.clone().sub(s);
    const tip = c.clone().addScaledVector(toC.clone().normalize(), -r * 0.3);
    const out = new THREE.Vector3(toC.x, 0, toC.z);
    if (out.lengthSq() > 1e-8) out.normalize();
    const L = toC.length();
    const mid = s.clone().lerp(tip, 0.5).addScaledVector(out, L * 0.12 * u[6]).addScaledVector(UP, L * 0.04);
    lumps.push({
      c,
      r,
      sy,
      waves,
      cards,
      spikes,
      top,
      phase: p0 + (u[7] - 0.5) * 0.9,
      tint: { h: (u[8] - 0.5) * 0.04, l: (u[9] - 0.5) * 0.08 },
      branch: { p0: s, p1: mid, p2: tip, r: r0 * (top ? 0.72 : 0.6) },
    });
  }
  return { variant, name: V.name, p0, leafPick, barkTint, nb, trunk, lumps };
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

/** ¿Está p dentro de la masa v (encogida a `shrink`)? */
function inside(p, v, shrink) {
  const x = (p.x - v.c.x) / v.r, y = (p.y - v.c.y) / (v.r * v.sy), z = (p.z - v.c.z) / v.r;
  return x * x + y * y + z * z < shrink * shrink;
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
/** TriBuilder con uv (el follaje: tarjetas y parche opaco de la masa). */
class UvTriBuilder extends TriBuilder {
  constructor(p0, count) {
    super(p0, count);
    this.uv = [];
  }
  tri(a, b, c, phase) {
    if (this.count) {
      this.n += 3;
      return;
    }
    _e1.subVectors(b.p, a.p);
    _e2.subVectors(c.p, a.p);
    _fn.crossVectors(_e1, _e2);
    const flip = _fn.dot(_e1.copy(a.n).add(b.n).add(c.n)) < 0;
    for (const v of flip ? [a, c, b] : [a, b, c]) {
      this.vert(v.p, v.n, v.c, phase, v.w ?? 0);
      this.uv.push(v.uv[0], v.uv[1]);
    }
  }
  geometry() {
    const g = super.geometry();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** Cuántas tarjetas o puntas lleva un penacho (por área frente a REF_R). */
const perLump = (n, cl, pool) => (n > 0 ? Math.max(1, Math.min(pool, Math.round(n * (cl.r / REF_R) ** 2))) : 0);

/**
 * state: { include[], ico[], cards, spikes, twig }. count: solo cuenta triángulos.
 * cache (solo al contar): las piezas se cuentan una vez por estado de lo que las afecta.
 */
function build(plan, level, palette, state, count = false, cache = null) {
  const D = DETAIL[level];
  const mats = shrubMaterials();
  const mask = state.include.map((b) => (b ? 1 : 0)).join('');
  // masa de cada penacho incluido (más pequeña que el penacho: el borde lo ponen tarjetas y puntas)
  const vols = plan.lumps.map((cl) => ({ c: cl.c, r: cl.r * D.vol, sy: cl.sy, cl }));
  const live = vols.filter((_, i) => state.include[i]);

  const cc = new THREE.Vector3();
  let wsum = 0, yMax = 0, R = 0, fMin = Infinity;
  for (const v of live) {
    const k = v.r ** 3 * v.sy;
    cc.addScaledVector(v.c, k);
    wsum += k;
  }
  cc.divideScalar(wsum || 1);
  for (const v of live) {
    yMax = Math.max(yMax, v.c.y + v.cl.r * v.sy);
    fMin = Math.min(fMin, v.c.y - v.r * v.sy);
    R = Math.max(R, v.c.distanceTo(cc) + v.cl.r);
  }

  // colores (lineales): hoja elegida de la paleta y un tono por penacho
  const leaves = palette.leaves.length ? palette.leaves : SHRUB_DEFAULTS.leaves;
  const leafBase = new THREE.Color(leaves[Math.floor(plan.leafPick * leaves.length) % leaves.length]);
  const bark = new THREE.Color(palette.bark).offsetHSL(0, 0, plan.barkTint);
  const tipTint = (base) => base.clone().offsetHSL(-0.03, 0.05, 0.1);
  const shadeLeaf = (p, n, base) => {
    const h = Math.max(0, Math.min(1, p.y / Math.max(1e-6, yMax)));
    const dc = Math.min(1.2, p.distanceTo(cc) / Math.max(1e-6, R));
    // oclusión: abajo y dentro, más oscuro; la cara de abajo un poco más
    let ao = 0.34 + 0.4 * smooth(0, 1, h) + 0.26 * smooth(0.3, 0.95, dc);
    if (n.y < 0) ao *= 1 + 0.25 * n.y;
    const c = base.clone().lerp(tipTint(base), 0.55 * smooth(0.5, 1, h));
    return c.multiplyScalar(Math.max(0.22, Math.min(1, ao)));
  };
  const spherize = (p, v, out = new THREE.Vector3()) => {
    // normal de la elipsoide del penacho mezclada con la dirección desde el centro del arbusto
    out.set((p.x - v.c.x) / (v.r * v.r), (p.y - v.c.y) / (v.r * v.sy) ** 2, (p.z - v.c.z) / (v.r * v.r)).normalize();
    const g = p.clone().sub(cc);
    if (g.lengthSq() > 1e-8) out.multiplyScalar(0.7).addScaledVector(g.normalize(), 0.3);
    return out.normalize();
  };
  const onLump = (v, az, y) => {
    const sr = Math.sqrt(Math.max(0, 1 - y * y));
    const d = new THREE.Vector3(sr * Math.cos(az), y, sr * Math.sin(az));
    return { d, P: new THREE.Vector3(v.c.x + d.x * v.r, v.c.y + d.y * v.r * v.sy, v.c.z + d.z * v.r) };
  };
  // borde de hojas: no dentro de otra masa, no mirando al centro del arbusto, no bajo el suelo
  const edgeOk = (v, d, P) => P.y > 0.03 && !live.some((o) => o !== v && inside(P, o, 1)) && P.clone().sub(cc).dot(d) >= 0;
  // marco de una hoja que sale de P: U hacia fuera y arriba, A de lado (girado `roll` sobre U)
  const frame = (v, d, P, up, roll) => {
    const n = spherize(P, v);
    const U = n.clone().multiplyScalar(1 - up).addScaledVector(UP, up).normalize();
    let A0 = new THREE.Vector3().crossVectors(U, n);
    if (A0.lengthSq() < 1e-6) A0 = new THREE.Vector3().crossVectors(U, Math.abs(U.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
    A0.normalize();
    const B0 = new THREE.Vector3().crossVectors(U, A0);
    return { n, U, A: A0.multiplyScalar(Math.cos(roll)).addScaledVector(B0, Math.sin(roll)) };
  };

  const part = (b, key, emit) => {
    if (count && cache?.has(key)) {
      b.n += cache.get(key) * 3;
      return;
    }
    const n0 = b.n;
    emit();
    if (count && cache) cache.set(key, (b.n - n0) / 3);
  };

  // ---- follaje: masas, tarjetas (Medio/Alto) y puntas (Bajo) ----
  const fb = new UvTriBuilder(plan.p0, count);
  const d = new THREE.Vector3();
  vols.forEach((v, i) => {
    if (!state.include[i]) return;
    const cl = v.cl;
    const base = count ? null : leafBase.clone().offsetHSL(cl.tint.h, 0, cl.tint.l);
    part(fb, `v${i}:${state.ico[i]}:${mask}`, () => {
      const unit = unitIco(state.ico[i]);
      for (let f = 0; f < unit.length; f += 9) {
        const tri = [];
        for (let k = 0; k < 3; k++) {
          d.fromArray(unit, f + k * 3);
          let bump = 0;
          for (const w of cl.waves) bump += Math.sin(d.dot(w.d) * w.f + w.ph);
          let s = 1 + (bump / cl.waves.length) * BUMP;
          // Bajo: algunos vértices (no los de abajo) salen en punta y la masa deja de ser una bola
          if (D.tufts && d.y > -0.3) s += D.tufts * Math.max(0, Math.sin(d.dot(cl.waves[0].d) * 9 + cl.waves[1].ph) - 0.2) / 0.8;
          tri.push({ p: new THREE.Vector3(v.c.x + d.x * v.r * s, v.c.y + d.y * v.r * v.sy * s, v.c.z + d.z * v.r * s), uv: UV_SOLID });
        }
        if (tri.every((q) => q.p.y < GROUND) || live.some((o) => o !== v && tri.every((q) => inside(q.p, o, CULL)))) continue;
        if (count) {
          fb.n += 3;
          continue;
        }
        for (const q of tri) {
          q.n = spherize(q.p, v);
          q.c = shadeLeaf(q.p, q.n, base);
          // la masa casi no aletea; algo más arriba
          q.w = 0.12 + 0.3 * smooth(0.3, 1, q.p.y / Math.max(1e-6, yMax));
        }
        fb.tri(tri[0], tri[1], tri[2], cl.phase);
      }
    });

    const wantCards = perLump(state.cards, cl, CARD_POOL);
    if (wantCards) {
      part(fb, `c${i}:${wantCards}:${mask}`, () => {
        let made = 0;
        for (const cand of cl.cards) {
          if (made >= wantCards) break;
          const { d: dd, P } = onLump(v, cand.az, cand.y);
          if (!edgeOk(v, dd, P)) continue;
          made++;
          if (count) {
            fb.n += 6;
            continue;
          }
          const { U, A } = frame(v, dd, P, cand.up, cand.roll);
          const len = cl.r * (0.62 + 0.26 * cand.size);
          const half = len * 0.45;
          const B = P.clone().addScaledVector(U, -len * 0.28); // el pie de la ramita queda dentro de la masa
          const corner = (sa, tip) => {
            const p = B.clone().addScaledVector(A, sa * half).addScaledVector(U, tip * len);
            const n = spherize(p, v);
            let c = shadeLeaf(p, n, base);
            c = tip ? c.lerp(tipTint(c), 0.5).multiplyScalar(1.12) : c.multiplyScalar(0.92);
            return { p, n, c, w: tip ? 0.9 : 0.35, uv: [sa < 0 ? 0 : 0.5, tip] };
          };
          const q = [corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)];
          fb.tri(q[0], q[1], q[2], cl.phase);
          fb.tri(q[0], q[2], q[3], cl.phase);
        }
      });
    }

    const wantSpikes = perLump(state.spikes, cl, SPIKE_POOL);
    if (wantSpikes) {
      part(fb, `s${i}:${wantSpikes}:${mask}`, () => {
        let made = 0;
        for (const cand of cl.spikes) {
          if (made >= wantSpikes) break;
          const { d: dd, P } = onLump(v, cand.az, cand.y);
          if (!edgeOk(v, dd, P)) continue;
          made++;
          if (count) {
            fb.n += 3;
            continue;
          }
          // una punta: triángulo de dos caras que sale de la masa hacia fuera y arriba
          const { U, A } = frame(v, dd, P, 0.4, cand.roll);
          const len = cl.r * (0.38 + 0.3 * cand.len);
          const half = cl.r * 0.2;
          const B = P.clone().addScaledVector(U, -half * 0.5);
          const mk = (p, tip) => {
            const n = tip ? U.clone().add(spherize(p, v)).normalize() : spherize(p, v);
            const c = shadeLeaf(p, n, base);
            return { p, n, c: tip ? c.lerp(tipTint(c), 0.5).multiplyScalar(1.12) : c, w: tip ? 0.9 : 0.3, uv: UV_SOLID };
          };
          fb.tri(mk(B.clone().addScaledVector(A, -half), 0), mk(B.clone().addScaledVector(A, half), 0), mk(P.clone().addScaledVector(U, len), 1), cl.phase);
        }
      });
    }
  });

  // ---- ramas: tronquito y una rama por penacho ----
  const tb = new TriBuilder(plan.p0, count);
  const T = TWIGS[state.twig];
  const twigHidden = (tri) => tri.every((q) => q.p.y < GROUND) || live.some((o) => tri.every((q) => inside(q.p, o, 0.97)));
  const twigShade = count
    ? () => null
    : (p) => {
        // pie oscuro (toca el suelo) y más oscuro según entra bajo el follaje
        const ao = (0.62 + 0.38 * smooth(0, 0.2, p.y)) * (1 - 0.4 * smooth(fMin - 0.05, fMin + 0.2, p.y));
        return bark.clone().multiplyScalar(ao);
      };
  const { trunk } = plan;
  part(tb, `t${state.twig}:${mask}`, () =>
    tube(tb, curve(trunk), (t) => trunk.r0 * (1 - 0.3 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.25) ** 2), T.trunk[0], T.trunk[1], twigShade, twigHidden),
  );
  plan.lumps.forEach((cl, i) => {
    if (!state.include[i] || !state.tube[i]) return;
    part(tb, `b${i}:${state.twig}:${mask}`, () => tube(tb, curve(cl.branch), (t) => cl.branch.r * (1 - 0.55 * t), T.branch[0], T.branch[1], twigShade, twigHidden));
  });

  return {
    tris: fb.tris + tb.tris,
    leafTris: fb.tris,
    twigTris: tb.tris,
    make() {
      const g = new THREE.Group();
      for (const [b, mat] of [[fb, mats.foliage], [tb, mats.twigs]]) {
        if (!b.tris) continue;
        const m = new THREE.Mesh(b.geometry(), mat);
        m.castShadow = true;
        g.add(m);
      }
      return g;
    },
  };
}

/**
 * Ajusta el arbusto al presupuesto sin tirar más del rng. Empieza con todo el detalle
 * de su calidad y lo baja por este orden: masas de los penachos pequeños (hasta minIco),
 * tarjetas (hasta minCards), masas otra vez (hasta 0), lados de las ramas, tubos de rama
 * (primero el del penacho de encima, que queda tapado; quedan al menos MIN_TUBES), puntas
 * y, en último caso, el penacho más pequeño que no sea el de encima.
 */
function fit(plan, level, palette) {
  const D = DETAIL[level];
  const budget = SHRUB_BUDGET[level];
  const state = { include: plan.lumps.map(() => true), tube: plan.lumps.map(() => true), ico: plan.lumps.map(() => D.ico), cards: D.cards, spikes: D.spikes, twig: D.twig };
  const cache = new Map();
  const smallest = (ok) => {
    let best = -1;
    plan.lumps.forEach((cl, i) => {
      if (state.include[i] && ok(cl, i) && (best < 0 || cl.r < plan.lumps[best].r)) best = i;
    });
    return best;
  };
  const lowerIco = (floor) => {
    const maxIco = Math.max(...state.ico.filter((_, i) => state.include[i]));
    const i = maxIco > floor ? smallest((_, k) => state.ico[k] === maxIco) : -1;
    if (i >= 0) state.ico[i]--;
    return i >= 0;
  };
  for (let guard = 0; guard < 96; guard++) {
    if (build(plan, level, palette, state, true, cache).tris <= budget) break;
    if (lowerIco(D.minIco)) continue;
    if (state.cards > D.minCards) {
      state.cards--;
      continue;
    }
    if (lowerIco(0)) continue;
    if (state.twig > 0) {
      state.twig--;
      continue;
    }
    if (state.tube.filter((t, i) => t && state.include[i]).length > MIN_TUBES) {
      const top = plan.lumps.findIndex((cl) => cl.top);
      const t = state.tube[top] ? top : smallest((_, i) => state.tube[i]);
      if (t >= 0) {
        state.tube[t] = false;
        continue;
      }
    }
    if (state.spikes > 0) {
      state.spikes--;
      continue;
    }
    const drop = smallest((cl) => !cl.top);
    if (drop < 0) break;
    state.include[drop] = false;
  }
  return { built: build(plan, level, palette, state), state };
}

/**
 * Arbusto mediterráneo liso. Devuelve un Group en el origen (base en y = 0; de ~0,5 m
 * el bajo a ~1,4 m el alto) con userData.swayRoot; quien lo usa lo coloca, gira y escala.
 * Hijos: follaje (material shrubMaterial()) y ramas.
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level, theme? }), { lod } o 0/1/2
 * - opts: { variant?: 0..3, leaves?: [hex], bark?: hex, theme?: { leaves, bark } }
 *   Paleta: opts.leaves/bark, si no opts.theme o quality.theme, si no SHRUB_DEFAULTS.
 */
export function makeShrub(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const qt = quality && typeof quality === 'object' ? quality.theme : undefined;
  const palette = {
    leaves: opts.leaves ?? opts.theme?.leaves ?? qt?.leaves ?? SHRUB_DEFAULTS.leaves,
    bark: opts.bark ?? opts.theme?.bark ?? qt?.bark ?? SHRUB_DEFAULTS.bark,
  };
  const plan = planShrub(rng, opts);
  const { built, state } = fit(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  const lumpInfo = (cl) => ({ center: cl.c.toArray(), r: cl.r, sy: cl.sy });
  g.userData.shrub = {
    variant: plan.variant,
    name: plan.name,
    level,
    triangles: built.tris,
    leafTriangles: built.leafTris,
    twigTriangles: built.twigTris,
    branches: plan.nb,
    lumps: plan.lumps.filter((_, i) => state.include[i]).map(lumpInfo),
    allLumps: plan.lumps.map((cl) => ({ ...lumpInfo(cl), phase: cl.phase })),
  };
  return g;
}
