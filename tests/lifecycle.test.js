import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScope } from '../src/screens/lifecycle.js';
import { fakeEnv } from './helpers/fakeEnv.js';

function mountLike(env) {
  const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  scope.on(env.win, 'resize', () => {});
  scope.on(env.doc, 'keydown', () => {});
  scope.timeout(() => {}, 1000);
  scope.interval(() => {}, 500);
  scope.raf(() => {});
  let unsubbed = 0;
  scope.sub(() => { unsubbed++; });
  const child = scope.child();
  child.on(env.win, 'blur', () => {});
  child.interval(() => {}, 100);
  return { scope, unsubbed: () => unsubbed };
}

test('20 ciclos mount/dispose dejan todo en 0', () => {
  const env = fakeEnv();
  for (let i = 0; i < 20; i++) {
    const { scope, unsubbed } = mountLike(env);
    assert.ok(env.liveListeners() > 0);
    assert.ok(env.liveTimers() > 0);
    assert.deepEqual(scope.live(), { listeners: 3, timers: 4, subs: 1 });
    scope.dispose();
    assert.equal(unsubbed(), 1);
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
    assert.equal(env.liveListeners(), 0);
    assert.equal(env.liveTimers(), 0);
  }
});

test('dispose es idempotente y no repite las suscripciones', () => {
  const env = fakeEnv();
  const { scope, unsubbed } = mountLike(env);
  scope.dispose();
  scope.dispose();
  assert.equal(unsubbed(), 1);
});

test('off() y cancel() sueltan solo lo suyo', () => {
  const env = fakeEnv();
  const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  const off = scope.on(env.win, 'x', () => {});
  const cancel = scope.timeout(() => {}, 10);
  off(); cancel(); off(); cancel();
  assert.equal(env.liveListeners() + env.liveTimers(), 0);
  assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('un timeout ya disparado deja de contar como vivo', () => {
  const env = fakeEnv();
  const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  let n = 0;
  scope.timeout(() => { n++; }, 10);
  env.timers.advance(10);
  assert.equal(n, 1);
  assert.equal(scope.live().timers, 0);
  assert.equal(env.liveTimers(), 0);
});

test('tras dispose, los callbacks pendientes no se ejecutan y no se registra nada nuevo', () => {
  const env = fakeEnv();
  const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  let n = 0;
  scope.interval(() => { n++; }, 5);
  scope.dispose();
  env.timers.advance(50);
  assert.equal(n, 0);
  scope.on(env.win, 'z', () => {});
  scope.timeout(() => {}, 1);
  let late = 0;
  scope.sub(() => { late++; });
  assert.equal(late, 1);
  assert.equal(env.liveListeners() + env.liveTimers(), 0);
});

test('child se libera con el padre y también por separado', () => {
  const env = fakeEnv();
  const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  const a = scope.child();
  const b = scope.child();
  a.on(env.win, 'a', () => {});
  b.on(env.win, 'b', () => {});
  a.dispose();
  assert.equal(env.liveListeners(), 1);
  scope.dispose();
  assert.equal(env.liveListeners(), 0);
});

test('el entorno falso ofrece elementos stub', () => {
  const env = fakeEnv();
  const m = env.el('main');
  assert.equal(m.tag, 'main');
  assert.equal(typeof m.querySelector('.x').addEventListener, 'function');
  m.classList.add('a');
  assert.ok(m.classList.contains('a'));
  m.innerHTML = '<b></b>';
  assert.deepEqual(m.dataset, {});
});
