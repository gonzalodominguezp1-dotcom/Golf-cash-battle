import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFY_MS, newNotices } from '../src/ui/notifyRules.js';

const friends = (...names) => ({ friends: [], incoming: names.map((name) => ({ name })), outgoing: [] });
const party = (...invs) => ({ party: null, invites: invs.map(([p, from]) => ({ party: p, from })) });

test('un aviso dura como mucho 5 segundos', () => {
  assert.ok(NOTIFY_MS <= 5000);
});

test('la primera consulta no anuncia lo que ya estaba pendiente', () => {
  const seen = new Set();
  assert.deepEqual(newNotices(seen, friends('Ana'), party(['p1', 'Leo']), { seed: true }), []);
  assert.deepEqual(newNotices(seen, friends('Ana'), party(['p1', 'Leo'])), []);
});

test('avisa de peticiones e invitaciones nuevas una sola vez', () => {
  const seen = new Set();
  newNotices(seen, friends(), party(), { seed: true });
  const a = newNotices(seen, friends('Ana'), party(['p1', 'Leo']));
  assert.deepEqual(a.map((n) => n.kind).sort(), ['friend', 'invite']);
  assert.deepEqual(newNotices(seen, friends('Ana'), party(['p1', 'Leo'])), []);
});

test('si la petición desaparece y vuelve, vuelve a avisar', () => {
  const seen = new Set();
  newNotices(seen, friends('Ana'), party(), { seed: true });
  newNotices(seen, friends(), party());
  assert.equal(newNotices(seen, friends('ana'), party()).length, 1);
});

test('tolera respuestas vacías', () => {
  assert.deepEqual(newNotices(new Set(), null, null), []);
});
