import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, makeNatureRoundTree, roundTreePalette, ROUND_TREE_SCALE } = await import('../src/game/render/environment.js');
const { makeRoundTree, roundTreeMaterials } = await import('../src/game/render/assets/roundTree.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { seededRng } = await import('../src/lab/assetRegistry.js');

function lcg(seed) {
  let s = seed;
  const f = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  f.state = () => s;
  return f;
}
function build(course) {
  const scene = new THREE.Scene();
  const rng = lcg(7);
  buildEnvironment(scene, course, THEMES[course.theme], rng);
  const meshes = [];
  scene.traverse((o) => o.isMesh && meshes.push(o));
  return { scene, rng, meshes };
}
const usesRound = (meshes) => {
  const m = roundTreeMaterials();
  return meshes.some((o) => o.material === m.canopy);
};
const natural = COURSES.filter((c) => THEMES[c.theme]?.trees?.includes('round') && !THEMES[c.theme].neon);
const neon = COURSES.filter((c) => THEMES[c.theme]?.neon);

test('entorno natural: los temas con árbol redondo lo construyen con roundTree', () => {
  assert.ok(natural.length >= 3);
  for (const c of natural) assert.ok(usesRound(build(c).meshes), `${c.name} (${c.theme})`);
});

test('entorno neón y temas sin árbol redondo: no llevan árbol nuevo', () => {
  assert.ok(neon.length >= 1);
  for (const c of neon) assert.ok(!usesRound(build(c).meshes), c.name);
  for (const c of COURSES.filter((c) => !THEMES[c.theme]?.trees?.includes('round'))) assert.ok(!usesRound(build(c).meshes), c.name);
});

test('entorno: mismo hoyo y misma semilla, mismo decorado (mallas y estado del rng)', () => {
  for (const c of natural.slice(0, 4)) {
    const a = build(c), b = build(c);
    assert.equal(a.meshes.length, b.meshes.length, c.name);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    const pa = a.meshes.map((m) => m.geometry.attributes.position.count), pb = b.meshes.map((m) => m.geometry.attributes.position.count);
    assert.deepEqual(pa, pb, c.name);
  }
});

test('luz: el sol es la primera luz direccional de la escena (roundTree lee directionalLights[0])', () => {
  for (const c of COURSES) {
    const { scene } = build(c);
    const dirs = [];
    scene.traverse((o) => o.isDirectionalLight && dirs.push(o));
    assert.ok(dirs.length >= 1, c.name);
    assert.equal(dirs[0].color.getHex(), new THREE.Color(THEMES[c.theme].sunColor).getHex(), `${c.name}: la primera luz no es el sol`);
    assert.ok(dirs[0].intensity === THEMES[c.theme].sunIntensity, c.name);
  }
});

test('árbol redondo del decorado: gasta 3 tiradas siempre, sea cual sea la calidad', () => {
  for (const level of [0, 1, 2, 'low', 'high']) {
    const r = lcg(11);
    const before = r.state();
    makeNatureRoundTree(r, 1, 0, 2, THEMES.meadowDay, level);
    const r2 = lcg(11);
    r2(); r2(); r2();
    assert.notEqual(r.state(), before);
    assert.equal(r.state(), r2.state(), `nivel ${level}`);
  }
});

test('árbol redondo del decorado: escala en la constante nombrada y altura media parecida al viejo (~2,2 m)', () => {
  assert.ok(ROUND_TREE_SCALE > 0.6 && ROUND_TREE_SCALE < 1.5);
  let sum = 0;
  const N = 60;
  for (let i = 1; i <= N; i++) {
    const g = makeNatureRoundTree(lcg(i * 101), 3, 1, -2, THEMES.meadowDay, 1);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const h = box.max.y - box.min.y;
    assert.ok(h > 1.2 && h < 4.6, `h=${h}`);
    assert.equal(g.userData.swayRoot, true);
    assert.deepEqual(g.position.toArray(), [3, 0.95, -2]);
    sum += h;
  }
  const mean = sum / N;
  assert.ok(mean > 1.9 && mean < 2.6, `altura media ${mean}`);
});

test('paleta del tema: opts > quality.theme > por defecto; el tema sin hojas usa el verde de siempre', () => {
  const colorOf = (g) => {
    const c = g.children.find((m) => m.material === roundTreeMaterials().canopy).geometry.attributes.color;
    return [c.getX(0), c.getY(0), c.getZ(0)];
  };
  const red = { level: 'medium', theme: { leaves: [0xff0000], bark: 0x333333 } };
  const blue = { leaves: [0x0000ff] };
  const byPreset = colorOf(makeRoundTree(seededRng(3), red));
  const byOpts = colorOf(makeRoundTree(seededRng(3), red, blue));
  const byDefault = colorOf(makeRoundTree(seededRng(3), 'medium'));
  assert.ok(byPreset[0] > byPreset[2] * 3, 'rojo desde quality.theme');
  assert.ok(byOpts[2] > byOpts[0] * 3, 'opts gana a quality.theme');
  assert.notDeepEqual(byDefault, byPreset);
  assert.deepEqual(colorOf(makeRoundTree(seededRng(3), { level: 'medium' })), byDefault, 'preset sin theme: como antes');
  assert.deepEqual(roundTreePalette({}).leaves, roundTreePalette(undefined).leaves);
  assert.deepEqual(roundTreePalette(THEMES.meadowDay).leaves, THEMES.meadowDay.leaves);
});
