import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { chunk, collectTextures, runSteps, withCap, yieldToMain } from '../src/game/warmupRules.js';

test('runSteps cede entre pasos y reporta progreso', async () => {
  const log = [];
  const prog = [];
  const r = await runSteps(
    [() => log.push('a'), async () => log.push('b'), () => log.push('c')],
    { yieldFn: () => { log.push('y'); return Promise.resolve(); }, onProgress: (p) => prog.push(p) },
  );
  assert.deepEqual(log, ['a', 'y', 'b', 'y', 'c']);
  assert.deepEqual(prog, [1 / 3, 2 / 3, 1]);
  assert.equal(r.cancelled, false);
});

test('runSteps se cancela con signal.cancelled', async () => {
  const signal = { cancelled: false };
  const log = [];
  const r = await runSteps([() => { log.push(1); signal.cancelled = true; }, () => log.push(2)], { signal, yieldFn: async () => {} });
  assert.deepEqual(log, [1]);
  assert.equal(r.cancelled, true);
});

test('runSteps propaga errores', async () => {
  await assert.rejects(runSteps([() => { throw new Error('boom'); }], { yieldFn: async () => {} }), /boom/);
});

test('yieldToMain resuelve', async () => {
  await yieldToMain();
});

test('withCap resuelve a tiempo y a timeout con timers falsos', async () => {
  let fire;
  let cleared = 0;
  const timers = { setTimeout: (fn) => { fire = fn; return 7; }, clearTimeout: (id) => { if (id === 7) cleared++; } };
  assert.deepEqual(await withCap(Promise.resolve(5), 100, timers), { ok: true, value: 5 });
  assert.equal(cleared, 1);
  const never = new Promise(() => {});
  const p = withCap(never, 100, timers);
  fire();
  assert.deepEqual(await p, { ok: false, timeout: true });
});

test('chunk parte en trozos', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 4), []);
});

test('collectTextures recoge mapas, materiales múltiples y uniforms', () => {
  const map = new THREE.Texture();
  const normal = new THREE.Texture();
  const other = new THREE.Texture();
  const uni = new THREE.Texture();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map, normalMap: normal })));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({ map }), new THREE.MeshBasicMaterial({ map: other })]));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial({ uniforms: { tex: { value: uni }, k: { value: 3 } } })));
  const set = collectTextures(root);
  assert.equal(set.size, 4);
  for (const t of [map, normal, other, uni]) assert.ok(set.has(t));
});

const src = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8');

test('GolfGame: compileAsync con setRenderTarget previo y WARM_GPU exportada', () => {
  assert.match(src, /export const WARM_GPU = true;/);
  const warm = src.slice(src.indexOf('async #warmGpu('));
  const i = warm.indexOf('compileAsync(');
  assert.ok(i > 0);
  assert.ok(warm.lastIndexOf('setRenderTarget(', i) > 0, 'setRenderTarget antes de compileAsync');
  const build = src.slice(src.indexOf('  #buildScene()'), src.indexOf('  #resetFx()'));
  const j = build.indexOf('compileAsync(');
  if (j >= 0) assert.ok(build.lastIndexOf('if (!WARM_GPU)', j) > 0, 'en #buildScene solo bajo el interruptor');
});
