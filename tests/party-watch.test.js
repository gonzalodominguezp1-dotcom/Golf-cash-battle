import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartyWatch, PARTY_POLL_MS } from '../src/match/partyWatch.js';

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
      await flush();
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

function setup(over = {}) {
  const timers = fakeTimers();
  const calls = [];
  let state = { party: null, invites: [] };
  const parties = {
    mine: async () => state,
    invite: async (n) => { calls.push(['invite', n]); return state; },
    ready: async (v) => { calls.push(['ready', v]); return state; },
    setTier: async (id) => { calls.push(['setTier', id]); return state; },
    leave: async () => { calls.push(['leave']); return state; },
    respond: async () => state,
  };
  const tournaments = { get: async (id) => ({ id, status: 'open', me: { finished: false } }) };
  const w = createPartyWatch({ parties, tournaments, tiers: [{ id: 't1' }], timers, storage: mem(), ...over });
  return { w, timers, calls, set: (s) => { state = s; } };
}

test('start sondea cada PARTY_POLL_MS y stop deja 0 timers', async () => {
  const { w, timers } = setup();
  w.start();
  await flush();
  assert.equal(PARTY_POLL_MS, 3000);
  assert.equal(timers.next()[1].ms, 3000);
  w.stop();
  assert.equal(timers.live(), 0);
});

test('stop con consulta en vuelo no reprograma', async () => {
  const { w, timers } = setup();
  w.start();
  w.stop();
  await flush();
  assert.equal(timers.live(), 0);
});

test('notifica a los suscriptores solo cuando el estado cambia', async () => {
  const { w, timers, set } = setup();
  const seen = [];
  w.subscribe((s) => seen.push(s));
  w.start();
  await flush();
  await timers.fire();
  assert.equal(seen.length, 1);
  set({ party: { leader: true, members: [], invited: [] }, invites: [] });
  await timers.fire();
  assert.equal(seen.length, 2);
  assert.equal(w.state.party.leader, true);
});

test('un torneo nuevo del grupo llama a onNewMatch una sola vez', async () => {
  const { w, timers, set } = setup();
  const got = [];
  w.onNewMatch((m) => got.push(m.id));
  w.start();
  await flush();
  set({ party: { tournament_id: 'x1', members: [], invited: [] }, invites: [] });
  await timers.fire();
  await timers.fire();
  assert.deepEqual(got, ['x1']);
});

test('pickTier: el líder fija la mesa y se pone listo; el miembro solo confirma la del líder', async () => {
  const { w, calls, set } = setup();
  set({ party: { leader: true, tier_id: null, members: [], invited: [] }, invites: [] });
  w.start();
  await flush();
  await w.pickTier({ id: 't1' });
  assert.deepEqual(calls, [['setTier', 't1'], ['ready', true]]);
  calls.length = 0;
  set({ party: { leader: false, tier_id: 't1', members: [], invited: [] }, invites: [] });
  await w.apply(async () => (await w.state, { party: { leader: false, tier_id: 't1', members: [], invited: [] }, invites: [] }));
  await w.pickTier({ id: 't1' });
  assert.deepEqual(calls, [['ready', true]]);
  w.stop();
});

test('apply convierte el error en mensaje y lo pasa a los suscriptores', async () => {
  const { w } = setup();
  const metas = [];
  w.subscribe((s, meta) => metas.push(meta));
  await w.apply(async () => { throw Object.assign(new Error(), { code: 'party_full' }); });
  assert.equal(metas.at(-1).msg, 'El grupo está completo.');
  await w.apply(async () => ({ party: null, invites: [] }), 'Hecho.');
  assert.equal(metas.at(-1).msg, 'Hecho.');
});

test('con el almacenamiento bloqueado no lanza al construir ni al usar', async () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const { w, timers } = setup({ storage: bad });
  w.start();
  await flush();
  assert.equal(timers.live(), 1);
  w.stop();
});

test('storage por defecto que lanza al acceder no rompe createPartyWatch', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    const { w, timers } = setup({ storage: undefined });
    w.start();
    await flush();
    assert.equal(timers.live(), 1);
    w.stop();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage;
  }
});

test('un torneo nuevo sin suscriptores no se marca como visto; al suscribirse se abre', async () => {
  const { w, timers, set } = setup();
  set({ party: { tournament_id: 'x9', members: [], invited: [] }, invites: [] });
  w.start();
  await flush();
  await timers.fire();
  const got = [];
  w.onNewMatch((m) => got.push(m.id));
  await timers.fire();
  assert.deepEqual(got, ['x9']);
});

test('start; stop; start sin esperar deja un solo timer y start repetido no duplica', async () => {
  const { w, timers } = setup();
  w.start(); w.stop(); w.start(); w.start();
  await flush();
  assert.equal(timers.live(), 1);
  w.stop();
  assert.equal(timers.live(), 0);
});

test('mine() que rechaza no rompe el sondeo', async () => {
  const { w, timers } = setup({ parties: { mine: async () => { throw new Error('x'); } } });
  w.start();
  await flush();
  assert.equal(timers.live(), 1);
  w.stop();
});

test('tournaments.get que lanza no abre nada ni rompe el sondeo', async () => {
  const { w, timers, set } = setup({ tournaments: { get: async () => { throw new Error('x'); } } });
  const got = [];
  w.onNewMatch((m) => got.push(m));
  set({ party: { tournament_id: 'z', members: [], invited: [] }, invites: [] });
  w.start();
  await flush();
  assert.deepEqual(got, []);
  assert.equal(timers.live(), 1);
  w.stop();
});

test('stop mientras tournaments.get está en vuelo no dispara onNewMatch', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { w, set } = setup({ tournaments: { get: async (id) => { await gate; return { id, status: 'open', me: { finished: false } }; } } });
  const got = [];
  w.onNewMatch((m) => got.push(m));
  set({ party: { tournament_id: 'q', members: [], invited: [] }, invites: [] });
  w.start();
  await flush();
  w.stop();
  release();
  await flush();
  assert.deepEqual(got, []);
});
