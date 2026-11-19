import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds, makeNatureRock, natureTree, rockMaterialOf, ROCK_SCALE, ROCK_PILE_MIN_D, ROCK_JITTER, ROCK_RNG_DRAWS } = await import('../src/game/render/environment.js');
const { rockMaterial } = await import('../src/game/render/assets/rock.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');

// calidad del juego: lee localStorage; en node se simula y se restaura
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
function build(course, seed = 7) {
  const scene = new THREE.Scene();
  const rng = lcg(seed);
  const env = buildEnvironment(scene, course, THEMES[course.theme], rng);
  const rocks = [];
  scene.traverse((o) => o.isMesh && o.material === rockMaterial() && rocks.push(o));
  return { scene, rng, env, rocks };
}
const natural = COURSES.filter((c) => !THEMES[c.theme]?.neon);
const neon = COURSES.filter((c) => THEMES[c.theme]?.neon);
const verts = (meshes) => meshes.flatMap((m) => Array.from(m.geometry.attributes.position.array));

test('entorno natural: todos los temas naturales colocan las rocas nuevas, juntas en pocas llamadas (bakeStatic)', () => {
  assert.ok(natural.length >= 8);
  for (const c of natural) {
    const { rocks } = build(c);
    // una llamada por cubo de sombra (cerca proyecta, lejos no): como mucho 2 en vez de una malla por roca
    assert.ok(rocks.length >= 1 && rocks.length <= 2, `${c.name} (${c.theme}): ${rocks.length} mallas`);
    assert.ok(rocks.every((m) => m.geometry.attributes.color && !m.geometry.attributes.windPhase), c.name);
  }
  // en Alto el corte en cuadrantes de bakeStatic suma llamadas: medido con 20 semillas x todos los hoyos, Bajo y Medio
  // dan como mucho 2 y Alto como mucho 5 (el máximo, 'Dentro del Volcán'); un montón de mallas sueltas daría decenas
  const MAX_CALLS = { low: 2, medium: 2, high: 5 };
  for (const level of ['low', 'medium', 'high']) {
    withQuality(level, () => {
      for (const c of natural) {
        for (let s = 1; s <= 8; s++) {
          const n = build(c, s * 7919).rocks.length;
          assert.ok(n >= 1 && n <= MAX_CALLS[level], `${c.name} ${level} semilla ${s}: ${n} mallas`);
        }
      }
    });
  }
});

test('entorno neón y ciudad: no llevan rocas nuevas', () => {
  assert.ok(neon.length >= 1);
  for (const c of neon) assert.equal(build(c).rocks.length, 0, `${c.name} (${c.theme})`);
});

test('entorno: mismo hoyo y misma semilla, mismas rocas y mismo estado del rng', () => {
  for (const c of natural.slice(0, 5)) {
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.deepEqual(verts(a.rocks), verts(b.rocks), c.name);
  }
});

test('rng del hoyo: cada roca gasta ROCK_RNG_DRAWS tirada, sea cual sea el tipo, la calidad o el tema', () => {
  assert.equal(ROCK_RNG_DRAWS, 1);
  for (const kind of ['rock', 'group', 'pile']) {
    for (const level of [0, 1, 2, 'low', 'high']) {
      for (const theme of [THEMES.meadowDay, THEMES.snow, THEMES.canyon]) {
        const r = lcg(11);
        makeNatureRock(r, 1, 0, 2, theme, level, kind);
        assert.equal(r.calls, ROCK_RNG_DRAWS, `${kind} ${level}`);
      }
    }
  }
});

test('rockpile: natureTree lo sustituye por el montón nuevo; los demás tipos viejos siguen devolviendo null', () => {
  const g = natureTree('rockpile', lcg(5), 1, 0.5, 2, THEMES.canyon, 1);
  assert.equal(g.userData.rock.type, 'pile');
  assert.ok(g.userData.rock.stones >= 5 && g.userData.rock.stones <= 8);
  assert.equal(natureTree('cactus', lcg(5), 0, 0, 0, THEMES.canyon, 1), null);
  assert.equal(natureTree('deadtree', lcg(5), 0, 0, 0, THEMES.volcano, 1), null);
});

test('rocas: ninguna a menos de 0,5 m de la pista (por vértice) con 20 semillas x 3 calidades; a ras de suelo, el claro del tee', () => {
  const MIN = 0.5;
  let worst = Infinity;
  for (const level of ['low', 'medium', 'high']) {
    withQuality(level, () => {
      for (const c of natural) {
        const b = courseBounds(c);
        const [tx, tz] = c.tee;
        for (let seed = 1; seed <= 20; seed++) {
          const p = verts(build(c, seed * 7919).rocks);
          for (let i = 0; i < p.length; i += 3) {
            const x = p[i], z = p[i + 2];
            const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
            worst = Math.min(worst, d);
            assert.ok(d >= MIN, `${c.name} ${level} semilla ${seed}: roca a ${d.toFixed(2)} m de la pista`);
            // el centro queda a más de 9 m del tee; el vértice, a más de 9 - 2,36 (radio máx. del montón) = 6,6 m
            if (c.grounded) assert.ok(Math.hypot(x - tx, z - tz) > 6.5, `${c.name}: roca en el claro del tee`);
          }
        }
      }
    });
  }
  assert.ok(worst < Infinity);
});

test('montón: su radio máximo (escala y variación máximas) cabe en ROCK_PILE_MIN_D con 0,5 m de margen', () => {
  let worst = 0;
  for (const level of [0, 1, 2]) {
    for (let seed = 1; seed <= 60; seed++) {
      const g = makeNatureRock(lcg(seed * 977), 0, 0, 0, THEMES.canyon, level, 'pile');
      g.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let r = 0;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(...[v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)].map((q) => [q.x, q.z]).flat()));
      });
      // se lleva al peor caso de la variación de tamaño (ROCK_JITTER[1]), sea cual fuera la de esta roca
      worst = Math.max(worst, (r * ROCK_SCALE.pile * ROCK_JITTER[1]) / g.scale.x);
    }
  }
  assert.ok(ROCK_PILE_MIN_D - worst >= 0.5, `radio máx. ${worst.toFixed(2)} m, ROCK_PILE_MIN_D ${ROCK_PILE_MIN_D}`);
});

test('material por tema: arenisca en suelo de arena, pelada en nieve y ceniza, gris en hierba', () => {
  const m = (k) => rockMaterialOf(THEMES[k]);
  for (const k of ['canyon', 'beach', 'beachNight']) assert.equal(m(k), 'sandstone', k);
  for (const k of ['snow', 'glacier', 'volcano', 'caldera']) assert.equal(m(k), 'bare', k);
  for (const k of ['meadowDay', 'jungle', 'sunset', 'night', 'gardenNight', 'autumn']) assert.equal(m(k), 'gray', k);
  const r = (k, kind) => makeNatureRock(lcg(9), 0, 0, 0, THEMES[k], 1, kind).userData.rock;
  assert.equal(r('canyon', 'pile').material, 'sandstone');
  assert.equal(r('snow', 'rock').material, 'bare');
});

test('musgo: solo en los temas verdes (hierba y hojas verdes), nunca en nieve, arena, ceniza ni otoño', () => {
  const mossy = (k) => {
    let n = 0;
    for (let s = 1; s <= 40; s++) for (const kind of ['rock', 'group', 'pile']) n += makeNatureRock(lcg(s * 37), 0, 0, 0, THEMES[k], 1, kind).userData.rock.mossy ? 1 : 0;
    return n;
  };
  for (const k of ['meadowDay', 'jungle', 'sunset']) assert.ok(mossy(k) > 0, `${k} con musgo`);
  for (const k of ['snow', 'glacier', 'canyon', 'beach', 'beachNight', 'volcano', 'caldera', 'autumn']) assert.equal(mossy(k), 0, `${k} sin musgo`);
});

test('escala: los tamaños medios quedan cerca de los de las rocas viejas (constantes ROCK_SCALE)', () => {
  // viejo medido: makeRock size 1 -> 1,28 m de ancho; grupo de 3 piedras -> 1,23 m; rockpile -> 3,21 m
  const mean = (kind, type) => {
    let w = 0, n = 0;
    for (let s = 1; s <= 60; s++) {
      const g = makeNatureRock(lcg(s * 101), 0, 0, 0, THEMES.meadowDay, 1, kind);
      if (type && g.userData.rock.type !== type) continue;
      g.updateMatrixWorld(true);
      const sz = new THREE.Box3().setFromObject(g, true).getSize(new THREE.Vector3());
      w += (sz.x + sz.z) / 2;
      n++;
    }
    return w / n;
  };
  assert.ok(Math.abs(mean('rock', 'boulder') - 1.28) < 0.22, `canto ${mean('rock', 'boulder')}`);
  assert.ok(Math.abs(mean('group') - 1.23) < 0.22, `grupo ${mean('group')}`);
  assert.ok(Math.abs(mean('pile') - 3.21) < 0.4, `montón ${mean('pile')}`);
  assert.deepEqual(Object.keys(ROCK_SCALE).sort(), ['boulder', 'group', 'pile', 'slab']);
});

test('rocas: env.lod() y env.dispose() no lanzan en ningún tema natural', () => {
  for (const c of natural.slice(0, 6)) {
    const { env } = build(c);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()), c.name);
    assert.doesNotThrow(() => env.dispose(), c.name);
  }
});
