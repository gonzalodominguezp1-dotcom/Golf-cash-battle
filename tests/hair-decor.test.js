import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHairDecor, fillHairGeometry } from '../src/game/render/skins/hairDecor.js';
import { SKINS, skinById } from '../src/progress/skins.js';

const radii = (geo) => {
  const a = geo.getAttribute('position').array;
  const out = [];
  for (let i = 0; i < a.length; i += 3) out.push(Math.hypot(a[i], a[i + 1], a[i + 2]));
  return out;
};

test('cada pelo es un tubo: vértices e índices exactos y todo finito', () => {
  const g = fillHairGeometry(new THREE.BufferGeometry(), { count: 50, seed: 3 });
  assert.equal(g.getAttribute('position').count, 50 * 11 * 4); // 10 tramos (bultito + pelo) x 4 caras
  assert.equal(g.index.count, 50 * 10 * 4 * 6);
  assert.equal(g.getAttribute('color').count, g.getAttribute('position').count);
  for (const k of ['position', 'normal', 'color']) assert.ok(Array.from(g.getAttribute(k).array).every(Number.isFinite), k);
  assert.ok(Math.max(...g.index.array) < g.getAttribute('position').count);
});

test('muchos pelos no desbordan los índices (Uint32 si hace falta)', () => {
  const g = fillHairGeometry(new THREE.BufferGeometry(), { count: 1600, seed: 2 });
  assert.ok(g.getAttribute('position').count > 65535);
  assert.ok(g.index.array instanceof Uint32Array);
  let max = 0;
  for (const i of g.index.array) if (i > max) max = i;
  assert.ok(max < g.getAttribute('position').count);
});

test('reparto: se agrupan junto al rafe (x ≈ 0, por delante) y la raíz es color carne, no negra', () => {
  const n = 400;
  const g = fillHairGeometry(new THREE.BufferGeometry(), { count: n, seed: 5 });
  const a = g.getAttribute('position').array, c = g.getAttribute('color').array;
  let near = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 11 * 4 * 3; // centro del anillo 0 (bultito) = raíz
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 4; j++) { x += a[o + j * 3]; y += a[o + j * 3 + 1]; z += a[o + j * 3 + 2]; }
    const r = Math.hypot(x, y, z);
    if (Math.abs(x / r) < 0.15 && z / r > -0.2) near++;
    assert.ok(c[o] > c[o + 3 * 4 * 5], 'la raíz es más clara que el pelo');
  }
  // al azar solo caería ~15 % en esa franja; con el rafe, bastante más
  assert.ok(near / n > 0.3, `junto al rafe: ${near}/${n}`);
});

test('los pelos SOBRESALEN de la esfera: raíces en la piel y puntas claramente fuera', () => {
  const r = radii(fillHairGeometry(new THREE.BufferGeometry(), { count: 200, seed: 1 }));
  assert.ok(Math.min(...r) > 0.95, 'ninguna raíz se hunde dentro de la bola');
  assert.ok(Math.max(...r) > 1.15, 'hay puntas bien por fuera de la silueta');
});

test('determinista por semilla: misma semilla igual, otra semilla distinta', () => {
  const pos = (seed) => Array.from(fillHairGeometry(new THREE.BufferGeometry(), { count: 20, seed }).getAttribute('position').array);
  assert.deepEqual(pos(7), pos(7));
  assert.notDeepEqual(pos(7), pos(8));
});

test('count 0 no rompe y setSeed rehace la misma geometría', () => {
  assert.equal(fillHairGeometry(new THREE.BufferGeometry(), { count: 0 }).getAttribute('position').count, 0);
  const d = createHairDecor({ count: 10, seed: 1 });
  const before = Array.from(d.geometry.getAttribute('position').array);
  d.setSeed(2);
  assert.notDeepEqual(Array.from(d.geometry.getAttribute('position').array), before);
  d.setSeed(1);
  assert.deepEqual(Array.from(d.geometry.getAttribute('position').array), before);
  d.setOpacity(0.5);
  assert.equal(d.material.transparent, true);
  d.setOpacity(1);
  assert.equal(d.material.transparent, false);
  d.dispose();
  d.dispose(); // idempotente
});

test('huevo_mio declara pelos en media y alta; ninguna otra skin los lleva', () => {
  const cfg = skinById('huevo_mio').decor.hair;
  assert.ok(cfg.medium > 0 && cfg.high >= cfg.medium && cfg.high <= 600);
  assert.ok(!('low' in cfg), 'en baja se queda la textura pintada');
  assert.deepEqual(SKINS.filter((s) => s.decor).map((s) => s.id), ['huevo_mio']);
});

test('attachSkinDecor cuelga un clon escalado, lo sustituye y lo quita', async () => {
  const { attachSkinDecor } = await import('../src/game/render/ballSkins.js');
  const decor = createHairDecor({ count: 5, seed: 1 });
  const handle = { decor };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6));
  const mirror = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6));
  attachSkinDecor(mesh, handle, 0.4);
  attachSkinDecor(mirror, handle, 0.4);
  assert.equal(mesh.children.length, 1);
  assert.equal(mirror.children.length, 1, 'el espejo también tiene sus pelos');
  assert.equal(mesh.children[0].scale.x, 0.4);
  assert.equal(mesh.children[0].children[0].geometry, decor.geometry, 'comparten geometría');
  attachSkinDecor(mesh, handle, 0.4);
  assert.equal(mesh.children.length, 1, 'no se acumulan');
  attachSkinDecor(mesh, null);
  assert.equal(mesh.children.length, 0);
  attachSkinDecor(mesh, {}); // skin sin extras: no falla
  assert.equal(mesh.children.length, 0);
});
