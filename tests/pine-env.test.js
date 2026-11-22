import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, makeNaturePine, makeTree, pinePaletteOpts, PINE_SCALE } = await import('../src/game/render/environment.js');
const { makePine, pineMaterials } = await import('../src/game/render/assets/pine.js');
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
const usesPine = (meshes) => meshes.some((o) => o.material === pineMaterials().canopy);
const natural = COURSES.filter((c) => THEMES[c.theme]?.trees?.includes('pine') && !THEMES[c.theme].neon);
const neon = COURSES.filter((c) => THEMES[c.theme]?.neon);

test('entorno natural: los temas con pino lo construyen con pine.js', () => {
  assert.ok(natural.length >= 3);
  for (const c of natural) assert.ok(usesPine(build(c).meshes), `${c.name} (${c.theme})`);
});

test('entorno neón y temas sin pino: no llevan pino nuevo', () => {
  assert.ok(neon.length >= 1);
  for (const c of neon) assert.ok(!usesPine(build(c).meshes), c.name);
  for (const c of COURSES.filter((c) => !THEMES[c.theme]?.trees?.includes('pine'))) assert.ok(!usesPine(build(c).meshes), c.name);
});

test('entorno: mismo hoyo y misma semilla, mismo decorado (mallas y estado del rng)', () => {
  for (const c of natural.slice(0, 4)) {
    const a = build(c), b = build(c);
    assert.equal(a.meshes.length, b.meshes.length, c.name);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.deepEqual(a.meshes.map((m) => m.geometry.attributes.position.count), b.meshes.map((m) => m.geometry.attributes.position.count), c.name);
  }
});

test('luz: el sol es la primera luz direccional de la escena (el pino lee directionalLights[0])', () => {
  for (const c of COURSES) {
    const dirs = [];
    build(c).scene.traverse((o) => o.isDirectionalLight && dirs.push(o));
    assert.ok(dirs.length >= 1, c.name);
    assert.equal(dirs[0].color.getHex(), new THREE.Color(THEMES[c.theme].sunColor).getHex(), c.name);
  }
});

test('pino del decorado: gasta 3 tiradas siempre, sea cual sea la calidad', () => {
  for (const level of [0, 1, 2, 'low', 'high']) {
    const r = lcg(11);
    const before = r.state();
    makeNaturePine(r, 1, 0, 2, THEMES.meadowDay, level);
    const r2 = lcg(11);
    r2(); r2(); r2();
    assert.notEqual(r.state(), before);
    assert.equal(r.state(), r2.state(), `nivel ${level}`);
  }
});

test('pino del decorado: escala en la constante nombrada y altura media parecida al viejo (~2,4 m)', () => {
  assert.ok(PINE_SCALE > 0.4 && PINE_SCALE < 1.2);
  const H = (g) => {
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    return b.max.y - b.min.y;
  };
  let sum = 0, old = 0;
  const N = 60;
  for (let i = 1; i <= N; i++) {
    const g = makeNaturePine(lcg(i * 101), 3, 1, -2, THEMES.meadowDay, 1);
    const h = H(g);
    assert.ok(h > 1.4 && h < 4.2, `h=${h}`);
    assert.equal(g.userData.swayRoot, true);
    assert.deepEqual(g.position.toArray(), [3, 0.95, -2]);
    sum += h;
    old += H(makeTree('pine', lcg(i * 101), 0, 0, 0));
  }
  assert.ok(Math.abs(sum / N - old / N) < 0.3, `nuevo ${sum / N} frente a viejo ${old / N}`);
});

test('paleta: los verdes del tema llegan por opts.leaves y salen oscurecidos', () => {
  assert.deepEqual(pinePaletteOpts(undefined), {});
  assert.deepEqual(pinePaletteOpts(THEMES.meadowDay).leaves, THEMES.meadowDay.leaves);
  const canopyL = (g) => {
    const a = g.children.find((m) => m.material === pineMaterials().canopy).geometry.attributes.color;
    let s = 0;
    for (let i = 0; i < a.count; i++) s += (a.getX(i) + a.getY(i) + a.getZ(i)) / 3;
    return s / a.count;
  };
  const bright = 0x7fe08a;
  const viaOpts = canopyL(makePine(seededRng(5), 'low', { leaves: [bright] }));
  const viaTheme = canopyL(makePine(seededRng(5), 'low', { theme: { leaves: [bright] } }));
  assert.equal(viaOpts, viaTheme, 'opts.leaves se oscurece igual que el tema');
  const c = new THREE.Color(bright);
  assert.ok(viaOpts < (c.r + c.g + c.b) / 3 * 0.8, 'más oscuro que el verde del tema');
});
