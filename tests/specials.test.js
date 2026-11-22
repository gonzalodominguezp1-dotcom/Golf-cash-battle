import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  makeSnowPine, makeCactus, makeDeadTree, cactusMaterial, deadTreeMaterial,
  SPECIAL_BUDGET, SPECIAL_RNG_DRAWS, SNOW_PINE_VARIANTS, CACTUS_VARIANTS, DEAD_TREE_VARIANTS, CACTUS_WIND, DEAD_WIND,
} from '../src/game/render/assets/specials.js';
import { pineMaterials } from '../src/game/render/assets/pine.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial, windDisplacement } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

// Especiales del estilo liso (paso 9): pino nevado, cactus y árbol seco. Ver assets/specials.js.

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 5 + i * 7919);
const MAKERS = {
  snow: (seed, level = 'medium', opts = {}) => makeSnowPine(seededRng(seed), level, opts),
  cactus: (seed, level = 'medium', opts = {}) => makeCactus(seededRng(seed), level, opts),
  dead: (seed, level = 'medium', opts = {}) => makeDeadTree(seededRng(seed), level, opts),
};
const VARIANTS = { snow: SNOW_PINE_VARIANTS, cactus: CACTUS_VARIANTS, dead: DEAD_TREE_VARIANTS };
const INFO = { snow: 'snowPine', cactus: 'cactus', dead: 'deadTree' };
const DRAW_CALLS = { snow: 2, cactus: 1, dead: 1 };
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);
const canopyOf = (g) => meshesOf(g).find((m) => m.material === pineMaterials().canopy);

test('presupuesto: 250 / 600 / 1200 triángulos por calidad en todas las variantes y semillas (y se aprovecha)', () => {
  assert.deepEqual(SPECIAL_BUDGET, { low: 250, medium: 600, high: 1200 });
  for (const [name, mk] of Object.entries(MAKERS)) {
    for (const level of LEVELS) {
      for (let variant = 0; variant < VARIANTS[name]; variant++) {
        for (const seed of SEEDS) {
          const g = mk(seed, level, { variant });
          const n = tris(g);
          assert.ok(n <= SPECIAL_BUDGET[level], `${name} ${level} v${variant} s${seed}: ${n} tri`);
          assert.ok(n >= SPECIAL_BUDGET[level] * 0.4, `${name} ${level} v${variant} s${seed}: solo ${n} tri`);
          assert.equal(g.userData[INFO[name]].triangles, n);
          assert.equal(meshesOf(g).length, DRAW_CALLS[name], `${name}: llamadas de dibujo`);
        }
      }
    }
  }
});

test('más calidad, más triángulos (misma semilla y variante)', () => {
  for (const [name, mk] of Object.entries(MAKERS)) {
    for (let variant = 0; variant < VARIANTS[name]; variant++) {
      for (const seed of SEEDS.slice(0, 5)) {
        const [lo, me, hi] = LEVELS.map((l) => tris(mk(seed, l, { variant })));
        assert.ok(lo < me && me < hi, `${name} v${variant} s${seed}: ${lo} / ${me} / ${hi}`);
      }
    }
  }
});

test('determinismo y tiradas fijas: una sola tirada del rng, misma forma en las tres calidades', () => {
  assert.equal(SPECIAL_RNG_DRAWS, 1);
  for (const [name, mk] of Object.entries(MAKERS)) {
    for (const level of LEVELS) {
      const a = meshesOf(mk(5, level)), b = meshesOf(mk(5, level));
      assert.equal(a.length, b.length);
      a.forEach((m, i) => {
        for (const k of Object.keys(m.geometry.attributes)) assert.deepEqual(m.geometry.attributes[k].array, b[i].geometry.attributes[k].array, `${name} ${level} ${k}`);
      });
    }
    // gasta SIEMPRE una tirada, sea cual sea la variante o la calidad
    for (let variant = -1; variant < VARIANTS[name]; variant++) {
      for (const level of LEVELS) {
        let draws = 0;
        const r = seededRng(77);
        mk.call(null, 0, level); // calienta (no cuenta)
        const rng = () => (draws++, r());
        (name === 'snow' ? makeSnowPine : name === 'cactus' ? makeCactus : makeDeadTree)(rng, level, variant < 0 ? {} : { variant });
        assert.equal(draws, 1, `${name} ${level} v${variant}: ${draws} tiradas`);
      }
    }
    for (const seed of SEEDS.slice(0, 10)) {
      const sizes = LEVELS.map((l) => new THREE.Box3().setFromObject(mk(seed, l)).getSize(new THREE.Vector3()));
      const infos = LEVELS.map((l) => mk(seed, l).userData[INFO[name]]);
      for (const k of [1, 2]) {
        assert.equal(infos[k].variant, infos[0].variant);
        assert.ok(sizes[k].distanceTo(sizes[2]) < 0.45, `${name} s${seed}: ${sizes[k].toArray()} vs ${sizes[2].toArray()}`);
      }
    }
    // la semilla elige entre todas las variantes
    assert.equal(new Set(SEEDS.map((s) => mk(s).userData[INFO[name]].variant)).size, VARIANTS[name]);
  }
});

test('sin NaN, normales unitarias, caras hacia fuera y atributos de viento completos (barrido de semillas)', () => {
  for (const [name, mk] of Object.entries(MAKERS)) {
    for (const level of LEVELS) {
      for (let variant = 0; variant < VARIANTS[name]; variant++) {
        for (const seed of SEEDS.slice(0, 12)) {
          const g = mk(seed, level, { variant });
          assert.equal(g.userData.swayRoot, true);
          for (const m of meshesOf(g)) {
            const at = m.geometry.attributes;
            for (const [k, a] of Object.entries(at)) for (const v of a.array) assert.ok(Number.isFinite(v), `${name} ${level} v${variant} s${seed} ${k} NaN`);
            for (const k of WIND_ATTRS) assert.equal(at[k]?.itemSize, WIND_ATTR_SIZES[k], `falta ${k}`);
            assert.ok(at.color && at.normal);
            assert.equal(at.uv, undefined);
            for (let i = 0; i < at.normal.count; i++) {
              const l = Math.hypot(at.normal.getX(i), at.normal.getY(i), at.normal.getZ(i));
              assert.ok(Math.abs(l - 1) < 1e-4, `${name} normal ${l}`);
            }
            const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
            let bad = 0;
            for (let i = 0; i < at.position.count; i += 3) {
              A.fromBufferAttribute(at.position, i);
              B.fromBufferAttribute(at.position, i + 1).sub(A);
              C.fromBufferAttribute(at.position, i + 2).sub(A);
              N.set(0, 0, 0);
              for (let k = 0; k < 3; k++) N.add(new THREE.Vector3().fromBufferAttribute(at.normal, i + k));
              if (B.cross(C).dot(N) < -1e-9) bad++;
            }
            assert.equal(bad, 0, `${name} ${level} v${variant} s${seed}: ${bad} caras del revés`);
            // sway = altura del vértice; la nieve lleva la de la falda que cubre (hasta 12 cm de diferencia: gorra, grosor, borde que cae)
            const from = name === 'snow' && m.material === pineMaterials().canopy ? g.userData.snowPine.snowFrom : at.sway.count;
            for (let i = 0; i < at.sway.count; i++) assert.ok(Math.abs(at.sway.getX(i) - Math.max(0, at.position.getY(i))) < (i < from ? 1e-5 : 0.12), `sway ${i}`);
          }
        }
      }
    }
  }
});

test('calidad como nombre, preset del laboratorio o lod', () => {
  for (const mk of [makeSnowPine, makeCactus, makeDeadTree]) {
    for (const [i, level] of LEVELS.entries()) {
      const n = tris(mk(seededRng(9), level));
      assert.equal(tris(mk(seededRng(9), { level })), n);
      assert.equal(tris(mk(seededRng(9), { lod: i })), n);
      assert.equal(tris(mk(seededRng(9), i)), n);
    }
    assert.equal(tris(mk(seededRng(9), 'nope')), tris(mk(seededRng(9), 'medium')));
    assert.equal(tris(mk(seededRng(9))), tris(mk(seededRng(9), 'medium')));
  }
});

// ---------- pino nevado ----------

test('pino nevado: la nieve cubre solo caras que miran hacia arriba y es blanca azulada', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 8)) {
        const g = MAKERS.snow(seed, level, { variant });
        const info = g.userData.snowPine;
        assert.ok(info.snowTriangles >= info.tiers.length * 6, `${level} v${variant}: ${info.snowTriangles} triángulos de nieve`);
        assert.equal(info.pineTriangles + info.snowTriangles, info.triangles);
        const { position: p, normal: n, color: c, windFlutter: w } = canopyOf(g).geometry.attributes;
        assert.equal(p.count, (info.pineTriangles - tris(g) + tris(g)) * 0 + info.snowFrom + info.snowTriangles * 3);
        const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
        for (let i = info.snowFrom; i < p.count; i++) {
          assert.ok(n.getY(i) >= 0.3, `${level} v${variant} s${seed}: normal de nieve y=${n.getY(i).toFixed(2)}`);
          // blanca azulada y clara
          assert.ok(c.getZ(i) >= c.getX(i) - 1e-6 && c.getZ(i) >= c.getY(i) - 1e-6, 'azulada');
          assert.ok(lum(c, i) > 1.5, `nieve oscura: ${lum(c, i).toFixed(2)}`);
          assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1, 'peso de aleteo fuera de 0..1');
        }
        for (let i = info.snowFrom; i < p.count; i += 3) {
          A.fromBufferAttribute(p, i);
          B.fromBufferAttribute(p, i + 1).sub(A);
          C.fromBufferAttribute(p, i + 2).sub(A);
          const fn = B.cross(C).normalize();
          assert.ok(fn.y > 0.05, `${level} v${variant} s${seed}: cara de nieve inclinada hacia abajo (${fn.y.toFixed(2)})`);
        }
      }
    }
  }
});

test('pino nevado: capa por piso, gorra en la punta y las agujas siguen verdes por debajo', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      const g = MAKERS.snow(11, level, { variant });
      const info = g.userData.snowPine;
      const { position: p, color: c } = canopyOf(g).geometry.attributes;
      // cada piso lleva nieve (algún vértice de nieve dentro de su radio y entre su borde y su cima)
      for (const T of info.tiers) {
        let found = false;
        for (let i = info.snowFrom; i < p.count && !found; i++) found = Math.hypot(p.getX(i) - T.x, p.getZ(i) - T.z) < T.r * 1.05 && p.getY(i) > T.rim - 0.15 && p.getY(i) < T.top + 0.15;
        assert.ok(found, `${level} v${variant}: piso sin nieve`);
      }
      // gorra: lo más alto de la nieve pasa de la punta del último piso
      const tip = info.tiers.at(-1);
      let maxY = -1;
      for (let i = info.snowFrom; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
      assert.ok(maxY > tip.top + 0.015, `${level} v${variant}: sin gorra (${maxY.toFixed(2)} vs ${tip.top.toFixed(2)})`);
      // borde que cuelga: algún vértice de nieve sale del radio del piso y baja de su borde (Medio/Alto)
      if (level !== 'low') {
        let lip = false;
        for (let i = info.snowFrom; i < p.count && !lip; i++) for (const T of info.tiers) if (Math.hypot(p.getX(i) - T.x, p.getZ(i) - T.z) > T.r * 1.02 && p.getY(i) < T.rim + 0.02) lip = true;
        assert.ok(lip, `${level} v${variant}: sin borde que cae`);
      }
      // las ramas (antes de la nieve) son verdes: mucho más oscuras que la nieve y con el verde por encima del azul
      let needles = 0, snow = 0, green = 0;
      for (let i = 0; i < info.snowFrom; i++) {
        needles += lum(c, i) / info.snowFrom;
        if (c.getY(i) > c.getZ(i)) green++;
      }
      for (let i = info.snowFrom; i < p.count; i++) snow += lum(c, i) / (p.count - info.snowFrom);
      assert.ok(needles < snow * 0.6, `agujas ${needles.toFixed(2)} nieve ${snow.toFixed(2)}`);
      assert.ok(green > info.snowFrom * 0.6, 'las agujas no son verdes');
    }
  }
});

test('pino nevado: el pino de debajo es el mismo en las tres calidades y la nieve va con su piso (misma fase)', () => {
  for (const seed of SEEDS.slice(0, 6)) {
    const infos = LEVELS.map((l) => MAKERS.snow(seed, l).userData.snowPine);
    for (const k of [1, 2]) assert.deepEqual(infos[k].tiers, infos[0].tiers);
    const g = MAKERS.snow(seed, 'high');
    const { windPhase: ph, position: p } = canopyOf(g).geometry.attributes;
    const info = g.userData.snowPine;
    const phases = new Set();
    for (let i = 0; i < info.snowFrom; i++) phases.add(ph.getY(i));
    // toda la nieve lleva la fase de un piso del pino
    for (let i = info.snowFrom; i < p.count; i++) assert.ok(phases.has(ph.getY(i)), 'fase de nieve sin piso');
    assert.equal(ph.getX(info.snowFrom), ph.getX(0));
  }
});

test('pino nevado: usa los materiales del pino (viento y luz de borde) y opts.budget del pino se respeta', () => {
  const g = MAKERS.snow(3, 'high');
  const mats = meshesOf(g).map((m) => m.material);
  assert.deepEqual(mats.slice().sort((a, b) => a.id - b.id), Object.values(pineMaterials()).sort((a, b) => a.id - b.id));
  for (const m of mats) assert.ok(isWindMaterial(m));
  assert.deepEqual(mats.map((m) => m.userData.wind.layer).sort(), ['canopy', 'trunk']);
  for (const m of mats) {
    assert.equal(m.flatShading, false);
    assert.equal(m.vertexColors, true);
  }
});

test('pino nevado: paleta del tema y escarcha opcional en las agujas', () => {
  const mean = (g) => {
    const info = g.userData.snowPine;
    const a = canopyOf(g).geometry.attributes.color;
    const s = [0, 0, 0];
    for (let i = 0; i < info.snowFrom; i++) (s[0] += a.getX(i)), (s[1] += a.getY(i)), (s[2] += a.getZ(i));
    return s.map((v) => v / info.snowFrom);
  };
  const red = mean(MAKERS.snow(4, 'low', { leaves: [0xff2000] }));
  assert.ok(red[0] > red[1] * 2, 'hojas rojas');
  const themed = mean(makeSnowPine(seededRng(4), { level: 'low', theme: { leaves: [0xff2000] } }));
  assert.deepEqual(themed, red);
  const frosted = mean(MAKERS.snow(4, 'low', { snow: 1 })), dusty = mean(MAKERS.snow(4, 'low', { snow: 0 }));
  assert.ok(frosted[0] + frosted[1] + frosted[2] > dusty[0] + dusty[1] + dusty[2]);
});

// ---------- pino nevado: la nieve no deja ver el verde con el viento ----------
//
// Bug: «se ve la textura verde con el movimiento del viento». La nieve iba con aleteo 0 y la altura de viento de su
// propio vértice (elevado) mientras las agujas aleteaban (hasta 0,012 x fuerza por su peso) y se doblaban con la suya:
// con viento máximo se separaban hasta 16 cm (Bajo) y la nieve quedaba hasta 9 cm bajo las agujas. Ahora cada vértice
// de nieve se posa sobre un vértice de las agujas (mismo anillo, mismo ángulo) y hereda su fase, su peso de aleteo y su
// altura de viento. Métrica: desplazamiento relativo (m, 3D) entre cada vértice de nieve y el vértice de las agujas
// sobre el que está, con windDisplacement de wind.js (espejo exacto del sombreador) y el viento máximo
// (fuerza 2, dos ráfagas a tope, varias direcciones y tiempos).

const MAX_WINDS = [];
for (const [dirX, dirZ] of [[1, 0], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2]]) {
  for (const t of [0, 2.9, 7.7, 20.5]) for (const front of [-2, 3]) MAX_WINDS.push([t, { strength: 2, dirX, dirZ, gusts: [{ front, amp: 1 }, { front: front + 9, amp: 1 }], gustWidth: 7 }]);
}
const SNOW_REL = { median: 0.008, p90: 0.02, max: 0.06 }; // m
const SNOW_MIN_GAP = 0.008; // m: la nieve queda al menos 8 mm por encima de las agujas (elevación mínima)
const SNOW_MIN_LIFT = 0.024; // m: todo vértice de nieve (salvo el ápice) queda al menos a 24 mm de su vértice de agujas (medido: 26 mm)
const SNOW_MAX_SINK = 0.005; // m

/** Vértices del canopy como los lee el sombreador (altura de viento, fases, peso de aleteo). */
function canopyRig(g) {
  const info = g.userData.snowPine;
  const A = canopyOf(g).geometry.attributes;
  const V = Array.from({ length: A.position.count }, (_, i) => ({
    x: A.position.getX(i), y: A.position.getY(i), z: A.position.getZ(i), h: A.sway.getX(i), p0: A.windPhase.getX(i), p1: A.windPhase.getY(i), w: A.windFlutter.getX(i), ny: A.normal.getY(i),
  }));
  return { info, V, from: info.snowFrom };
}

/** Para cada vértice de nieve: el vértice de las agujas más cercano de su mismo piso (donde se posa). */
function anchors({ V, from }) {
  const byTier = new Map();
  for (let i = 0; i < from; i++) {
    if (!byTier.has(V[i].p1)) byTier.set(V[i].p1, []);
    byTier.get(V[i].p1).push(i);
  }
  const out = [];
  for (let i = from; i < V.length; i++) {
    let best = -1, bd = Infinity;
    for (const j of byTier.get(V[i].p1) ?? []) {
      const d = Math.hypot(V[i].x - V[j].x, V[i].y - V[j].y, V[i].z - V[j].z);
      if (d < bd) (bd = d), (best = j);
    }
    out.push({ i, j: best, d: bd });
  }
  return out;
}

/** Desplazamiento relativo (m) de cada vértice de nieve respecto a su vértice de las agujas, el peor de todos los vientos. */
function relativeMotion(rig, pairs, winds = MAX_WINDS) {
  const worst = new Float64Array(pairs.length);
  for (const [t, st] of winds) {
    const cache = new Map();
    const disp = (k) => {
      if (!cache.has(k)) cache.set(k, windDisplacement(rig.V[k], 'canopy', t, st));
      return cache.get(k);
    };
    pairs.forEach(({ i, j }, n) => {
      const a = disp(i), b = disp(j);
      worst[n] = Math.max(worst[n], Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    });
  }
  const s = Array.from(worst).sort((a, b) => a - b);
  return { median: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1] };
}

/**
 * Hundimiento estático: para cada vértice de nieve, la altura de la cara de arriba de las agujas de su piso justo
 * debajo (triángulos reales de la malla). gap = y de la nieve - y de las agujas (negativo = hundida).
 */
function staticGaps({ V, from }) {
  const tris = new Map();
  for (let i = 0; i < from; i += 3) {
    const [a, b, c] = [V[i], V[i + 1], V[i + 2]];
    if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) <= 0) continue; // solo la cara de arriba
    if (!tris.has(a.p1)) tris.set(a.p1, []);
    tris.get(a.p1).push([a, b, c]);
  }
  const gaps = [];
  for (let i = from; i < V.length; i++) {
    const v = V[i];
    let best = null;
    for (const [a, b, c] of tris.get(v.p1) ?? []) {
      const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(den) < 1e-9) continue;
      const l1 = ((b.z - c.z) * (v.x - c.x) + (c.x - b.x) * (v.z - c.z)) / den;
      const l2 = ((c.z - a.z) * (v.x - c.x) + (a.x - c.x) * (v.z - c.z)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const gap = v.y - (l1 * a.y + l2 * b.y + l3 * c.y);
      if (Math.abs(gap) < 0.15 && (best === null || Math.abs(gap) < Math.abs(best))) best = gap;
    }
    if (best !== null) gaps.push({ i, gap: best });
  }
  return gaps;
}

test('pino nevado con el viento máximo: la nieve se mueve con las agujas que cubre (el verde no asoma)', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const rig = canopyRig(MAKERS.snow(seed, level, { variant }));
        const pairs = anchors(rig);
        assert.ok(pairs.length > 40, 'sin nieve');
        for (const { i, j, d } of pairs) {
          // elevación mínima sobre su vértice de agujas (SNOW_LIFT + SNOW_STEEP...): el apice (peso de aleteo 0) solo sube la gorra
          if (rig.V[i].w > 0.01) assert.ok(d >= SNOW_MIN_LIFT, `${level} v${variant} s${seed}: la nieve ${i} está a solo ${(d * 1000).toFixed(1)} mm de su vértice de agujas`);
          assert.ok(d < 0.12, `${level} v${variant} s${seed}: la nieve ${i} está a ${d.toFixed(3)} m de su vértice de agujas`);
          // misma capa, misma fase de pieza, mismo peso de aleteo y misma altura de viento que el vértice que cubre
          assert.equal(rig.V[i].p0, rig.V[j].p0);
          assert.equal(rig.V[i].p1, rig.V[j].p1);
          assert.ok(Math.abs(rig.V[i].w - rig.V[j].w) < 1e-6, `${level} v${variant} s${seed}: aleteo de la nieve ${rig.V[i].w} vs agujas ${rig.V[j].w}`);
          assert.ok(Math.abs(rig.V[i].h - rig.V[j].h) < 1e-5, `${level} v${variant} s${seed}: altura de viento ${rig.V[i].h} vs ${rig.V[j].h}`);
        }
        const r = relativeMotion(rig, pairs);
        const tag = `${level} v${variant} s${seed}: mediana ${r.median.toFixed(4)} p90 ${r.p90.toFixed(4)} máx ${r.max.toFixed(4)} m`;
        assert.ok(r.median <= SNOW_REL.median, tag);
        assert.ok(r.p90 <= SNOW_REL.p90, tag);
        assert.ok(r.max <= SNOW_REL.max, tag);
      }
    }
  }
});

test('pino nevado: ningún vértice de nieve queda hundido bajo las agujas y todos asoman al menos 8 mm (40 semillas x 4 variantes x 3 calidades)', () => {
  const seeds = SEEDS.concat(Array.from({ length: 10 }, (_, i) => 100003 + i * 31));
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      let hits = 0, total = 0;
      for (const seed of seeds) {
        const rig = canopyRig(MAKERS.snow(seed, level, { variant }));
        total += rig.V.length - rig.from;
        for (const { i, gap } of staticGaps(rig)) {
          hits++;
          assert.ok(gap >= -SNOW_MAX_SINK, `${level} v${variant} s${seed}: vértice ${i} hundido ${(-gap * 100).toFixed(1)} cm bajo las agujas`);
          assert.ok(gap >= SNOW_MIN_GAP, `${level} v${variant} s${seed}: vértice ${i} a ${(gap * 1000).toFixed(1)} mm de las agujas (a ras)`);
        }
      }
      assert.ok(hits > total * 0.35, `${level} v${variant}: solo ${hits}/${total} vértices comprobados`);
    }
  }
});

test('pino nevado: la capa tiene grosor (varios cm sobre las agujas en las caras planas)', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      const rig = canopyRig(MAKERS.snow(11, level, { variant }));
      const flat = staticGaps(rig).map(({ gap }) => gap).sort((a, b) => a - b);
      assert.ok(flat.length > 20);
      const p75 = flat[Math.floor(flat.length * 0.75)];
      assert.ok(p75 >= 0.03, `${level} v${variant}: la nieve apenas levanta ${(p75 * 100).toFixed(1)} cm sobre las agujas`);
      assert.ok(flat.at(-1) < 0.14, `${level} v${variant}: nieve demasiado gruesa (${(flat.at(-1) * 100).toFixed(1)} cm)`);
    }
  }
});

// ---------- pino nevado: el interior de los triángulos de nieve ----------
//
// Bug: «se ve la textura verde en el pino nevado». Los triángulos de la nieve son cuerdas entre vértices posados sobre
// las agujas; en el INTERIOR del triángulo la nieve quedaba por debajo de la cara de arriba de las agujas (falda
// cóncava y con lóbulos): con 7 puntos baricéntricos por triángulo, 12-18 % de las muestras hundidas > 1 cm en Bajo y
// Medio (hasta 15-30 cm en la punta). Ahora la nieve repite los ángulos y anillos de las agujas (SNOW_LADDER.match) y,
// donde no, se eleva lo justo (liftToNeedles). Los tests de arriba solo miraban los vértices.

const BARY7 = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
const INTERIOR_SINK = 0.005; // m: el interior de la nieve no baja más de 5 mm de las agujas de su piso
const INTERIOR_MIN_GAP = 0.003; // m: y queda al menos 3 mm por encima (el margen de la elevación: sin él quedaría a ras)

/** Hundimiento (m, positivo = hundida) de 7 puntos interiores de cada triángulo de nieve bajo la cara de arriba de las agujas. */
function interiorSink({ V, from }) {
  const tris = new Map();
  for (let i = 0; i < from; i += 3) {
    const [a, b, c] = [V[i], V[i + 1], V[i + 2]];
    if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) <= 0) continue; // solo la cara de arriba
    if (!tris.has(a.p1)) tris.set(a.p1, []);
    tris.get(a.p1).push([a, b, c]);
  }
  let worst = 0, n = 0, min = Infinity;
  for (let i = from; i < V.length; i += 3) {
    const S = [V[i], V[i + 1], V[i + 2]];
    for (const [u, v, w] of BARY7) {
      const x = u * S[0].x + v * S[1].x + w * S[2].x, z = u * S[0].z + v * S[1].z + w * S[2].z, y = u * S[0].y + v * S[1].y + w * S[2].y;
      let best = null;
      for (const [a, b, c] of tris.get(S[0].p1) ?? []) {
        const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(den) < 1e-9) continue;
        const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den, l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const gap = y - (l1 * a.y + l2 * b.y + l3 * c.y);
        if (Math.abs(gap) < 0.3 && (best === null || Math.abs(gap) < Math.abs(best))) best = gap;
      }
      if (best === null) continue;
      n++;
      worst = Math.max(worst, -best);
      min = Math.min(min, best);
    }
  }
  return { worst, n, min };
}

const SINK_SEEDS = SEEDS.concat(Array.from({ length: 10 }, (_, i) => 100003 + i * 31));
// presupuestos estrechos: bajan por la escalera SNOW_LADDER hasta el último escalón (sin ángulos de las agujas: solo la elevación)
const NARROW = { low: [130, 160], medium: [150, 250], high: [150, 400] };

test('pino nevado: el interior de cada triángulo de nieve no se hunde bajo las agujas (7 puntos, 40 semillas x 4 variantes x 3 calidades y presupuestos estrechos)', () => {
  for (const level of LEVELS) {
    for (const budget of [undefined, ...NARROW[level]]) {
      let n = 0;
      for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
        for (const seed of budget === undefined ? SINK_SEEDS : SINK_SEEDS.slice(0, 10)) {
          const rig = canopyRig(MAKERS.snow(seed, level, { variant, budget }));
          const r = interiorSink(rig);
          n += r.n;
          assert.ok(r.worst <= INTERIOR_SINK, `${level} v${variant} s${seed} presupuesto ${budget ?? 'normal'}: el interior de la nieve se hunde ${(r.worst * 1000).toFixed(1)} mm bajo las agujas`);
          assert.ok(r.min >= INTERIOR_MIN_GAP, `${level} v${variant} s${seed} presupuesto ${budget ?? 'normal'}: el interior de la nieve queda a ${(r.min * 1000).toFixed(1)} mm de las agujas (a ras)`);
        }
      }
      assert.ok(n > (budget === undefined ? 20000 : 3000), `${level} presupuesto ${budget ?? 'normal'}: solo ${n} muestras interiores`);
    }
  }
});

// Con el viento máximo la métrica vertical no sirve en la punta (un cono empinado tumbado: 2 cm de desplazamiento horizontal
// son 14 cm de «altura» y el triángulo de agujas que cae bajo el punto es otro). Se mide lo que se ve: un z-buffer
// ortográfico (cenital y a 30° de elevación, desde donde sopla el viento: la copa se inclina hacia la cámara) y la fracción
// de píxeles con nieve donde las agujas del MISMO piso quedan por delante (verde asomando), con y sin viento.

/** Fracción (0..1) de píxeles cubiertos por nieve donde la cara de arriba de las agujas de su piso está delante de la nieve. */
function greenThrough(V, from, elev, az, px = 0.03) {
  const e = (elev * Math.PI) / 180, ce = Math.cos(e), se = Math.sin(e);
  const rx = -Math.sin(az), rz = Math.cos(az), ux = -se * Math.cos(az), uz = -se * Math.sin(az), uy = ce;
  const fx = ce * Math.cos(az), fz = ce * Math.sin(az), fy = se;
  const P = V.map((v) => [v.x * rx + v.z * rz, v.x * ux + v.y * uy + v.z * uz, v.x * fx + v.y * fy + v.z * fz]);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of P) (minU = Math.min(minU, p[0])), (maxU = Math.max(maxU, p[0])), (minV = Math.min(minV, p[1])), (maxV = Math.max(maxV, p[1]));
  const W = Math.ceil((maxU - minU) / px) + 2, H = Math.ceil((maxV - minV) / px) + 2;
  const tiers = [...new Set(V.map((v) => v.p1))];
  const zs = tiers.map(() => new Float32Array(W * H).fill(-1e9)), zn = tiers.map(() => new Float32Array(W * H).fill(-1e9));
  const zb = new Float32Array(W * H).fill(-1e9), isSnow = new Uint8Array(W * H);
  for (let i = 0; i < V.length; i += 3) {
    const snow = i >= from;
    if (!snow && V[i].ny <= 0.05) continue; // el reverso de las ramas no cuenta
    const t = tiers.indexOf(V[i].p1);
    const [a, b, c] = [P[i], P[i + 1], P[i + 2]];
    const ax = (a[0] - minU) / px, ay = (a[1] - minV) / px, bx = (b[0] - minU) / px, by = (b[1] - minV) / px, cx = (c[0] - minU) / px, cy = (c[1] - minV) / px;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= y1; y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= x1; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const l1 = ((by - cy) * (qx - cx) + (cx - bx) * (qy - cy)) / den, l2 = ((cy - ay) * (qx - cx) + (ax - cx) * (qy - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const d = l1 * a[2] + l2 * b[2] + l3 * c[2], o = y * W + x;
        if (d > zb[o]) (zb[o] = d), (isSnow[o] = snow ? 1 : 0);
        const z = snow ? zs[t] : zn[t];
        if (d > z[o]) z[o] = d;
      }
    }
  }
  let covered = 0, bad = 0;
  for (let o = 0; o < W * H; o++) {
    let through = false;
    for (let t = 0; t < tiers.length; t++) if (zs[t][o] > -1e8 && zn[t][o] > zs[t][o] + 0.004 && zn[t][o] >= zb[o] - 1e-4) through = true;
    if (isSnow[o] || through) covered++;
    if (through) bad++;
  }
  return bad / (covered || 1);
}

const WIND_VIEWS = [[[1, 0], 0, 0], [[0, 1], Math.PI / 2, 8]]; // [dirección del viento, azimut de la cámara, tiempo]
const stateOf = (dirX, dirZ, t) => [t, { strength: 2, dirX, dirZ, gusts: [{ front: -2 + (t > 5 ? 5 : 0), amp: 1 }, { front: 7 + (t > 5 ? 5 : 0), amp: 1 }], gustWidth: 7 }];
const windy = (V, t, st) => V.map((v) => {
  const d = windDisplacement(v, 'canopy', t, st);
  return { ...v, x: v.x + d.x, y: v.y + d.y, z: v.z + d.z };
});
const GREEN_GROWTH = { top: 0.01, p95: 0.01, max: 0.03 }; // puntos de área (fracción): cenital <= 1; a 30° p95 <= 1 y máx <= 3 (viento máximo: la punta se dobla hasta 2 m)

test('pino nevado con el viento máximo: el verde no asoma a través de la nieve (z-buffer cenital y a 30°, no crece más de 1 punto)', () => {
  const growth = { low: [], medium: [], high: [] };
  for (const level of LEVELS) {
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const { V, from } = canopyRig(MAKERS.snow(seed, level, { variant }));
        for (const [[dx, dz], az, t0] of WIND_VIEWS) {
          const [t, st] = stateOf(dx, dz, t0);
          const D = windy(V, t, st);
          for (const elev of [90, 30]) {
            const still = greenThrough(V, from, elev, az), moved = greenThrough(D, from, elev, az);
            assert.ok(still <= 0.003, `${level} v${variant} s${seed}: sin viento asoma el verde (${(still * 100).toFixed(2)} %)`);
            if (elev === 90) assert.ok(moved - still <= GREEN_GROWTH.top, `${level} v${variant} s${seed}: cenital crece ${((moved - still) * 100).toFixed(2)} puntos con el viento`);
            else growth[level].push(moved - still);
          }
        }
      }
    }
  }
  for (const level of LEVELS) {
    const g = growth[level].sort((a, b) => a - b);
    assert.ok(g.length >= 48);
    assert.ok(g[Math.floor(g.length * 0.95)] <= GREEN_GROWTH.p95, `${level}: p95 del crecimiento a 30° ${(g[Math.floor(g.length * 0.95)] * 100).toFixed(2)} puntos`);
    assert.ok(g.at(-1) <= GREEN_GROWTH.max, `${level}: máximo del crecimiento a 30° ${(g.at(-1) * 100).toFixed(2)} puntos`);
  }
});

test('pino nevado: el reparto entre agujas y nieve aprovecha el presupuesto y la escalera de reserva nunca lo rebasa', () => {
  for (const level of LEVELS) {
    let used = 0, n = 0;
    for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 12)) {
        const g = MAKERS.snow(seed, level, { variant });
        const info = g.userData.snowPine;
        assert.equal(info.overBudget, false);
        assert.equal(info.snowDetail.match, true, `${level} v${variant} s${seed}: la nieve no repite la malla de las agujas con el presupuesto normal`);
        assert.ok(info.triangles >= SPECIAL_BUDGET[level] * 0.7, `${level} v${variant} s${seed}: solo ${info.triangles} triángulos`);
        used += info.triangles / SPECIAL_BUDGET[level];
        n++;
      }
    }
    assert.ok(used / n >= 0.88, `${level}: el presupuesto se aprovecha al ${((used / n) * 100).toFixed(0)} %`);
  }
  // presupuestos estrechos: se baja por la escalera hasta el último escalón; nunca por encima del presupuesto sin avisar
  const rungs = new Set();
  for (const level of LEVELS) {
    for (const budget of [60, 110, 130, 160, 250, 400]) {
      for (let variant = 0; variant < SNOW_PINE_VARIANTS; variant++) {
        for (const seed of SEEDS.slice(0, 4)) {
          const info = MAKERS.snow(seed, level, { variant, budget }).userData.snowPine;
          if (info.overBudget) assert.ok(info.triangles > budget && info.snowDetail.R === 1 && info.snowDetail.m === 1, `${level} ${budget}: avisa sin haber llegado al último escalón`);
          else assert.ok(info.triangles <= budget, `${level} v${variant} s${seed}: ${info.triangles} triángulos con presupuesto ${budget}`);
          rungs.add(`${level}:${info.snowDetail.match ? 'match' : 'm1'}:R${info.snowDetail.R}${info.snowDetail.lip ? 'lip' : ''}`);
        }
      }
    }
  }
  for (const r of ['low:match:R2', 'low:m1:R1', 'medium:match:R3lip', 'medium:match:R2', 'medium:m1:R1', 'high:match:R3lip', 'high:match:R2', 'high:m1:R1']) assert.ok(rungs.has(r), `la escalera nunca usa ${r}`);
});

test('pino nevado: la nieve aletea (peso distinto de 0 en las faldas altas), como las agujas', () => {
  for (const level of LEVELS) {
    const rig = canopyRig(MAKERS.snow(9, level, { variant: 0 }));
    let max = 0;
    for (let i = rig.from; i < rig.V.length; i++) max = Math.max(max, rig.V[i].w);
    assert.ok(max > 0.3, `${level}: la nieve no aletea (${max})`);
  }
});

// ---------- cactus ----------

test('cactus: verde y liso; sin flor es todo verde, con flor suma color', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < CACTUS_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 8)) {
        const plain = MAKERS.cactus(seed, level, { variant, flower: false, fruit: 0x4f9e3c });
        const { color: c } = meshesOf(plain)[0].geometry.attributes;
        let notGreen = 0;
        for (let i = 0; i < c.count; i++) if (!(c.getY(i) > c.getX(i) && c.getY(i) > c.getZ(i))) notGreen++;
        assert.ok(notGreen < c.count * 0.03, `${level} v${variant} s${seed}: ${notGreen}/${c.count} vértices no verdes`);
        assert.equal(plain.userData.cactus.flowers, 0);
      }
    }
  }
  // flor: petalos de otro color
  for (const variant of [0, 1, 2]) {
    const g = MAKERS.cactus(5, 'medium', { variant, flower: true });
    assert.ok(g.userData.cactus.flowers >= 1);
    const { color: c } = meshesOf(g)[0].geometry.attributes;
    let colored = 0;
    for (let i = 0; i < c.count; i++) if (!(c.getY(i) > c.getX(i) && c.getY(i) > c.getZ(i))) colored++;
    assert.ok(colored >= 5, `v${variant}: sin color de flor`);
  }
  // nopal con tunas rojas en Medio y Alto, sin ellas en Bajo
  const red = (g) => {
    const { color: c } = meshesOf(g)[0].geometry.attributes;
    let n = 0;
    for (let i = 0; i < c.count; i++) if (c.getX(i) > c.getY(i) * 1.5) n++;
    return n;
  };
  assert.equal(red(MAKERS.cactus(5, 'low', { variant: 3 })), 0);
  assert.ok(red(MAKERS.cactus(5, 'medium', { variant: 3 })) > 0);
});

test('cactus: 1, 2 o 3 brazos, costillas suaves en el tronco y cúpula en la punta; nopal de palas', () => {
  const arms = [2, 1, 3, 0];
  for (let variant = 0; variant < CACTUS_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 6)) {
      const g = MAKERS.cactus(seed, 'high', { variant });
      assert.equal(g.userData.cactus.arms, arms[variant]);
      assert.equal(g.userData.cactus.pads > 0, variant === 3);
    }
  }
  // costillas: a media altura el radio del tronco varía de cresta a valle (Alto) y sube y baja ribs veces
  const g = MAKERS.cactus(8, 'high', { variant: 1 });
  const { ribs, height } = g.userData.cactus;
  const p = meshesOf(g)[0].geometry.attributes.position;
  const rs = [];
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - height * 0.1) < 0.05) rs.push([Math.atan2(p.getZ(i), p.getX(i)), Math.hypot(p.getX(i), p.getZ(i))]);
  assert.ok(rs.length >= ribs * 3, `${rs.length} vértices en el anillo`);
  const rr = rs.map((v) => v[1]);
  assert.ok(Math.max(...rr) / Math.min(...rr) > 1.1, 'sin costillas');
  assert.ok(Math.max(...rr) / Math.min(...rr) < 1.45, 'costillas demasiado marcadas');
  // cúpula: lo más alto del saguaro es un solo vértice con normal hacia arriba
  const { normal: n } = meshesOf(g)[0].geometry.attributes;
  let top = -1, topI = -1;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > top && Math.hypot(p.getX(i), p.getZ(i)) < 0.4) (top = p.getY(i)), (topI = i);
  assert.ok(n.getY(topI) > 0.9, 'la punta no mira hacia arriba');
  assert.ok(Math.abs(top - height) < 0.35);
  // normales suavizadas en el tronco: dos vértices vecinos de un mismo anillo no se separan mucho (sin facetas planas)
  let maxAngle = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    A.fromBufferAttribute(n, i);
    B.fromBufferAttribute(n, i + 1);
    maxAngle = Math.max(maxAngle, A.angleTo(B));
  }
  assert.ok(maxAngle < 1.2, `normales con facetas (${maxAngle.toFixed(2)} rad)`);
});

test('cactus: casi rígido (viento de la capa trunk con bend 0,012, sin balanceo ni aleteo) y material compartido', () => {
  assert.equal(CACTUS_WIND.bend, 0.012);
  for (let variant = 0; variant < CACTUS_VARIANTS; variant++) {
    const g = MAKERS.cactus(2, 'high', { variant });
    const m = meshesOf(g)[0];
    assert.equal(m.material, cactusMaterial());
    assert.ok(isWindMaterial(m.material));
    const w = m.material.userData.wind;
    assert.ok(w.bend <= 0.02 && w.sway === 0 && w.flutter === 0, `viento ${JSON.stringify(w)}`);
    assert.ok(w.bend < 0.14 * 0.15, 'más blando que un tronco de árbol');
    for (const v of m.geometry.attributes.windFlutter.array) assert.equal(v, 0);
    assert.equal(m.material.flatShading, false);
    assert.equal(m.material.vertexColors, true);
    const lib = THREE.ShaderLib.lambert;
    const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    m.material.onBeforeCompile(sh);
    assert.match(sh.vertexShader, /attribute vec2 windPhase;/);
    assert.match(sh.fragmentShader, /gcbRim/);
  }
});

test('cactus: los brazos salen horizontales y SUBEN hasta una punta (cúpula) bien por encima de donde salen', () => {
  for (const level of LEVELS) {
    for (const variant of [0, 1, 2]) {
      for (const seed of SEEDS.slice(0, 10)) {
        const g = MAKERS.cactus(seed, level, { variant, flower: false });
        const { armTips, arms, height } = g.userData.cactus;
        assert.equal(armTips.length, arms);
        const p = meshesOf(g)[0].geometry.attributes.position;
        for (const t of armTips) {
          // el vértice más alto de la malla bajo la punta del brazo (en un radio pequeño)
          let hi = -Infinity;
          for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - t.x, p.getZ(i) - t.z) < 0.5 * t.r + 0.04) hi = Math.max(hi, p.getY(i));
          assert.ok(Math.abs(hi - t.y) < 0.02, `${level} v${variant} s${seed}: la malla no llega a la punta del brazo (${hi.toFixed(2)} vs ${t.y.toFixed(2)})`);
          const rise = hi - t.from - t.r * 0.9; // lo que sube el brazo desde que sale del tronco
          assert.ok(rise >= 0.25, `${level} v${variant} s${seed}: el brazo apenas sube (${rise.toFixed(2)} m)`);
          assert.ok(hi < height + 0.1, 'el brazo pasa de la punta del tronco');
        }
      }
    }
  }
});

test('nopal: el pie toca el suelo (nada baja de y = -1 cm y la base queda a menos de 5 cm)', () => {
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      const g = MAKERS.cactus(seed, level, { variant: 3 });
      const p = meshesOf(g)[0].geometry.attributes.position;
      let min = Infinity;
      for (let i = 0; i < p.count; i++) min = Math.min(min, p.getY(i));
      assert.ok(min >= -0.01, `${level} s${seed}: el nopal baja ${(-min * 100).toFixed(1)} cm bajo el suelo`);
      assert.ok(min <= 0.05, `${level} s${seed}: el nopal flota ${(min * 100).toFixed(1)} cm`);
    }
  }
});

// ---------- árbol seco ----------

test('árbol seco: sin hojas ni verde, marrón grisáceo, una sola malla', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < DEAD_TREE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 8)) {
        const g = MAKERS.dead(seed, level, { variant });
        assert.equal(meshesOf(g).length, 1);
        const m = meshesOf(g)[0];
        assert.equal(m.material, deadTreeMaterial());
        assert.notEqual(m.material.side, THREE.DoubleSide, 'sin hojas de dos caras');
        const { color: c } = m.geometry.attributes;
        for (let i = 0; i < c.count; i++) {
          assert.ok(c.getY(i) <= Math.max(c.getX(i), c.getZ(i)) + 1e-6, `${level} v${variant}: vértice verde`);
          assert.ok(c.getX(i) >= c.getZ(i) - 1e-6, 'tono frío');
        }
      }
    }
  }
});

test('árbol seco: 4 formas (en pie, retorcido, partido, tocón con raíces) con su silueta', () => {
  const stat = (variant) => {
    const hs = [], ws = [];
    for (const s of SEEDS.slice(0, 10)) {
      const g = MAKERS.dead(s, 'medium', { variant });
      const b = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      hs.push(b.y);
      ws.push(Math.max(b.x, b.z));
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return { h: avg(hs), w: avg(ws) };
  };
  const [stand, twisted, broken, stump] = [0, 1, 2, 3].map(stat);
  assert.ok(stump.h < 0.8, `tocón de ${stump.h.toFixed(2)} m`);
  assert.ok(stump.w > stump.h * 1.5, 'las raíces abren el tocón');
  assert.ok(stand.h > twisted.h && twisted.h > broken.h && broken.h > stump.h);
  assert.equal(MAKERS.dead(3, 'high', { variant: 3 }).userData.deadTree.roots, 5);
  assert.equal(MAKERS.dead(3, 'high', { variant: 0 }).userData.deadTree.roots, 0);
  assert.ok(MAKERS.dead(3, 'high', { variant: 0 }).userData.deadTree.branches >= 4);
  assert.equal(MAKERS.dead(3, 'high', { variant: 3 }).userData.deadTree.branches, 0);
  assert.equal(MAKERS.dead(3, 'high', { variant: 2 }).userData.deadTree.broken, true);
  // el corte del tocón (pálido) es más claro que la corteza
  const g = MAKERS.dead(3, 'medium', { variant: 3 });
  const { color: c } = meshesOf(g)[0].geometry.attributes;
  let max = 0, sum = 0;
  for (let i = 0; i < c.count; i++) (max = Math.max(max, lum(c, i))), (sum += lum(c, i) / c.count);
  assert.ok(max > sum * 1.6, 'corte sin pintar');
});

test('árbol seco: tronco retorcido (se aparta de la recta suelo-punta) y casi rígido al viento', () => {
  const g = MAKERS.dead(9, 'high', { variant: 1 });
  const p = meshesOf(g)[0].geometry.attributes.position;
  let sx = 0, sz = 0, n = 0, topX = 0, topZ = 0, top = -1;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i) - 1.2) < 0.15 && Math.hypot(p.getX(i), p.getZ(i)) < 0.6) (sx += p.getX(i)), (sz += p.getZ(i)), n++;
  }
  assert.ok(n > 0);
  assert.ok(Math.hypot(sx / n, sz / n) > 0.03, 'tronco recto');
  assert.equal(DEAD_WIND.bend, 0.025);
  const m = meshesOf(g)[0];
  const w = m.material.userData.wind;
  assert.ok(w.bend <= 0.03 && w.sway === 0 && w.flutter === 0, JSON.stringify(w));
  for (const v of m.geometry.attributes.windFlutter.array) assert.equal(v, 0);
  assert.equal(m.material.flatShading, false);
  assert.ok(isWindMaterial(m.material));
});

// ---------- bakeStatic y dispose ----------

test('bakeStatic: el grupo entero en 2 / 1 / 1 llamadas, viento y color intactos', () => {
  for (const [name, mk] of Object.entries(MAKERS)) {
    const root = new THREE.Group();
    const trees = [];
    for (let i = 0; i < 12; i++) {
      const t = mk(100 + i, LEVELS[i % 3], { variant: i % VARIANTS[name] });
      t.position.set(i * 5, 0, (i % 3) * -4);
      t.rotation.y = i;
      t.scale.setScalar(0.8 + (i % 5) * 0.15);
      root.add(t);
      trees.push(t);
    }
    const before = trees.reduce((n, t) => n + tris(t), 0);
    const out = bakeStatic(root, new THREE.Group());
    assert.equal(out.length, DRAW_CALLS[name], `${name}: llamadas tras bakeStatic`);
    assert.equal(out.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0), before);
    for (const m of out) {
      for (const k of WIND_ATTRS) assert.equal(m.geometry.attributes[k]?.itemSize, WIND_ATTR_SIZES[k], `${name} falta ${k}`);
      assert.ok(m.geometry.attributes.color);
      assert.equal(m.geometry.attributes.uv, undefined);
    }
    // cada árbol conserva su fase
    const phases = new Set();
    for (const m of out) for (let i = 0; i < m.geometry.attributes.windPhase.count; i++) phases.add(m.geometry.attributes.windPhase.getX(i));
    assert.equal(phases.size, trees.length, `${name}: fases`);
  }
  // el aleteo y la altura de viento de la nieve (los de la falda que cubre) llegan tal cual al lote
  const root = new THREE.Group();
  const s = MAKERS.snow(7, 'medium');
  root.add(s);
  const info = s.userData.snowPine;
  const out = bakeStatic(root, new THREE.Group());
  const baked = out.find((m) => m.material === pineMaterials().canopy).geometry.attributes;
  const orig = canopyOf(MAKERS.snow(7, 'medium')).geometry.attributes;
  assert.equal(baked.windFlutter.count, orig.windFlutter.count);
  for (let i = info.snowFrom; i < orig.windFlutter.count; i++) {
    assert.equal(baked.windFlutter.getX(i), orig.windFlutter.getX(i));
    assert.equal(baked.sway.getX(i), orig.sway.getX(i));
  }
});

test('dispose: las geometrías se liberan y los materiales compartidos se conservan', () => {
  for (const [name, mk] of Object.entries(MAKERS)) {
    const g = mk(4, 'medium');
    let disposed = 0;
    const ms = meshesOf(g);
    for (const m of ms) m.geometry.addEventListener('dispose', () => disposed++);
    const mats = ms.map((m) => m.material);
    let matDisposed = 0;
    for (const m of mats) m.addEventListener('dispose', () => matDisposed++);
    g.traverse((o) => o.geometry?.dispose());
    assert.equal(disposed, ms.length, `${name}: geometrías`);
    assert.equal(matDisposed, 0, `${name}: los materiales compartidos no se tocan`);
  }
  // la geometría del pino sin nieve que se descarta al unir la nieve no deja nada colgado: una sola malla de ramas
  assert.equal(meshesOf(MAKERS.snow(4, 'high')).filter((m) => m.material === pineMaterials().canopy).length, 1);
});
