import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount } from '../src/screens/tables.js';
import { TIERS } from '../src/config.js';

// Raíz falsa: reconoce [data-x] y [data-x="v"] sobre el HTML pintado y devuelve elementos estables.
function fakeRoot(env) {
  const els = new Map();
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const get = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!els.has(k)) {
      const e = env.el('button');
      e.dataset = { [camel(attr)]: val };
      const cache = new Map();
      e.querySelector = (s) => { if (!cache.has(s)) cache.set(s, env.el('button')); return cache.get(s); };
      els.set(k, e);
    }
    return els.get(k);
  };
  return {
    innerHTML: '',
    els,
    querySelectorAll(sel) {
      const attr = sel.match(/^\[(data-[\w-]+)\]$/)[1];
      return [...this.innerHTML.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => get(attr, m[1]));
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)(?:="([^"]+)")?\]$/);
      if (!m) return null;
      const has = m[2] === undefined ? this.innerHTML.includes(m[1]) : this.innerHTML.includes(`${m[1]}="${m[2]}"`);
      return has ? get(m[1], m[2] ?? '') : null;
    },
  };
}

const settle = () => new Promise((r) => setImmediate(r));

function makeCtx(env, over = {}) {
  const calls = { push: [], back: 0, start: [], claim: 0, release: 0, enter: 0, pick: [] };
  const store = new Map();
  const walletSubs = new Set();
  const wallet = {
    getBalance: async () => 100,
    subscribe(fn) { walletSubs.add(fn); return () => walletSubs.delete(fn); },
  };
  const ctx = {
    router: { push: (id) => { calls.push.push(id); }, back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    wallet,
    backend: { mode: 'remote', account: { profile: {} }, parties: {}, tournaments: {} },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    partyWatch: { state: null, pickTier: (t) => calls.pick.push(t.id), stop: () => { calls.release++; } },
    actions: { startMatch: (t) => calls.start.push(t.id), claimRewards: () => { calls.claim++; } },
    legacy: {
      enterTables: () => { calls.enter++; },
    },
    ...over,
  };
  return { ctx, calls, store, walletSubs };
}

const paidTier = () => TIERS.find((x) => x.entryFee > 0);
const freeTier = () => TIERS.find((x) => x.entryFee === 0);

test('tables: cabecera con saldo, lista de mesas y textos en español', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.match(root.innerHTML, /Mesas de Torneo/);
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/); // sin volver en cabecera: lo hace el lobby
  assert.match(root.innerHTML, /data-lobby/);
  assert.match(root.innerHTML, /data-tables-balance[\s\S]*?100/);
  for (const tier of TIERS) assert.match(root.innerHTML, new RegExp(`data-tier="${tier.id}"`), tier.id);
  assert.ok(root.innerHTML.includes('Practicar'));
  assert.ok(root.innerHTML.includes('Jugar Torneo'));
  assert.equal(calls.claim, 1);
  assert.equal(calls.enter, 1);
  // solo las mesas: sin etiquetas de información ni texto de demostración
  assert.doesNotMatch(root.innerHTML, /live-pill|spec-chip|pulse-dot|lobby-specs/);
  { const m = root.innerHTML.replace(/<p class="legal">[\s\S]*?<\/p>/, '').replace(/<svg[\s\S]*?<\/svg>/g, '').match(/.{30}(EN VIVO|Jugadores|hoyos|determinista).{30}/si); assert.equal(m, null, m && m[0]); }
  assert.doesNotMatch(root.innerHTML, /Créditos de demostración|demostración/i);
  assert.equal([...root.innerHTML.matchAll(/class="tier /g)].length, TIERS.length);
  const legal = root.innerHTML.match(/<p class="legal">([\s\S]*?)<\/p>/);
  assert.ok(legal && legal[1].trim().length > 0, 'el párrafo legal no se pinta vacío');
  assert.match(legal[1], /Comisión de la plataforma: \d+% del bote/);
  assert.match(root.querySelector('[data-party-box]').innerHTML, /Juega con amigos/); // el panel de grupo (partyPanel.js) se monta en su caja
});

test('tables: pulsar una mesa arranca la partida, recuerda la última y volver usa el router', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls, store } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  root.querySelector(`[data-tier="${paidTier().id}"]`).emit('click');
  await settle();
  assert.deepEqual(calls.start, [paidTier().id]);
  assert.equal(store.get('gcb.lastTier.v1'), paidTier().id);
});

test('tables: en grupo, las mesas de pago confirman la mesa del grupo; la práctica no', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  ctx.partyWatch.state = { party: { leader: true } }; // el panel limpia el estado al montarse; el sondeo lo rellena después
  root.querySelector(`[data-tier="${paidTier().id}"]`).emit('click');
  root.querySelector(`[data-tier="${freeTier().id}"]`).emit('click');
  assert.deepEqual(calls.pick, [paidTier().id]);
  assert.deepEqual(calls.start, [freeTier().id]);
});

test('tables: la última mesa sale destacada; sin mesa previa, ninguna', async () => {
  const env = fakeEnv();
  const a = fakeRoot(env);
  await mount(a, makeCtx(env).ctx, {}); await settle();
  assert.doesNotMatch(a.innerHTML, /data-last/);
  const b = fakeRoot(env);
  const second = makeCtx(env);
  second.store.set('gcb.lastTier.v1', paidTier().id);
  await mount(b, second.ctx, {}); await settle();
  assert.equal([...b.innerHTML.matchAll(/data-last/g)].length, 1);
  assert.match(b.innerHTML, new RegExp(`tier--${paidTier().id}"[^>]*data-last`));
  assert.ok(b.innerHTML.includes('Última mesa'));
});

test('tables: saldo insuficiente desactiva las mesas de pago y la suscripción actualiza la cabecera', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, walletSubs } = makeCtx(env);
  ctx.wallet.getBalance = async () => 0;
  await mount(root, ctx, {}); await settle();
  assert.ok(root.innerHTML.includes('Saldo insuficiente'));
  assert.equal(walletSubs.size, 1);
  const el = root.querySelector('[data-tables-balance]');
  for (const fn of walletSubs) fn(42);
  assert.match(el.innerHTML, /42/);
});

test('tables: aviso de mesas de pago bloqueadas y modo sin conexión', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: { mode: 'local', account: { profile: { paid_block: 'kyc_required' } } } });
  await mount(root, ctx, {}); await settle();
  assert.ok(root.innerHTML.includes('Verifica tu edad e identidad para jugar mesas con entrada'));
  assert.ok(root.innerHTML.includes('Modo sin conexión'));
  assert.equal(root.querySelector('[data-party-box]'), null); // sin parties no hay panel de grupo
  root.querySelector('[data-go="account"]').emit('click');
  assert.deepEqual(calls.push, ['account']);
});

test('tables: error al leer el saldo muestra Reintentar y se recupera', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  let fail = true;
  ctx.wallet.getBalance = async () => { if (fail) throw new Error('x'); return 5; };
  await mount(root, ctx, {}); await settle();
  const body = root.querySelector('[data-tables-body]');
  assert.equal(body.dataset.state, 'error');
  assert.ok(body.innerHTML.includes('Reintentar'));
  fail = false;
  body.querySelector('[data-retry]').emit('click');
  await settle();
  assert.doesNotMatch(root.innerHTML, /Reintentar/);
  assert.match(root.innerHTML, /data-tier=/);
});

test('tables: destroy deja el scope a cero y para el sondeo del grupo; 20 ciclos sin fugas', async () => {
  const env = fakeEnv();
  const { ctx, calls } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const screen = await mount(fakeRoot(env), { ...ctx, scope }, {});
    await settle();
    const live = scope.live();
    assert.ok(live.subs >= 1 && live.listeners >= 1, 'había algo vivo');
    screen.destroy();
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 }); // antes de scope.dispose()
    scope.dispose();
  }
  assert.equal(calls.release, 20);
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('tables: monedero que no responde: mount resuelve ya, tras el tope sale Reintentar y se recupera', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  let hang = true;
  ctx.wallet.getBalance = () => (hang ? new Promise(() => {}) : Promise.resolve(7));
  const screen = await mount(root, ctx, {}); // no espera al saldo
  const body = root.querySelector('[data-tables-body]');
  assert.equal(body.dataset.state, 'loading');
  env.timers.advance(8000);
  await settle();
  assert.equal(body.dataset.state, 'error');
  hang = false;
  body.querySelector('[data-retry]').emit('click');
  await settle();
  assert.match(root.innerHTML, /data-tier=/);
  screen.destroy();
});

test('tables: destroy durante la carga no deja nada vivo ni pinta después', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  let release;
  ctx.wallet.getBalance = () => new Promise((r) => { release = r; });
  const screen = await mount(root, ctx, {});
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  release(10);
  env.timers.advance(20000);
  await settle();
  assert.doesNotMatch(root.innerHTML, /data-tier=/);
  assert.equal(root.querySelector('[data-party-box]'), null);
});

test('tables: la última mesa solo se recuerda si la entrada se inició sin error', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, store } = makeCtx(env);
  ctx.actions.startMatch = async (tier) => { if (tier.id === paidTier().id) throw new Error('sin fondos'); };
  await mount(root, ctx, {}); await settle();
  root.querySelector(`[data-tier="${paidTier().id}"]`).emit("click");
  await settle();
  assert.equal(store.get('gcb.lastTier.v1'), undefined);
  root.querySelector(`[data-tier="${freeTier().id}"]`).emit("click");
  await settle();
  assert.equal(store.get('gcb.lastTier.v1'), freeTier().id);
});
