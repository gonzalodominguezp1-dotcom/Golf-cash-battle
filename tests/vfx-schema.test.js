import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CAP, budget, emissions, flashRate, validate } from '../src/game/render/vfx/schema.js';

const burst = (over = {}) => ({
  id: 'spark-pop', name: 'Chispazo', family: 'impact', duration: 1, loop: false,
  maxParticles: { low: 12, medium: 30, high: 60 },
  emitters: [{ cell: 'spark', n: 40, speed: 3, spread: 0.6, size: 0.1, life: 0.6, col: 'accent', t0: 0 }],
  ...over,
});
const loop = (over = {}) => ({
  id: 'aura', name: 'Aura', family: 'skin', duration: 2, loop: true,
  maxParticles: { low: 14, medium: 24, high: 40 },
  emitters: [{ cell: 'soft', rate: 20, t0: 0, t1: 2, speed: 0.5, spread: 1, size: 0.2, life: 0.5, col: 'glow' }],
  ...over,
});

test('validate: acepta un efecto de una vez y uno en bucle correctos', () => {
  assert.deepEqual(validate(burst()), { ok: true });
  assert.deepEqual(validate(loop()), { ok: true });
});

test('validate: rechaza campos desconocidos, ids vacíos y valores no válidos con el nombre del campo', () => {
  for (const [bad, field] of [
    [burst({ sorpresa: 1 }), 'sorpresa'],
    [burst({ id: '' }), 'id'],
    [burst({ duration: 0 }), 'duration'],
    [burst({ emitters: [{ ...burst().emitters[0], life: -1 }] }), 'life'],
    [burst({ emitters: [] }), 'emitters'],
  ]) {
    const r = validate(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes(field)), `falta ${field} en ${r.errors}`);
  }
});

test('AC5: el presupuesto nunca pasa del tope por calidad y lo que lo supera es inválido', () => {
  for (const q of ['low', 'medium', 'high']) assert.ok(budget(burst(), q) <= PLAYER_CAP[q]);
  const r = validate(burst({ maxParticles: { low: 12, medium: 30, high: 500 } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('maxParticles')));
});

test('AC4: mismas entradas dan la misma lista y otra semilla da otra', () => {
  const a = emissions(burst(), 7, 'high', false);
  assert.deepEqual(a, emissions(burst(), 7, 'high', false));
  assert.notDeepEqual(a, emissions(burst(), 8, 'high', false));
});

test('AC5/AC13: nunca más emisiones que el presupuesto y low conserva al menos el 30 % de high', () => {
  const h = emissions(burst(), 1, 'high', false).length;
  for (const q of ['low', 'medium', 'high']) assert.ok(emissions(burst(), 1, q, false).length <= budget(burst(), q));
  assert.ok(emissions(burst(), 1, 'low', false).length >= Math.floor(h * 0.3));
  assert.equal(validate(burst({ maxParticles: { low: 2, medium: 30, high: 60 } })).ok, false);
});

test('AC6: con reducción de movimiento hay menos partículas, más lentas y ningún destello', () => {
  const fx = burst({ flashes: [0, 0.4] });
  const n = emissions(fx, 1, 'high', false), r = emissions(fx, 1, 'high', true);
  assert.ok(r.length < n.length);
  assert.ok(Math.max(...r.map((e) => e.speed)) < Math.max(...n.map((e) => e.speed)));
  assert.equal(flashRate(fx, true), 0);
});

test('AC3: un efecto de una vez no deja nada visible pasada su duración', () => {
  assert.equal(validate(burst({ duration: 0.5 })).ok, false); // t0 + life = 0.6 > 0.5
  assert.equal(validate(burst({ duration: 0.6 })).ok, true);
  const last = Math.max(...emissions(burst(), 1, 'high', false).map((e) => e.t + e.life));
  assert.ok(last <= burst().duration + 1e-9);
});

test('AC2: un bucle sin ráfagas sueltas y con ritmo entero cierra sin salto', () => {
  assert.equal(validate(loop({ emitters: [{ ...loop().emitters[0], n: 10, rate: undefined }] })).ok, false);
  assert.equal(validate(loop({ emitters: [{ ...loop().emitters[0], rate: 20.3 }] })).ok, false);
  const e = emissions(loop(), 3, 'high', false);
  assert.equal(e[0].t, 0);
  const gap = e[1].t - e[0].t;
  assert.ok(Math.abs(loop().duration - e[e.length - 1].t - gap) < 1e-9);
});

test('AC7: la tasa de destellos mide la ventana de 1 s y más de 3 es inválido', () => {
  assert.equal(flashRate(burst({ flashes: [0, 0.2, 0.4] }), false), 3);
  assert.equal(flashRate(burst({ flashes: [0, 0.2, 0.4, 0.6] }), false), 4);
  assert.equal(validate(burst({ flashes: [0, 0.2, 0.4, 0.6] })).ok, false);
  assert.equal(validate(burst({ flashes: [0, 0.4, 0.8] })).ok, true);
  assert.equal(flashRate(burst({ flashes: [0, 1.5] }), false), 1);
});

test('strength escala la cantidad sin pasar del presupuesto', () => {
  const full = emissions(burst(), 1, 'high', false, 1).length;
  const half = emissions(burst(), 1, 'high', false, 0.5).length;
  assert.ok(half < full && half > 0);
  assert.ok(emissions(burst(), 1, 'high', false, 5).length <= budget(burst(), 'high'));
});
