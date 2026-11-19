import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeRock, rockMaterial, rockPalette, ROCK_TYPES, ROCK_STONES, ROCK_BUDGET, ROCK_BUDGET_PILE, PILE_STONES, ROCK_VARIANTS, ROCK_MAX_DRAW_CALLS, ROCK_MAX_STONES } from '../src/game/render/assets/rock.js';
import { WIND_ATTRS, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';
import { THEMES } from '../src/game/themes.js';
import { roundTreePalette } from '../src/game/render/environment.js';

// Rocas del estilo liso (paso 7): canto rodado, losa plana, grupo de piedras y montón, en piedra gris,
// sin musgo y arenisca. Ver assets/rock.js.

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 5 + i * 7919);
// máximo de triángulos medido por tipo y calidad (30 semillas x 3 variantes)
const MEASURED_MAX = {
  boulder: { low: 80, medium: 180, high: 320 },
  slab: { low: 80, medium: 180, high: 320 },
  group: { low: 100, medium: 240, high: 440 },
  pile: { low: 160, medium: 360, high: 700 },
};
const budgetOf = (type, level) => (type === 'pile' ? ROCK_BUDGET_PILE : ROCK_BUDGET)[level];
const rock = (seed, level = 'medium', opts = {}) => makeRock(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
// preset del laboratorio para un tema: como assetsLab.js (preset.theme = roundTreePalette, sceneTheme = tema entero)
const presetOf = (id, level = 'medium') => ({ level, theme: roundTreePalette(THEMES[id]), sceneTheme: THEMES[id] });
const greenness = (c, i) => c.getY(i) - Math.max(c.getX(i), c.getZ(i));
const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);

test('roca: presupuesto por calidad, tipo y variante en 30 semillas (máximos medidos, se aprovecha)', () => {
  assert.deepEqual(ROCK_BUDGET, { low: 100, medium: 240, high: 480 });
  assert.deepEqual(ROCK_BUDGET_PILE, { low: 160, medium: 360, high: 720 });
  assert.deepEqual(ROCK_TYPES, ['boulder', 'slab', 'group', 'pile']);
  assert.ok(5 * 20 <= ROCK_BUDGET.low, 'cinco piedras en el icosaedro mínimo caben en Bajo');
  assert.equal(ROCK_MAX_STONES, 8);
  assert.deepEqual(PILE_STONES, [5, 8]);
  assert.ok(ROCK_MAX_STONES * 20 <= ROCK_BUDGET_PILE.low, 'ocho piedras en el icosaedro mínimo caben en Bajo (montón)');
  for (const type of ROCK_TYPES) {
    for (const level of LEVELS) {
      let max = 0;
      for (let variant = 0; variant < ROCK_VARIANTS; variant++) {
        for (const seed of SEEDS) {
          const g = rock(seed, level, { type, variant });
          const n = tris(g);
          assert.ok(n <= budgetOf(type, level), `${type} ${level} v${variant} s${seed}: ${n} tri`);
          assert.ok(n >= budgetOf(type, level) * 0.55, `${type} ${level}: solo ${n} tri`);
          assert.equal(g.userData.rock.triangles, n);
          max = Math.max(max, n);
        }
      }
      assert.equal(max, MEASURED_MAX[type][level], `${type} ${level}: máximo medido`);
    }
  }
});

test('roca: más calidad, más triángulos (misma semilla, tipo y forma)', () => {
  for (const type of ROCK_TYPES) {
    for (const seed of SEEDS.slice(0, 6)) {
      const [lo, me, hi] = LEVELS.map((l) => tris(rock(seed, l, { type })));
      assert.ok(lo < me && me < hi, `${type} s${seed}: ${lo} / ${me} / ${hi}`);
    }
  }
});

test('roca: una llamada de dibujo, material Lambert compartido, liso y sin viento', () => {
  const mat = rockMaterial();
  assert.ok(mat.isMeshLambertMaterial && mat.vertexColors && !mat.flatShading);
  assert.ok(!isWindMaterial(mat), 'las rocas no se mueven con el viento');
  let maxCalls = 0;
  for (const type of ROCK_TYPES) {
    for (const level of LEVELS) {
      const g = rock(3, level, { type });
      const ms = meshesOf(g);
      maxCalls = Math.max(maxCalls, ms.length);
      assert.equal(ms[0].material, mat);
      assert.ok(!g.userData.swayRoot, 'sin swayRoot');
      for (const a of WIND_ATTRS) assert.ok(!ms[0].geometry.attributes[a], `sin ${a}`);
      assert.ok(!ms[0].isInstancedMesh);
    }
  }
  assert.equal(maxCalls, ROCK_MAX_DRAW_CALLS);
  assert.equal(ROCK_MAX_DRAW_CALLS, 1);
});

test('roca: normales suavizadas (vértices en el mismo sitio comparten normal) y sin facetas gruesas', () => {
  for (const type of ROCK_TYPES) {
    const g = meshesOf(rock(7, 'high', { type }))[0].geometry;
    const pos = g.attributes.position, nor = g.attributes.normal;
    const byPos = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      if (!byPos.has(k)) byPos.set(k, n);
      else for (let c = 0; c < 3; c++) assert.ok(Math.abs(byPos.get(k)[c] - n[c]) < 1e-5, `${type}: normal distinta en un vértice soldado`);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-4, 'normal unitaria');
    }
    // lisa: entre las normales de dos vértices de un mismo triángulo hay poco ángulo
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const angles = [];
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(nor, i);
      b.fromBufferAttribute(nor, i + 1);
      angles.push(a.angleTo(b));
    }
    angles.sort((x, y) => x - y);
    const p90 = angles[Math.floor(angles.length * 0.9)];
    // la losa es tan fina (y las piedras pequeñas del grupo, con pocos triángulos, giran más por arista) que su borde (de arriba abajo en una arista) gira casi 90 grados: es el canto de la piedra
    assert.ok(p90 < { boulder: 0.7, slab: 1.3, group: 1.0, pile: 1.0 }[type], `${type}: el 90 % de las aristas gira menos de ${p90.toFixed(2)} rad`);
    assert.ok(angles.filter((x) => x > 0.01).length > angles.length * 0.5, `${type}: normales distintas en cada triángulo (no facetado)`);
    assert.ok(angles.at(-1) < { boulder: 1.5, slab: 2.2, group: 1.8, pile: 1.8 }[type], `${type}: ángulo máx. entre normales vecinas ${angles.at(-1).toFixed(2)} rad`);
  }
});

test('roca: la losa lleva un plano tallado arriba y todas se apoyan en el suelo', () => {
  const flatTop = (g) => {
    const p = meshesOf(g)[0].geometry.attributes.position;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let flat = 0, n = 0;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const f = e1.subVectors(b, a).cross(e2.subVectors(c, a));
      if (f.lengthSq() < 1e-12) continue;
      n++;
      if (f.normalize().y > 0.93 && a.y > 0.05) flat++;
    }
    return flat / n;
  };
  for (const type of ROCK_TYPES) {
    for (const seed of SEEDS.slice(0, 5)) {
      const g = rock(seed, 'high', { type });
      const box = new THREE.Box3().setFromObject(g);
      assert.ok(Math.abs(box.min.y - -0.03) < 1e-4, `${type}: base a ${box.min.y}`);
      if (type === 'slab') assert.ok(flatTop(g) > 0.12, `losa s${seed}: ${flatTop(g).toFixed(2)} de triángulos planos arriba`);
    }
  }
});

test('roca: los planos tallados existen de verdad (ningún vértice pasa del último plano y varios quedan sobre él)', () => {
  for (const type of ['boulder', 'slab']) {
    for (const seed of SEEDS.slice(0, 6)) {
      const g = rock(seed, 'high', { type });
      const { center, cuts } = g.userData.rock.planes[0];
      const p = meshesOf(g)[0].geometry.attributes.position;
      let onPlane = 0;
      for (const { n, h } of cuts.slice(-1)) { // el último plano se corta el último: el único que ningún corte posterior mueve
        let on = 0;
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) < -0.03 + 1e-5) continue; // la base plana se recorta después (bajo tierra)
          const d = (p.getX(i) - center[0]) * n[0] + (p.getY(i) - center[1]) * n[1] + (p.getZ(i) - center[2]) * n[2];
          assert.ok(d <= h + 1e-4, `${type} s${seed}: un vértice pasa del plano (${d.toFixed(3)} > ${h.toFixed(3)})`);
          if (Math.abs(d - h) < 1e-4) on++;
        }
        onPlane = Math.max(onPlane, on);
      }
      assert.ok(onPlane >= 6, `${type} s${seed}: ${onPlane} vértices sobre un plano tallado`);
    }
  }
});

test('roca: tipos con proporciones propias (canto alto, losa baja y ancha, grupo de 3-5 piedras)', () => {
  const size = (type, seed, variant) => new THREE.Box3().setFromObject(rock(seed, 'high', { type, variant })).getSize(new THREE.Vector3());
  for (const seed of SEEDS.slice(0, 10)) {
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      const b = size('boulder', seed, v), s = size('slab', seed, v), pl = size('pile', seed, v);
      assert.ok(b.y / Math.max(b.x, b.z) > 0.4, `canto s${seed} v${v}: ${b.y.toFixed(2)} / ${Math.max(b.x, b.z).toFixed(2)}`);
      assert.ok(s.y / Math.max(s.x, s.z) < 0.25, `losa s${seed} v${v}: ${s.y.toFixed(2)} / ${Math.max(s.x, s.z).toFixed(2)}`);
      assert.ok(Math.max(b.x, b.y, b.z) < 1.4 && Math.max(s.x, s.z) < 2.2);
      // el montón, sin escalar, es del tamaño del rockpile de hoy (3 bolas apiladas: ~1,9 m de alto a escala 1): medido 1,80-2,39 m de alto y 2,02-3,04 m de ancho
      assert.ok(pl.y >= 1.6 && pl.y <= 2.6, `montón s${seed} v${v}: alto ${pl.y.toFixed(2)}`);
      assert.ok(Math.max(pl.x, pl.z) >= 2 && Math.max(pl.x, pl.z) <= 3.3, `montón s${seed} v${v}: ancho ${Math.max(pl.x, pl.z).toFixed(2)}`);
      assert.ok(pl.y > 3 * b.y * 0.7 && pl.y > 2 * s.y, 'el montón es mucho mayor que el canto y la losa');
    }
    const n = rock(seed, 'medium', { type: 'group' }).userData.rock.stones;
    assert.ok(n >= 3 && n <= 5, `${n} piedras`);
  }
  assert.equal(new Set(SEEDS.map((s) => rock(s, 'medium', { type: 'group' }).userData.rock.stones)).size, 3, 'salen grupos de 3, 4 y 5');
  // montón: 5-8 piedras (salen 5, 6, 7 y 8), grandes abajo y pequeñas arriba
  const counts = new Set();
  for (const seed of SEEDS) {
    const g = rock(seed, 'high', { type: 'pile' }), info = g.userData.rock;
    assert.ok(info.stones >= PILE_STONES[0] && info.stones <= PILE_STONES[1], `${info.stones} piedras`);
    counts.add(info.stones);
    const ys = info.planes.map((pl) => pl.center[1]);
    assert.ok(ys[0] < 0.7 && ys.at(-1) > ys[0] + 0.5, 'la cima queda por encima de la base');
  }
  assert.deepEqual([...counts].sort(), [5, 6, 7, 8]);
});

test('roca: la semilla elige entre 3 variantes y la geometría cambia con la semilla', () => {
  for (const type of ROCK_TYPES) assert.equal(new Set(SEEDS.map((s) => rock(s, 'medium', { type }).userData.rock.variant)).size, ROCK_VARIANTS);
  const sig = (g) => Array.from(meshesOf(g)[0].geometry.attributes.position.array.slice(0, 60)).join();
  assert.notEqual(sig(rock(1)), sig(rock(2)));
  assert.notEqual(sig(rock(1, 'medium', { variant: 0 })), sig(rock(1, 'medium', { variant: 1 })));
  assert.equal(rock(1, 'medium', { variant: 4 }).userData.rock.variant, 1, 'variante fuera de rango: módulo');
});

test('roca: determinista; tiradas fijas sin depender de la calidad ni del tipo; misma roca en las tres calidades', () => {
  for (const type of ROCK_TYPES) {
    for (const level of LEVELS) {
      const a = meshesOf(rock(5, level, { type }))[0].geometry.attributes, b = meshesOf(rock(5, level, { type }))[0].geometry.attributes;
      for (const name of Object.keys(a)) assert.deepEqual(a[name].array, b[name].array, `${type} ${level} ${name}`);
    }
  }
  const draws = (level, type) => {
    let n = 0;
    const r = seededRng(11);
    makeRock(() => (n++, r()), level, { type });
    return n;
  };
  const drawsV = (level, type, variant) => {
    let n = 0;
    const r = seededRng(11);
    makeRock(() => (n++, r()), level, { type, variant });
    return n;
  };
  const d0 = draws('medium', 'boulder');
  assert.ok(d0 > 100);
  for (const level of LEVELS) for (const type of ROCK_TYPES) assert.equal(draws(level, type), d0, `${level} ${type}`);
  // con opts.variant las tiradas son las mismas (la variante no ahorra ni añade llamadas al rng)
  for (const level of LEVELS) for (const type of ROCK_TYPES) for (let v = 0; v < ROCK_VARIANTS; v++) assert.equal(drawsV(level, type, v), d0, `variant ${v} ${level} ${type}`);
  // misma roca: variante, nº de piedras y caja casi igual (solo cambia la subdivisión)
  for (const type of ROCK_TYPES) {
    for (const seed of SEEDS.slice(0, 8)) {
      const info = LEVELS.map((l) => rock(seed, l, { type }).userData.rock);
      for (const k of [1, 2]) {
        assert.equal(info[k].variant, info[0].variant);
        assert.equal(info[k].stones, info[0].stones);
      }
      const [s0, s2] = [LEVELS[0], LEVELS[2]].map((l) => new THREE.Box3().setFromObject(rock(seed, l, { type })).getSize(new THREE.Vector3()));
      assert.ok(s0.distanceTo(s2) < 0.25 * s2.length(), `${type} s${seed}: caja distinta entre Bajo y Alto`);
    }
  }
});

test('roca: musgo arriba (normal hacia arriba) solo en temas verdes', () => {
  const stats = (preset, type, seed) => {
    const g = meshesOf(rock(seed, preset, { type }))[0].geometry;
    const col = g.attributes.color, nor = g.attributes.normal;
    let up = 0, nUp = 0, down = 0, nDown = 0, max = -1, maxDown = -1, nFlank = 0;
    for (let i = 0; i < col.count; i++) {
      const gr = greenness(col, i);
      max = Math.max(max, gr);
      if (nor.getY(i) > 0.85) (up += gr, nUp++);
      else if (nor.getY(i) < 0.3) (down += gr, nDown++);
      if (nor.getY(i) < 0.1) (nFlank++, maxDown = Math.max(maxDown, gr));
    }
    return { up: up / Math.max(1, nUp), down: down / Math.max(1, nDown), max, nUp, nFlank, maxDown };
  };
  for (const type of ROCK_TYPES) {
    for (const id of ['meadowDay', 'meadow', 'jungle', 'sunset', 'night']) {
      const s = stats(presetOf(id, 'high'), type, 3);
      assert.ok(s.nUp > 0 && s.up > 0.02, `${id} ${type}: arriba ${s.up.toFixed(3)}`);
      assert.ok(s.up > s.down + 0.02, `${id} ${type}: el musgo va arriba (${s.up.toFixed(3)} vs ${s.down.toFixed(3)})`);
      // el musgo se acota por la normal: flancos y bajos (normal.y < 0.1) sin verde
      assert.ok(s.nFlank > 0 && s.maxDown < 0.01, `${id} ${type}: sin musgo con la normal horizontal o hacia abajo (${s.maxDown.toFixed(3)})`);
      assert.ok(rock(3, presetOf(id), { type }).userData.rock.mossy);
    }
    // temas no verdes: hojas de otoño, y temas con hojas por defecto verdes pero suelo de nieve, arena o ceniza
    for (const id of ['autumn', 'snow', 'beach', 'beachNight', 'canyon', 'volcano', 'caldera', 'glacier', 'neon']) {
      const s = stats(presetOf(id, 'high'), type, 3);
      assert.ok(s.max < 0.01, `${id} ${type}: no debe haber musgo (${s.max.toFixed(3)})`);
      assert.ok(!rock(3, presetOf(id), { type }).userData.rock.mossy);
    }
  }
  // sin tema: piedra pelada
  assert.ok(stats('medium', 'boulder', 3).max < 0.01);
  // la paleta: verde si hay hojas verdes y no hay tema entero que lo desmienta
  assert.ok(rockPalette({ leaves: [0x2f9e44, 0x3bb54a] }).moss);
  assert.equal(rockPalette({ leaves: [0xff6b35, 0xf72585, 0xffb703] }).moss, null);
  assert.equal(rockPalette({ leaves: [0x2f9e44] }, THEMES.snow).moss, null);
  // mixto: la mitad o más de las hojas verdes -> musgo; menos de la mitad -> sin musgo
  assert.equal(rockPalette({ leaves: [0x2f9e44, 0xff6b35, 0xf72585] }).moss, null, '1 verde + 2 naranjas: sin musgo');
  assert.ok(rockPalette({ leaves: [0x2f9e44, 0xff6b35] }).moss, '1 verde + 1 naranja: musgo (la mitad)');
  assert.equal(rockPalette(undefined).moss, null);
});

test('roca: la base, donde toca el suelo, es más oscura que arriba (con y sin musgo)', () => {
  for (const preset of ['medium', presetOf('meadowDay', 'high')]) {
    for (const type of ROCK_TYPES) {
      const g = rock(9, preset, { type });
      const geo = meshesOf(g)[0].geometry;
      const p = geo.attributes.position, col = geo.attributes.color;
      const box = new THREE.Box3().setFromObject(g);
      const h = box.max.y - box.min.y;
      const nor = geo.attributes.normal;
      let lo = 0, nLo = 0, hi = 0, nHi = 0;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) - box.min.y) / h;
        if (t < 0.12) (lo += lum(col, i), nLo++);
        else if (t > 0.5 && nor.getY(i) < 0.6) (hi += lum(col, i), nHi++); // flancos: sin musgo
      }
      if (type === 'slab' && !nHi) continue; // la losa es tan fina (y las piedras pequeñas del grupo, con pocos triángulos, giran más por arista) que no tiene flancos altos
      assert.ok(nLo > 0 && nHi > 0, `${type}: ${nLo}/${nHi}`);
      assert.ok(lo / nLo < (hi / nHi) * 0.8, `${type}: base ${(lo / nLo).toFixed(3)} frente a arriba ${(hi / nHi).toFixed(3)}`);
    }
  }
});

test('roca: sobrevive a bakeStatic (todas las rocas en 1 llamada; color y normales intactos, sin atributos de viento)', () => {
  const root = new THREE.Group();
  const items = [];
  for (let i = 0; i < 12; i++) {
    const r = rock(100 + i, i % 2 ? presetOf('meadowDay', LEVELS[i % 3]) : LEVELS[i % 3], { type: ROCK_TYPES[i % 4] });
    r.position.set(i * 3, 0, (i % 3) * -2);
    r.rotation.y = i;
    r.scale.setScalar(0.8 + (i % 5) * 0.15);
    if (i % 4 === 3) r.position.x += 2;
    root.add(r);
    items.push(r);
  }
  const before = items.reduce((n, t) => n + tris(t), 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, ROCK_MAX_DRAW_CALLS, 'una llamada de dibujo para todas las rocas');
  assert.equal(out[0].material, rockMaterial());
  const at = out[0].geometry.attributes;
  assert.equal(at.position.count / 3, before);
  assert.deepEqual(Object.keys(at).sort(), ['color', 'normal', 'position']);
  for (const a of WIND_ATTRS) assert.ok(!at[a], `${a} no debe aparecer (las rocas no se mueven)`);
  let sum = 0;
  for (let i = 0; i < at.color.count; i++) sum += lum(at.color, i);
  assert.ok(sum > 0 && Number.isFinite(sum));
  assert.ok(out[0].castShadow && out[0].receiveShadow);
});

test('roca: sin InstancedMesh (nada instanciado que liberar) y la geometría se libera con dispose', () => {
  for (const type of ROCK_TYPES) {
    const g = rock(2, 'high', { type });
    let inst = 0;
    g.traverse((o) => o.isInstancedMesh && inst++);
    assert.equal(inst, 0);
    const geo = meshesOf(g)[0].geometry;
    let disposed = 0;
    geo.addEventListener('dispose', () => disposed++);
    geo.dispose();
    assert.equal(disposed, 1);
  }
});

test('roca: la calidad se acepta como nombre, preset del laboratorio o lod', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = tris(rock(9, level));
    assert.equal(tris(rock(9, { level })), n);
    assert.equal(tris(makeRock(seededRng(9), { lod: i })), n);
    assert.equal(tris(makeRock(seededRng(9), i)), n);
  }
  assert.equal(tris(rock(9, 'nope')), tris(rock(9, 'medium')));
  assert.equal(tris(makeRock(seededRng(9))), tris(rock(9, 'medium')));
  assert.equal(rock(9, 'medium', { type: 'nope' }).userData.rock.type, 'boulder');
});

// ---------- montón (pile = el rediseño del rockpile) y sus piedras (gris, sin musgo, arenisca) ----------

const colorsOf = (g) => Array.from(meshesOf(g)[0].geometry.attributes.color.array);
const GREEN_IDS = ['meadowDay', 'meadow', 'jungle', 'sunset', 'night'];
// luminosidad media por tramo de 5 cm de altura (solo por encima de 0,5 m: sin la base oscura) -> { sd, flips, n }
const strata = (g) => {
  const geo = meshesOf(g)[0].geometry, p = geo.attributes.position, c = geo.attributes.color;
  const bins = new Map();
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0.5) continue;
    const k = Math.floor(p.getY(i) / 0.05), a = bins.get(k) ?? [0, 0];
    a[0] += lum(c, i);
    a[1]++;
    bins.set(k, a);
  }
  const seq = [...bins.entries()].sort((a, b) => a[0] - b[0]).filter((e) => e[1][1] > 3).map((e) => e[1][0] / e[1][1]);
  const m = seq.reduce((a, b) => a + b, 0) / seq.length;
  const sd = Math.sqrt(seq.reduce((a, b) => a + (b - m) ** 2, 0) / seq.length);
  let flips = 0, last = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i] - seq[i - 1];
    if (Math.abs(d) < 0.04) continue;
    if (last && Math.sign(d) !== last) flips++;
    last = Math.sign(d);
  }
  return { sd, flips, n: seq.length };
};

test('montón: 5-8 piedras apiladas (grande abajo, pequeña arriba, la cima desplazada) y apoyado en el suelo', () => {
  const counts = new Set();
  for (const seed of SEEDS) {
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      const g = rock(seed, 'high', { type: 'pile', variant: v });
      const box = new THREE.Box3().setFromObject(g);
      assert.ok(Math.abs(box.min.y - -0.03) < 1e-4, `base a ${box.min.y}`);
      const { planes, stones, details } = g.userData.rock;
      assert.ok(stones >= PILE_STONES[0] && stones <= PILE_STONES[1], `${stones} piedras`);
      assert.equal(details.length, stones);
      counts.add(stones);
      assert.ok(planes[0].center[1] < planes[stones - 1].center[1] - 0.5, 'la cima queda por encima de la base');
    }
  }
  assert.deepEqual([...counts].sort(), [5, 6, 7, 8]);
  // piedras inclinadas / apoyadas: la cima no es una torre vertical
  let off = 0;
  for (const seed of SEEDS) {
    const { planes, stones } = rock(seed, 'medium', { type: 'pile' }).userData.rock;
    off = Math.max(off, Math.hypot(planes[stones - 1].center[0], planes[stones - 1].center[2]));
  }
  assert.ok(off > 0.2, `la cima se desplaza del centro (${off.toFixed(2)} m)`);
});

test('montón: tamaño mínimo medido sin escalar (alto >= 1,6 m, ancho >= 2 m) en 30 semillas x 3 variantes x 3 calidades', () => {
  let minH = 9, minW = 9, maxH = 0, maxW = 0;
  for (const level of LEVELS) {
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      for (const seed of SEEDS) {
        const b = new THREE.Box3().setFromObject(rock(seed, level, { type: 'pile', variant: v })).getSize(new THREE.Vector3());
        const w = Math.max(b.x, b.z);
        minH = Math.min(minH, b.y);
        minW = Math.min(minW, w);
        maxH = Math.max(maxH, b.y);
        maxW = Math.max(maxW, w);
      }
    }
  }
  assert.ok(minH >= 1.6 && minW >= 2, `mínimo medido: ${minH.toFixed(2)} x ${minW.toFixed(2)} m`);
  assert.ok(maxH <= 2.6 && maxW <= 3.3, `máximo medido: ${maxH.toFixed(2)} x ${maxW.toFixed(2)} m`);
  // mucho mayor que el canto, la losa y el grupo
  const big = (type) => Math.max(...SEEDS.slice(0, 8).map((s) => new THREE.Box3().setFromObject(rock(s, 'high', { type })).getSize(new THREE.Vector3()).y));
  assert.ok(minH > 1.4 * big('group') && minH > 1.4 * big('boulder'));
});

test('piedra: la variante solo cambia el color (misma forma, tiradas y llamadas de dibujo); gris por defecto', () => {
  assert.deepEqual(ROCK_STONES, ['gray', 'bare', 'sandstone']);
  for (const type of ROCK_TYPES) {
    const base = meshesOf(rock(6, presetOf('meadowDay', 'high'), { type }))[0].geometry.attributes;
    // sin `material` o con 'gray' o con un valor desconocido: la misma piedra de siempre (boulder, slab y group no cambian)
    for (const material of ['gray', 'nope', undefined]) {
      const at = meshesOf(rock(6, presetOf('meadowDay', 'high'), { type, material }))[0].geometry.attributes;
      for (const name of Object.keys(base)) assert.deepEqual(at[name].array, base[name].array, `${type} ${material} ${name}`);
    }
    for (const material of ['bare', 'sandstone']) {
      const g = rock(6, presetOf('meadowDay', 'high'), { type, material });
      assert.equal(g.userData.rock.material, material);
      assert.equal(meshesOf(g).length, ROCK_MAX_DRAW_CALLS);
      assert.equal(meshesOf(g)[0].material, rockMaterial());
      const at = meshesOf(g)[0].geometry.attributes;
      assert.deepEqual(at.position.array, base.position.array, `${type} ${material}: misma forma`);
      assert.deepEqual(at.normal.array, base.normal.array);
      let n = 0, n0 = 0;
      const r = seededRng(11), r0 = seededRng(11);
      makeRock(() => (n++, r()), 'medium', { type, material });
      makeRock(() => (n0++, r0()), 'medium', { type });
      assert.equal(n, n0, `${type} ${material}: mismas tiradas`);
    }
  }
  assert.equal(rock(1, 'medium', { material: 'nope' }).userData.rock.material, 'gray');
});

test('montón sin musgo (bare): gris igual que la gris pero sin verde aunque el tema sea verde', () => {
  for (const id of GREEN_IDS) {
    const gray = rock(3, presetOf(id, 'high'), { type: 'pile' }), bare = rock(3, presetOf(id, 'high'), { type: 'pile', material: 'bare' });
    assert.ok(gray.userData.rock.mossy && !bare.userData.rock.mossy, id);
    const col = meshesOf(bare)[0].geometry.attributes.color;
    for (let i = 0; i < col.count; i++) assert.ok(greenness(col, i) < 0.01, `${id}: verde ${greenness(col, i).toFixed(3)}`);
    // es la piedra gris de un tema no verde, vértice a vértice
    assert.deepEqual(colorsOf(bare), colorsOf(rock(3, presetOf('snow', 'high'), { type: 'pile' })), `${id}: bare = gris sin musgo`);
  }
  assert.equal(rockPalette({ leaves: [0x2f9e44, 0x3bb54a] }, null, null, 'bare').moss, null);
  assert.ok(rockPalette({ leaves: [0x2f9e44, 0x3bb54a] }, null, null, 'gray').moss);
});

test('montón de arenisca: cálido (R > B), sin musgo ni en temas verdes, con estratos horizontales', () => {
  const gray = meshesOf(rock(3, presetOf('snow', 'high'), { type: 'pile' }))[0].geometry.attributes.color;
  let rbGray = 0;
  for (let i = 0; i < gray.count; i++) rbGray += gray.getX(i) / gray.getZ(i);
  for (const id of [...GREEN_IDS, 'snow', 'canyon']) {
    const g = rock(3, presetOf(id, 'high'), { type: 'pile', material: 'sandstone' });
    assert.ok(!g.userData.rock.mossy, id);
    const col = meshesOf(g)[0].geometry.attributes.color;
    let rb = 0;
    for (let i = 0; i < col.count; i++) {
      assert.ok(col.getX(i) > col.getZ(i) + 0.05, `${id}: R ${col.getX(i).toFixed(3)} > B ${col.getZ(i).toFixed(3)}`);
      assert.ok(greenness(col, i) < 0, 'sin verde');
      rb += col.getX(i) / col.getZ(i);
    }
    assert.ok(rb / col.count > 2 * (rbGray / gray.count), `${id}: mucho más cálida que la gris (${(rb / col.count).toFixed(2)} frente a ${(rbGray / gray.count).toFixed(2)})`);
  }
  assert.equal(rockPalette({ leaves: [0x2f9e44] }, null, null, 'sandstone').moss, null);
  assert.equal(rockPalette({ leaves: [0x2f9e44] }, null, null, 'sandstone').strata, true);
  assert.equal(rockPalette({ leaves: [0x2f9e44] }).strata, false);
  // estratos: la luminosidad sube y baja con la altura (varias bandas), mucho más que en la piedra sin musgo
  for (const seed of [3, 9, 15]) {
    const sand = strata(rock(seed, 'high', { type: 'pile', material: 'sandstone' })), bare = strata(rock(seed, 'high', { type: 'pile', material: 'bare' }));
    assert.ok(sand.n >= 15, `s${seed}: ${sand.n} tramos`);
    assert.ok(sand.flips >= 6, `s${seed}: ${sand.flips} cambios de sentido (bandas)`);
    assert.ok(sand.sd > 1.8 * bare.sd, `s${seed}: variación por altura ${sand.sd.toFixed(3)} frente a ${bare.sd.toFixed(3)}`);
  }
});

test('montón de arenisca y sin musgo: la base, donde toca el suelo, es más oscura que arriba', () => {
  for (const material of ['bare', 'sandstone']) {
    const g = rock(9, presetOf('meadowDay', 'high'), { type: 'pile', material });
    const geo = meshesOf(g)[0].geometry;
    const p = geo.attributes.position, col = geo.attributes.color, nor = geo.attributes.normal;
    const box = new THREE.Box3().setFromObject(g);
    const h = box.max.y - box.min.y;
    let lo = 0, nLo = 0, hi = 0, nHi = 0;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) - box.min.y) / h;
      if (t < 0.12) (lo += lum(col, i), nLo++);
      else if (t > 0.35 && nor.getY(i) < 0.6) (hi += lum(col, i), nHi++);
    }
    assert.ok(nLo > 0 && nHi > 0 && lo / nLo < (hi / nHi) * 0.85, `${material}: base ${(lo / nLo).toFixed(3)} frente a arriba ${(hi / nHi).toFixed(3)}`);
  }
});

test('montón: bakeStatic con las tres piedras juntas en 1 llamada, y dispose', () => {
  const root = new THREE.Group();
  let before = 0;
  ROCK_STONES.forEach((material, j) => {
    for (let i = 0; i < 3; i++) {
      const r = rock(200 + i * 3 + j, presetOf('meadowDay', LEVELS[(i + j) % 3]), { type: 'pile', material });
      r.position.set(i * 4, 0, j * -4);
      root.add(r);
      before += tris(r);
    }
  });
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, ROCK_MAX_DRAW_CALLS);
  assert.equal(out[0].geometry.attributes.position.count / 3, before);
  assert.deepEqual(Object.keys(out[0].geometry.attributes).sort(), ['color', 'normal', 'position']);
  let disposed = 0;
  const geo = meshesOf(rock(2, 'high', { type: 'pile', material: 'sandstone' }))[0].geometry;
  geo.addEventListener('dispose', () => disposed++);
  geo.dispose();
  assert.equal(disposed, 1);
});

test('montón de arenisca: el aclarado con la altura se nota en la tendencia (pendiente de luminosidad por metro, media de 8 semillas)', () => {
  // los estratos suben y bajan la luminosidad; el aclarado de arriba (12 % hacia la arena clara) frena la caída: medido -0,050 con él y -0,084 sin él
  let tot = 0;
  const seeds = [3, 9, 15, 21, 27, 33, 39, 45];
  for (const seed of seeds) {
    const g = meshesOf(rock(seed, 'high', { type: 'pile', material: 'sandstone' }))[0].geometry;
    const p = g.attributes.position, c = g.attributes.color;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 0.5) continue;
      const l = lum(c, i);
      sx += y; sy += l; sxx += y * y; sxy += y * l; n++;
    }
    tot += (n * sxy - sx * sy) / (n * sxx - sx * sx);
  }
  assert.ok(tot / seeds.length > -0.07, `pendiente media ${(tot / seeds.length).toFixed(3)}`);
});

// ---------- roca suelta (canto rodado y losa) en arenisca ----------

// por encima del 30 % de la altura, en tramos de 2 cm: parte de la variación de luminosidad que explica la altura
// (R^2 de las medias por tramo) y cambios de sentido de la luminosidad por tramo (bandas)
const heightBands = (g) => {
  const geo = meshesOf(g)[0].geometry, p = geo.attributes.position, c = geo.attributes.color;
  let h = 0;
  for (let i = 0; i < p.count; i++) h = Math.max(h, p.getY(i));
  const bins = new Map();
  let n = 0, s = 0, s2 = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0.3 * h) continue;
    const l = lum(c, i), k = Math.floor(p.getY(i) / 0.02), a = bins.get(k) ?? [0, 0, 0];
    a[0] += l; a[1]++; a[2] += l * l;
    bins.set(k, a);
    n++; s += l; s2 += l * l;
  }
  const vt = s2 / n - (s / n) ** 2;
  let within = 0;
  for (const a of bins.values()) within += a[2] - (a[0] * a[0]) / a[1];
  const seq = [...bins.entries()].sort((a, b) => a[0] - b[0]).filter((e) => e[1][1] > 2).map((e) => e[1][0] / e[1][1]);
  let flips = 0, last = 0;
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i] - seq[i - 1];
    if (Math.abs(d) < 0.04) continue;
    if (last && Math.sign(d) !== last) flips++;
    last = Math.sign(d);
  }
  return { r2: 1 - within / n / vt, flips };
};
const SAND_SEEDS = [9, 15, 21, 27, 33, 39, 45, 51];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('roca de arenisca (canto y losa): estratos con la altura, más cálida que la gris, sin musgo en temas verdes', () => {
  for (const type of ['boulder', 'slab']) {
    const sand = SAND_SEEDS.map((s) => heightBands(rock(s, 'high', { type, material: 'sandstone' })));
    const bare = SAND_SEEDS.map((s) => heightBands(rock(s, 'high', { type, material: 'bare' })));
    const r2s = mean(sand.map((b) => b.r2)), r2b = mean(bare.map((b) => b.r2));
    assert.ok(r2s > 0.6 && r2s > r2b + 0.2, `${type}: la altura explica ${r2s.toFixed(2)} (sin musgo ${r2b.toFixed(2)})`);
    if (type === 'boulder') assert.ok(mean(sand.map((b) => b.flips)) >= 2.5, `canto: ${mean(sand.map((b) => b.flips)).toFixed(1)} cambios de sentido`);
    assert.ok(mean(sand.map((b) => b.flips)) > mean(bare.map((b) => b.flips)), `${type}: más bandas que sin musgo`);
    for (const id of [...GREEN_IDS, 'snow', 'canyon']) {
      const g = rock(3, presetOf(id, 'high'), { type, material: 'sandstone' });
      assert.ok(!g.userData.rock.mossy, `${type} ${id}`);
      const col = meshesOf(g)[0].geometry.attributes.color;
      for (let i = 0; i < col.count; i++) {
        assert.ok(col.getX(i) > col.getZ(i) + 0.05, `${type} ${id}: R > B`);
        assert.ok(greenness(col, i) < 0, `${type} ${id}: sin verde`);
      }
    }
  }
});

test('roca de arenisca (canto y losa): base más oscura, mismo presupuesto y mismas tiradas que en gris, y sin material no cambia', () => {
  for (const type of ['boulder', 'slab']) {
    for (const seed of [9, 15]) {
      const g = rock(seed, presetOf('meadowDay', 'high'), { type, material: 'sandstone' });
      const geo = meshesOf(g)[0].geometry, p = geo.attributes.position, col = geo.attributes.color, nor = geo.attributes.normal;
      const box = new THREE.Box3().setFromObject(g), h = box.max.y - box.min.y;
      let lo = 0, nLo = 0, hi = 0, nHi = 0;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) - box.min.y) / h;
        if (t < 0.12) (lo += lum(col, i), nLo++);
        else if (t > 0.35 && nor.getY(i) < 0.6) (hi += lum(col, i), nHi++);
      }
      assert.ok(nLo > 0 && nHi > 0 && lo / nLo < (hi / nHi) * 0.85, `${type} s${seed}: base ${(lo / nLo).toFixed(3)} frente a arriba ${(hi / nHi).toFixed(3)}`);
    }
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const gray = rock(seed, level, { type }), sand = rock(seed, level, { type, material: 'sandstone' });
        assert.equal(tris(sand), tris(gray), `${type} ${level} s${seed}: mismos triángulos`);
        assert.ok(tris(sand) <= budgetOf(type, level));
        assert.equal(meshesOf(sand).length, ROCK_MAX_DRAW_CALLS);
      }
      let n = 0, n0 = 0;
      const r = seededRng(11), r0 = seededRng(11);
      makeRock(() => (n++, r()), level, { type, material: 'sandstone' });
      makeRock(() => (n0++, r0()), level, { type });
      assert.equal(n, n0, `${type} ${level}: mismas tiradas (${n})`);
    }
    // sin `material`: exactamente la roca de siempre (con 'gray', y con un valor desconocido)
    const base = meshesOf(rock(6, presetOf('meadowDay', 'high'), { type }))[0].geometry.attributes;
    for (const material of [undefined, 'gray', 'nope']) {
      const at = meshesOf(rock(6, presetOf('meadowDay', 'high'), { type, material }))[0].geometry.attributes;
      for (const name of Object.keys(base)) assert.deepEqual(at[name].array, base[name].array, `${type} ${material} ${name}`);
    }
    assert.notDeepEqual(colorsOf(rock(6, presetOf('meadowDay', 'high'), { type, material: 'sandstone' })), colorsOf(rock(6, presetOf('meadowDay', 'high'), { type })));
  }
});
