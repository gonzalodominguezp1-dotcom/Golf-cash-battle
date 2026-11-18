import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, lerp, smooth, treeLevel, withRim, vertexLambert, TriBuilder } from './treeKit.js';

// Arbusto del estilo liso (paso 4 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// Misma familia que la copa del árbol redondo, pero baja y ancha: 2-4 racimos lisos
// (icosaedros con abolladura suave) pegados al suelo, sin tronco. Una sola malla.
// - Normales «esferizadas»: cada vértice mira desde el centro de su racimo, mezclado
//   con el centro del arbusto (luz suave, estilo cartoon, sin flatShading).
// - Oclusión en el color de vértice: más oscuro abajo y hacia dentro; el tono de
//   arriba es algo más claro.
// - Luz de borde a contraluz en el sombreador.
// - Se quitan las caras que quedan dentro de otro racimo o bajo el suelo.
// - Viento suave (assets/wind.js, capa canopy con altura de referencia baja): cada
//   racimo se balancea con su fase y el borde aletea un poco. Los atributos de viento
//   ya vienen escritos: bakeStatic y prepareWind los respetan.
//
// Móvil primero: un único material compartido con el color en el vértice; tras
// bakeStatic, todos los arbustos son una llamada de dibujo. Presupuesto por arbusto
// en SHRUB_BUDGET. Todas las tiradas salen del rng recibido y no dependen de la
// calidad ni de la variante: misma semilla, mismo arbusto en Bajo, Medio y Alto.

export const SHRUB_BUDGET = { low: 120, medium: 300, high: 600 };
export const SHRUB_VARIANTS = 3;
export const SHRUB_DEFAULTS = { leaves: [0x4caf3c, 0x3f9f45, 0x66bd3f, 0x2f8f3f] };
export const SHRUB_WIND_HEIGHT = 1.2; // altura de referencia del viento (m): un arbusto de ~0,7 m se mece unos centímetros

// icosaedro de cada racimo por calidad: [principal, resto]; min = hasta dónde baja el ajuste
const DETAIL = {
  low: { main: 1, rest: 0, min: 0 },
  medium: { main: 2, rest: 1, min: 0 },
  high: { main: 3, rest: 2, min: 1 },
};

const MAX_LUMPS = 4;
const BUMP = 0.07; // abolladura de los racimos (fracción del radio)
const CULL = 0.8; // una cara se quita si está dentro del 80 % de otro racimo
const GROUND = -0.03; // una cara con los tres vértices por debajo no se ve

// forma de cada variante: racimos { rad: distancia al centro (fracción), r: radio, sy: aplastado }
const VARIANTS = [
  // 0 · redondo: bola con dos lóbulos a los lados
  { name: 'redondo', lumps: [{ rad: [0, 0.05], r: [0.4, 0.46], sy: [0.8, 0.9] }, { rad: [0.5, 0.62], r: [0.28, 0.33], sy: [0.78, 0.88] }, { rad: [0.5, 0.62], r: [0.26, 0.31], sy: [0.78, 0.88] }] },
  // 1 · ancho y bajo: tres racimos en fila, casi pegados al suelo
  { name: 'ancho', lumps: [{ rad: [0, 0.05], r: [0.34, 0.4], sy: [0.58, 0.68] }, { rad: [0.7, 0.8], r: [0.3, 0.36], sy: [0.55, 0.65] }, { rad: [0.7, 0.8], r: [0.28, 0.34], sy: [0.55, 0.65] }] },
  // 2 · mata: racimo alto en medio y tres pequeños alrededor
  { name: 'mata', lumps: [{ rad: [0, 0.05], r: [0.3, 0.35], sy: [1.1, 1.25] }, { rad: [0.5, 0.58], r: [0.24, 0.28], sy: [0.85, 0.95] }, { rad: [0.5, 0.58], r: [0.22, 0.26], sy: [0.85, 0.95] }, { rad: [0.45, 0.55], r: [0.18, 0.22], sy: [0.8, 0.9] }] },
];

// ---------- material (compartido por todos los arbustos) ----------

let MAT = null;
/** El mismo para todos los arbustos. */
export function shrubMaterial() {
  if (MAT) return MAT;
  MAT = applyWind(withRim(vertexLambert(), 0.55), { layer: 'canopy', height: SHRUB_WIND_HEIGHT });
  return MAT;
}

// ---------- plan: todas las tiradas del rng (no dependen de la calidad) ----------

function planShrub(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % SHRUB_VARIANTS) + SHRUB_VARIANTS) % SHRUB_VARIANTS : Math.floor(vr * SHRUB_VARIANTS);
  const V = VARIANTS[variant];
  const p0 = rng() * TAU;
  const leafPick = rng();
  const a0 = rng() * TAU;
  const lumps = [];
  for (let i = 0; i < MAX_LUMPS; i++) {
    // siempre las mismas tiradas por racimo, haya o no racimo en esta variante
    const u = [rng(), rng(), rng(), rng(), rng(), rng(), rng()];
    const waves = Array.from({ length: 3 }, () => ({
      d: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
      f: 2.4 * (0.7 + rng() * 0.8),
      ph: rng() * TAU,
    }));
    const S = V.lumps[i];
    if (!S) continue;
    const r = lerp(S.r[0], S.r[1], u[0]);
    const sy = lerp(S.sy[0], S.sy[1], u[1]);
    const rad = lerp(S.rad[0], S.rad[1], u[2]);
    const az = i === 0 ? u[3] * TAU : a0 + ((i - 1) / (V.lumps.length - 1)) * TAU + (u[3] - 0.5) * 0.7;
    const c = new THREE.Vector3(Math.cos(az) * rad, 0, Math.sin(az) * rad);
    c.y = r * sy * 0.62; // el racimo se hunde un poco en el suelo
    lumps.push({ c, r, sy, waves, phase: p0 + (u[4] - 0.5) * 0.9, tint: { h: (u[5] - 0.5) * 0.03, l: (u[6] - 0.5) * 0.07 }, main: i === 0 });
  }
  return { variant, name: V.name, p0, leafPick, lumps };
}

function shrubCenter(lumps) {
  const c = new THREE.Vector3();
  let w = 0;
  for (const cl of lumps) {
    const k = cl.r ** 3 * cl.sy;
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

function inside(p, cl, shrink) {
  const x = (p.x - cl.c.x) / cl.r, y = (p.y - cl.c.y) / (cl.r * cl.sy), z = (p.z - cl.c.z) / cl.r;
  return x * x + y * y + z * z < shrink * shrink;
}

/** Una cara se quita si está bajo el suelo o sus tres vértices caen dentro de un mismo racimo. */
const hidden = (tri, lumps, skip) => tri.every((v) => v.p.y < GROUND) || lumps.some((cl) => cl !== skip && tri.every((v) => inside(v.p, cl, CULL)));

function build(plan, palette, state, count = false) {
  const lumps = plan.lumps.filter((_, i) => state.include[i]);
  const cc = shrubCenter(lumps);
  let yMax = 0, R = 0;
  for (const cl of lumps) {
    yMax = Math.max(yMax, cl.c.y + cl.r * cl.sy);
    R = Math.max(R, Math.hypot(cl.c.x - cc.x, cl.c.z - cc.z) + cl.r);
  }
  const leaves = palette.leaves.length ? palette.leaves : SHRUB_DEFAULTS.leaves;
  const leafBase = new THREE.Color(leaves[Math.floor(plan.leafPick * leaves.length) % leaves.length]);
  const topTint = (base) => base.clone().offsetHSL(-0.025, 0.02, 0.08);
  const shade = (p, n, base) => {
    const h = Math.max(0, Math.min(1, p.y / Math.max(1e-6, yMax)));
    const dc = Math.min(1.2, Math.hypot(p.x - cc.x, p.z - cc.z) / Math.max(1e-6, R));
    // oclusión: abajo y dentro, más oscuro; la cara de abajo un poco más
    let ao = 0.4 + 0.38 * smooth(0, 1, h) + 0.22 * smooth(0.3, 0.95, dc);
    if (n.y < 0) ao *= 1 + 0.25 * n.y;
    const c = base.clone().lerp(topTint(base), 0.6 * smooth(0.5, 1, h));
    return { c: c.multiplyScalar(Math.max(0.24, Math.min(1, ao))), w: 0.25 + 0.75 * smooth(0.3, 1, h) };
  };
  const spherize = (p, cl, out = new THREE.Vector3()) => {
    out.set((p.x - cl.c.x) / (cl.r * cl.r), (p.y - cl.c.y) / (cl.r * cl.sy) ** 2, (p.z - cl.c.z) / (cl.r * cl.r)).normalize();
    const g = p.clone().sub(cc);
    if (g.lengthSq() > 1e-8) out.multiplyScalar(0.7).addScaledVector(g.normalize(), 0.3);
    return out.normalize();
  };

  const lb = new TriBuilder(plan.p0, count);
  const d = new THREE.Vector3();
  plan.lumps.forEach((cl, i) => {
    if (!state.include[i]) return;
    const unit = unitIco(state.ico[i]);
    const base = count ? null : leafBase.clone().offsetHSL(cl.tint.h, 0, cl.tint.l);
    for (let f = 0; f < unit.length; f += 9) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        d.fromArray(unit, f + k * 3);
        let bump = 0;
        for (const w of cl.waves) bump += Math.sin(d.dot(w.d) * w.f + w.ph);
        const s = 1 + (bump / cl.waves.length) * BUMP;
        tri.push({ p: new THREE.Vector3(cl.c.x + d.x * cl.r * s, cl.c.y + d.y * cl.r * cl.sy * s, cl.c.z + d.z * cl.r * s) });
      }
      if (hidden(tri, lumps, cl)) continue;
      if (count) {
        lb.n += 3;
        continue;
      }
      for (const v of tri) {
        v.n = spherize(v.p, cl);
        const { c, w } = shade(v.p, v.n, base);
        v.c = c;
        v.w = w;
      }
      lb.tri(tri[0], tri[1], tri[2], cl.phase);
    }
  });

  return {
    tris: lb.tris,
    make() {
      const g = new THREE.Group();
      if (lb.tris) {
        const m = new THREE.Mesh(lb.geometry(), shrubMaterial());
        m.castShadow = true;
        g.add(m);
      }
      return g;
    },
  };
}

/**
 * Ajusta el arbusto al presupuesto sin tirar más del rng: primero baja el detalle de
 * los racimos pequeños, luego quita el más pequeño que no sea el principal.
 */
function fit(plan, level, palette) {
  const D = DETAIL[level];
  const budget = SHRUB_BUDGET[level];
  const state = { include: plan.lumps.map(() => true), ico: plan.lumps.map((cl) => (cl.main ? D.main : D.rest)) };
  const smallest = (ok) => {
    let best = -1;
    plan.lumps.forEach((cl, i) => {
      if (state.include[i] && ok(cl, i) && (best < 0 || cl.r < plan.lumps[best].r)) best = i;
    });
    return best;
  };
  for (let guard = 0; guard < 32; guard++) {
    if (build(plan, palette, state, true).tris <= budget) break;
    const maxIco = Math.max(...state.ico.filter((_, i) => state.include[i]));
    const down = maxIco > D.min ? smallest((_, i) => state.ico[i] === maxIco) : -1;
    if (down >= 0) {
      state.ico[down]--;
      continue;
    }
    const drop = smallest((cl) => !cl.main);
    if (drop < 0) break;
    state.include[drop] = false;
  }
  return { built: build(plan, palette, state), state };
}

/**
 * Arbusto liso. Devuelve un Group en el origen (base en y = 0, ~0,5-0,9 m de alto,
 * ~1 m de ancho) con userData.swayRoot; quien lo usa lo coloca, gira y escala.
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level, theme? }), { lod } o 0/1/2
 * - opts: { variant?: 0..2, leaves?: [hex], theme?: { leaves } }
 *   Paleta: opts.leaves, si no opts.theme o quality.theme, si no SHRUB_DEFAULTS.
 */
export function makeShrub(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const qt = quality && typeof quality === 'object' ? quality.theme : undefined;
  const palette = { leaves: opts.leaves ?? opts.theme?.leaves ?? qt?.leaves ?? SHRUB_DEFAULTS.leaves };
  const plan = planShrub(rng, opts);
  const { built, state } = fit(plan, level, palette);
  const g = built.make();
  g.userData.swayRoot = true;
  g.userData.shrub = {
    variant: plan.variant,
    name: plan.name,
    level,
    triangles: built.tris,
    lumps: plan.lumps.filter((_, i) => state.include[i]).map((cl) => ({ center: cl.c.toArray(), r: cl.r, sy: cl.sy })),
    allLumps: plan.lumps.map((cl) => ({ center: cl.c.toArray(), r: cl.r, sy: cl.sy, phase: cl.phase })),
  };
  return g;
}
