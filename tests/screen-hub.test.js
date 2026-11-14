import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount, fmtCoins } from '../src/screens/hub.js';
import { CHALLENGES } from '../src/progress/skins.js';
import { seenSet, markSeen } from '../src/screens/achievementsRules.js';

// Raíz falsa: reconoce [data-x] y [data-x="v"] sobre el HTML pintado y devuelve elementos estables.
function fakeRoot(env) {
  const els = new Map();
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const get = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!els.has(k)) { const e = env.el('button'); e.dataset = { [camel(attr)]: val }; els.set(k, e); }
    return els.get(k);
  };
  return {
    innerHTML: '',
    els,
    querySelectorAll(sel) {
      const attr = sel.match(/^\[(data-[\w-]+)\]$/)[1];
      return [...this.innerHTML.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => get(attr, m[1]));
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)="([^"]+)"\]$/);
      return m && this.innerHTML.includes(`${m[1]}="${m[2]}"`) ? get(m[1], m[2]) : null;
    },
  };
}

function makeCtx(env, over = {}) {
  const calls = { push: [], params: [], actions: [] };
  const subs = new Set();
  const notifier = {
    counts: { friendRequests: 0, partyInvites: 0 },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(c) { this.counts = c; for (const f of [...subs]) f(c); },
  };
  const store = new Map();
  const ctx = {
    router: { push: (id, p) => { calls.push.push(id); calls.params.push(p); return true; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    progress: { level: { level: 7, into: 40, need: 100 }, challenge: () => ({ value: 0, goal: 1, done: false }) },
    backend: { user: { id: 'u1' }, account: { profile: { username: 'ana', is_anonymous: false } } },
    notifier,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    sfx: { tap() {} },
    actions: {
      startPractice: () => calls.actions.push('practice'),
      toggleFullscreen: () => calls.actions.push('fullscreen'),
      claimRewards: () => calls.actions.push('claim'),
    },
    ...over,
  };
  return { ctx, calls, notifier, subs };
}

const click = (root, key) => root.querySelector(`[data-hub="${key}"]`).emit('click');

test('hub: composición C10 con textos en español y sin saldo ni silencio', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {});
  assert.doesNotMatch(root.innerHTML, /balance|saldo|mute|silencio/i); // sin wallet el hub no muestra saldo
  for (const key of ['account', 'settings', 'fullscreen', 'ranking', 'achievements', 'skins', 'friends', 'maps', 'play', 'practice']) {
    assert.match(root.innerHTML, new RegExp(`data-hub="${key}"`), key);
  }
  for (const txt of ['Ranking', 'Logros', 'Skins', 'Amigos', 'Mapas', 'JUGAR', 'Práctica', 'Ajustes']) assert.ok(root.innerHTML.includes(txt), txt);
  assert.match(root.innerHTML, /Nivel 7, 40 % al siguiente/);
  assert.match(root.innerHTML, /--pct:40/);
  assert.doesNotMatch(root.innerHTML, /mute|silencio/i);
  // iconos del set existente
  for (const n of ['trophy', 'medal', 'skins', 'users', 'map', 'robot', 'gear', 'fullscreen', 'user']) assert.ok(root.innerHTML.includes(`data-icon="${n}"`), n);
});

// NOTA: el logo vuelve como banderín en la escena (tarea aparte); la barra del hub no lleva imagen de logo.
test('hub: sin logo en la barra; h1 solo para lectores con el nombre del juego', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {});
  assert.doesNotMatch(root.innerHTML, /<img|hub-logo|logo-header/);
  assert.match(root.innerHTML, /<h1 class="sr-only">Golf Cash Battle<\/h1>/);
});

test('hub: cada acceso navega a su destino', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {});
  const dest = { account: 'account', settings: 'settings', ranking: 'ranking', achievements: 'achievements', skins: 'skins', friends: 'friends', maps: 'maps', play: 'tables' };
  for (const [k, id] of Object.entries(dest)) click(root, k);
  assert.deepEqual(calls.push, Object.values(dest));
  click(root, 'practice');
  click(root, 'fullscreen');
  assert.deepEqual(calls.actions.filter((a) => a !== 'claim'), ['practice', 'fullscreen']);
});

test('hub: reclama recompensas al montar', async () => {
  const env = fakeEnv();
  const { ctx, calls } = makeCtx(env);
  await mount(fakeRoot(env), ctx, {});
  assert.ok(calls.actions.includes('claim'));
});

test('hub: badge de amigos sigue al notifier (petición + invitación)', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, notifier } = makeCtx(env);
  notifier.counts = { friendRequests: 1, partyInvites: 1 };
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /2 novedades/);
  notifier.emit({ friendRequests: 1, partyInvites: 0 });
  assert.match(root.querySelector('[data-badge="friends"]').innerHTML, /1 novedad/);
  notifier.emit({ friendRequests: 0, partyInvites: 0 });
  assert.equal(root.querySelector('[data-badge="friends"]').innerHTML, '');
});

test('hub: badge de logros = completados no vistos', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const done = new Set([CHALLENGES[0].id, CHALLENGES[1].id]);
  const { ctx } = makeCtx(env, { progress: { level: { level: 1, into: 0, need: 100 }, challenge: (id) => ({ value: 1, goal: 1, done: done.has(id) }) } });
  markSeen(ctx.storage, 'u1', [CHALLENGES[0].id]);
  assert.equal(seenSet(ctx.storage, 'u1').size, 1);
  await mount(root, ctx, {});
  const html = root.querySelector('[data-badge="achievements"]').innerHTML;
  assert.match(root.innerHTML, /1 novedad/);
  assert.ok(html === '' || /1 novedad/.test(html));
});

test('hub: invitado marca los huecos de cuenta', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { backend: { user: { id: 'g' }, account: { profile: { is_anonymous: true } } } });
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /Requiere cuenta/);
  assert.match(root.innerHTML, /hub-needs-account/);
  const { ctx: ctx2 } = makeCtx(env);
  const root2 = fakeRoot(env);
  await mount(root2, ctx2, {});
  assert.doesNotMatch(root2.innerHTML, /Requiere cuenta/);
});

test('hub: sin notifier (modo local) monta igual', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { notifier: null, backend: { user: { id: 'l' }, account: null } });
  const s = await mount(root, ctx, {});
  assert.ok(root.innerHTML.includes('JUGAR'));
  s.destroy();
});

// Monedero falso: getBalance asíncrono controlable + suscripción.
function fakeWallet(balance = 1250, { never = false, fail = false } = {}) {
  const subs = new Set();
  return {
    balance, subs,
    getBalance() { return fail ? Promise.reject(new Error('x')) : never ? new Promise(() => {}) : Promise.resolve(this.balance); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(n) { this.balance = n; for (const f of [...subs]) f(n); },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
const bal = (root) => root.querySelector('[data-hub-balance="1"]');

test('hub: píldora de saldo muestra «—» y luego la cantidad con separador de miles', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const wallet = fakeWallet(1250);
  let release;
  wallet.getBalance = () => new Promise((r) => { release = () => r(1250); });
  const { ctx } = makeCtx(env, { wallet });
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /data-hub="wallet"/);
  assert.ok(root.innerHTML.includes('data-icon="coins"'));
  assert.ok(!root.innerHTML.includes('data-icon="wallet"'), 'la píldora lleva solo el icono coins');
  assert.equal(bal(root).textContent, '—');
  release();
  await flush();
  assert.equal(bal(root).textContent, '1.250');
  assert.match(root.innerHTML, /aria-label="Monedero/);
});

test('hub: el saldo sigue a la suscripción, también tapado y al destapar', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const wallet = fakeWallet(100);
  const { ctx } = makeCtx(env, { wallet });
  const s = await mount(root, ctx, {});
  await flush();
  assert.equal(bal(root).textContent, '100');
  wallet.emit(2500000);
  assert.equal(bal(root).textContent, '2.500.000');
  s.onCover();
  wallet.emit(7);
  assert.equal(bal(root).textContent, '7'); // nodo guardado, no root.querySelector
  wallet.balance = 9;
  s.onUncover();
  await flush();
  assert.equal(bal(root).textContent, '9');
});

test('hub: pulsar la píldora abre Cuenta › Monedero', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { wallet: fakeWallet() });
  await mount(root, ctx, {});
  click(root, 'wallet');
  assert.deepEqual(calls.push, ['account']);
  assert.deepEqual(calls.params, [{ tab: 'monedero' }]);
});

test('hub: getBalance que no resuelve o falla no bloquea el montaje; sin wallet no hay píldora', async () => {
  const env = fakeEnv();
  for (const w of [fakeWallet(1, { never: true }), fakeWallet(1, { fail: true })]) {
    const root = fakeRoot(env);
    const { ctx } = makeCtx(env, { wallet: w });
    await mount(root, ctx, {});
    await flush();
    assert.equal(bal(root).textContent, '—');
  }
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { wallet: null });
  await mount(root, ctx, {});
  assert.doesNotMatch(root.innerHTML, /data-hub="wallet"/);
});

test('hub: una lectura vieja tardía no pisa a la nueva; destroy con lectura pendiente no pinta', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const wallet = fakeWallet();
  const pend = [];
  wallet.getBalance = () => new Promise((r) => pend.push(r));
  const { ctx } = makeCtx(env, { wallet });
  const s = await mount(root, ctx, {});
  s.onCover(); s.onUncover(); // lectura A (lenta) y B (nueva)
  pend[1](9); await flush();
  assert.equal(bal(root).textContent, '9');
  pend[0](1); await flush(); // A resuelve tarde con el valor viejo
  assert.equal(bal(root).textContent, '9');
  s.onUncover(); // lectura C pendiente
  s.destroy();
  pend[2](777); await flush();
  assert.equal(bal(root).textContent, '9');
});

test('hub: formato de saldo entero, sin negativos ni notación científica, compacto desde 10 M', () => {
  assert.equal(fmtCoins(1250), '1.250');
  assert.equal(fmtCoins(2500000), '2.500.000');
  assert.equal(fmtCoins(9999999), '9.999.999');
  assert.equal(fmtCoins(12345678), '12,3 M');
  assert.equal(fmtCoins(10000000), '10 M');
  assert.equal(fmtCoins(12345678, false), '12.345.678');
  assert.equal(fmtCoins(-0.001), '0');
  assert.equal(fmtCoins(12.9), '12');
  assert.doesNotMatch(fmtCoins(1e21), /e/);
});

test('hub: 20 montajes con wallet no dejan suscripciones ni listeners', async () => {
  const env = fakeEnv();
  const wallet = fakeWallet();
  const { ctx: base } = makeCtx(env, { wallet });
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const s = await mount(fakeRoot(env), { ...base, scope }, {});
    assert.equal(wallet.subs.size, 1);
    s.destroy();
    scope.dispose();
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
    assert.equal(wallet.subs.size, 0);
  }
  await flush();
  assert.equal(env.liveListeners(), 0);
});

test('hub: 20 montajes y destruidos no dejan listeners, timers ni suscripciones', async () => {
  const env = fakeEnv();
  const { ctx: base, subs } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers }); // el host da un scope por montaje
    const root = fakeRoot(env);
    const s = await mount(root, { ...base, scope }, {});
    assert.equal(subs.size, 1);
    assert.ok(scope.live().listeners >= 8);
    s.destroy();
    scope.dispose(); // el host lo libera tras destroy()
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
    assert.equal(subs.size, 0);
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

// Reglas de CSS que no se ven en el DOM falso pero que, si se pierden, rompen el diseño aprobado por el humano.
import { readFileSync } from 'node:fs';
const HUB_CSS = readFileSync(new URL('../src/screens/hub.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const i = HUB_CSS.indexOf(`${sel} {`);
  return i < 0 ? '' : HUB_CSS.slice(i, HUB_CSS.indexOf('}', i));
};

test('la caja de monedas se ensancha con las cifras: no se encoge y mide lo que mide su contenido', () => {
  const r = rule('.hub-wallet');
  assert.ok(r, 'existe la regla .hub-wallet');
  assert.match(r, /flex:\s*none/);
  assert.match(r, /width:\s*max-content/);
  assert.doesNotMatch(r, /overflow:\s*hidden/);
  const n = rule('.hub-wallet-n');
  assert.ok(n, 'existe la regla .hub-wallet-n');
  assert.doesNotMatch(n, /text-overflow:\s*ellipsis/); // un número truncado engaña
});

test('los botones de abajo usan la fuente de los accesos laterales (Outfit) en mayúsculas', () => {
  assert.match(HUB_CSS, /--display-btn:\s*var\(--display\)/);
  const r = rule('.hub-big, .hub-play');
  assert.ok(r, 'existe la regla de los botones de abajo');
  assert.match(r, /text-transform:\s*uppercase/);
  assert.doesNotMatch(HUB_CSS, /Montserrat|Lilita/);
});

test('Ajustes, pantalla completa y Cuenta no llevan texto visible (solo nombre accesible)', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {});
  const html = root.innerHTML;
  const top = html.slice(html.indexOf('<header class="hub-top">'), html.indexOf('</header>'));
  assert.ok(top.length > 50, 'se encontró la barra superior');
  assert.doesNotMatch(top, /hub-nav-t/); // sin etiquetas de texto en la barra superior
  for (const key of ['settings', 'fullscreen', 'account']) assert.match(top, new RegExp(`data-hub="${key}"[^>]*aria-label="[^"]+"`), key);
});
