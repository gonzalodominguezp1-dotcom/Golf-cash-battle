import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionFor } from '../src/screens/transitionRules.js';

test('movimiento normal: deslizamiento de 150 a 250 ms (AC7)', () => {
  const t = transitionFor({ reduced: false });
  assert.equal(t.kind, 'slide');
  assert.equal(t.ms, 200);
  assert.ok(t.ms >= 150 && t.ms <= 250);
});

test('movimiento reducido: fundido de 80 ms o menos (AC6)', () => {
  const t = transitionFor({ reduced: true });
  assert.equal(t.kind, 'fade');
  assert.ok(t.ms <= 80);
});

test('sin argumentos cuenta como movimiento normal', () => {
  assert.equal(transitionFor().kind, 'slide');
});
