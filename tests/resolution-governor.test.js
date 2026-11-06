import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolutionGovernor, RESOLUTION } from '../src/game/render/resolutionGovernor.js';

function run(gov, frameMs, totalMs, start = 0) {
  let t = start;
  for (; t < start + totalMs; t += frameMs) gov.tick(t);
  return t;
}

test('baja la resolución si los fotogramas van lentos y no pasa del mínimo', () => {
  const seen = [];
  const gov = new ResolutionGovernor({ min: 0.8, max: 1.5, apply: (pr) => seen.push(pr) });
  run(gov, 33, 20000);
  assert.ok(seen.length >= 1);
  assert.equal(gov.value, 0.8);
  assert.ok(seen.every((v) => v >= 0.8 && v <= 1.5));
});

test('vuelve a subir cuando sobra margen, sin pasar del máximo', () => {
  const gov = new ResolutionGovernor({ min: 0.8, max: 1.5, apply: () => {} });
  const t = run(gov, 33, 20000);
  run(gov, 8, 60000, t);
  assert.equal(gov.value, 1.5);
});

test('a 60 fps estables no cambia nada', () => {
  const gov = new ResolutionGovernor({ min: 0.8, max: 1.5, apply: () => assert.fail('no debería cambiar') });
  run(gov, 16.7, 30000);
  assert.equal(gov.value, 1.5);
});

test('un hueco largo (pestaña oculta) no cuenta como lento', () => {
  const gov = new ResolutionGovernor({ min: 0.8, max: 1.5, apply: () => assert.fail('no debería cambiar') });
  let t = run(gov, 16.7, 2000);
  t += 5000; // pestaña oculta
  run(gov, 16.7, 2000, t);
  assert.equal(gov.value, 1.5);
});

test('no cambia más de una vez por HOLD_MS', () => {
  const times = [];
  let now = 0;
  const gov = new ResolutionGovernor({ min: 0.1, max: 2, apply: () => times.push(now) });
  for (; now < 15000; now += 40) gov.tick(now);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= RESOLUTION.HOLD_MS);
});
