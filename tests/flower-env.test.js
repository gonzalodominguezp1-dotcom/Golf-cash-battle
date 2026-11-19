import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds, FLOWER_GAME_DENSITY } = await import('../src/game/render/environment.js');
const { flowerMaterial, makeFlowerField, FLOWER_MAX, FLOWER_MAX_CALLS, FLOWER_RNG_DRAWS, FLOWER_SPECIES } = await import('../src/game/render/assets/flower.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');

// calidad del juego: sale del almacén de ajustes (settings); se fija y se restaura
const { setQuality, isAutoQuality, getQuality } = await import('../src/game/render/quality.js');
function withQuality(level, fn) {
  const prev = isAutoQuality() ? null : getQuality();
  setQuality(level);
  const restore = () => setQuality(prev);
  let out;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}

function lcg(seed) {
  let s = seed;
  const f = () => (f.calls++, (s = (s * 16807) % 2147483647) / 2147483647);
  f.calls = 0;
  f.state = () => s;
  return f;
}
function build(course, theme = THEMES[course.theme], seed = 7) {
  const scene = new THREE.Scene();
  const rng = lcg(seed);
  const env = buildEnvironment(scene, course, theme, rng);
  const flowers = [];
  scene.traverse((o) => o.isInstancedMesh && o.name.startsWith('flowers-') && flowers.push(o));
  return { scene, rng, env, flowers };
}
const withFlowers = COURSES.filter((c) => THEMES[c.theme]?.flowers && !THEMES[c.theme].neon);
const without = COURSES.filter((c) => !THEMES[c.theme]?.flowers || THEMES[c.theme].neon);
const count = (meshes) => meshes.reduce((n, m) => n + m.count, 0);
const positions = (meshes) => meshes.flatMap((m) => Array.from({ length: m.count }, (_, i) => new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16)).map((e) => [m.name, ...e.elements.slice(12, 15).map((v) => +v.toFixed(5))]));

test('entorno natural: los temas con flores construyen las flores nuevas (una malla por especie, un material)', () => {
  assert.ok(withFlowers.length >= 4);
  for (const c of withFlowers) {
    const { flowers } = build(c);
    assert.ok(flowers.length >= 1 && flowers.length <= FLOWER_MAX_CALLS, `${c.name} (${c.theme}): ${flowers.length} mallas`);
    assert.ok(flowers.every((m) => m.material === flowerMaterial() && FLOWER_SPECIES.includes(m.userData.species)), c.name);
    assert.ok(count(flowers) > 10, `${c.name}: ${count(flowers)} flores`);
  }
});

test('entorno: neón, ciudad, lava, caldera y los temas sin flores no las llevan, y lod/dispose no lanzan', () => {
  assert.ok(COURSES.some((c) => THEMES[c.theme]?.neon));
  assert.ok(without.some((c) => THEMES[c.theme]?.caldera));
  for (const c of without) {
    const { flowers, env } = build(c);
    assert.equal(flowers.length, 0, `${c.name} (${c.theme})`);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()));
    assert.doesNotThrow(() => env.dispose());
  }
});

test('entorno: mismo hoyo y misma semilla, mismas flores y mismo estado del rng', () => {
  for (const c of withFlowers.slice(0, 4)) {
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.deepEqual(positions(a.flowers), positions(b.flowers), c.name);
  }
});

test('rng del hoyo: las flores gastan FLOWER_RNG_DRAWS tiradas fijas, haya muchas flores o ninguna', () => {
  assert.equal(FLOWER_RNG_DRAWS, 1);
  for (const c of withFlowers.slice(0, 3)) {
    const theme = THEMES[c.theme];
    const many = build(c, theme);
    const none = build(c, { ...theme, flora: { ...(theme.flora ?? {}), flowers: 0 } });
    assert.ok(many.flowers.length >= 1 && none.flowers.length === 0, c.name);
    assert.equal(many.rng.calls, none.rng.calls, `${c.name}: mismas tiradas con y sin flores en el campo`);
    assert.equal(many.rng.state(), none.rng.state(), c.name);
    // el campo en sí (la llamada que hace el entorno): una tirada, con flores o sin ellas
    const b = courseBounds(c);
    for (const density of [0, FLOWER_GAME_DENSITY]) {
      const r = lcg(3);
      makeFlowerField({ bounds: b, rng: r, density, level: 'medium', theme });
      assert.equal(r.calls, FLOWER_RNG_DRAWS, `${c.name}: densidad ${density}`);
    }
  }
});

test('flores: la cantidad media se parece a la de las flores viejas y sube con la calidad (FLOWER_GAME_DENSITY)', () => {
  // viejo (medido con 5 semillas en los hoyos con flores): 25,6 / 41,8 / 56,4 flores en Bajo / Medio / Alto
  const old = { low: 25.6, medium: 41.8, high: 56.4 };
  assert.ok(FLOWER_GAME_DENSITY > 0 && FLOWER_GAME_DENSITY < 0.3, 'constante nombrada y ajustable, lejos de la densidad del laboratorio');
  const mean = {};
  for (const level of ['low', 'medium', 'high']) {
    withQuality(level, () => {
      let sum = 0;
      for (const c of withFlowers) sum += count(build(c).flowers);
      mean[level] = sum / withFlowers.length;
    });
    assert.ok(mean[level] <= FLOWER_MAX[level], `${level}: por debajo del tope de la calidad`);
    assert.ok(Math.abs(mean[level] - old[level]) <= old[level] * 0.2, `${level}: ${mean[level]} frente a ${old[level]}`);
  }
  assert.ok(mean.low < mean.medium && mean.medium < mean.high);
});

test('flores: ninguna sobre la pista ni sobre el tee, y a ras de suelo más lejos de la pista', () => {
  for (const c of withFlowers) {
    const bounds = courseBounds(c);
    const [tx, tz] = c.tee;
    const pts = positions(build(c).flowers);
    assert.ok(pts.length > 10, c.name);
    const minD = c.grounded ? 1.6 : 1.2;
    for (const [, x, , z] of pts) {
      const d = Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
      assert.ok(d >= minD - 1e-6, `${c.name}: flor a ${d.toFixed(3)} m de la pista`);
      assert.ok(Math.hypot(x - tx, z - tz) > 1.2 - 1e-6, `${c.name}: flor sobre el tee`);
    }
  }
});

test('flores: ni bajo el agua (y >= agua + 0,25) ni en el cauce del río (distancia >= ancho + 1,1), con varias semillas', () => {
  let rivers = 0, minWater = Infinity, minRiver = Infinity;
  for (const c of withFlowers) {
    // el nivel del agua del tema y dos más altos: así el suelo del campo llega a quedar bajo el agua y la cláusula actúa
    for (const wl of [null, 0.3, 0.8]) for (let seed = 1; seed <= 6; seed++) {
      const theme = wl === null ? THEMES[c.theme] : { ...THEMES[c.theme], waterLevel: wl };
      const { env, flowers } = build(c, theme, seed * 31);
      if (wl !== null) assert.ok(count(flowers) > 0 || c.grounded, `${c.name} agua ${wl}: sin flores`);
      const waterY = env.river?.grounded ? env.river.y : theme.waterLevel;
      if (env.river) rivers++;
      const m = new THREE.Matrix4();
      for (const mesh of flowers) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          const [x, y, z] = m.elements.slice(12, 15);
          minWater = Math.min(minWater, y - waterY);
          // la flor se hunde 0,01 m en el suelo (assets/flower.js): se compara con esa holgura
          assert.ok(y >= waterY + 0.25 - 0.011, `${c.name} semilla ${seed}: flor a ${(y - waterY).toFixed(3)} m sobre el agua`);
          if (env.river) {
            minRiver = Math.min(minRiver, env.river.dist(x, z) - env.river.w);
            assert.ok(env.river.dist(x, z) >= env.river.w + 1.1 - 1e-6, `${c.name} semilla ${seed}: flor a ${(env.river.dist(x, z) - env.river.w).toFixed(3)} m del cauce`);
          }
        }
      }
    }
  }
  assert.ok(rivers >= 4, 'hay hoyos con río y flores');
  assert.ok(minWater < Infinity && minRiver < Infinity);
});

test('flores: lod() las esconde de lejos y las muestra de cerca', () => {
  const c = withFlowers[0];
  const { flowers, env } = build(c);
  env.lod(new THREE.Vector3(1e4, 0, 1e4));
  assert.ok(flowers.every((m) => m.visible === false), 'de muy lejos se esconden');
  const b = courseBounds(c);
  env.lod(new THREE.Vector3((b.minX + b.maxX) / 2, 1.5, (b.minZ + b.maxZ) / 2));
  assert.ok(flowers.some((m) => m.visible), 'de cerca se ven');
});

test('flores: env.dispose() quita el campo, libera sus mallas y geometrías, no el material; es idempotente', () => {
  const { scene, env, flowers } = build(withFlowers[0]);
  const group = flowers[0].parent;
  assert.ok(group && group.parent === scene);
  const geo = new Set(), mesh = new Set();
  let mat = 0;
  for (const m of flowers) {
    m.geometry.addEventListener('dispose', () => geo.add(m));
    m.addEventListener('dispose', () => mesh.add(m));
  }
  flowers[0].material.addEventListener('dispose', () => mat++);
  env.dispose();
  assert.equal(group.parent, null);
  const left = [];
  scene.traverse((o) => o.name?.startsWith('flowers-') && left.push(o));
  assert.equal(left.length, 0);
  assert.equal(geo.size, flowers.length);
  assert.equal(mesh.size, flowers.length);
  assert.equal(mat, 0);
  assert.doesNotThrow(() => env.dispose());
  assert.doesNotThrow(() => env.dispose());
});
