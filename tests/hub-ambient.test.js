// hubAmbient con three real (sin WebGL: solo Scene y mallas) y un canvas falso.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
};
const THREE = await import('three');
const { createHubAmbient } = await import('../src/game/render/hubAmbient.js');

const mk = (opts = {}) => {
  const scene = new THREE.Scene();
  const a = createHubAmbient(scene, { quality: 'medium', rng: () => 0, ...opts });
  return { scene, a };
};
// rng=0: tipo 'particles', espera mínima (medium 9 s). Avanza el reloj en pasos de 0,1 s.
const run = (a, seconds, step = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += step) a.update(step); };

test('crea 3 objetos en la escena y dispose los quita todos', () => {
  const { scene, a } = mk();
  assert.equal(scene.children.length, 3);
  a.dispose();
  assert.equal(scene.children.length, 0);
  a.dispose(); // idempotente
});

test('reduced-motion: nunca aparece nada', () => {
  const { a } = mk({ reducedMotion: true });
  run(a, 300);
  assert.equal(a.active(), null);
  a.dispose();
});

test('clamp de dt: un salto enorme no adelanta el reloj; NaN y negativos se ignoran', () => {
  const { a } = mk();
  a.update(1000); // vale 0,1 s, no 1000
  a.update(NaN);
  a.update(-5);
  assert.equal(a.active(), null);
  run(a, 8); // 8,1 s en total < 9 s de espera
  assert.equal(a.active(), null);
  run(a, 1.5);
  assert.notEqual(a.active(), null);
  a.dispose();
});

test('en 90 s con rng constante salen los tres tipos (rotación)', () => {
  const { a } = mk();
  const seen = new Set();
  for (let t = 0; t < 600; t += 0.1) { a.update(0.1); if (a.active()) seen.add(a.active()); }
  // aunque el azar pida siempre lo mismo, la rotación los reparte
  assert.equal(seen.size, 3);
  a.dispose();
});

test('setEnabled(false) borra lo activo y deja la escena sin apariciones visibles', () => {
  const { scene, a } = mk();
  run(a, 9.5);
  assert.notEqual(a.active(), null);
  a.setEnabled(false);
  assert.equal(a.active(), null);
  for (const o of scene.children) if (o.isMesh && o.geometry.isInstancedBufferGeometry) assert.equal(o.visible, false);
  run(a, 300);
  assert.equal(a.active(), null);
  a.setEnabled(true);
  let again = false;
  for (let t = 0; t < 20; t += 0.1) { a.update(0.1); if (a.active()) again = true; }
  assert.equal(again, true);
  a.dispose();
});

test('setQuality recorta las chispas vivas al nuevo máximo', () => {
  const { scene, a } = mk({ quality: 'high' });
  run(a, 6.5); // high: espera mínima 6 s -> chispas
  const mesh = scene.children.find((o) => o.geometry?.isInstancedBufferGeometry);
  a.update(0.01);
  assert.ok(mesh.geometry.instanceCount > 8);
  a.setQuality('low');
  a.update(0.01);
  assert.ok(mesh.geometry.instanceCount <= 8);
  a.dispose();
});

test('tras dispose, update no hace nada', () => {
  const { scene, a } = mk();
  a.dispose();
  run(a, 60);
  assert.equal(scene.children.length, 0);
});
