import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, makeNaturePalm, makeTree, palmPaletteOpts, PALM_SCALE } = await import('../src/game/render/environment.js');
const { makePalm, palmMaterials } = await import('../src/game/render/assets/palm.js');
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
const usesPalm = (meshes) => {
  const m = palmMaterials();
  const set = new Set(Object.values(m));
  return meshes.some((o) => set.has(o.material));
};
const natural = COURSES.filter((c) => THEMES[c.theme]?.trees?.includes('palm') && !THEMES[c.theme].neon);

test('entorno natural: los temas con palmera la construyen con palm.js', () => {
  assert.ok(natural.length >= 1);
  for (const c of natural) assert.ok(usesPalm(build(c).meshes), `${c.name} (${c.theme})`);
});

test('entorno: temas sin palmera y neón no llevan palmera nueva', () => {
  for (const c of COURSES.filter((c) => !THEMES[c.theme]?.trees?.includes('palm') || THEMES[c.theme].neon)) assert.ok(!usesPalm(build(c).meshes), c.name);
});

test('entorno: mismo hoyo y misma semilla, mismo decorado', () => {
  for (const c of natural.slice(0, 3)) {
    const a = build(c), b = build(c);
    assert.equal(a.meshes.length, b.meshes.length, c.name);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
  }
});

test('palmera del decorado: gasta 3 tiradas siempre, sea cual sea la calidad', () => {
  for (const level of [0, 1, 2, 'low', 'high']) {
    const r = lcg(11);
    makeNaturePalm(r, 1, 0, 2, THEMES.meadowDay, level);
    const r2 = lcg(11);
    r2(); r2(); r2();
    assert.equal(r.state(), r2.state(), `nivel ${level}`);
  }
});

test('palmera del decorado: escala nombrada y altura media parecida a la vieja', () => {
  assert.ok(PALM_SCALE > 0.3 && PALM_SCALE < 1.2);
  const H = (g) => {
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    return b.max.y - b.min.y;
  };
  let sum = 0, old = 0;
  const N = 60;
  const theme = natural.map((c) => THEMES[c.theme])[0];
  for (let i = 1; i <= N; i++) {
    const g = makeNaturePalm(lcg(i * 101), 3, 1, -2, theme, 1);
    assert.equal(g.userData.swayRoot, true);
    assert.deepEqual(g.position.toArray(), [3, 0.95, -2]);
    sum += H(g);
    old += H(makeTree('palm', lcg(i * 101), 0, 0, 0));
  }
  assert.ok(Math.abs(sum / N - old / N) < 0.3, `nuevo ${sum / N} frente a viejo ${old / N}`);
});

test('paleta: las hojas del tema llegan a la palmera', () => {
  assert.deepEqual(palmPaletteOpts(undefined), {});
  assert.deepEqual(palmPaletteOpts(THEMES[natural[0].theme]).leaves, THEMES[natural[0].theme].leaves);
  const meanR = (g) => {
    const m = g.children.find((o) => o.material === palmMaterials().frond);
    const a = m.geometry.attributes.color;
    let s = 0;
    for (let i = 0; i < a.count; i++) s += a.getX(i);
    return s / a.count;
  };
  const red = meanR(makePalm(seededRng(5), 'low', { leaves: [0xff0000] }));
  const green = meanR(makePalm(seededRng(5), 'low', { leaves: [0x00ff00] }));
  assert.notEqual(red, green);
});
