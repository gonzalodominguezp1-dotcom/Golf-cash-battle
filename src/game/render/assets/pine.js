import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, range, smooth, treeLevel, withRim, vertexLambert, TriBuilder, tube } from './treeKit.js';

// Pino del estilo liso (paso 2 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// - Tronco recto con un poco de inclinación, pie abierto, visible bajo cada piso.
// - Pisos de ramas: faldas cónicas cerradas por debajo (el reverso sube hacia el
//   tronco, así que bajo cada falda hay hueco y se ve el tronco). El borde es
//   ondulado suave: lóbulos que salen y caen un poco (puntas de rama que cuelgan).
//   El último piso es alto, estrecho y cóncavo: la punta fina.
// - Misma técnica que el árbol redondo: normales «esferizadas» (cada piso mira
//   desde su centro, borde redondeado sin arista), oclusión en el color de vértice
//   (más oscuro abajo, hacia el tronco, bajo el piso de encima y en el reverso),
//   luz de borde a contraluz en el sombreador.
// - Viento de tres capas (assets/wind.js): el tronco se dobla; cada piso se
//   balancea con su fase (parecidas: una onda que sube) y el borde aletea, más
//   cuanto más alto (la punta se mueve más).
// - Nieve opcional (opts.snow) solo en el color de vértice: encima de los pisos,
//   sin material nuevo ni cambiar la forma.
//
// Móvil primero: dos materiales compartidos por todos los pinos (tronco y pisos),
// la paleta va en el vértice. Tras bakeStatic, el bosque entero son dos llamadas.
// Las caras que quedan dentro de otro piso (o el tronco dentro de un piso) se quitan.
// Todo sale del rng recibido y las tiradas no dependen de la calidad: misma semilla,
// mismo pino en Bajo, Medio y Alto.

export const PINE_BUDGET = { low: 220, medium: 500, high: 1000 };
export const PINE_VARIANTS = 4;
export const PINE_DEFAULTS = { leaves: [0x2f6b3c, 0x2a5e38, 0x37763f, 0x26553a], bark: 0x5b3d2b };
export const PINE_SNOW = 0xf2f6fb;

// detalle por calidad: tronco [lados, tramos]; m = vértices del borde por lóbulo;
// rings = anillos de la falda (perfil caído). min*: hasta dónde baja el ajuste.
const DETAIL = {
  low: { trunk: [5, 3], m: 2, rings: 2, minM: 2, minRings: 1 },
  medium: { trunk: [7, 4], m: 3, rings: 3, minM: 2, minRings: 2 },
  high: { trunk: [9, 6], m: 5, rings: 4, minM: 3, minRings: 2 },
};

const CULL = 0.8; // una cara se quita si está dentro del 80 % del radio de otro piso (margen para ondas y viento)
const TIP_DROOP = -0.35; // perfil cóncavo del último piso: punta afilada

// forma de cada variante: n pisos, altura h, pie despejado base, radio del primer
// piso R0, cuánto se estrecha arriba taper, solape entre pisos (negativo: hueco),
// altura extra de la punta tip, caída del perfil droop, lóbulos del primer piso,
// inclinación lean y radio del tronco r0
const VARIANTS = [
  // 0 · clásico: cuatro pisos regulares
  { name: 'clásico', n: 4, h: [3.4, 3.9], base: [0.8, 0.95], R0: [1.05, 1.2], taper: 0.7, overlap: [0.28, 0.38], tip: [0.75, 0.9], droop: [0.25, 0.4], lobes: [7, 8], lean: [0.02, 0.08], r0: [0.12, 0.14] },
  // 1 · esbelto: cinco pisos estrechos y alto
  { name: 'esbelto', n: 5, h: [4.1, 4.7], base: [0.9, 1.05], R0: [0.78, 0.88], taper: 0.66, overlap: [0.35, 0.45], tip: [0.95, 1.1], droop: [0.2, 0.32], lobes: [6, 7], lean: [0.02, 0.06], r0: [0.1, 0.12] },
  // 2 · ancho: tres faldas anchas y caídas, tronco corto
  { name: 'ancho', n: 3, h: [3.0, 3.4], base: [0.6, 0.75], R0: [1.4, 1.55], taper: 0.62, overlap: [0.3, 0.4], tip: [0.6, 0.7], droop: [0.35, 0.5], lobes: [8, 9], lean: [0.03, 0.09], r0: [0.14, 0.17] },
  // 3 · separado: pisos con hueco entre ellos (el tronco se ve), faldas más caídas
  { name: 'separado', n: 4, h: [3.7, 4.2], base: [1.0, 1.15], R0: [1.0, 1.1], taper: 0.66, overlap: [-0.28, -0.16], tip: [0.75, 0.9], droop: [0.4, 0.55], lobes: [6, 7], lean: [0.04, 0.1], r0: [0.11, 0.13] },
];

// ---------- materiales (compartidos por todos los pinos) ----------

let MATS = null;
/** { trunk, canopy }: los mismos para todos los pinos (también los nevados). */
export function pineMaterials() {
  if (MATS) return MATS;
  const trunk = applyWind(withRim(vertexLambert(), 0.15), { layer: 'trunk' });
  const canopy = applyWind(withRim(vertexLambert(), 0.5), { layer: 'canopy' });
  MATS = { trunk, canopy };
  return MATS;
}

// ---------- paleta ----------

/** Verde de pino a partir de un verde del tema (más oscuro y menos saturado). */
function conifer(hex) {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  return c.setHSL(hsl.h + 0.01, hsl.s * 0.9, hsl.l * 0.72);
}

function pinePalette(quality, opts) {
  const theme = opts.theme ?? (quality && typeof quality === 'object' ? quality.theme : null) ?? null;
  let leaves;
  if (opts.leaves?.length) leaves = opts.leaves.map((h) => new THREE.Color(h));
  else if (theme?.leaves?.length) leaves = theme.leaves.map(conifer);
  else leaves = PINE_DEFAULTS.leaves.map((h) => new THREE.Color(h));
  const bark = new THREE.Color(opts.bark ?? theme?.bark ?? PINE_DEFAULTS.bark);
  const snow = opts.snow === true ? 1 : Math.max(0, Math.min(1, Number(opts.snow) || 0));
  return { leaves, bark, snow, snowColor: new THREE.Color(opts.snowColor ?? PINE_SNOW) };
}

// ---------- plan: todas las tiradas del rng (no dependen de la calidad) ----------

function planPine(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % PINE_VARIANTS) + PINE_VARIANTS) % PINE_VARIANTS : Math.floor(vr * PINE_VARIANTS);
  const V = VARIANTS[variant];
  const p0 = rng() * TAU;
  const leafPick = rng();
  const barkTint = (rng() - 0.5) * 0.06;
  const h = range(rng, V.h);
  const base = range(rng, V.base);
  const R0 = range(rng, V.R0);
  const overlap = range(rng, V.overlap);
  const tip = range(rng, V.tip);
  const lean = range(rng, V.lean);
  const la = rng() * TAU;
  const curl = (rng() - 0.5) * 0.06;
  const r0 = range(rng, V.r0);
  const lobes0 = V.lobes[0] + Math.min(V.lobes[1] - V.lobes[0], Math.floor(rng() * (V.lobes[1] - V.lobes[0] + 1)));

  // eje del árbol: se inclina poco a poco (más arriba, más) con una pizca de curva
  const leanDir = new THREE.Vector2(Math.cos(la), Math.sin(la));
  const axis = (y) => {
    const k = Math.max(0, y) / h;
    const s = curl * Math.sin(Math.PI * k);
    return { x: leanDir.x * lean * k * k - leanDir.y * s, z: leanDir.y * lean * k * k + leanDir.x * s };
  };

  // pisos: cada uno en su hueco; el último (la punta) es más alto
  const n = V.n;
  const slot = (h - base) / (n + tip);
  const tiers = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const jy = (rng() - 0.5) * 0.08 * slot;
    const jr = 1 + (rng() - 0.5) * 0.08;
    const t = {
      i,
      rim: base + i * slot + (i > 0 ? jy : 0),
      R: R0 * (1 - V.taper * (i / (n - 1)) ** 0.9) * jr,
      lobes: Math.max(4, lobes0 - i),
      ph: rng() * TAU,
      ph2: rng() * TAU,
      wa: last ? lerp(0.05, 0.07, rng()) : lerp(0.07, 0.12, rng()),
      dv: lerp(0.08, 0.16, rng()),
      dr: last ? (rng(), TIP_DROOP) : range(rng, V.droop),
      under: lerp(0.35, 0.5, rng()),
      tint: { h: (rng() - 0.5) * 0.02, l: (rng() - 0.5) * 0.05 },
      phase: p0 + 0.25 * i + (rng() - 0.5) * 0.3,
    };
    t.top = last ? h : t.rim + slot * (1 + overlap);
    t.Ht = t.top - t.rim;
    t.Hs = t.Ht / (1 + 0.5 * t.dv); // el borde medio cae justo en `rim`
    // el reverso sube hacia el tronco; en pisos estrechos menos (que no quede de canto)
    t.hub = t.rim + Math.min(t.under * t.Ht, (last ? 0.3 : 0.55) * t.R);
    const a = axis(t.top);
    t.x = a.x;
    t.z = a.z;
    tiers.push(t);
  }

  // tronco: del suelo a media altura de la punta (el final queda dentro)
  const tipT = tiers[n - 1];
  const trunkTop = tipT.rim + 0.45 * tipT.Ht;
  const at = (t) => {
    const y = lerp(-0.05, trunkTop, t);
    const a = axis(y);
    return new THREE.Vector3(a.x, y, a.z);
  };
  const trunk = {
    top: trunkTop,
    curve: {
      at,
      tangent: (t, out) => out.copy(at(Math.min(1, t + 1e-3))).sub(at(Math.max(0, t - 1e-3))).normalize(),
    },
    radius: (t) => r0 * (1 - 0.72 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.12) ** 2),
  };
  return { variant, name: V.name, p0, leafPick, barkTint, h, tiers, trunk, yMin: tiers[0].rim - tiers[0].Hs * tiers[0].dv * 0.5 - 0.02 };
}

// ---------- forma de un piso ----------

/** Punto de la cara de arriba del piso T: t = 0 (cuello, en el eje) .. 1 (borde), ángulo a. */
function topPoint(T, t, a, out = new THREE.Vector3()) {
  const u = T.lobes * (a - T.ph);
  const wv = 0.75 * Math.cos(u) + 0.25 * Math.cos(2 * u + T.ph2);
  const lobe = 0.5 + 0.5 * Math.cos(u);
  const r = T.R * t * (1 + T.wa * wv * t ** 1.5);
  const y = T.top - T.Hs * (t * (1 - T.dr) + T.dr * t * t + T.dv * lobe * t * t);
  return out.set(T.x + Math.cos(a) * r, y, T.z + Math.sin(a) * r);
}

/** ¿Está p dentro del piso T (encogido)? Cota prudente: tiene en cuenta ondas y caída del borde. */
function insideTier(p, T) {
  const d = Math.hypot(p.x - T.x, p.z - T.z);
  if (d > CULL * T.R * (1 - T.wa)) return false;
  const tt = d / T.R;
  const yTop = T.top - T.Hs * (tt * (1 - T.dr) + T.dr * tt * tt + T.dv * tt * tt) - 0.02;
  const rimHigh = T.rim + 0.5 * T.dv * T.Hs;
  const yUnder = T.hub - (T.hub - rimHigh) * Math.min(1, d / (T.R * (1 + T.wa))) + 0.02;
  return p.y < yTop && p.y > yUnder;
}

const hiddenIn = (tri, tiers, skip) => tiers.some((T) => T !== skip && tri.every((v) => insideTier(v.p, T)));

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

/** Normal geométrica de la cara de arriba (hacia arriba). */
function topSurfaceNormal(T, t, a, out) {
  const e = 1e-3;
  const tt = Math.max(0.02, t);
  topPoint(T, Math.min(1, tt + e), a, _a).sub(topPoint(T, tt - e, a, _b)); // radial
  topPoint(T, tt, a + e, _c).sub(topPoint(T, tt, a - e, _d)); // a lo largo del borde
  out.crossVectors(_c, _a).normalize();
  if (out.y < 0) out.negate();
  return out;
}

function buildTier(lb, plan, T, i, m, rings, palette, count) {
  const N = T.lobes * m;
  const { tiers } = plan;
  const upper = tiers[i + 1] ?? null;
  const ts = [0];
  for (let j = 1; j <= rings; j++) ts.push(1 - (1 - j / rings) ** 1.3); // anillos más juntos en el borde
  // centro de la «bola» del piso (normales esferizadas): algo por debajo del borde, así
  // la falda se lee como una cúpula y su borde sigue mirando un poco hacia arriba (al sol)
  const C = new THREE.Vector3(T.x, T.rim - 0.15 * T.Ht, T.z);
  const hubP = new THREE.Vector3(T.x, T.hub, T.z);

  let base, topTint;
  if (!count) {
    base = palette.leaf.clone().offsetHSL(T.tint.h, 0, T.tint.l);
    topTint = base.clone().offsetHSL(-0.02, 0.03, 0.07);
  }
  const hOf = (p) => Math.max(0, Math.min(1, (p.y - plan.yMin) / (plan.h - plan.yMin)));
  const lobeOf = (a) => 0.5 + 0.5 * Math.cos(T.lobes * (a - T.ph));
  const flutterOf = (p, t) => Math.min(1, t ** 1.5 * (0.35 + 0.65 * hOf(p)));
  const sph = (p) => {
    const s = p.clone().sub(C);
    return s.lengthSq() > 1e-10 ? s.normalize() : UP.clone();
  };

  const topColor = (p, n, t, a) => {
    const hT = hOf(p);
    let occ = 0;
    if (upper) occ = 1 - smooth(upper.R * 0.5, upper.R * 1.15, Math.hypot(p.x - upper.x, p.z - upper.z));
    let ao = (0.55 + 0.4 * smooth(0, 1, hT)) * (0.68 + 0.32 * smooth(0.05, 0.8, t)) * (1 - 0.32 * occ) * (0.92 + 0.16 * lobeOf(a) * t);
    ao = Math.max(0.2, Math.min(1.05, ao));
    const c = base.clone().lerp(topTint, 0.5 * smooth(0.6, 1, hT)).multiplyScalar(ao);
    if (palette.snow > 0) {
      // nieve encima: donde la cara mira arriba, lejos del cuello y no tapada por el piso de encima
      const s = palette.snow * smooth(0.3, 0.7, n.y) * smooth(0.12, 0.45, t) * (1 - 0.85 * occ) * (0.6 + 0.4 * lobeOf(a));
      c.lerp(palette.snowColor.clone().multiplyScalar(0.72 + 0.28 * Math.min(1, ao)), Math.min(1, s * 1.4));
    }
    return c;
  };
  // reverso: en sombra, algo menos hacia el borde (le llega luz rebotada)
  const underColor = (p, t) => base.clone().multiplyScalar((0.18 + 0.16 * t) * (0.75 + 0.35 * hOf(p)));

  const vTop = (t, a) => {
    const p = topPoint(T, t, a);
    if (count) return { p };
    // normal de la falda mezclada con la del centro del piso (más hacia el borde): luz suave, borde redondeado
    const n = t === 0 ? UP.clone() : topSurfaceNormal(T, t, a, new THREE.Vector3()).lerp(sph(p), 0.15 + 0.35 * t * t).normalize();
    if (n.y < 0.08) n.setY(0.08).normalize(); // la cara de arriba nunca mira abajo (puntas muy caídas)
    return { p, n, c: topColor(p, n, t, a), w: flutterOf(p, t), a };
  };
  /** Normal del reverso en el borde: la de su cara (abajo y hacia dentro), un poco más hacia abajo. */
  const underNormal = (v) => {
    const tang = topPoint(T, 1, v.a + 1e-3, new THREE.Vector3()).sub(topPoint(T, 1, v.a - 1e-3, new THREE.Vector3()));
    const un = new THREE.Vector3().crossVectors(tang, v.p.clone().sub(hubP)).normalize();
    if (un.y > 0) un.negate();
    return un.lerp(DOWN, 0.2).normalize();
  };

  // los ángulos arrancan en la cresta de un lóbulo: con pocos vértices (Bajo) las
  // puntas de rama siguen ahí y la silueta mide lo mismo en las tres calidades
  const grid = ts.map((t, j) => (j === 0 ? [vTop(0, T.ph)] : Array.from({ length: N }, (_, k) => vTop(t, T.ph + (k / N) * TAU))));
  const emit = (a, b, c, facing) => {
    if (hiddenIn([a, b, c], tiers, T)) return;
    lb.tri(a, b, c, T.phase, facing);
  };
  // cara de arriba: abanico en el cuello y tiras hasta el borde
  for (let k = 0; k < N; k++) emit(grid[0][0], grid[1][k], grid[1][(k + 1) % N], UP);
  for (let j = 1; j < rings; j++) {
    for (let k = 0; k < N; k++) {
      const a = grid[j][k], b = grid[j][(k + 1) % N], c = grid[j + 1][k], d = grid[j + 1][(k + 1) % N];
      emit(a, b, c, UP);
      emit(b, d, c, UP);
    }
  }
  // reverso: abanico del borde al eje, más arriba. Mismos puntos y viento que el borde
  // de arriba (no se abre al moverse); normal y color propios: la falda es fina y su
  // borde es una arista de verdad (arriba al sol, abajo en sombra)
  const rim = grid[rings];
  const hub = count ? { p: hubP } : { p: hubP, n: DOWN.clone(), c: underColor(hubP, 0), w: 0 };
  const under = rim.map((v) => (count ? v : { p: v.p, n: underNormal(v), c: underColor(v.p, 1), w: v.w }));
  for (let k = 0; k < N; k++) emit(hub, under[k], under[(k + 1) % N], DOWN);
}

function build(plan, level, palette, state, count = false) {
  const mats = pineMaterials();
  const { tiers, trunk } = plan;
  const pal = count ? palette : { ...palette, leaf: palette.leaves[Math.floor(plan.leafPick * palette.leaves.length) % palette.leaves.length] };

  // ---- tronco ----
  const tb = new TriBuilder(plan.p0, count);
  const bark = count ? null : palette.bark.clone().offsetHSL(0, 0, plan.barkTint);
  const shadeTrunk = count
    ? () => null
    : (p) => {
        // pie oscuro (toca el suelo) y más oscuro bajo cada falda
        let under = 0;
        for (const T of tiers) under = Math.max(under, smooth(T.rim - 0.12, T.rim + 0.06, p.y) * (1 - smooth(T.hub, T.top, p.y)));
        return bark.clone().multiplyScalar((0.6 + 0.4 * smooth(0, 0.4, p.y)) * (1 - 0.32 * under));
      };
  tube(tb, trunk.curve, trunk.radius, state.trunk[0], state.trunk[1], shadeTrunk, (tri) => hiddenIn(tri, tiers, null));

  // ---- pisos ----
  const lb = new TriBuilder(plan.p0, count);
  tiers.forEach((T, i) => buildTier(lb, plan, T, i, state.m[i], state.rings[i], pal, count));

  return {
    tris: tb.tris + lb.tris,
    make() {
      const g = new THREE.Group();
      for (const [b, mat] of [[tb, mats.trunk], [lb, mats.canopy]]) {
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
 * Ajusta el pino al presupuesto de su calidad sin tirar más del rng: primero quita
 * anillos de las faldas (de la más pequeña a la más grande), luego vértices del
 * borde por lóbulo y, al final, detalle del tronco. Los pisos nunca se quitan.
 */
function fit(plan, level, palette) {
  const D = DETAIL[level];
  const budget = PINE_BUDGET[level];
  const state = { m: plan.tiers.map(() => D.m), rings: plan.tiers.map(() => D.rings), trunk: [...D.trunk] };
  const order = plan.tiers.map((_, i) => i).sort((a, b) => plan.tiers[a].R - plan.tiers[b].R);
  const lower = (key, min) => {
    const top = Math.max(...state[key]);
    if (top <= min) return false;
    state[key][order.find((i) => state[key][i] === top)]--;
    return true;
  };
  for (let guard = 0; guard < 96; guard++) {
    if (build(plan, level, palette, state, true).tris <= budget) break;
    if (lower('rings', D.minRings) || lower('m', D.minM)) continue;
    if (state.trunk[1] > 2) state.trunk[1]--;
    else if (state.trunk[0] > 4) state.trunk[0]--;
    else if (!lower('rings', 1) && !lower('m', 2)) break;
  }
  return { built: build(plan, level, palette, state), state };
}

/**
 * Pino liso. Devuelve un Group en el origen (base en y = 0, ~3-4,7 m de alto) con
 * userData.swayRoot; quien lo usa lo coloca, gira y escala.
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level, theme? }), { lod } o 0/1/2
 * - opts: { variant?: 0..3, leaves?: [hex], bark?: hex, theme?: { leaves, bark }, snow?: bool | 0..1, snowColor?: hex }
 *   Paleta: opts.leaves/bark, si no opts.theme o quality.theme (los verdes del tema se
 *   oscurecen a verde de pino), si no PINE_DEFAULTS.
 */
export function makePine(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const palette = pinePalette(quality, opts);
  const plan = planPine(rng, opts);
  const { built } = fit(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.pine = {
    variant: plan.variant,
    name: plan.name,
    level,
    height: plan.h,
    snow: palette.snow,
    triangles: built.tris,
    tiers: plan.tiers.map((T) => ({ x: T.x, z: T.z, r: T.R, rim: T.rim, top: T.top, hub: T.hub, lobes: T.lobes })),
  };
  return g;
}
