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

// raíz de cada pelo = media de los 4 vértices de su anillo 0 (el bultito), normalizada
const rootsOf = (g, n) => {
  const a = g.getAttribute('position').array, out = [];
  for (let i = 0; i < n; i++) {
    const o = i * 11 * 4 * 3;
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 4; j++) { x += a[o + j * 3]; y += a[o + j * 3 + 1]; z += a[o + j * 3 + 2]; }
    const r = Math.hypot(x, y, z);
    out.push([x / r, y / r, z / r]);
  }
  return out;
};
const minNN = (pts) => {
  let m = 4;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]));
  return m;
};

test('reparto parejo: sin zonas apelmazadas ni huecos, y la raíz es color carne', () => {
  const n = 340;
  const g = fillHairGeometry(new THREE.BufferGeometry(), { count: n, seed: 5 });
  const pts = rootsOf(g, n);
  // cada octante de la esfera recibe cerca de n/8 pelos
  const oct = new Array(8).fill(0);
  for (const [x, y, z] of pts) oct[(x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 4 : 0)]++;
  for (const c of oct) assert.ok(Math.abs(c - n / 8) < (n / 8) * 0.3, `octante con ${c} pelos (esperado ~${n / 8}): ${oct}`);
  // y ninguna pareja casi encima (al azar puro sí ocurre)
  const even = minNN(pts), plain = minNN(rootsOf(fillHairGeometry(new THREE.BufferGeometry(), { count: n, seed: 5, spread: 1 }), n));
  assert.ok(even > plain * 2, `mejor candidato ${even.toFixed(3)} vs azar puro ${plain.toFixed(3)}`);
  const c = g.getAttribute('color').array;
  for (let i = 0; i < n; i++) assert.ok(c[i * 132] > c[i * 132 + 3 * 4 * 5], 'la raíz es más clara que el pelo');
});

test('con seam y clump se pueden agrupar (opciones conservadas)', () => {
  const n = 300;
  const pts = rootsOf(fillHairGeometry(new THREE.BufferGeometry(), { count: n, seed: 5, seam: 0.5, clump: 0.2 }), n);
  assert.ok(pts.filter(([x, , z]) => Math.abs(x) < 0.15 && z > -0.2).length / n > 0.3);
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
