import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderAchievements, markSeen, seenSet } from '../src/screens/achievementsRules.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

const ch = (...ids) => ids.map((id) => ({ id }));

test('pendientes por porcentaje descendente, luego id; completados al final', () => {
  const states = {
    a: { value: 1, goal: 10, done: false },
    b: { value: 5, goal: 10, done: false },
    c: { value: 10, goal: 10, done: true },
    d: { value: 5, goal: 10, done: false },
    e: { value: 3, goal: 3, done: true },
  };
  const out = orderAchievements(ch('a', 'b', 'c', 'd', 'e'), (id) => states[id]);
  assert.deepEqual(out.pending.map((x) => x.id), ['b', 'd', 'a']);
  assert.deepEqual(out.done.map((x) => x.id), ['c', 'e']);
});

test('meta 0 no rompe el orden', () => {
  const out = orderAchievements(ch('x'), () => ({ value: 0, goal: 0, done: false }));
  assert.equal(out.pending.length, 1);
});

test('seenSet vacío sin datos y con datos corruptos', () => {
  assert.equal(seenSet(memStorage(), 'u1').size, 0);
  assert.equal(seenSet(memStorage({ 'gcb.achievements.seen.v1:u1': '{no' }), 'u1').size, 0);
  assert.equal(seenSet(memStorage({ 'gcb.achievements.seen.v1:u1': '{"a":1}' }), 'u1').size, 0);
});

test('markSeen acumula por usuario y no mezcla usuarios', () => {
  const s = memStorage();
  markSeen(s, 'u1', ['a', 'b']);
  markSeen(s, 'u1', ['b', 'c']);
  markSeen(s, 'u2', ['z']);
  assert.deepEqual([...seenSet(s, 'u1')].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...seenSet(s, 'u2')], ['z']);
  assert.ok(s.m.has('gcb.achievements.seen.v1:u1'));
});

test('un almacenamiento que lanza no rompe', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(seenSet(bad, 'u1').size, 0);
  assert.doesNotThrow(() => markSeen(bad, 'u1', ['a']));
});
