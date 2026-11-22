import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelRing, friendsBadge, achievementsBadge, lastTier, rememberTier } from '../src/screens/hubRules.js';
import { TIERS } from '../src/config.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('levelRing: porcentaje y etiqueta', () => {
  assert.deepEqual(levelRing({ level: 7, into: 40, need: 100 }), { level: 7, pct: 40, label: 'Nivel 7, 40 % al siguiente' });
});

test('levelRing: acota 0..100 y tolera need 0', () => {
  assert.equal(levelRing({ level: 1, into: 150, need: 100 }).pct, 100);
  assert.equal(levelRing({ level: 1, into: -5, need: 100 }).pct, 0);
  assert.equal(levelRing({ level: 1, into: 5, need: 0 }).pct, 0);
});

test('friendsBadge suma solicitudes e invitaciones; sin pendientes, etiqueta vacía', () => {
  const f = { friends: [], incoming: [{ name: 'a' }, { name: 'b' }], outgoing: [] };
  const p = { party: null, invites: [{ party: 'p', from: 'c' }] };
  assert.deepEqual(friendsBadge(f, p), { count: 3, label: '3 novedades' });
  assert.deepEqual(friendsBadge({ incoming: [] }, { invites: [] }), { count: 0, label: '' });
  assert.deepEqual(friendsBadge(null, undefined), { count: 0, label: '' });
  assert.equal(friendsBadge({ incoming: [{}] }, null).label, '1 novedad');
});

test('achievementsBadge cuenta completados aún no vistos', () => {
  const states = [{ id: 'a', done: true }, { id: 'b', done: true }, { id: 'c', done: false }];
  assert.deepEqual(achievementsBadge(states, new Set(['a'])), { count: 1, label: '1 novedad' });
  assert.deepEqual(achievementsBadge(states, new Set(['a', 'b'])), { count: 0, label: '' });
  assert.equal(achievementsBadge(states, new Set()).label, '2 novedades');
});

test('lastTier / rememberTier con clave gcb.lastTier.v1', () => {
  const s = memStorage();
  assert.equal(lastTier(s, TIERS), null);
  rememberTier(s, 'gold');
  assert.equal(s.m.get('gcb.lastTier.v1'), 'gold');
  assert.equal(lastTier(s, TIERS), 'gold');
});

test('lastTier: mesa inexistente o almacenamiento roto devuelve null', () => {
  assert.equal(lastTier(memStorage({ 'gcb.lastTier.v1': 'platino' }), TIERS), null);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(lastTier(bad, TIERS), null);
  assert.doesNotThrow(() => rememberTier(bad, 'gold'));
});

test('nextFrame: siguiente marco por nivel y niveles que faltan; null con todos', async () => {
  const { nextFrame } = await import('../src/screens/hubRules.js');
  const { LEVEL_FRAMES } = await import('../src/progress/prestige.js');
  assert.deepEqual(nextFrame(1), { frame: LEVEL_FRAMES[0], missing: 4 });
  assert.deepEqual(nextFrame(4), { frame: LEVEL_FRAMES[0], missing: 1 });
  assert.deepEqual(nextFrame(5), { frame: LEVEL_FRAMES[1], missing: 10 }); // en el nivel justo ya se tiene ese marco
  assert.deepEqual(nextFrame(149), { frame: LEVEL_FRAMES.at(-1), missing: 1 });
  assert.equal(nextFrame(150), null);
  assert.equal(nextFrame(999), null);
});
