import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { grassMaterial, grassMixOf, GRASS_CLEAR, GRASS_MAX_CALLS } = await import('../src/game/render/assets/grass.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { floraOf } = await import('../src/game/render/flora.js');

function lcg(seed) {
  let s = seed;
  const f = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  f.state = () => s;
  return f;
}
function build(course) {
  const scene = new THREE.Scene();
  const rng = lcg(7);
  const env = buildEnvironment(scene, course, THEMES[course.theme], rng);
  const grass = [];
  scene.traverse((o) => o.isInstancedMesh && o.name.startsWith('grass-') && grass.push(o));
  return { scene, rng, env, grass };
}
const hasGrass = (t) => t && !t.neon && !!grassMixOf(t) && floraOf(t).grass > 0 && !t.caldera;
const natural = COURSES.filter((c) => hasGrass(THEMES[c.theme]));
const noGrass = COURSES.filter((c) => !hasGrass(THEMES[c.theme]));
const positions = (meshes) => meshes.flatMap((m) => Array.from({ length: m.count }, (_, i) => new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16)).map((e) => [m.name, ...e.elements.slice(12, 15).map((v) => +v.toFixed(5))]));

test('entorno natural: los temas con hierba construyen el césped nuevo (una malla por especie)', () => {
  assert.ok(natural.length >= 3);
  for (const c of natural) {
    const { grass } = build(c);
    assert.ok(grass.length >= 1 && grass.length <= GRASS_MAX_CALLS, `${c.name} (${c.theme}): ${grass.length} mallas`);
    assert.ok(grass.every((m) => m.material === grass[0].material), `${c.name}: un solo material`);
  }
});

test('entorno: neón, ciudad, lava y caldera no llevan césped', () => {
  assert.ok(COURSES.some((c) => THEMES[c.theme]?.neon));
  assert.ok(noGrass.length >= 1);
  for (const c of noGrass) {
    const { grass, env } = build(c);
    assert.equal(grass.length, 0, `${c.name} (${c.theme})`);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()));
    assert.doesNotThrow(() => env.dispose());
  }
});

test('entorno: mismo hoyo y misma semilla, mismo césped y mismo rng', () => {
  for (const c of natural.slice(0, 4)) {
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.deepEqual(positions(a.grass), positions(b.grass), c.name);
  }
});

test('césped: ninguna mata sobre la pista ni sobre el tee', () => {
  for (const c of natural) {
    const bounds = courseBounds(c);
    const [tx, tz] = c.tee;
    const pts = positions(build(c).grass);
    assert.ok(pts.length > 100, `${c.name}: ${pts.length} matas`);
    for (const [, x, , z] of pts) {
      const d = Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
      assert.ok(d >= GRASS_CLEAR.course - 1e-6, `${c.name}: mata a ${d.toFixed(3)} m de la pista`);
      assert.ok(Math.hypot(x - tx, z - tz) > 1.2 - 1e-6, `${c.name}: mata sobre el tee`);
    }
  }
});

test('césped: el material es el compartido de la calidad y lo actualiza lod() sin lanzar', () => {
  const c = natural[0];
  const { grass, env } = build(c);
  const levels = ['low', 'medium', 'high'].map((l) => grassMaterial(l));
  assert.ok(levels.includes(grass[0].material));
  env.lod(new THREE.Vector3(1e4, 0, 1e4));
  assert.ok(grass.every((m) => m.visible === false), 'de muy lejos se esconde');
  const b = courseBounds(c);
  env.lod(new THREE.Vector3((b.minX + b.maxX) / 2, 1.5, (b.minZ + b.maxZ) / 2));
  assert.ok(grass.some((m) => m.visible), 'de cerca se ve');
});

test('césped: env.dispose() quita el grupo, libera las geometrías y no el material compartido; es idempotente', () => {
  const { scene, env, grass } = build(natural[0]);
  assert.ok(grass.length >= 1);
  const group = grass[0].parent;
  assert.ok(group && group.parent === scene, 'el grupo cuelga de la escena');
  const geoDisposed = new Set(), meshDisposed = new Set(), matDisposed = [];
  for (const m of grass) {
    m.geometry.addEventListener('dispose', () => geoDisposed.add(m));
    m.addEventListener('dispose', () => meshDisposed.add(m));
  }
  grass[0].material.addEventListener('dispose', () => matDisposed.push(1));
  env.dispose();
  assert.equal(group.parent, null, 'el grupo ya no cuelga de la escena');
  const left = [];
  scene.traverse((o) => o.name?.startsWith('grass-') && left.push(o));
  assert.equal(left.length, 0, 'no quedan mallas grass-* en la escena');
  assert.equal(geoDisposed.size, grass.length, 'todas las geometrías emitieron dispose');
  assert.equal(meshDisposed.size, grass.length, 'todas las InstancedMesh emitieron dispose');
  assert.equal(matDisposed.length, 0, 'el material compartido no se libera');
  assert.doesNotThrow(() => env.dispose());
  assert.doesNotThrow(() => env.dispose());
});

const groundOf = (scene) => {
  let best = null;
  scene.children.forEach((o) => o.isMesh && o.receiveShadow && o.material.vertexColors && o.geometry.attributes.color && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count) && (best = o));
  return best.geometry;
};
// mismo tema con la hierba apagada por el propio tema (flora.grass = 0): referencia sin tinte
function buildGround(course, theme) {
  const scene = new THREE.Scene();
  const env = buildEnvironment(scene, course, theme, lcg(7));
  return { geo: groundOf(scene), env, scene };
}
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

test('suelo: sin hierba (neón) el color del suelo no se tiñe', () => {
  const c = noGrass.find((k) => THEMES[k.theme]?.neon);
  assert.ok(c);
  const theme = THEMES[c.theme];
  const a = buildGround(c, theme).geo.attributes.color.array;
  const b = buildGround(c, { ...theme, flora: { ...(theme.flora ?? {}), grass: 0.9 } }).geo.attributes.color.array;
  assert.equal(maxDiff(a, b), 0);
});

test('suelo: con hierba natural el color se tiñe, pero la altura del suelo no cambia', () => {
  for (const c of natural.slice(0, 3)) {
    const theme = THEMES[c.theme];
    const withG = buildGround(c, theme).geo;
    const base = buildGround(c, { ...theme, flora: { ...(theme.flora ?? {}), grass: 0 } }).geo;
    const pa = withG.attributes.position.array, pb = base.attributes.position.array;
    assert.equal(pa.length, pb.length);
    let dy = 0;
    for (let i = 1; i < pa.length; i += 3) dy = Math.max(dy, Math.abs(pa[i] - pb[i]));
    assert.equal(dy, 0, `${c.name}: la y del suelo no cambia`);
    assert.ok(maxDiff(withG.attributes.color.array, base.attributes.color.array) > 0, `${c.name}: el color sí cambia`);
  }
});
