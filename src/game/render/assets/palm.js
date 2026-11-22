import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, range, smooth, treeLevel, withRim, vertexLambert, TriBuilder, tube } from './treeKit.js';

// Palmera del estilo liso (paso 3 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// - Tronco curvo (inclinado y con una pizca de S), pie ensanchado, adelgazándose hacia
//   arriba. Los anillos van en el color de vértice (franjas más oscuras alternas) y en
//   un abultamiento leve del radio en cada anillo.
// - Hojas largas arqueadas: un raquis que sube y cae (cabeceo lineal en su longitud) con
//   foliolos a cada lado, un triángulo (Bajo) o un triángulo subdividido (Medio/Alto)
//   por foliolo, barridos hacia la punta y caídos en V. Material de dos caras con la
//   normal sin darse la vuelta: la hoja se lee igual vista desde abajo.
// - Normales suavizadas (frente del raquis mezclado con la dirección desde la corona),
//   oclusión en el color (base de la hoja y hojas bajas más oscuras, punta más clara),
//   luz de borde a contraluz en el Lambert (como el árbol redondo y el pino).
// - Viento (assets/wind.js): el tronco, capa trunk, se dobla poco; las hojas, capa leaf,
//   se doblan con él, se balancean cada una con su fase y aletean más hacia la punta.
//   Los cocos van con el tronco (capa trunk) para no despegarse.
//
// Móvil primero: dos materiales compartidos por todas las palmeras (tronco y hojas), la
// paleta va en el vértice; tras bakeStatic el palmeral entero son dos llamadas de dibujo.
// Todo sale del rng recibido y las tiradas no dependen de la calidad: misma semilla,
// misma palmera en Bajo, Medio y Alto.

export const PALM_BUDGET = { low: 250, medium: 600, high: 1200 };
export const PALM_VARIANTS = 4;
export const PALM_DEFAULTS = { leaves: [0x3a9a3f, 0x2f8a3c, 0x45a845, 0x2b7d3a], bark: 0x8a6a48, coconut: 0x4a2f1c };

// detalle por calidad: tronco [lados, tramos]; K = segmentos del raquis de cada hoja;
// q = 1 foliolo de un triángulo, 2 foliolo de tres triángulos (con curva); coco = con cocos.
const DETAIL = {
  low: { trunk: [5, 4], K: 8, q: 1, coco: false },
  medium: { trunk: [7, 6], K: 9, q: 2, coco: true },
  high: { trunk: [9, 10], K: 14, q: 2, coco: true },
};
const MIN_K = 3;

// forma de cada variante: n hojas, altura h, inclinación lean (m de desplazamiento de la
// copa), S del tronco curl, largo de hoja L, caída extra droop, radio base del tronco r0
const VARIANTS = [
  // 0 · clásica: tronco alto y curvo, copa de nueve hojas
  { name: 'clásica', n: 9, h: [4.2, 4.8], lean: [0.3, 0.55], curl: [0.1, 0.25], L: [1.9, 2.3], droop: [0, 0.2], r0: [0.13, 0.15] },
  // 1 · esbelta: muy alta y casi recta, hojas más cortas
  { name: 'esbelta', n: 8, h: [5.0, 5.8], lean: [0.12, 0.3], curl: [0.05, 0.15], L: [1.7, 2.0], droop: [0, 0.15], r0: [0.1, 0.12] },
  // 2 · joven: bajita, muchas hojas caídas
  { name: 'joven', n: 10, h: [2.5, 3.1], lean: [0.1, 0.3], curl: [0.05, 0.15], L: [1.5, 1.9], droop: [0.15, 0.35], r0: [0.13, 0.16] },
  // 3 · inclinada: de playa, el tronco se echa a un lado
  { name: 'inclinada', n: 8, h: [4.0, 4.6], lean: [0.95, 1.35], curl: [0.25, 0.45], L: [2.0, 2.4], droop: [0.05, 0.25], r0: [0.12, 0.14] },
];

// ---------- materiales (compartidos por todas las palmeras) ----------

let MATS = null;
/** { trunk, frond }: los mismos para todas las palmeras. */
export function palmMaterials() {
  if (MATS) return MATS;
  const trunk = applyWind(withRim(vertexLambert(), 0.12), { layer: 'trunk' });
  const frond = applyWind(withRim(vertexLambert({ side: THREE.DoubleSide }), 0.45, true), { layer: 'leaf' });
  MATS = { trunk, frond };
  return MATS;
}

// ---------- paleta ----------

function palmPalette(quality, opts) {
  const theme = opts.theme ?? (quality && typeof quality === 'object' ? quality.theme : null) ?? null;
  const src = opts.leaves?.length ? opts.leaves : theme?.leaves?.length ? theme.leaves : PALM_DEFAULTS.leaves;
  return {
    leaves: src.map((h) => new THREE.Color(h)),
    bark: new THREE.Color(opts.bark ?? theme?.bark ?? PALM_DEFAULTS.bark),
    coconut: new THREE.Color(opts.coconut ?? PALM_DEFAULTS.coconut),
  };
}

// ---------- plan: todas las tiradas del rng (no dependen de la calidad) ----------

const UP = new THREE.Vector3(0, 1, 0);

function planPalm(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % PALM_VARIANTS) + PALM_VARIANTS) % PALM_VARIANTS : Math.floor(vr * PALM_VARIANTS);
  const V = VARIANTS[variant];
  const p0 = rng() * TAU;
  const leafPick = rng();
  const barkTint = (rng() - 0.5) * 0.06;
  const h = range(rng, V.h);
  const lean = range(rng, V.lean);
  const la = rng() * TAU;
  const curl = range(rng, V.curl) * (rng() < 0.5 ? -1 : 1);
  const r0 = range(rng, V.r0);
  const ringStep = lerp(0.18, 0.26, rng());
  const cocoPh = rng() * TAU;

  const leanDir = new THREE.Vector2(Math.cos(la), Math.sin(la));
  const at = (t) => {
    const k = t ** 1.7;
    const s = curl * Math.sin(Math.PI * t);
    return new THREE.Vector3(leanDir.x * lean * k - leanDir.y * s, lerp(-0.05, h, t), leanDir.y * lean * k + leanDir.x * s);
  };
  const crown = at(1);
  const trunk = {
    at,
    tangent: (t, out) => out.copy(at(Math.min(1, t + 1e-3))).sub(at(Math.max(0, t - 1e-3))).normalize(),
  };

  // hojas: alternan altas (casi erguidas) y bajas (caídas), repartidas en torno a la corona
  const n = V.n;
  const fronds = [];
  for (let i = 0; i < n; i++) {
    const high = i % 2 === 0;
    const f = {
      a: p0 + (i / n) * TAU + (rng() - 0.5) * 0.5 * (TAU / n),
      e0: (high ? lerp(0.6, 1.15, rng()) : lerp(0.1, 0.5, rng())) + (rng() - 0.5) * 0.1,
      d: lerp(1.5, 2.1, rng()) + range(rng, V.droop),
      L: range(rng, V.L) * lerp(0.85, 1, high ? 1 : rng()),
      lf: lerp(0.22, 0.28, rng()),
      tint: { h: (rng() - 0.5) * 0.03, l: (rng() - 0.5) * 0.06 },
      phase: rng() * TAU,
      high,
    };
    fronds.push(f);
  }
  return { variant, name: V.name, p0, leafPick, barkTint, h, lean, r0, ringStep, cocoPh, trunk, crown, fronds };
}

// ---------- forma de una hoja ----------

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _o = new THREE.Vector3();

/** Raquis de la hoja f en s ∈ [0,1]: punto y tangente (cabeceo lineal e0 - d·s: sube y cae). */
function rachis(plan, f, s, outP, outT) {
  const th = f.e0 - f.d * s;
  const ca = Math.cos(f.a), sa = Math.sin(f.a);
  const reach = (Math.sin(f.e0) - Math.sin(th)) / f.d;
  const rise = (Math.cos(th) - Math.cos(f.e0)) / f.d;
  outP.set(plan.crown.x + ca * (0.06 + f.L * reach), plan.crown.y + 0.04 + f.L * rise, plan.crown.z + sa * (0.06 + f.L * reach));
  outT.set(ca * Math.cos(th), Math.sin(th), sa * Math.cos(th));
  return th;
}

function buildFrond(lb, plan, f, K, q, palette, leaf, count) {
  const sgn = [1, -1];
  const side = new THREE.Vector3(-Math.sin(f.a), 0, Math.cos(f.a));
  const crown = new THREE.Vector3(plan.crown.x, plan.crown.y - 0.1, plan.crown.z);
  const yMin = plan.crown.y - 0.2, yMax = plan.crown.y + f.L * 0.8;
  let base, light;
  if (!count) {
    base = leaf.clone().offsetHSL(f.tint.h, 0, f.tint.l);
    light = base.clone().offsetHSL(-0.03, 0.02, 0.1);
  }
  const lowFrond = f.high ? 1 : 0.9;
  const spine = [];
  for (let i = 0; i <= K; i++) {
    const s = i / K;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    rachis(plan, f, s, P, T);
    if (count) {
      spine.push({ p: P, T });
      continue;
    }
    _n.copy(UP).addScaledVector(T, -T.y).normalize();
    const n = _n.clone().multiplyScalar(0.75).addScaledVector(_o.copy(P).sub(crown).normalize(), 0.25).normalize();
    const ao = (0.6 + 0.4 * smooth(0, 0.45, s)) * lowFrond;
    const c = base.clone().lerp(light, 0.45 * smooth(0.3, 1, s)).multiplyScalar(ao);
    spine.push({ p: P, T, nf: _n.clone(), n, c, w: 0.25 + 0.75 * s });
  }
  for (let i = 0; i < K; i++) {
    const a = spine[i], b = spine[i + 1];
    const sm = (i + 0.5) / K;
    for (const sg of sgn) {
      if (count) {
        lb.tri(a, b, a, f.phase);
        if (q === 2) lb.tri(a, b, a, f.phase), lb.tri(a, b, a, f.phase);
        continue;
      }
      const len = f.L * f.lf * Math.sin(Math.PI * (0.12 + 0.8 * sm));
      const tipP = _t.copy(a.p).add(b.p).multiplyScalar(0.5).addScaledVector(side, sg * 0.85 * len).addScaledVector(a.T, 0.42 * len).addScaledVector(UP, -0.32 * len).clone();
      const tn = a.nf.clone().addScaledVector(side, sg * 0.45).add(UP.clone().multiplyScalar(0.1)).normalize();
      const tipC = a.c.clone().lerp(b.c, 0.5).lerp(light, 0.35).multiplyScalar(1.04);
      const tip = { p: tipP, n: tn, c: tipC, w: Math.min(1, (a.w + b.w) / 2 + 0.25) };
      if (q === 1) {
        lb.tri(a, b, tip, f.phase);
      } else {
        // mitad del foliolo: más caída (lo curva) y a un 55 % del camino
        const mp = (from, ts) => from.p.clone().lerp(tipP, 0.55).addScaledVector(UP, -0.05 * len * (1 + ts));
        const mn = (from) => from.nf.clone().addScaledVector(side, sg * 0.25).normalize();
        const m0 = { p: mp(a, 0), n: mn(a), c: a.c.clone().lerp(tipC, 0.55), w: Math.min(1, a.w + 0.12) };
        const m1 = { p: mp(b, 0), n: mn(b), c: b.c.clone().lerp(tipC, 0.55), w: Math.min(1, b.w + 0.12) };
        lb.tri(a, b, m1, f.phase);
        lb.tri(a, m1, m0, f.phase);
        lb.tri(m0, m1, tip, f.phase);
      }
    }
  }
  return { yMin, yMax };
}

const OCTA = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const OCTA_F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];

function build(plan, level, palette, state, count = false) {
  const mats = palmMaterials();
  const leaf = count ? null : palette.leaves[Math.floor(plan.leafPick * palette.leaves.length) % palette.leaves.length];

  // ---- tronco ----
  const tb = new TriBuilder(plan.p0, count);
  const [radial, rings] = state.trunk;
  const bark = count ? null : palette.bark.clone().offsetHSL(0, 0, plan.barkTint);
  const ringOf = (t) => Math.round(t * rings);
  const radius = (t) => {
    const bulge = ringOf(t) % 2 === 1 ? 1.06 : 1;
    return plan.r0 * (1 - 0.38 * t) * (1 + 0.7 * Math.max(0, 1 - t / 0.1) ** 2) * bulge;
  };
  const shade = count
    ? () => null
    : (p, t) => {
        const band = ringOf(t) % 2 === 1 ? 0.84 : 1;
        return bark.clone().multiplyScalar((0.58 + 0.42 * smooth(0, 0.35, p.y)) * band * (1 - 0.1 * smooth(0.85, 1, t)));
      };
  tube(tb, plan.trunk, radius, radial, rings, shade);

  // cocos: octaedros lisos bajo la corona, con el tronco
  if (state.coco) {
    for (let k = 0; k < 3; k++) {
      const ak = plan.cocoPh + k * 2.1;
      const ctr = new THREE.Vector3(plan.crown.x + Math.cos(ak) * 0.13, plan.crown.y - 0.14, plan.crown.z + Math.sin(ak) * 0.13);
      const vs = OCTA.map(([x, y, z]) => {
        const nn = new THREE.Vector3(x, y, z);
        return count ? { p: nn } : { p: ctr.clone().addScaledVector(nn, 0.1), n: nn.clone(), c: palette.coconut.clone().multiplyScalar(0.7 + 0.3 * (y * 0.5 + 0.5)), w: 0 };
      });
      for (const [a, b, c] of OCTA_F) tb.tri(vs[a], vs[b], vs[c], plan.p0);
    }
  }

  // ---- hojas ----
  const lb = new TriBuilder(plan.p0, count);
  for (const f of plan.fronds) buildFrond(lb, plan, f, state.K, state.q, palette, leaf, count);

  return {
    tris: tb.tris + lb.tris,
    make() {
      const g = new THREE.Group();
      for (const [b, mat] of [[tb, mats.trunk], [lb, mats.frond]]) {
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
 * Ajusta la palmera al presupuesto de su calidad sin tirar más del rng: primero quita
 * segmentos a las hojas (hasta 5), luego pasa los foliolos de tres a un triángulo, luego
 * más segmentos, los cocos, y al final detalle del tronco. Las hojas nunca se quitan.
 */
function fit(plan, level, palette) {
  const D = DETAIL[level];
  const budget = PALM_BUDGET[level];
  const state = { K: D.K, q: D.q, coco: D.coco, trunk: [...D.trunk] };
  for (let guard = 0; guard < 96; guard++) {
    if (build(plan, level, palette, state, true).tris <= budget) break;
    if (state.K > 5) state.K--;
    else if (state.q > 1) state.q--;
    else if (state.K > MIN_K) state.K--;
    else if (state.coco) state.coco = false;
    else if (state.trunk[1] > 2) state.trunk[1]--;
    else if (state.trunk[0] > 4) state.trunk[0]--;
    else break;
  }
  return { built: build(plan, level, palette, state), state };
}

/**
 * Palmera lisa. Devuelve un Group en el origen (base en y = 0, ~2,5-5,8 m de alto sin las
 * hojas) con userData.swayRoot; quien lo usa lo coloca, gira y escala.
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level, theme? }), { lod } o 0/1/2
 * - opts: { variant?: 0..3, leaves?: [hex], bark?: hex, coconut?: hex, theme?: { leaves, bark } }
 *   Paleta: opts, si no opts.theme o quality.theme, si no PALM_DEFAULTS.
 */
export function makePalm(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const palette = palmPalette(quality, opts);
  const plan = planPalm(rng, opts);
  const { built, state } = fit(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.palm = {
    variant: plan.variant,
    name: plan.name,
    level,
    height: plan.h,
    triangles: built.tris,
    segments: state.K,
    coconuts: state.coco,
    crown: { x: plan.crown.x, y: plan.crown.y, z: plan.crown.z },
    fronds: plan.fronds.map((f) => ({ a: f.a, e0: f.e0, d: f.d, L: f.L })),
  };
  return g;
}
