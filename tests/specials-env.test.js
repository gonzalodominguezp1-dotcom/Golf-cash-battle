import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds, makeNatureSnowPine, makeNatureCactus, makeNatureDeadTree, natureTree, makeTree, SNOW_PINE_SCALE, CACTUS_SCALE, DEAD_TREE_SCALE } = await import('../src/game/render/environment.js');
const { cactusMaterial, deadTreeMaterial } = await import('../src/game/render/assets/specials.js');
const { pineMaterials } = await import('../src/game/render/assets/pine.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');

const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function withQuality(level, fn) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => level, setItem() {} } });
  try {
    return fn();
  } finally {
    if (real) Object.defineProperty(globalThis, 'localStorage', real);
    else delete globalThis.localStorage;
  }
}
function lcg(seed) {
  let s = seed;
  const f = () => (f.calls++, (s = (s * 16807) % 2147483647) / 2147483647);
  f.calls = 0;
  f.state = () => s;
  return f;
}
// rng bien repartido (el lcg con semillas pequeñas da primeras tiradas casi iguales: no sirve para medir alturas)
function mb(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function build(course, seed = 7) {
  const scene = new THREE.Scene();
  const rng = lcg(seed);
  buildEnvironment(scene, course, THEMES[course.theme], rng);
  const meshes = [];
  scene.traverse((o) => o.isMesh && meshes.push(o));
  return { scene, rng, meshes };
}
const KINDS = {
  snowpine: { make: makeNatureSnowPine, scale: SNOW_PINE_SCALE, theme: 'snow', mats: () => [pineMaterials().canopy] },
  cactus: { make: makeNatureCactus, scale: CACTUS_SCALE, theme: 'canyon', mats: () => [cactusMaterial()] },
  deadtree: { make: makeNatureDeadTree, scale: DEAD_TREE_SCALE, theme: 'volcano', mats: () => [deadTreeMaterial()] },
};
const coursesWith = (kind) => COURSES.filter((c) => THEMES[c.theme]?.trees?.includes(kind) && !THEMES[c.theme].neon);
const mine = (kind, meshes) => meshes.filter((m) => KINDS[kind].mats().includes(m.material));

for (const kind of Object.keys(KINDS)) {
  test(`${kind}: los hoyos cuyo tema lo usa lo construyen con la malla nueva`, () => {
    const cs = coursesWith(kind);
    assert.ok(cs.length >= 1, kind);
    for (const c of cs) assert.ok(mine(kind, build(c).meshes).length >= 1, `${c.name} (${c.theme})`);
  });

  test(`${kind}: natureTree devuelve el nuevo (con swayRoot) y gasta 3 tiradas con cualquier calidad`, () => {
    const { make, theme } = KINDS[kind];
    const g = natureTree(kind, lcg(5), 1, 0.5, 2, THEMES[theme], 1);
    assert.ok(g && g.isGroup && g.userData.swayRoot === true);
    assert.deepEqual(g.position.toArray(), [1, 0.45, 2]);
    for (const level of [0, 1, 2, 'low', 'high']) {
      const r = lcg(11);
      make(r, 1, 0, 2, THEMES[theme], level);
      assert.equal(r.calls, 3, `${kind} ${level}`);
    }
    const pos = (o) => Array.from(o.children[0].geometry.attributes.position.array);
    assert.deepEqual(pos(make(lcg(9), 0, 0, 0, THEMES[theme], 1)), pos(make(lcg(9), 0, 0, 0, THEMES[theme], 1)));
  });

  test(`${kind}: escala en la constante nombrada y altura media igual a la del viejo (±5 %)`, () => {
    const { make, scale, theme } = KINDS[kind];
    assert.ok(scale > 0.5 && scale < 1.5);
    const H = (g) => {
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g);
      return b.max.y - b.min.y;
    };
    let sum = 0, old = 0;
    const N = 100;
    for (let i = 1; i <= N; i++) {
      sum += H(make(mb(i * 101), 0, 0, 0, THEMES[theme], 1));
      old += H(makeTree(kind, mb(i * 101), 0, 0, 0));
    }
    assert.ok(Math.abs(sum / old - 1) < 0.05, `${kind}: nuevo ${sum / N} frente a viejo ${old / N}`);
  });
}

test('pino nevado: la paleta del tema (hojas) llega al pino', () => {
  const col = (g) => Array.from(g.children.find((m) => m.material === pineMaterials().canopy).geometry.attributes.color.array).join();
  const a = makeNatureSnowPine(lcg(3), 0, 0, 0, { leaves: [0x7fe08a] }, 0);
  const b = makeNatureSnowPine(lcg(3), 0, 0, 0, {}, 0);
  assert.notEqual(col(a), col(b));
});

test('temas sin esos árboles (y neón, ciudad, lava): no llevan las mallas nuevas', () => {
  let untouched = 0;
  for (const c of COURSES) {
    const t = THEMES[c.theme];
    const meshes = build(c).meshes;
    for (const k of Object.keys(KINDS)) {
      if (k === 'snowpine') continue; // su malla de copa es la del pino: se comprueba por tema abajo
      if (!t.trees?.includes(k) || t.neon) assert.equal(mine(k, meshes).length, 0, `${c.name} ${k}`);
    }
    if (!t.trees?.includes('snowpine') && !t.trees?.includes('pine')) assert.equal(mine('snowpine', meshes).length, 0, c.name);
    if (!Object.keys(KINDS).some((k) => t.trees?.includes(k))) untouched++;
  }
  assert.ok(untouched >= 3);
});

test('bakeStatic: pino nevado y pino juntos en pocas llamadas; cactus y árbol seco en 1 por cubo de sombra', () => {
  const MAX = { snowpine: 4, cactus: 2, deadtree: 2 }; // medido: una malla por cubo de sombra (cerca/lejos) por material
  for (const kind of Object.keys(KINDS)) {
    for (const level of ['low', 'medium']) {
      withQuality(level, () => {
        for (const c of coursesWith(kind)) {
          for (let s = 1; s <= 4; s++) {
            const n = mine(kind, build(c, s * 7919).meshes).length;
            assert.ok(n >= 1 && n <= MAX[kind], `${c.name} ${kind} ${level} s${s}: ${n} mallas`);
          }
        }
      });
    }
  }
  // y cada árbol suelto: 2 mallas (pino nevado: copa con nieve + tronco), 1 (cactus), 1 (árbol seco)
  for (const [kind, n] of [['snowpine', 2], ['cactus', 1], ['deadtree', 1]]) {
    for (const level of [0, 1, 2]) assert.equal(KINDS[kind].make(lcg(4), 0, 0, 0, THEMES[KINDS[kind].theme], level).children.length, n, `${kind} ${level}`);
  }
});

test('sin árboles especiales sobre la pista ni en el claro del tee (con 6 semillas x 2 calidades)', () => {
  for (const kind of ['cactus', 'deadtree']) {
    for (const level of ['low', 'high']) {
      withQuality(level, () => {
        for (const c of coursesWith(kind)) {
          const b = courseBounds(c);
          const [tx, tz] = c.tee;
          for (let seed = 1; seed <= 6; seed++) {
            for (const m of mine(kind, build(c, seed * 31).meshes)) {
              const p = m.geometry.attributes.position;
              for (let i = 0; i < p.count; i += 3) {
                const x = p.getX(i), z = p.getZ(i);
                const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
                assert.ok(d >= 0.5, `${c.name} ${level} s${seed}: a ${d.toFixed(2)} m de la pista`);
                if (c.grounded) assert.ok(Math.hypot(x - tx, z - tz) > 6, `${c.name}: en el claro del tee`);
              }
            }
          }
        }
      });
    }
  }
});

test('rng del hoyo: determinista (mismo estado y mismas mallas con la misma semilla)', () => {
  for (const kind of Object.keys(KINDS)) {
    const c = coursesWith(kind)[0];
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.equal(a.rng.calls, b.rng.calls, c.name);
    assert.equal(a.meshes.length, b.meshes.length, c.name);
  }
});
