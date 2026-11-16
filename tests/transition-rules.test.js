import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionFor } from '../src/screens/transitionRules.js';
import { createRouter } from '../src/screens/router.js';
import { createHost } from '../src/screens/host.js';
import { fakeEnv } from './helpers/fakeEnv.js';

function fakeWin() {
  const listeners = [];
  const entries = [{ state: null, hash: '' }];
  let idx = 0;
  return {
    location: { get hash() { return entries[idx].hash; } },
    history: {
      get state() { return entries[idx].state; },
      pushState(state, _t, url) { entries.splice(idx + 1); entries.push({ state, hash: url ?? entries[idx].hash }); idx++; },
      replaceState(state, _t, url) { entries[idx] = { state, hash: url ?? entries[idx].hash }; },
      go(n) { idx = Math.max(0, Math.min(entries.length - 1, idx + n)); },
      back() { this.go(-1); },
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); },
    removeEventListener() {},
  };
}

// Host real con un escenario de montaje: la entrada devuelve { destroy } al momento y la transición dura lo de transitionFor.
async function hostWith(reduced) {
  const env = fakeEnv();
  const doc = { activeElement: null, createElement: (tag) => env.el(tag) };
  const mount = () => ({ destroy() {} });
  const routes = [
    { id: 'hub', hash: '#/', load: async () => ({ mount }) },
    { id: 'ranking', hash: '#/ranking', parent: 'hub', load: async () => ({ mount }) },
  ];
  let host;
  const router = createRouter({ routes, root: 'hub', win: fakeWin(), isBusy: () => host.isBusy() });
  host = createHost({ router, routes, root: env.el('main'), ctx: { reducedMotion: () => reduced }, notify: () => {}, win: env.win, doc, timers: env.timers });
  host.attach();
  const settle = () => new Promise((r) => setTimeout(r, 0));
  router.start();
  await settle(); env.timers.advance(300);
  router.push('ranking');
  await settle();
  return { env, host };
}

test('la entrada no bloquea: la transición normal dura 200 ms y termina ahí', async () => {
  const { env, host } = await hostWith(false);
  assert.equal(host.isBusy(), true);
  env.timers.advance(199);
  assert.equal(host.isBusy(), true);
  env.timers.advance(1);
  assert.equal(host.isBusy(), false);
});

test('la entrada no bloquea: con movimiento reducido la transición dura 80 ms', async () => {
  const { env, host } = await hostWith(true);
  assert.equal(host.isBusy(), true);
  env.timers.advance(79);
  assert.equal(host.isBusy(), true);
  env.timers.advance(1);
  assert.equal(host.isBusy(), false);
});

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
