import test from 'node:test';
import assert from 'node:assert/strict';
import { flagWindSpec, flagWaveOffset, poleLean, windGust, planarShadowMatrix } from '../src/game/render/hubSceneRules.js';

test('flagWindSpec: sin ondeo en reduced-motion ni en calidad baja; high es más fino que medium', () => {
  assert.equal(flagWindSpec('medium', true), null);
  assert.equal(flagWindSpec('high', true), null);
  assert.equal(flagWindSpec('low', false), null);
  const m = flagWindSpec('medium', false), h = flagWindSpec('high', false);
  assert.ok(m && h);
  assert.ok(h.segW >= m.segW && h.segH >= m.segH);
  assert.ok(flagWindSpec('desconocida', false), 'calidad desconocida cae a medium');
});

test('flagWindSpec: ningún movimiento a más de 2 Hz y amplitudes pequeñas', () => {
  for (const q of ['medium', 'high']) {
    const s = flagWindSpec(q, false);
    assert.ok(s.freqHz * 2 <= 2 + 1e-9, `armónico a ${s.freqHz * 2} Hz`);
    assert.ok(s.poleFreqHz * 2 <= 2 + 1e-9);
    assert.ok(s.amp > 0 && s.amp <= 0.2);
    assert.ok(s.poleLeanDeg > 0 && s.poleLeanDeg <= 2);
  }
});

test('flagWaveOffset: el borde del mástil no se mueve y la punta ondea más', () => {
  const s = flagWindSpec('high', false);
  for (let t = 0; t < 10; t += 0.37) {
    const root = flagWaveOffset(0, 0.5, t, s);
    assert.equal(root.x, 0); assert.equal(root.y, 0); assert.equal(root.z, 0);
  }
  let maxMid = 0, maxTip = 0;
  for (let t = 0; t < 10; t += 0.01) {
    maxMid = Math.max(maxMid, Math.abs(flagWaveOffset(0.4, 0.5, t, s).z));
    maxTip = Math.max(maxTip, Math.abs(flagWaveOffset(1, 0.5, t, s).z));
  }
  assert.ok(maxTip > maxMid && maxMid > 0);
  assert.ok(maxTip <= s.amp * 1.5, 'amplitud acotada');
});

test('flagWaveOffset: continuo en el tiempo y sin NaN con entradas raras', () => {
  const s = flagWindSpec('medium', false);
  let prev = flagWaveOffset(1, 0.5, 0, s).z;
  for (let t = 0.01; t < 20; t += 0.01) {
    const z = flagWaveOffset(1, 0.5, t, s).z;
    assert.ok(Math.abs(z - prev) < 0.02, `salto en t=${t}`);
    prev = z;
  }
  for (const bad of [NaN, -5, Infinity]) {
    const o = flagWaveOffset(0.5, 0.5, bad, s);
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z));
  }
  assert.deepEqual(flagWaveOffset(1, 1, 3, null), { x: 0, y: 0, z: 0 });
});

test('windGust y poleLean: acotados y suaves', () => {
  const s = flagWindSpec('high', false);
  for (let t = 0; t < 60; t += 0.05) {
    const g = windGust(t);
    assert.ok(g >= 0.6 && g <= 1.0001);
    assert.ok(Math.abs(poleLean(t, s)) <= (s.poleLeanDeg * Math.PI) / 180 + 1e-9);
  }
  assert.equal(poleLean(5, null), 0);
});

test('planarShadowMatrix: puntos del suelo no cambian y un punto elevado cae según la dirección del sol', () => {
  const sun = [-0.55, 0.8, -0.35];
  const m = planarShadowMatrix(sun, 0.03);
  const apply = ([x, y, z]) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
  const ground = apply([2, 0.03, -1]);
  assert.ok(Math.abs(ground[0] - 2) < 1e-9 && Math.abs(ground[1] - 0.03) < 1e-9 && Math.abs(ground[2] + 1) < 1e-9);
  const p = apply([0, 2.1, 0]);
  assert.ok(Math.abs(p[1] - 0.03) < 1e-9);
  const k = (2.1 - 0.03) / sun[1];
  assert.ok(Math.abs(p[0] - -sun[0] * k) < 1e-9 && Math.abs(p[2] - -sun[2] * k) < 1e-9);
  assert.ok(p[0] > 0 && p[2] > 0, 'la sombra cae al lado contrario del sol');
});

test('planarShadowMatrix: sol en el horizonte o bajo el suelo -> null', () => {
  assert.equal(planarShadowMatrix([1, 0, 0], 0), null);
  assert.equal(planarShadowMatrix([0, -1, 0], 0), null);
});
