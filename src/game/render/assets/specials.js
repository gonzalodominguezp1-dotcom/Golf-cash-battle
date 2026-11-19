import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, range, smooth, treeLevel, withRim, vertexLambert, TriBuilder, tube } from './treeKit.js';
import { makePine, pineMaterials, planPine, topPoint, topSurfaceNormal, hiddenIn, PINE_VARIANTS } from './pine.js';

// Especiales del estilo liso (paso 9 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md):
// pino nevado, cactus y árbol seco. Mismos criterios que pine.js / palm.js: Lambert compartido
// con el color en el vértice, normales suavizadas, rng propio de tiradas fijas (no depende de la
// calidad), ajuste al presupuesto sin tirar más del rng, compatible con bakeStatic y viento con
// las capas de wind.js.
//
// - PINO NEVADO: el pino de pine.js (4 variantes, mismos materiales) con nieve de verdad encima
//   de cada piso. La nieve es geometría: una capa blanca azulada que sigue la cara de arriba del
//   piso (topPoint de pine.js), más gruesa en el medio, con un borde que cuelga por encima del
//   borde de las ramas y una gorrita en la punta. Solo cubre caras que miran hacia arriba (sus
//   normales están mezcladas con la vertical y el grosor se anula si la cara es muy empinada) y
//   no se pinta donde queda tapada por el piso de encima. Va en la misma malla de las ramas (misma
//   fase que su piso: hereda el viento de las agujas que cubre). La nieve repite los ángulos y anillos de las
//   agujas (SNOW_LADDER match): sus triángulos son los de las agujas elevados, así que entre vértices no hay
//   cuerda que se hunda en la falda (con la escalera de reserva sin match, liftToNeedles eleva lo justo). La
//   elevación va hacia FUERA en las caras empinadas y sin gorra alta: el viento tumba las puntas y una
//   elevación vertical quedaría DETRÁS de las agujas. El pino de debajo recibe el presupuesto que le deja la
//   nieve (opts.budget de makePine; fitSnowPine reparte el total entre los dos).
// - CACTUS: saguaro (1, 2 o 3 brazos) con costillas suaves (radio modulado en el anillo, normales
//   que las siguen), cúpula en la punta y brazos que salen horizontales y suben (Bézier); flor
//   opcional en la punta; y nopal de palas (elipsoides aplastados encadenados, con tunas rojas).
//   Casi rígido: viento de la capa trunk con bend 0,012, sin balanceo ni aleteo.
// - ÁRBOL SECO: tronco retorcido que se afila y ramas sin hojas (con subramas): muerto en pie,
//   retorcido, partido (punta astillada) y tocón con raíces y anillos de crecimiento en el corte.
//   Casi rígido (trunk, bend 0,025). Marrón grisáceo, nada verde.
//
// Móvil primero: pino nevado = los dos materiales del pino (2 llamadas de dibujo por bosque);
// cactus y árbol seco = 1 material y 1 malla cada uno (1 llamada por grupo). Presupuesto de
// triángulos medido en tests/specials.test.js.

export const SPECIAL_BUDGET = { low: 250, medium: 600, high: 1200 };
export const SNOW_PINE_BUDGET = SPECIAL_BUDGET;
export const CACTUS_BUDGET = SPECIAL_BUDGET;
export const DEAD_TREE_BUDGET = SPECIAL_BUDGET;
export const SNOW_PINE_VARIANTS = PINE_VARIANTS;
export const CACTUS_VARIANTS = 4;
export const DEAD_TREE_VARIANTS = 4;
export const SPECIAL_RNG_DRAWS = 1; // tiradas del rng recibido por asset: la semilla de su rng propio
export const SNOW_COLORS = { light: 0xf4f8ff, shade: 0xb9cde8 };
export const CACTUS_DEFAULTS = { body: 0x4f9e3c, pad: 0x5aa84a, fruit: 0xd2385a, flowers: [0xf06a9a, 0xffd23f, 0xf5f0e6, 0xe0457b] };
export const DEAD_DEFAULTS = { bark: 0x4a3b32, bleach: 0xb8a898, cut: 0xc9b79a };
export const CACTUS_WIND = { layer: 'trunk', bend: 0.012, height: 2.5 };
export const DEAD_WIND = { layer: 'trunk', bend: 0.025, height: 3 };

const UP = new THREE.Vector3(0, 1, 0);

// ---------- rng propio ----------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Una tirada del rng recibido (SPECIAL_RNG_DRAWS) -> generador propio: la forma no depende de la calidad. */
const ownRng = (rng) => mulberry(Math.floor(rng() * 4294967296));
/** n tiradas de golpe (se tiran siempre todas, se usen o no) y un cursor para consumirlas en orden. */
function drawer(rng, n) {
  const R = Array.from({ length: n }, () => rng());
  let i = 0;
  return () => R[i++];
}
const pickVariant = (opts, n, r) => (Number.isInteger(opts.variant) ? ((opts.variant % n) + n) % n : Math.floor(r * n));

// ---------- materiales (compartidos) ----------

let CACTUS_MAT = null, DEAD_MAT = null;
/** El material de todos los cactus (color en el vértice, viento casi nulo). */
export function cactusMaterial() {
  return (CACTUS_MAT ??= applyWind(withRim(vertexLambert(), 0.18), CACTUS_WIND));
}
/** El material de todos los árboles secos. */
export function deadTreeMaterial() {
  return (DEAD_MAT ??= applyWind(withRim(vertexLambert(), 0.08), DEAD_WIND));
}

// =====================================================================================
// PINO NEVADO
// =====================================================================================

// escalera de detalle de la nieve por calidad (de más a menos): match = los vértices de la nieve son los de
// las agujas (mismos ángulos que su malla: la nieve no se hunde entre vértices); si no, m = vértices por lóbulo
// del borde (la mitad de resolución que las agujas: la cuerda de la nieve queda por dentro de la falda y se
// eleva en liftToNeedles). R = anillos de la capa como mucho (nunca más que las agujas del piso; el último,
// en el borde), lip = borde que cuelga. Triángulos por piso: N * (2 * (R + lip) - 1), N = lóbulos * m.
// Con R menor que los anillos de las agujas la cuerda cuello-borde se hunde en la falda cóncava (se eleva).
const SNOW_LADDER = {
  low: [{ match: true, R: 2, lip: false }, { m: 1, R: 1, lip: false }],
  medium: [{ match: true, R: 3, lip: true }, { match: true, R: 2, lip: false }, { m: 1, R: 1, lip: false }],
  high: [{ match: true, R: 3, lip: true }, { match: true, R: 2, lip: false }, { m: 1, R: 1, lip: false }],
};
const SNOW_THICK = 0.065; // grosor de la capa (m) en el medio de la falda
const SNOW_LIFT = 0.015; // elevación mínima de la nieve sobre las agujas (m), también en caras llanas
const SNOW_STEEP = 0.035; // elevación extra (m) en caras empinadas (hacia fuera, no hacia arriba): con el viento se tumban y el verde asoma
const SNOW_CAP = 0.02; // altura de la gorra sobre la punta (más alta, con la punta tumbada por el viento la gorra queda DETRÁS de las agujas)
const SNOW_MIN_UP = [0.2, 0.55]; // normal y de la falda a partir de la cual la nieve se acumula del todo

/**
 * Peso del aleteo de las agujas en el punto `p` (t = 0 cuello .. 1 borde) del piso: la MISMA fórmula
 * que flutterOf de pine.js. La nieve lo hereda del punto de la falda que cubre: con otro peso (p. ej. 0)
 * las agujas se mecerían debajo de ella y el verde asomaría (la nieve y las agujas deben moverse igual).
 * tests/specials.test.js compara con el peso real de las agujas.
 */
export const needleFlutter = (plan, p, t) => Math.min(1, t ** 1.5 * (0.35 + 0.65 * Math.max(0, Math.min(1, (p.y - plan.yMin) / (plan.h - plan.yMin)))));

const SNOW_FIT_SLACK = 0.1;
const SNOW_FIT_START = { low: 0.62, medium: 0.5, high: 0.5 }; // parte del presupuesto que se da al pino en el primer intento (medido: la mayoría cabe a la primera) // fracción del presupuesto que puede quedar sin usar al repartirlo entre agujas y nieve
const SNOW_MARGIN = 0.006; // m: holgura mínima de la nieve sobre las agujas en TODO el interior de cada triángulo
const SNOW_SAMPLES = 6; // subdivisiones baricéntricas con las que se mide el interior (28 puntos por triángulo)
const SAMPLE_POINTS = [];
for (let a = 0; a <= SNOW_SAMPLES; a++) for (let b = 0; b <= SNOW_SAMPLES - a; b++) SAMPLE_POINTS.push([a / SNOW_SAMPLES, b / SNOW_SAMPLES, (SNOW_SAMPLES - a - b) / SNOW_SAMPLES]);

/** Triángulos de la cara de arriba de las agujas de un piso (la malla real de pine.js con su grid), como [[x,y,z] x3]. */
function needleTop(plan, T, grid) {
  const ts = [0];
  for (let j = 1; j <= grid.rings; j++) ts.push(1 - (1 - j / grid.rings) ** 1.3); // mismo reparto que buildTier de pine.js
  const N = T.lobes * grid.m;
  const P = ts.map((t, j) => (j === 0 ? [topPoint(T, 0, T.ph)] : Array.from({ length: N }, (_, k) => topPoint(T, t, T.ph + (k / N) * TAU))));
  const out = [];
  const add = (a, b, c) => {
    if (!hiddenIn([{ p: a }, { p: b }, { p: c }], plan.tiers, T)) out.push([a, b, c]);
  };
  for (let k = 0; k < N; k++) add(P[0][0], P[1][k], P[1][(k + 1) % N]);
  for (let j = 1; j < grid.rings; j++) {
    for (let k = 0; k < N; k++) {
      const a = P[j][k], b = P[j][(k + 1) % N], c = P[j + 1][k], d = P[j + 1][(k + 1) % N];
      add(a, b, c);
      add(b, d, c);
    }
  }
  return out;
}

/** Altura de la cara de arriba de las agujas en (x, z), o -Infinity si ahí no hay agujas del piso. */
function needleY(tris, x, z) {
  for (const [a, b, c] of tris) {
    const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(den) < 1e-12) continue;
    const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den;
    const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * a.y + l2 * b.y + l3 * c.y;
  }
  return -Infinity;
}

/**
 * Eleva los vértices de la nieve lo justo para que NINGÚN punto del interior de un triángulo quede por debajo de
 * las agujas (más SNOW_MARGIN). Los triángulos de la nieve son cuerdas entre vértices posados sobre las agujas y la
 * falda es cóncava (cae más rápido hacia el borde) y ondulada (lóbulos): entre vértices la cuerda de la nieve se
 * hunde (medido: hasta 15-30 cm, 12-18 % de los puntos interiores en Bajo/Medio). La elevación necesaria de cada
 * triángulo se aplica a sus tres vértices; como solo sube, los triángulos vecinos solo ganan margen (una pasada basta).
 */
function liftToNeedles(tris, needles) {
  const need = new Map();
  for (const [a, b, c] of tris) {
    let d = 0;
    for (const [u, v, w] of SAMPLE_POINTS) {
      const x = u * a.p.x + v * b.p.x + w * c.p.x, z = u * a.p.z + v * b.p.z + w * c.p.z, y = u * a.p.y + v * b.p.y + w * c.p.y;
      d = Math.max(d, needleY(needles, x, z) + SNOW_MARGIN - y);
    }
    if (d > 0) for (const q of [a, b, c]) need.set(q, Math.max(need.get(q) ?? 0, d));
  }
  for (const [q, d] of need) q.p.y += d;
}

/** Capa de nieve de un piso: abanico desde el cuello, anillos hasta el borde y borde que cuelga. */
function snowTier(sb, plan, T, i, cfg, grid, lift) {
  const Np = T.lobes * grid.m; // vértices por anillo de las agujas de este piso
  const N = cfg.match ? Np : T.lobes * Math.min(cfg.m, grid.m);
  const upper = plan.tiers[i + 1] ?? null;
  // Anillos y ángulos: los vértices de la nieve se POSAN sobre vértices de las agujas (mismos radios de anillo y
  // mismos ángulos): sus puntos base son vértices de la falda y reciben exactamente el mismo viento. Con una malla
  // propia, los puntos intermedios se mueven por la función exacta del viento y las agujas por la cuerda entre
  // sus vértices: se separan hasta 7-19 cm con viento máximo en triángulos grandes.
  const R = Math.min(cfg.R, grid.rings);
  const ts = [];
  for (let j = 1; j <= R; j++) {
    const jj = Math.round((j * grid.rings) / R); // anillo de las agujas (1..rings), estrictamente creciente
    ts.push(1 - (1 - jj / grid.rings) ** 1.3); // mismo reparto de anillos que buildTier de pine.js
  }
  const angle = (k) => T.ph + (Math.round((k * Np) / N) / Np) * TAU;
  const lobeOf = (a) => 0.5 + 0.5 * Math.cos(T.lobes * (a - T.ph));
  const surf = new THREE.Vector3();

  const center = () => {
    const p = topPoint(T, 0, T.ph).add(new THREE.Vector3(0, upper ? 0.03 : SNOW_CAP, 0));
    p.swayH = topPoint(T, 0, T.ph).y;
    return { p, n: UP.clone(), c: new THREE.Color(SNOW_COLORS.light), w: 0 };
  };
  const colorAt = (p, ny, t, a) => {
    let occ = 0;
    if (upper) occ = 1 - smooth(upper.R * 0.5, upper.R * 1.15, Math.hypot(p.x - upper.x, p.z - upper.z));
    const shade = Math.min(1, 0.16 + 0.42 * occ + 0.3 * (1 - smooth(0.2, 0.7, ny)) + 0.18 * t * (1 - lobeOf(a)));
    return new THREE.Color(SNOW_COLORS.light).lerp(new THREE.Color(SNOW_COLORS.shade), shade).multiplyScalar(0.95 + 0.05 * lobeOf(a));
  };
  const ringV = (t, a, lip) => {
    const base = topPoint(T, Math.min(1, t), a);
    topSurfaceNormal(T, Math.max(0.05, Math.min(1, t)), a, surf);
    const ny = surf.y;
    // la nieve solo se acumula donde la cara mira hacia arriba
    const up = smooth(SNOW_MIN_UP[0], SNOW_MIN_UP[1], ny);
    const nrm = surf.clone().lerp(UP, 0.5).normalize(); // normal de luz: mezclada con la vertical
    const dir = surf.clone().lerp(UP, 0.5 * smooth(0.25, 0.7, ny)).normalize(); // dirección de la elevación
    let th = SNOW_THICK * (0.55 + 0.45 * smooth(0, 0.5, t)) * (0.8 + 0.2 * lobeOf(a)) * up * (0.6 + 0.4 * T.R);
    const p = base.clone();
    if (lip) {
      // borde que cuelga: pasa un poco del borde de las ramas y cae, más en las puntas de rama
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      p.addScaledVector(out, 0.035 + 0.03 * lobeOf(a)).y -= 0.03 + 0.045 * lobeOf(a);
      nrm.copy(UP).addScaledVector(out, 0.35).normalize();
      dir.copy(nrm);
      th *= 0.5;
    }
    // elevación mínima, también en caras empinadas, donde sube hacia FUERA (normal de la cara, sin mezclar con la
    // vertical): el viento tumba las puntas y una elevación vertical pasaría a quedar detrás de las agujas
    p.addScaledVector(dir, Math.max(SNOW_LIFT + SNOW_STEEP * (1 - up), th));
    p.swayH = base.y;
    return { p, n: nrm, c: colorAt(p, nrm.y, t, a), w: needleFlutter(plan, base, Math.min(1, t)) };
  };

  const rows = [];
  for (let q = 0; q < R + (cfg.lip ? 1 : 0); q++) {
    const lip = q === R;
    rows.push(Array.from({ length: N }, (_, k) => ringV(lip ? 1 : ts[q], angle(k), lip)));
  }
  const c0 = center();
  const tris = [];
  const emit = (a, b, c) => {
    if (!hiddenIn([a, b, c], plan.tiers, T)) tris.push([a, b, c]);
  };
  for (let k = 0; k < N; k++) emit(c0, rows[0][k], rows[0][(k + 1) % N]);
  for (let q = 0; q + 1 < rows.length; q++) {
    for (let k = 0; k < N; k++) {
      const a = rows[q][k], b = rows[q][(k + 1) % N], c = rows[q + 1][k], d = rows[q + 1][(k + 1) % N];
      emit(a, b, c);
      emit(b, d, c);
    }
  }
  // con los ángulos y anillos de las agujas (match, R = anillos) la nieve repite sus triángulos y no hay cuerda que se hunda
  if (lift && !(cfg.match && R === grid.rings)) liftToNeedles(tris, needleTop(plan, T, grid)); // los vértices son compartidos: se elevan una vez
  for (const [a, b, c] of tris) sb.tri(a, b, c, T.phase, UP);
}

/**
 * TriBuilder de la nieve: el atributo `sway` (la altura que usa el viento: el doblado crece con su
 * cuadrado) es el de la falda que cubre (p.swayH), no el del vértice ya elevado. Así nieve y agujas
 * reciben el mismo doblado y balanceo y no se cizallan entre sí (ni en la gorra, 10 cm más alta).
 */
class SnowBuilder extends TriBuilder {
  vert(p, n, c, phase, flutter) {
    super.vert(p, n, c, phase, flutter);
    if (!this.count && p.swayH !== undefined) this.sway[this.sway.length - 1] = Math.max(0, p.swayH);
  }
}

function buildSnow(plan, cfg, grid, count) {
  const sb = new SnowBuilder(plan.p0, count);
  plan.tiers.forEach((T, i) => snowTier(sb, plan, T, i, cfg, grid[i], !count));
  return sb;
}

/** Une los triángulos de la nieve a la geometría de las ramas (mismos atributos, misma malla). */
function appendGeometry(geo, extra) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], b = extra.attributes[name];
    const arr = new a.array.constructor(a.array.length + b.array.length);
    arr.set(a.array, 0);
    arr.set(b.array, a.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/** Reproduce las tiradas de un generador ya usado (para planear el pino con las mismas que makePine). */
function recorder(rng) {
  const log = [];
  const f = () => {
    const v = rng();
    log.push(v);
    return v;
  };
  f.replay = () => {
    let i = 0;
    return () => log[i++];
  };
  return f;
}

/**
 * Reparte el presupuesto entre las agujas y la nieve. La nieve se posa sobre la malla FINAL de las agujas, que
 * depende del presupuesto que se le da al pino (pb): el total (pino + nieve) crece con pb a saltos. Se parte
 * del pino a todo el presupuesto (la nieve más grande) y se busca por bisección el mayor pb cuyo total cabe.
 * Devuelve { g, grid, snowTris, total, fits }: el que cabe y más aprovecha, o el más pequeño si ninguno cabe.
 */
function fitSnowPine(planRng, plan, cfg, quality, pineOpts, budget, level) {
  const make = (pb) => {
const g = makePine(planRng(), quality, { ...pineOpts, budget: pb });
    const grid = g.userData.pine.grid;
    const snowTris = buildSnow(plan, cfg, grid, true).tris;
    const total = g.userData.pine.triangles + snowTris;
    return { g, grid, snowTris, total, fits: total <= budget };
  };
  const slack = Math.ceil(budget * SNOW_FIT_SLACK); // con tan poco sin usar se da por buena
  // la nieve repite los triángulos de las agujas: el total es casi proporcional al del pino. Se parte de un reparto
  // por tipo de capa, se corrige por proporción y, en cuanto hay cota por arriba y por abajo, por bisección
  let best = null, small = null, lo = 0, hi = budget, pb = Math.round(budget * (cfg.match ? SNOW_FIT_START[level] : 0.75));
  for (let pass = 0; pass < 9 && pb > lo && pb < hi; pass++) {
    const cand = make(pb);
    let drop = cand;
    if (cand.fits) {
      lo = pb;
      if (!best || cand.total > best.total) [drop, best] = [best, cand];
      if (budget - best.total <= slack) break;
    } else {
      hi = pb;
      if (!small || cand.total < small.total) [drop, small] = [small, cand];
    }
    if (drop) disposeGroup(drop.g);
    const next = Math.round((pb * budget) / cand.total);
    if (best && hi - lo <= slack * 0.4) break; // la búsqueda ya no afina: los pasos del ajuste del pino son más gordos
    pb = next > lo && next < hi ? next : (lo + hi) >> 1;
  }
  if (best) {
    if (small) disposeGroup(small.g);
    return best;
  }
  return small ?? make(Math.max(1, hi - 1));
}

/**
 * Pino con nieve. Devuelve un Group (como makePine) con userData.swayRoot y userData.snowPine.
 * - rng: generador con semilla; gasta SIEMPRE una tirada (SPECIAL_RNG_DRAWS), el resto sale de un rng propio
 * - quality: 'low' | 'medium' | 'high', preset del laboratorio ({ level, theme? }), { lod } o 0/1/2
 * - opts: { variant?: 0..3, leaves?, bark?, theme?, snow?: 0..1 (escarcha sobre las agujas, def. 0,2), budget? }
 */
export function makeSnowPine(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const own = ownRng(rng);
  const rec = recorder(own);
  const budget = Number.isFinite(opts.budget) ? opts.budget : SNOW_PINE_BUDGET[level];
  const pineOpts = { ...opts, snow: opts.snow ?? 0.2 };
  delete pineOpts.budget;
  // el plan del pino (para colocar la nieve) sale de las mismas tiradas que gastará makePine
  planPine(rec, pineOpts); // graba las tiradas del plan; makePine y el plan de la nieve las reproducen
  const planRng = rec.replay;
  const ladder = SNOW_LADDER[level];
  let best = null, plan = null, cfg = null;
  for (let q = 0; q < ladder.length; q++) {
    // makePine y el plan gastan las mismas tiradas: se rebobina la lista grabada
    plan = planPine(planRng(), pineOpts);
    const cand = fitSnowPine(planRng, plan, ladder[q], quality, pineOpts, budget, level);
    // la última pasada de la escalera se queda con lo más pequeño que haya salido (overBudget si aun así no cabe)
    if (best && (cand.fits ? false : cand.total >= best.total)) disposeGroup(cand.g);
    else {
      if (best) disposeGroup(best.g);
      best = cand;
      cfg = ladder[q];
    }
    if (best.fits) break;
  }
  const g = best.g;
  plan = planPine(planRng(), pineOpts);
  const sb = buildSnow(plan, cfg, best.grid, false);
  const snowTris = sb.tris;
  const canopy = g.children.find((m) => m.material === pineMaterials().canopy);
  const from = canopy.geometry.attributes.position.count;
  const merged = appendGeometry(canopy.geometry, sb.geometry());
  canopy.geometry.dispose();
  canopy.geometry = merged;
  g.userData.swayRoot = true;
  g.userData.snowPine = {
    variant: g.userData.pine.variant,
    name: g.userData.pine.name,
    level,
    height: g.userData.pine.height,
    triangles: g.userData.pine.triangles + snowTris,
    pineTriangles: g.userData.pine.triangles,
    snowTriangles: snowTris,
    snowFrom: from,
    snowDetail: { ...cfg },
    overBudget: !best.fits,
    tiers: g.userData.pine.tiers,
  };
  return g;
}

function disposeGroup(g) {
  g.traverse((o) => o.geometry?.dispose());
}

// =====================================================================================
// CACTUS
// =====================================================================================

// detalle por calidad: mult = vértices por costilla (1 = solo la cresta), s = tramos rectos del
// tronco, sa = tramos del brazo, dome = ángulos (grados) de los anillos de la cúpula (el último, 90,
// es la punta), flowerBody = pétalos con centro; pads [M, L] = meridianos y paralelos de cada pala
const CACTUS_DETAIL = {
  low: { mult: 1, s: 3, sa: 3, dome: [55, 90], petals: 5, center: false, pads: [6, 4], fruit: 0 },
  medium: { mult: 2, s: 5, sa: 5, dome: [35, 65, 90], petals: 6, center: true, pads: [10, 5], fruit: 3 },
  high: { mult: 3, s: 8, sa: 8, dome: [25, 50, 72, 90], petals: 6, center: true, pads: [14, 7], fruit: 4 },
};
const RIB_AMP = 0.085; // amplitud de las costillas (fracción del radio)

const CACTUS_FORMS = [
  { name: 'saguaro de dos brazos', arms: 2, h: [2.4, 3.0], r0: [0.2, 0.25] },
  { name: 'saguaro de un brazo', arms: 1, h: [2.0, 2.5], r0: [0.19, 0.23] },
  { name: 'saguaro de tres brazos', arms: 3, h: [2.8, 3.4], r0: [0.22, 0.27] },
  { name: 'nopal', arms: 0, h: [1.5, 1.9], r0: [0.0, 0.0] },
];

function planCactus(rng, opts) {
  const nx = drawer(rng, 64);
  const variant = pickVariant(opts, CACTUS_VARIANTS, nx());
  const F = CACTUS_FORMS[variant];
  const p0 = nx() * TAU;
  const tint = (nx() - 0.5) * 0.08;
  const h = range(nx, F.h);
  const r0 = range(nx, F.r0);
  const ribs = 6 + Math.floor(nx() * 3);
  const la = nx() * TAU;
  const lean = nx() * 0.12;
  const a0 = nx() * TAU;
  const arms = [];
  for (let i = 0; i < 3; i++) {
    const j = (nx() - 0.5) * 0.5, y0f = nx(), reach = nx(), up = nx(), rad = nx();
    if (i >= F.arms) continue;
    const a = a0 + (i / F.arms) * TAU + j;
    const y0 = h * (0.26 + 0.1 * i + 0.14 * y0f);
    const d = r0 * (1.7 + 1.8 * reach);
    const u = Math.max(0.25, Math.min(h * (0.2 + 0.24 * up), h - r0 * 1.3 - y0));
    arms.push({ a, y0, d, u, r: r0 * (0.55 + 0.12 * rad) });
  }
  const flowerRoll = nx(), flowerPick = nx(), flowerRoll2 = nx();
  const flower = opts.flower ?? flowerRoll < 0.55;
  const flowers = [flower ? 0 : -1];
  if (flower && F.arms > 1 && flowerRoll2 < 0.5) flowers.push(1);
  const cx = Math.cos(la) * lean, cz = Math.sin(la) * lean;
  // palas (nopal): tres niveles, 4-6
  const pads = [];
  if (variant === 3) {
    const yaw = nx() * TAU, tilt = (nx() - 0.5) * 0.3, base = lerp(0.9, 1.1, nx());
    const kids = [0, 1].map(() => ({ ang: lerp(0.4, 0.85, nx()), scale: lerp(0.68, 0.82, nx()), z: (nx() - 0.5) * 0.05, wob: (nx() - 0.5) * 0.2 }));
    const n3 = 1 + Math.floor(nx() * 3);
    const grand = [0, 1, 2].map(() => ({ from: nx() < 0.5 ? 0 : 1, side: nx() < 0.5 ? -1 : 1, ang: lerp(0.3, 0.8, nx()), scale: lerp(0.66, 0.8, nx()), z: (nx() - 0.5) * 0.05, wob: (nx() - 0.5) * 0.2 }));
    pads.push({ yaw, tilt, base, kids, grand: grand.slice(0, n3) });
  } else {
    for (let i = 0; i < 18; i++) nx(); // se tiran igual: mismo gasto en todas las variantes
  }
  return {
    variant, name: F.name, p0, tint, h, r0, ribs, arms, cx, cz, flowers, flowerPick: Math.floor(flowerPick * CACTUS_DEFAULTS.flowers.length), nopal: pads[0] ?? null,
  };
}

/** Anillos con costillas suaves: radio r(1 + A cos(ribs a)) y normales que las siguen. Cierra con un vértice en la punta si r = 0. */
function ribbedBody(b, rings, N, ribs, shade, hidden, count) {
  // pendiente del radio a lo largo del eje (para inclinar la normal en la cúpula y el pie)
  const len = [0];
  for (let i = 1; i < rings.length; i++) len.push(len[i - 1] + rings[i].c.distanceTo(rings[i - 1].c));
  let nrm = null;
  const frames = rings.map((ring, i) => {
    const T = ring.T;
    if (!nrm) {
      const ref = Math.abs(T.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      nrm = new THREE.Vector3().crossVectors(T, ref).normalize();
    } else nrm.addScaledVector(T, -nrm.dot(T)).normalize();
    return { n: nrm.clone(), bn: new THREE.Vector3().crossVectors(T, nrm) };
  });
  const verts = rings.map((ring, i) => {
    if (ring.r < 1e-6) return [count ? { p: ring.c.clone() } : { p: ring.c.clone(), n: ring.T.clone(), c: shade(ring.c, i, 1, rings.length, ring), w: 0 }];
    const i0 = Math.max(0, i - 1), i1 = Math.min(rings.length - 1, i + 1);
    const slope = (rings[i1].r - rings[i0].r) / Math.max(1e-6, len[i1] - len[i0]);
    const { n, bn } = frames[i];
    return Array.from({ length: N }, (_, k) => {
      const a = (k / N) * TAU;
      const cr = Math.cos(ribs * a);
      const d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
      const rr = ring.r * (1 + RIB_AMP * cr);
      const p = ring.c.clone().addScaledVector(d, rr);
      if (count) return { p };
      const e = n.clone().multiplyScalar(-Math.sin(a)).addScaledVector(bn, Math.cos(a));
      const drda = -ring.r * RIB_AMP * ribs * Math.sin(ribs * a);
      const nn = d.clone().multiplyScalar(rr).addScaledVector(e, -drda).normalize().addScaledVector(ring.T, -slope * (1 + RIB_AMP * cr)).normalize();
      return { p, n: nn, c: shade(p, i, cr, rings.length, ring), w: 0 };
    });
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = verts[i], B = verts[i + 1];
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      if (B.length === 1) {
        if (!hidden([A[k], A[k1], B[0]])) b.tri(A[k], A[k1], B[0], b.p0);
      } else {
        for (const t of [[A[k], A[k1], B[k]], [A[k1], B[k1], B[k]]]) if (!hidden(t)) b.tri(t[0], t[1], t[2], b.p0);
      }
    }
  }
}

const bez = (p0, p1, p2, p3, t, out) => {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
};

function domeRings(rings, c, T, r, domeDeg) {
  for (const deg of domeDeg) {
    const f = (deg * Math.PI) / 180;
    rings.push({ c: c.clone().addScaledVector(T, r * Math.sin(f)), T: T.clone(), r: deg >= 90 ? 0 : r * Math.cos(f) });
  }
}

/** Flor de cinco o seis pétalos sobre la punta de un cuerpo (apex hacia T). */
function flowerAt(b, apex, T, size, colors, petals, center, phase, count) {
  const ref = Math.abs(T.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(T, ref).normalize(), v = new THREE.Vector3().crossVectors(T, u);
  const ctr = apex.clone().addScaledVector(T, 0.025);
  const rim = (a, r, lift) => ctr.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).addScaledVector(T, lift);
  const tipN = T.clone();
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * TAU + phase;
    const hw = (TAU / petals) * 0.5;
    const A = { p: rim(a - hw * 0.8, size * 0.3, 0.005) }, B = { p: rim(a + hw * 0.8, size * 0.3, 0.005) }, C = { p: rim(a, size, size * 0.3) };
    if (!count) {
      for (const q of [A, B]) (q.n = tipN.clone().addScaledVector(q.p.clone().sub(ctr), 0.6).normalize()), (q.c = colors.petal.clone().multiplyScalar(0.8)), (q.w = 0);
      C.n = tipN.clone().addScaledVector(C.p.clone().sub(ctr), 0.8).normalize();
      C.c = colors.petal.clone().lerp(new THREE.Color(0xffffff), 0.25);
      C.w = 0;
    }
    b.tri(A, B, C, b.p0, T);
  }
  if (center) {
    const top = { p: ctr.clone().addScaledVector(T, size * 0.28) };
    const ringP = Array.from({ length: 5 }, (_, k) => ({ p: rim((k / 5) * TAU, size * 0.26, 0.02) }));
    if (!count) {
      top.n = tipN.clone();
      top.c = colors.heart.clone();
      top.w = 0;
      for (const q of ringP) (q.n = tipN.clone().addScaledVector(q.p.clone().sub(ctr), 1.5).normalize()), (q.c = colors.heart.clone().multiplyScalar(0.8)), (q.w = 0);
    }
    for (let k = 0; k < 5; k++) b.tri(ringP[k], ringP[(k + 1) % 5], top, b.p0, T);
  }
}

function paddle(b, pad, M, L, palette, count) {
  const R = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(pad.q));
  const rot = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(R);
  const grid = [];
  for (let i = 0; i <= L; i++) {
    const th = (Math.PI * i) / L;
    const sn = Math.sin(th), cs = Math.cos(th);
    const n = i === 0 || i === L ? 1 : M;
    grid.push(
      Array.from({ length: n }, (_, j) => {
        const ph = (j / M) * TAU;
        const lx = pad.a * sn * Math.cos(ph), ly = pad.b * sn * Math.sin(ph), lz = pad.c * cs;
        const p = rot(lx, ly, lz).add(pad.c0);
        if (count) return { p };
        const nn = rot(lx / (pad.a * pad.a), ly / (pad.b * pad.b), lz / (pad.c * pad.c)).normalize();
        const ao = 0.74 + 0.26 * smooth(-1, 1, ly / pad.b);
        const rimLight = 0.12 * smooth(0.6, 1, sn);
        return { p, n: nn, c: palette.pad.clone().multiplyScalar(ao).lerp(palette.padLight, rimLight), w: 0 };
      }),
    );
  }
  for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M;
    b.tri(grid[0][0], grid[1][j1], grid[1][j], b.p0);
    for (let i = 1; i < L - 1; i++) {
      const a = grid[i][j], c = grid[i][j1], d = grid[i + 1][j], e = grid[i + 1][j1];
      b.tri(a, c, d, b.p0);
      b.tri(c, e, d, b.p0);
    }
    b.tri(grid[L][0], grid[L - 1][j], grid[L - 1][j1], b.p0);
  }
}

const OCTA = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCTA_F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];

function cactusPalette(opts) {
  const body = new THREE.Color(opts.body ?? CACTUS_DEFAULTS.body);
  return {
    body,
    bodyLight: body.clone().offsetHSL(-0.02, 0.0, 0.1),
    spine: new THREE.Color(0xe2dcae),
    pad: new THREE.Color(opts.pad ?? CACTUS_DEFAULTS.pad),
    padLight: new THREE.Color(opts.pad ?? CACTUS_DEFAULTS.pad).offsetHSL(0.01, 0, 0.14),
    fruit: new THREE.Color(opts.fruit ?? CACTUS_DEFAULTS.fruit),
  };
}

/** Palas del nopal: base, dos hijas y 1-3 nietas encadenadas por el borde de arriba. */
function nopalPads(plan) {
  const N = plan.nopal;
  const out = [];
  const base = { a: 0.36 * N.base, b: 0.46 * N.base, c: 0.075 * N.base };
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, N.yaw, N.tilt, 'YXZ'));
  const first = { ...base, c0: new THREE.Vector3(0, base.b * 0.82, 0), q: q0, up: 0 };
  out.push(first);
  const child = (par, sc, side, ang, z, wob) => {
    const R = new THREE.Matrix4().makeRotationFromQuaternion(par.q);
    const off = new THREE.Vector3(side * par.a * 0.5, par.b * 0.82, z).applyMatrix4(R);
    const q = par.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, wob, -side * ang, 'XYZ')));
    const s = { a: par.a * sc, b: par.b * sc, c: par.c * Math.max(0.8, sc), c0: par.c0.clone().add(off), q };
    out.push(s);
    return s;
  };
  const kids = N.kids.map((k, i) => child(first, k.scale, i === 0 ? -1 : 1, k.ang, k.z, k.wob));
  N.grand.forEach((g) => {
    const par = kids[g.from];
    child(par, g.scale, g.side, g.ang, g.z, g.wob);
  });
  // el pie de la nopalera toca el suelo: lo más bajo de las palas (extremo del elipsoide girado) queda en y = 0
  const lowest = out.reduce((m, pad) => {
    const e = new THREE.Matrix4().makeRotationFromQuaternion(pad.q).elements; // fila y: e[1], e[5], e[9]
    return Math.min(m, pad.c0.y - Math.hypot(e[1] * pad.a, e[5] * pad.b, e[9] * pad.c));
  }, Infinity);
  for (const pad of out) pad.c0.y -= lowest + 0.015; // 1,5 cm hundido: la malla (sobre todo en Bajo) no llega a la punta exacta del elipsoide
  return out;
}

function buildCactus(plan, level, palette, state, count = false) {
  const b = new TriBuilder(plan.p0, count);
  const D = CACTUS_DETAIL[level];
  if (plan.nopal) {
    const pads = nopalPads(plan);
    for (const pad of pads) paddle(b, pad, state.pads[0], state.pads[1], palette, count);
    // tunas rojas en el borde de arriba de las palas de la punta
    const tips = pads.slice(1);
    for (let k = 0; k < state.fruit && k < tips.length; k++) {
      const pad = tips[tips.length - 1 - k];
      const R = new THREE.Matrix4().makeRotationFromQuaternion(pad.q);
      const ctr = new THREE.Vector3(pad.a * 0.25 * (k % 2 ? 1 : -1), pad.b * 0.97, pad.c * 0.4).applyMatrix4(R).add(pad.c0);
      const vs = OCTA.map(([x, y, z]) => (count ? { p: ctr.clone().addScaledVector(new THREE.Vector3(x, y * 1.3, z), 0.055) } : { p: ctr.clone().addScaledVector(new THREE.Vector3(x, y * 1.3, z), 0.055), n: new THREE.Vector3(x, y, z), c: palette.fruit.clone().multiplyScalar(0.75 + 0.25 * (y * 0.5 + 0.5)), w: 0 }));
      for (const [i, j, l] of OCTA_F) b.tri(vs[i], vs[j], vs[l], plan.p0);
    }
    return finishCactus(b, count);
  }
  const { h, r0, ribs } = plan;
  const N = ribs * state.mult;
  const axis = (y) => new THREE.Vector3(plan.cx * (Math.max(0, y) / h) ** 2, y, plan.cz * (Math.max(0, y) / h) ** 2);
  const axisT = (y) => axis(y + 1e-3).sub(axis(y - 1e-3)).normalize();
  const rAt = (y) => r0 * (1 - 0.07 * (y / h)) * (1 + 0.3 * Math.max(0, 1 - (y + 0.03) / 0.3) ** 2);
  const yTop = h - r0;
  const tint = plan.tint;
  const col = (cr, aoMin, up, extra = 0) => {
    const c = palette.body.clone().offsetHSL(0, 0, tint);
    c.lerp(palette.bodyLight, 0.55 * up + 0.2 * (0.5 + 0.5 * cr));
    c.lerp(palette.spine, 0.2 * smooth(0.97, 1, cr));
    return c.multiplyScalar(aoMin + extra);
  };
  // tronco: tramos rectos y cúpula
  const rings = [];
  for (let i = 0; i <= state.s; i++) {
    const y = lerp(-0.03, yTop, i / state.s);
    rings.push({ c: axis(y), T: axisT(y), r: rAt(y) });
  }
  const topC = axis(yTop), topT = axisT(yTop);
  domeRings(rings, topC, topT, rAt(yTop), state.dome);
  const shadeTrunk = count
    ? () => null
    : (p, i, cr, n) => col(cr, 0.6 + 0.4 * smooth(0, 0.5, p.y), smooth(0.6, 1, p.y / h));
  const trunkHidden = () => false;
  ribbedBody(b, rings, N, ribs, shadeTrunk, trunkHidden, count);
  // brazos: salen horizontales, suben y acaban en cúpula
  plan.arms.forEach((arm) => {
    const e = new THREE.Vector3(Math.cos(arm.a), 0, Math.sin(arm.a));
    const P0 = axis(arm.y0).addScaledVector(e, 0.3 * r0);
    const P3 = P0.clone().addScaledVector(e, arm.d).addScaledVector(UP, arm.u);
    const P1 = P0.clone().addScaledVector(e, arm.d * 0.9);
    const P2 = P0.clone().addScaledVector(e, arm.d).addScaledVector(UP, arm.u * 0.12);
    const at = (t) => bez(P0, P1, P2, P3, t, new THREE.Vector3());
    const ar = [];
    const tan = (t) => at(Math.min(1, t + 1e-3)).sub(at(Math.max(0, t - 1e-3))).normalize();
    for (let j = 0; j <= state.sa; j++) {
      const t = j / state.sa;
      ar.push({ c: at(t), T: tan(t), r: arm.r * (1 - 0.1 * t) });
    }
    domeRings(ar, at(1), tan(1), arm.r * 0.9, state.dome);
    // lo que queda dentro del tronco no se ve
    const inside = (v) => Math.hypot(v.p.x - axis(v.p.y).x, v.p.z - axis(v.p.y).z) < r0 * 0.84 && v.p.y > 0 && v.p.y < yTop;
    const shadeArm = count
      ? () => null
      : (p, i, cr, n, ring) => {
          const t = i / Math.max(1, state.sa);
          return col(cr, 0.62 + 0.38 * smooth(0, 0.35, t), smooth(0.2, 1, t));
        };
    ribbedBody(b, ar, N, ribs, shadeArm, (tri) => tri.every(inside), count);
  });
  // flores
  const colors = {
    petal: new THREE.Color(CACTUS_DEFAULTS.flowers[plan.flowerPick]),
    heart: new THREE.Color(0xffd23f),
  };
  if (state.flowers) {
    plan.flowers.forEach((f, i) => {
      if (f < 0) return;
      if (f === 0) flowerAt(b, topC.clone().addScaledVector(topT, rAt(yTop)), topT, 0.2, colors, D.petals, D.center, plan.p0, count);
      else if (plan.arms.length) {
        const arm = plan.arms[0];
        const e = new THREE.Vector3(Math.cos(arm.a), 0, Math.sin(arm.a));
        const P0 = axis(arm.y0).addScaledVector(e, 0.3 * r0);
        const top = P0.clone().addScaledVector(e, arm.d).addScaledVector(UP, arm.u + arm.r * 0.9);
        flowerAt(b, top, UP, 0.15, colors, D.petals, D.center, plan.p0 + 1, count);
      }
    });
  }
  return finishCactus(b, count);
}

function finishCactus(b, count) {
  return {
    tris: b.tris,
    make() {
      const g = new THREE.Group();
      const m = new THREE.Mesh(b.geometry(), cactusMaterial());
      m.castShadow = true;
      g.add(m);
      return g;
    },
  };
}

function fitCactus(plan, level, palette) {
  const D = CACTUS_DETAIL[level];
  const budget = CACTUS_BUDGET[level];
  const state = { mult: D.mult, s: D.s, sa: D.sa, dome: [...D.dome], flowers: true, pads: [...D.pads], fruit: D.fruit };
  for (let guard = 0; guard < 96; guard++) {
    if (buildCactus(plan, level, palette, state, true).tris <= budget) break;
    if (plan.nopal) {
      if (state.fruit > 0) state.fruit = 0;
      else if (state.pads[1] > 3) state.pads[1]--;
      else if (state.pads[0] > 5) state.pads[0]--;
      else break;
    } else if (state.sa > 2) state.sa--;
    else if (state.s > 2) state.s--;
    else if (state.dome.length > 2) state.dome.splice(0, 1);
    else if (state.mult > 1) state.mult--;
    else if (state.s > 1) state.s--;
    else break;
  }
  return { built: buildCactus(plan, level, palette, state), state };
}

/**
 * Cactus liso. Devuelve un Group en el origen (base en y = 0) con userData.swayRoot y una malla.
 * - rng: generador con semilla; gasta SIEMPRE una tirada (SPECIAL_RNG_DRAWS)
 * - quality: 'low' | 'medium' | 'high', preset del laboratorio ({ level }), { lod } o 0/1/2
 * - opts: { variant?: 0..3 (saguaro de 2, de 1, de 3 brazos, nopal), flower?: bool, body?: hex, pad?: hex, fruit?: hex }
 */
export function makeCactus(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const palette = cactusPalette(opts);
  const plan = planCactus(ownRng(rng), opts);
  const { built, state } = fitCactus(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.cactus = {
    variant: plan.variant,
    name: plan.name,
    level,
    height: plan.nopal ? nopalPads(plan).reduce((m, p) => Math.max(m, p.c0.y + p.b), 0) : plan.h,
    triangles: built.tris,
    arms: plan.arms.length,
    // punta de cada brazo (la cúpula) y altura de donde sale del tronco: los brazos salen horizontales y SUBEN (u > 0)
    armTips: plan.arms.map((arm) => {
      const k = (arm.y0 / plan.h) ** 2, e = 0.3 * plan.r0 + arm.d;
      return { x: plan.cx * k + Math.cos(arm.a) * e, y: arm.y0 + arm.u + arm.r * 0.9, z: plan.cz * k + Math.sin(arm.a) * e, from: arm.y0, r: arm.r };
    }),
    ribs: plan.ribs,
    flowers: state.flowers ? plan.flowers.filter((f) => f >= 0).length : 0,
    pads: plan.nopal ? 3 + plan.nopal.grand.length : 0,
  };
  return g;
}

// =====================================================================================
// ÁRBOL SECO
// =====================================================================================

const DEAD_DETAIL = {
  low: { trunk: [6, 8], br: [4, 3], sub: true, cap: 1, root: [4, 4] },
  medium: { trunk: [8, 11], br: [6, 5], sub: true, cap: 2, root: [6, 6] },
  high: { trunk: [11, 16], br: [8, 7], sub: true, cap: 2, root: [8, 8] },
};
const DEAD_FORMS = [
  { name: 'muerto en pie', nb: 5, h: [2.8, 3.4], r0: [0.1, 0.13], curl: [0.05, 0.12], turns: [0.5, 1], el: [0.5, 1.0], L: [0.7, 1.3], bend: [0.1, 0.3], broken: false, flare: 0.55 },
  { name: 'retorcido', nb: 4, h: [2.2, 2.8], r0: [0.12, 0.15], curl: [0.18, 0.3], turns: [1.4, 2.2], el: [0.7, 1.3], L: [0.6, 1.1], bend: [0.3, 0.6], broken: false, flare: 0.6 },
  { name: 'partido', nb: 3, h: [1.6, 2.2], r0: [0.12, 0.16], curl: [0.04, 0.1], turns: [0.4, 0.9], el: [0.9, 1.4], L: [0.5, 0.9], bend: [0.05, 0.25], broken: true, flare: 0.5 },
  { name: 'tocón con raíces', nb: 0, h: [0.35, 0.55], r0: [0.2, 0.28], curl: [0, 0.02], turns: [0, 0], el: [0, 0], L: [0, 0], bend: [0, 0], broken: false, flare: 1.1 },
];

function planDead(rng, opts) {
  const nx = drawer(rng, 112);
  const variant = pickVariant(opts, DEAD_TREE_VARIANTS, nx());
  const F = DEAD_FORMS[variant];
  const p0 = nx() * TAU;
  const tint = (nx() - 0.5) * 0.08;
  const h = range(nx, F.h);
  const r0 = range(nx, F.r0);
  const lean = nx() * 0.35, la = nx() * TAU;
  const curl = range(nx, F.curl), turns = range(nx, F.turns), ph = nx() * TAU;
  const cut = [nx(), nx(), nx()].map((v) => lerp(0.12, 0.38, v));
  const cutRoll = nx();
  const branches = [];
  for (let i = 0; i < 6; i++) {
    const d = { tb: lerp(0.32, 0.88, (i + nx() * 0.8) / 6.4), a: nx() * TAU, el: range(nx, F.el), L: range(nx, F.L), bend: range(nx, F.bend), wob: (nx() - 0.5) * 0.6, sub: { s: lerp(0.35, 0.65, nx()), da: (nx() < 0.5 ? -1 : 1) * lerp(0.7, 1.3, nx()), L: lerp(0.35, 0.55, nx()), el: lerp(0.5, 1.0, nx()) }, ph: nx() * TAU };
    if (i < F.nb) branches.push(d);
  }
  const roots = [];
  for (let i = 0; i < 6; i++) {
    const r = { a: ((i + (nx() - 0.5) * 0.6) / 5) * TAU, L: lerp(0.45, 0.85, nx()), y: lerp(0.1, 0.22, nx()), r: lerp(0.06, 0.09, nx()) };
    if (i < 5) roots.push(r);
  }
  const leanDir = [Math.cos(la), Math.sin(la)];
  const at = (t) => {
    const th = TAU * (turns * t) + ph;
    const ramp = Math.sin((Math.PI / 2) * Math.min(1, t * 1.4));
    return new THREE.Vector3(leanDir[0] * lean * t * t + curl * ramp * (Math.cos(th) - Math.cos(ph)), h * t - 0.04, leanDir[1] * lean * t * t + curl * ramp * (Math.sin(th) - Math.sin(ph)));
  };
  const trunk = { at, tangent: (t, out) => out.copy(at(Math.min(1, t + 1e-3))).sub(at(Math.max(0, t - 1e-3))).normalize() };
  return { variant, name: F.name, p0, tint, h, r0, flare: F.flare, broken: F.broken || (variant < 2 && opts.broken === true), stump: variant === 3, cut, cutRoll, branches, roots, trunk };
}

function buildDead(plan, level, palette, state, count = false) {
  const b = new TriBuilder(plan.p0, count);
  const tn = plan.tint;
  const bark = palette.bark.clone().offsetHSL(0, 0, tn);
  const noise = (p) => 0.92 + 0.08 * Math.sin(p.y * 23 + p.x * 11 + p.z * 7);
  const woody = (p, s, bleach = 0.0) => bark.clone().lerp(palette.bleach, bleach).multiplyScalar((0.62 + 0.38 * smooth(0, 0.45, p.y)) * noise(p) * s);
  // tronco
  const rAt = (t) => plan.r0 * (1 - (plan.stump ? 0.18 : 0.62) * t) * (1 + plan.flare * Math.max(0, 1 - t / (plan.stump ? 0.55 : 0.14)) ** 2);
  const rings = tube(b, plan.trunk, rAt, state.trunk[0], state.trunk[1], count ? () => null : (p, t) => woody(p, 1, 0.55 * smooth(0.55, 1, t) * (plan.stump ? 0 : 1)));
  // cierre de la punta: corte plano (con anillos de crecimiento) o astillas
  const top = rings[rings.length - 1];
  const Ttop = plan.trunk.tangent(1, new THREE.Vector3());
  const ctr = plan.trunk.at(1);
  const cutCol = palette.cut.clone();
  const M = top.length;
  const flat = (p) => ({ p, n: Ttop.clone(), c: null, w: 0 });
  if (plan.broken) {
    // astillas: tres picos de distinta altura repartidos por el borde
    const peaks = plan.cut.map((hgt, j) => ctr.clone().addScaledVector(Ttop, hgt).addScaledVector(new THREE.Vector3(Math.cos(j * 2.1 + plan.p0), 0, Math.sin(j * 2.1 + plan.p0)), plan.r0 * 0.25));
    for (let k = 0; k < M; k++) {
      const pk = peaks[Math.floor((k * 3) / M)];
      const A = top[k], B = top[(k + 1) % M];
      if (count) {
        b.tri(A, B, { p: pk }, plan.p0);
        continue;
      }
      const fn = new THREE.Vector3().crossVectors(B.p.clone().sub(A.p), pk.clone().sub(A.p)).normalize();
      if (fn.dot(A.p.clone().sub(ctr)) < 0) fn.negate();
      const mk = (q, cc) => ({ p: q, n: fn.clone().lerp(Ttop, 0.3).normalize(), c: cc, w: 0 });
      b.tri(mk(A.p, cutCol.clone().multiplyScalar(0.8)), mk(B.p, cutCol.clone().multiplyScalar(0.8)), mk(pk, cutCol.clone().lerp(new THREE.Color(0xffffff), 0.15)), plan.p0, fn);
    }
  } else {
    const cover = (v, mul) => (count ? v : { ...v, n: Ttop.clone(), c: cutCol.clone().multiplyScalar(mul), w: 0 });
    const c0 = cover({ p: ctr }, 1);
    if (state.cap >= 2 && plan.stump) {
      // anillos de crecimiento: un anillo intermedio más oscuro entre el borde y el centro
      const mid = top.map((v) => cover({ p: ctr.clone().lerp(v.p, 0.55) }, 0.74));
      const edge = top.map((v) => cover(v, 0.92));
      for (let k = 0; k < M; k++) {
        b.tri(c0, mid[k], mid[(k + 1) % M], plan.p0, Ttop);
        b.tri(mid[k], edge[k], mid[(k + 1) % M], plan.p0, Ttop);
        b.tri(mid[(k + 1) % M], edge[k], edge[(k + 1) % M], plan.p0, Ttop);
      }
    } else {
      for (let k = 0; k < M; k++) b.tri(c0, cover(top[k], plan.stump ? 0.9 : 0.8), cover(top[(k + 1) % M], plan.stump ? 0.9 : 0.8), plan.p0, Ttop);
    }
  }
  // ramas (y una subrama cada una)
  const bt = new THREE.Vector3();
  const branchCurve = (P0, dir, L, bend, wob, ph) => {
    const side = new THREE.Vector3().crossVectors(dir, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const at = (s) => P0.clone().addScaledVector(dir, L * s).addScaledVector(UP, bend * L * s * s).addScaledVector(side, wob * L * Math.sin(2 * Math.PI * 0.8 * s + ph) * s);
    return { at, tangent: (s, out) => out.copy(at(Math.min(1, s + 1e-3))).sub(at(Math.max(0, s - 1e-3))).normalize() };
  };
  for (const br of plan.branches) {
    const P0 = plan.trunk.at(br.tb).addScaledVector(new THREE.Vector3(Math.cos(br.a), 0, Math.sin(br.a)), -plan.r0 * 0.2);
    const dir = new THREE.Vector3(Math.cos(br.a) * Math.sin(br.el), Math.cos(br.el), Math.sin(br.a) * Math.sin(br.el)).normalize();
    const rb = rAt(br.tb) * 0.5;
    const curve = branchCurve(P0, dir, br.L * (1.1 - 0.4 * br.tb), br.bend, br.wob, br.ph);
    const shade = count ? () => null : (p, s) => woody(p, 1, 0.5 * smooth(0.3, 1, s));
    tube(b, curve, (s) => rb * (1 - 0.85 * s) + 0.004, state.br[0], state.br[1], shade);
    if (state.sub) {
      const Q0 = curve.at(br.sub.s);
      curve.tangent(br.sub.s, bt);
      const sd = bt.clone().applyAxisAngle(UP, br.sub.da).multiplyScalar(0.55).addScaledVector(UP, 0.7 * br.sub.el).normalize();
      const sc = branchCurve(Q0, sd, br.L * br.sub.L, br.bend * 0.6, -br.wob, br.ph + 1);
      const rs = rb * (1 - 0.85 * br.sub.s) * 0.62;
      tube(b, sc, (s) => rs * (1 - 0.85 * s) + 0.003, Math.max(3, state.br[0] - 1), Math.max(1, state.br[1] - 1), count ? () => null : (p, s) => woody(p, 1, 0.55 * smooth(0.2, 1, s)));
    }
  }
  // raíces del tocón: salen del pie, se abren y se hunden en el suelo
  if (plan.stump) {
    for (const r of plan.roots) {
      const dir = new THREE.Vector3(Math.cos(r.a), 0, Math.sin(r.a));
      const P0 = dir.clone().multiplyScalar(plan.r0 * 0.5).setY(r.y);
      const curve = { at: (s) => P0.clone().addScaledVector(dir, r.L * s).addScaledVector(UP, -(r.y + 0.04) * s ** 1.6), tangent: (s, out) => out.copy(curve.at(Math.min(1, s + 1e-3))).sub(curve.at(Math.max(0, s - 1e-3))).normalize() };
      tube(b, curve, (s) => r.r * (1 - 0.7 * s) + 0.005, state.root[0], state.root[1], count ? () => null : (p, s) => woody(new THREE.Vector3(p.x, Math.max(0.4, p.y), p.z), 0.95, 0.12 * s));
    }
  }
  return {
    tris: b.tris,
    make() {
      const g = new THREE.Group();
      const m = new THREE.Mesh(b.geometry(), deadTreeMaterial());
      m.castShadow = true;
      g.add(m);
      return g;
    },
  };
}

function fitDead(plan, level, palette) {
  const D = DEAD_DETAIL[level];
  const budget = DEAD_TREE_BUDGET[level];
  const state = { trunk: plan.stump ? [D.trunk[0], Math.min(D.trunk[1], 4)] : [...D.trunk], br: [...D.br], sub: D.sub, cap: D.cap, root: [...D.root] };
  for (let guard = 0; guard < 96; guard++) {
    if (buildDead(plan, level, palette, state, true).tris <= budget) break;
    if (state.br[1] > 1) state.br[1]--;
    else if (state.root[1] > 2) state.root[1]--;
    else if (state.trunk[1] > 3) state.trunk[1]--;
    else if (state.sub) state.sub = false;
    else if (state.br[0] > 3) state.br[0]--;
    else if (state.root[0] > 3) state.root[0]--;
    else if (state.trunk[0] > 4) state.trunk[0]--;
    else break;
  }
  return { built: buildDead(plan, level, palette, state), state };
}

/**
 * Árbol seco liso. Devuelve un Group en el origen (base en y = 0) con userData.swayRoot y una malla.
 * - rng: generador con semilla; gasta SIEMPRE una tirada (SPECIAL_RNG_DRAWS)
 * - quality: 'low' | 'medium' | 'high', preset del laboratorio ({ level }), { lod } o 0/1/2
 * - opts: { variant?: 0..3 (en pie, retorcido, partido, tocón), bark?: hex, bleach?: hex, cut?: hex, broken?: bool }
 */
export function makeDeadTree(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const palette = {
    bark: new THREE.Color(opts.bark ?? DEAD_DEFAULTS.bark),
    bleach: new THREE.Color(opts.bleach ?? DEAD_DEFAULTS.bleach),
    cut: new THREE.Color(opts.cut ?? DEAD_DEFAULTS.cut),
  };
  const plan = planDead(ownRng(rng), opts);
  const { built, state } = fitDead(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.deadTree = {
    variant: plan.variant,
    name: plan.name,
    level,
    height: plan.h,
    triangles: built.tris,
    branches: plan.branches.length,
    roots: plan.stump ? plan.roots.length : 0,
    subBranches: state.sub ? plan.branches.length : 0,
    broken: plan.broken,
  };
  return g;
}
