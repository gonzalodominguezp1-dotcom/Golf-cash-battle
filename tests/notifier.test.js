import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../src/ui/notifier.js';
import { NOTIFY_POLL_MS } from '../src/ui/notifyRules.js';

function fakeTimers() {
  let id = 0;
  const live = new Map();
  return {
    setTimeout: (fn, ms) => { live.set(++id, { fn, ms }); return id; },
    clearTimeout: (i) => { live.delete(i); },
    live: () => live.size,
    next: () => [...live.entries()][0],
    async fire() {
      const [i, t] = this.next();
      live.delete(i);
      await t.fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));

function setup(over = {}) {
  const timers = fakeTimers();
  const data = { friends: { incoming: [], friends: [], outgoing: [] }, party: { party: null, invites: [] } };
  const notices = [];
  const n = createNotifier({
    account: { profile: { username: 'yo' }, friends: async () => data.friends },
    parties: { mine: async () => data.party },
    timers,
    isHidden: () => false,
    onNotice: (x) => notices.push(x),
    ...over,
  });
  return { timers, data, notices, n };
}

test('start siembra sin avisar y programa el siguiente sondeo al intervalo de hoy', async () => {
  const { timers, data, notices, n } = setup();
  data.friends.incoming = [{ name: 'Ana' }];
  n.start();
  await flush();
  assert.deepEqual(notices, []);
  assert.equal(timers.next()[1].ms, NOTIFY_POLL_MS);
  assert.deepEqual(n.counts, { friendRequests: 1, partyInvites: 0 });
});

test('avisa de lo nuevo y actualiza counts con incoming + invites', async () => {
  const { timers, data, notices, n } = setup();
  const seen = [];
  n.subscribe((c) => seen.push(c));
  n.start();
  await flush();
  data.friends.incoming = [{ name: 'Ana' }, { name: 'Leo' }];
  data.party.invites = [{ party: 'p1', from: 'Mia' }];
  await timers.fire();
  assert.equal(notices.length, 3);
  assert.deepEqual(n.counts, { friendRequests: 2, partyInvites: 1 });
  assert.deepEqual(seen.at(-1), { friendRequests: 2, partyInvites: 1 });
});

test('subscribe devuelve off y no repite si counts no cambia', async () => {
  const { timers, n } = setup();
  let calls = 0;
  const off = n.subscribe(() => { calls++; });
  n.start();
  await flush();
  await timers.fire();
  assert.equal(calls, 0);
  off();
});

test('con la página oculta no consulta', async () => {
  let asked = 0;
  const { n, timers } = setup({ isHidden: () => true, parties: { mine: async () => { asked++; return null; } } });
  n.start();
  await flush();
  assert.equal(asked, 0);
  assert.equal(timers.live(), 1);
});

test('stop deja 0 timers, también si había una consulta en vuelo', async () => {
  const { timers, n } = setup();
  n.start();
  n.stop(); // consulta aún en vuelo
  await flush();
  assert.equal(timers.live(), 0);
  n.start();
  await flush();
  assert.equal(timers.live(), 1);
  n.stop();
  assert.equal(timers.live(), 0);
  n.stop();
});

test('sin cuenta o sin nombre de usuario no hace nada y no deja timers vivos de más', async () => {
  const t = fakeTimers();
  const n = createNotifier({ account: null, parties: null, timers: t, isHidden: () => false, onNotice() {} });
  n.start();
  await flush();
  assert.equal(t.live(), 0);
});

test('start; stop; start sin esperar deja un solo timer', async () => {
  const { timers, n } = setup();
  n.start(); n.stop(); n.start();
  await flush();
  assert.equal(timers.live(), 1);
  n.stop();
  assert.equal(timers.live(), 0);
});

test('start repetido sin stop no duplica el sondeo', async () => {
  const { timers, n } = setup();
  n.start(); n.start();
  await flush();
  assert.equal(timers.live(), 1);
});

test('si mine() falla, partyInvites se conserva y no hay cambio espurio', async () => {
  let fail = false;
  const data = { friends: { incoming: [], friends: [], outgoing: [] }, party: { party: null, invites: [{ party: 'p1', from: 'Mia' }] } };
  const timers = fakeTimers();
  const n = createNotifier({
    account: { profile: { username: 'yo' }, friends: async () => data.friends },
    parties: { mine: async () => { if (fail) throw new Error('x'); return data.party; } },
    timers, isHidden: () => false, onNotice() {},
  });
  let calls = 0;
  n.start();
  await flush();
  n.subscribe(() => { calls++; });
  fail = true;
  await timers.fire();
  assert.deepEqual(n.counts, { friendRequests: 0, partyInvites: 1 });
  assert.equal(calls, 0);
});

test('si friends() falla, friendRequests se conserva', async () => {
  let fail = false;
  const timers = fakeTimers();
  const n = createNotifier({
    account: { profile: { username: 'yo' }, friends: async () => { if (fail) throw new Error('x'); return { incoming: [{ name: 'Ana' }] }; } },
    parties: { mine: async () => ({ party: null, invites: [] }) },
    timers, isHidden: () => false, onNotice() {},
  });
  n.start();
  await flush();
  fail = true;
  await timers.fire();
  assert.equal(n.counts.friendRequests, 1);
});
