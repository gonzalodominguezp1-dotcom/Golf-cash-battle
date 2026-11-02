import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createRain } from '../src/game/render/cyberpunkRain.js';
import { createPuddles, puddlePolygons, PUDDLE_LIFT } from '../src/game/render/cyberpunkPuddles.js';
import { qualityPreset } from '../src/game/render/quality.js';
import { COURSES } from '../src/game/courses.js';
import { CUP_R, WALL_HALF } from '../src/game/physics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cyber = COURSES.find((c) => c.theme === 'cyber2078');

test('lluvia: low no añade malla; medium y high añaden una sola, con más gotas en high', () => {
  assert.equal(qualityPreset('low').rain, 0);
  assert.equal(createRain(new THREE.Scene(), cyber, qualityPreset('low')), null);

  const counts = {};
  for (const level of ['medium', 'high']) {
    const scene = new THREE.Scene();
    const before = scene.children.length;
    assert.ok(createRain(scene, cyber, qualityPreset(level)));
    const added = scene.children.slice(before);
    assert.equal(added.length, 1, `${level}: una sola malla de lluvia`);
    assert.ok(added[0] instanceof THREE.LineSegments);
    counts[level] = added[0].geometry.attributes.position.count / 2;
    assert.equal(counts[level], qualityPreset(level).rain, `${level}: gotas = preset`);
  }
  assert.ok(counts.high > counts.medium);
});

test('lluvia: ninguna gota cae dentro del contorno del campo (la bola no queda tapada)', () => {
  const scene = new THREE.Scene();
  createRain(scene, cyber, qualityPreset('high'));
  const pos = scene.children[0].geometry.attributes.position.array;
  const xs = cyber.outline.map((p) => p[0]), zs = cyber.outline.map((p) => p[1]);
  for (let i = 0; i < pos.length; i += 6) {
    const x = pos[i], z = pos[i + 2];
    const inside = x > Math.min(...xs) && x < Math.max(...xs) && z > Math.min(...zs) && z < Math.max(...zs);
    assert.ok(!inside, `gota dentro del campo en ${x.toFixed(2)},${z.toFixed(2)}`);
  }
});

test('charcos: low no añade malla; medium y high añaden una sola con el número del preset', () => {
  assert.equal(qualityPreset('low').puddles, 0);
  assert.equal(createPuddles(new THREE.Scene(), cyber, null, qualityPreset('low').puddles), null);
  for (const level of ['medium', 'high']) {
    const scene = new THREE.Scene();
    const n = qualityPreset(level).puddles;
    assert.ok(n > 0);
    const before = scene.children.length;
    assert.ok(createPuddles(scene, cyber, null, n));
    assert.equal(scene.children.slice(before).length, 1, `${level}: una sola malla de charcos`);
    assert.equal(puddlePolygons(cyber, n).length, n, `${level}: charcos = preset`);
  }
  assert.ok(qualityPreset('high').puddles > qualityPreset('medium').puddles);
  // el nivel medio es el primer tramo del alto (misma semilla): los charcos no cambian al subir de nivel
  const hi = puddlePolygons(cyber, qualityPreset('high').puddles);
  const md = puddlePolygons(cyber, qualityPreset('medium').puddles);
  assert.deepEqual(md, hi.slice(0, md.length));
});

test('charcos: altura sobre el suelo <= 1 cm y sin ningún charco pegado a una pieza, la línea de salida ni el hoyo', () => {
  assert.ok(PUDDLE_LIFT > 0 && PUDDLE_LIFT <= 0.01);
  const walls = cyber.walls;
  const distSeg = (px, pz, [a, b]) => {
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(a[0] + vx * t - px, a[1] + vz * t - pz);
  };
  const xs = cyber.outline.map((p) => p[0]), zs = cyber.outline.map((p) => p[1]);
  for (const { ring } of puddlePolygons(cyber, qualityPreset('high').puddles)) {
    for (const [x, z] of ring) {
      assert.ok(x > Math.min(...xs) + 0.3 && x < Math.max(...xs) - 0.3 && z > Math.min(...zs) + 0.3 && z < Math.max(...zs) - 0.3, 'charco pegado al borde');
      for (const w of walls) assert.ok(distSeg(x, z, w) >= WALL_HALF + 0.3, `charco pegado a una pared en ${x.toFixed(2)},${z.toFixed(2)}`);
      assert.ok(Math.hypot(x - cyber.cup[0], z - cyber.cup[1]) >= CUP_R + 0.3, 'charco sobre el hoyo');
      assert.ok(Math.hypot(x - cyber.tee[0], z - cyber.tee[1]) >= 0.7, 'charco sobre la salida');
      for (const b of cyber.bumpers) assert.ok(Math.hypot(x - b.x, z - b.z) >= b.r + 0.3, 'charco pegado a una seta');
    }
  }
});

test('solo visual: ningún módulo de simulación importa render ni lee la lluvia ni los charcos', () => {
  const sim = ['src/game/physics.js', 'src/game/courses.js', 'src/game/replay.js', 'src/game/bots.js'];
  const files = [...sim, ...listJs(join(ROOT, 'src/antibot')).map((f) => f.slice(ROOT.length + 1).replaceAll('\\', '/'))];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*render\//.test(src), `${f} importa render`);
    assert.ok(!/cyberpunkRain|cyberpunkFx|cyberpunkPuddles/.test(src), `${f} referencia los efectos`);
  }
});

function listJs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listJs(p) : p.endsWith('.js') ? [p] : [];
  });
}
