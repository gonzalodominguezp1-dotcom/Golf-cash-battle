import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount, isValidAmount, isSafeInvoiceUrl } from '../src/screens/account/wallet.js';

// DOM falso mínimo: parsea los elementos con data-* del HTML que escribe el módulo y expone querySelector(All),
// dataset, disabled, textContent y addEventListener/removeEventListener. Todo elemento creado se registra en `all`
// para contar listeners vivos (prueba de fugas).
const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
const settle = () => new Promise((r) => setImmediate(r));
const defer = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

function fakeRoot() {
  const all = [];
  let kids = [];
  let html = '';
  const matches = (e, sel) => {
    const m = sel.match(/^\[(data-[\w-]+)(?:="([^"]*)")?\]$/);
    return Boolean(m) && m[1] in e.attrs && (m[2] === undefined || e.attrs[m[1]] === m[2]);
  };
  const make = (attrs) => {
    const listeners = new Map();
    const dataset = {};
    for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) dataset[camel(k)] = v ?? '';
    const e = {
      attrs, dataset, disabled: false, textContent: '', innerHTML: '',
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      click() { for (const fn of [...(listeners.get('click') ?? [])]) fn({ preventDefault() {} }); },
      count() { let n = 0; for (const s of listeners.values()) n += s.size; return n; },
    };
    all.push(e);
    return e;
  };
  const parse = (h) => {
    const out = [];
    for (const m of h.matchAll(/<([a-zA-Z][\w-]*)((?:\s[^>]*?)?)\/?>/g)) {
      const attrs = {};
      for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2];
      if (Object.keys(attrs).some((k) => k.startsWith('data-'))) out.push(make(attrs));
    }
    return out;
  };
  return {
    dataset: {}, all,
    addEventListener() {}, removeEventListener() {},
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); kids = parse(html); },
    querySelector: (sel) => kids.find((e) => matches(e, sel)) ?? null,
    querySelectorAll: (sel) => kids.filter((e) => matches(e, sel)),
    listeners: () => all.reduce((n, e) => n + e.count(), 0),
  };
}

function fakeWallet(opts = {}) {
  const w = {
    balance: opts.balance ?? 120,
    txs: opts.txs ?? [],
    listeners: new Set(),
    calls: { balance: 0, deposit: [], crypto: [] },
    nextBalance: null, onDeposit: null, onCrypto: null,
    getBalance: () => { w.calls.balance++; return w.nextBalance ? w.nextBalance() : Promise.resolve(w.balance); },
    getTransactions: async () => w.txs,
    deposit: async (amount, note) => { w.calls.deposit.push([amount, note]); return w.onDeposit ? w.onDeposit(amount) : w.balance; },
    depositCrypto: async (amount) => { w.calls.crypto.push(amount); return w.onCrypto ? w.onCrypto(amount) : { invoiceUrl: 'https://pay.example/inv' }; },
    subscribe(fn) { w.listeners.add(fn); return () => w.listeners.delete(fn); },
    emit(n) { for (const fn of [...w.listeners]) fn(n); },
  };
  return w;
}

function makeCtx(env, w) {
  const win = { location: { href: '' } };
  const scope = createScope({ win, doc: env.doc, timers: env.timers });
  const ctx = { wallet: w, scope, icon: (n) => `<svg data-icon="${n}"></svg>`, sfx: { coins() {} } };
  return { ctx, scope, win };
}

const hung = () => new Promise(() => {});
// el contenido del saldo: lo escrito por el módulo en el HTML del nodo, o lo asignado después (suscripción)
const bal = (root) => {
  const e = root.querySelector('[data-wallet-balance]');
  if (e.innerHTML) return e.innerHTML;
  return root.innerHTML.match(/data-wallet-balance="1">([\s\S]*?)<\/strong>/)?.[1] ?? '';
};
const err = (root) => root.querySelector('[data-wallet-error]').textContent;
const TX = (over) => ({ id: 'x', type: 'deposit', amount: 50, note: 'Recarga demo', at: Date.UTC(2026, 10, 1), ...over });
const metric = (root, label) => root.innerHTML.match(new RegExp(`${label}</small>\\s*<b>([\\s\\S]*?)</b>`))?.[1] ?? '';

test('monedero: mount no bloquea, devuelve destroy y pinta «Cargando» mientras espera el saldo', () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet(); w.nextBalance = hung;
  const { ctx } = makeCtx(env, w);
  const m = mount(root, ctx);
  assert.equal(typeof m.destroy, 'function');
  assert.equal(root.dataset.state, 'loading');
  assert.match(root.innerHTML, /Cargando/);
});

test('monedero: pinta saldo, premios, partidas e historial; escapa las descripciones (XSS)', async () => {
  const env = fakeEnv(); const root = fakeRoot();
  const w = fakeWallet({
    balance: 120,
    txs: [
      TX({ type: 'prize', amount: 30, note: '<img src=x onerror=alert(1)>' }),
      TX({ type: 'entry', amount: -10, note: 'Mesa "A" & <b>B</b>' }),
    ],
  });
  const { ctx } = makeCtx(env, w);
  mount(root, ctx); await settle();
  assert.equal(root.dataset.state, 'ready');
  assert.match(root.innerHTML, /Saldo Disponible/);
  assert.equal(bal(root).endsWith('120'), true);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.doesNotMatch(root.innerHTML, /<b>B<\/b>/);
  assert.match(root.innerHTML, /&#60;img/);
  assert.doesNotMatch(root.innerHTML, /DIAMOND VIP/);
  assert.doesNotMatch(root.innerHTML, /desafío/i);
});

test('monedero: historial vacío muestra el estado vacío', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet({ txs: [] });
  mount(root, makeCtx(env, w).ctx); await settle();
  assert.match(root.innerHTML, /Sin movimientos todavía/);
});

test('monedero: premios sin negativos ni ceros y partidas solo de tipo entry', async () => {
  const env = fakeEnv(); const root = fakeRoot();
  const w = fakeWallet({
    txs: [
      TX({ type: 'prize', amount: 30 }),
      TX({ type: 'prize', amount: -20 }),
      TX({ type: 'prize', amount: 0 }),
      TX({ type: 'entry', amount: -10 }),
      TX({ type: 'entry', amount: -10 }),
      TX({ type: 'entry', amount: -10 }),
      TX({ type: 'deposit', amount: 50 }),
    ],
  });
  mount(root, makeCtx(env, w).ctx); await settle();
  assert.equal(metric(root, 'Premios Ganados').endsWith('30'), true);
  assert.equal(metric(root, 'Torneos Jugados'), '3');
});

test('monedero: tipo desconocido se escapa (sin HTML sin escapar)', async () => {
  const env = fakeEnv(); const root = fakeRoot();
  const w = fakeWallet({ txs: [TX({ type: '<img src=x onerror=alert(1)>', amount: 5 })] });
  mount(root, makeCtx(env, w).ctx); await settle();
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.match(root.innerHTML, /&#60;img/);
});

test('monedero: recarga válida envía el importe, y luego vuelve a leer el saldo del servidor', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-add="50"]').click(); await settle();
  assert.deepEqual(w.calls.deposit, [[50, 'Recarga demo']]);
  assert.equal(w.calls.balance, 2);
});

test('monedero: los importes de recarga son exactamente 50 y 200; los de cripto 10, 25 y 50', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  mount(root, makeCtx(env, w).ctx); await settle();
  assert.deepEqual(root.querySelectorAll('[data-add]').map((b) => b.dataset.add), ['50', '200']);
  assert.deepEqual(root.querySelectorAll('[data-crypto]').map((b) => b.dataset.crypto), ['10', '25', '50']);
});

test('monedero: importes no válidos (negativo, cero, texto, NaN, infinito) no se envían', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  mount(root, makeCtx(env, w).ctx); await settle();
  for (const bad of ['-5', '0', 'abc', 'NaN', 'Infinity']) {
    const b = root.querySelector('[data-add="50"]');
    b.dataset.add = bad;
    b.click(); await settle();
  }
  assert.deepEqual(w.calls.deposit, []);
  assert.equal(err(root), 'El importe no es válido.');
  assert.equal(isValidAmount(-1), false);
  assert.equal(isValidAmount(0), false);
  assert.equal(isValidAmount(NaN), false);
  assert.equal(isValidAmount('5'), false);
  assert.equal(isValidAmount(5), true);
});

test('monedero: cero y negativos no se envían ni en recarga ni en cripto', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  mount(root, makeCtx(env, w).ctx); await settle();
  for (const bad of ['0', '-5']) {
    root.querySelector('[data-add="50"]').dataset.add = bad;
    root.querySelector('[data-add="50"]').click(); await settle();
    assert.match(err(root), /no es válido/);
    root.querySelector('[data-crypto="10"]').dataset.crypto = bad;
    root.querySelector('[data-crypto="10"]').click(); await settle();
    assert.match(err(root), /no es válido/);
  }
  assert.deepEqual(w.calls.deposit, []);
  assert.deepEqual(w.calls.crypto, []);
});

test('monedero: tope diario de recargas muestra el aviso y reactiva el botón', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onDeposit = async () => { const e = new Error('daily_cap'); e.code = 'daily_cap'; throw e; };
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-add="200"]').click(); await settle();
  assert.match(err(root), /límite de recargas demo de hoy/);
  assert.equal(root.querySelector('[data-add="200"]').disabled, false);
});

test('monedero: otro error de recarga muestra el genérico, no el de tope diario', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onDeposit = async () => { throw new Error('network'); };
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-add="200"]').click(); await settle();
  assert.equal(err(root), 'No se ha podido hacer la recarga. Prueba otra vez.');
  assert.doesNotMatch(err(root), /límite/);
});

test('monedero: al pulsar una recarga se limpia el error previo', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onDeposit = async () => { throw new Error('network'); };
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-add="50"]').click(); await settle();
  assert.notEqual(err(root), '');
  const d = defer(); w.onDeposit = () => d.p;
  root.querySelector('[data-add="50"]').click();
  assert.equal(err(root), '');
  d.resolve(120); await settle();
});

test('monedero: pago en cripto solo redirige a https', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onCrypto = async () => ({ invoiceUrl: 'javascript:alert(1)' });
  const { ctx, win } = makeCtx(env, w);
  mount(root, ctx); await settle();
  root.querySelector('[data-crypto="10"]').click(); await settle();
  assert.equal(win.location.href, '');
  assert.match(err(root), /No se ha podido crear el pago/);
  assert.equal(isSafeInvoiceUrl('https://pay.example/x'), true);
  assert.equal(isSafeInvoiceUrl('javascript:alert(1)'), false);
  w.onCrypto = async () => ({ invoiceUrl: 'https://pay.example/inv' });
  root.querySelector('[data-crypto="25"]').click(); await settle();
  assert.equal(win.location.href, 'https://pay.example/inv');
});

test('monedero: solo https es seguro como factura (http, javascript con https:// dentro, https válido)', async () => {
  assert.equal(isSafeInvoiceUrl('http://evil.example/x'), false);
  assert.equal(isSafeInvoiceUrl("javascript:alert('https://')"), false);
  assert.equal(isSafeInvoiceUrl('https://ok.example/x'), true);
  assert.equal(isSafeInvoiceUrl(undefined), false);

  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onCrypto = async () => ({ invoiceUrl: 'http://evil.example/x' });
  const { ctx, win } = makeCtx(env, w);
  mount(root, ctx); await settle();
  root.querySelector('[data-crypto="10"]').click(); await settle();
  assert.equal(win.location.href, '');
  assert.match(err(root), /No se ha podido crear el pago/);
});

test('monedero: error de depositCrypto reactiva el botón', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onCrypto = async () => { throw new Error('boom'); };
  mount(root, makeCtx(env, w).ctx); await settle();
  const b = root.querySelector('[data-crypto="50"]');
  b.click(); await settle();
  assert.equal(b.disabled, false);
  assert.equal(err(root), 'No se ha podido crear el pago. Prueba otra vez.');
});

test('monedero: not_configured en cripto muestra su mensaje propio', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.onCrypto = async () => { const e = new Error('x'); e.code = 'not_configured'; throw e; };
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-crypto="10"]').click(); await settle();
  assert.equal(err(root), 'Los depósitos en cripto todavía no están activados.');
});

test('monedero: destroy con un pago cripto pendiente no redirige', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  const d = defer(); w.onCrypto = () => d.p;
  const { ctx, win } = makeCtx(env, w);
  const m = mount(root, ctx); await settle();
  root.querySelector('[data-crypto="10"]').click(); await settle();
  m.destroy();
  d.resolve({ invoiceUrl: 'https://pay.example/inv' }); await settle();
  assert.equal(win.location.href, '');
});

test('monedero: sin respuesta en 8 s muestra error con Reintentar, y Reintentar vuelve a pedir', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet(); w.nextBalance = hung;
  mount(root, makeCtx(env, w).ctx); await settle();
  env.timers.advance(7999); await settle();
  assert.equal(root.dataset.state, 'loading');
  env.timers.advance(1); await settle();
  assert.equal(root.dataset.state, 'error');
  assert.match(root.innerHTML, /No se pudo cargar tu monedero/);
  w.nextBalance = null;
  root.querySelector('[data-retry]').click(); await settle();
  assert.equal(root.dataset.state, 'ready');
  assert.equal(w.calls.balance, 2);
});

test('monedero: historial que no responde también cae en el tope de 8 s con Reintentar', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  w.getTransactions = hung;
  mount(root, makeCtx(env, w).ctx); await settle();
  env.timers.advance(8000); await settle();
  assert.equal(root.dataset.state, 'error');
  assert.match(root.innerHTML, /data-retry/);
});

test('monedero: una lectura vieja (red lenta) no pisa la última pedida', async () => {
  // Dos recargas quedan pendientes a la vez (los botones siguen en pantalla). Al resolver la primera, su lectura A
  // queda colgada; al resolver la segunda, la lectura B resuelve con 500. Cuando A llega tarde con 1, no debe repintar.
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  const dA = defer(), d50 = defer(), d200 = defer(); let n = 0;
  w.nextBalance = () => { n++; if (n === 1) return Promise.resolve(120); if (n === 2) return dA.p; return Promise.resolve(500); };
  w.onDeposit = (amount) => (amount === 50 ? d50.p : d200.p);
  mount(root, makeCtx(env, w).ctx); await settle();
  root.querySelector('[data-add="50"]').click(); await settle();
  root.querySelector('[data-add="200"]').click(); await settle();
  d50.resolve(120); await settle();                                // lectura A (pendiente)
  assert.equal(w.calls.balance, 2);
  d200.resolve(120); await settle();                               // lectura B (resuelve con 500)
  assert.equal(w.calls.balance, 3);
  assert.equal(bal(root).endsWith('500'), true);
  dA.resolve(1); await settle();                                   // A llega tarde con saldo viejo
  assert.equal(bal(root).endsWith('500'), true);
});

test('monedero: el saldo en vivo (wallet.subscribe) repinta solo el número', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  mount(root, makeCtx(env, w).ctx); await settle();
  w.emit(777);
  assert.equal(bal(root).endsWith('777'), true);
});

test('monedero: destroy con una lectura pendiente no pinta nada al llegar', async () => {
  const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
  const d = defer(); w.nextBalance = () => d.p;
  const m = mount(root, makeCtx(env, w).ctx); await settle();
  m.destroy();
  d.resolve(999); await settle();
  assert.equal(root.dataset.state, 'loading');
  assert.doesNotMatch(root.innerHTML, /Saldo Disponible/);
});

test('monedero: 20 ciclos mount/destroy sin fugas (suscripción, timers y listeners)', async () => {
  for (let i = 0; i < 20; i++) {
    const env = fakeEnv(); const root = fakeRoot(); const w = fakeWallet();
    const hold = i % 2 === 1;
    if (hold) w.nextBalance = hung;
    const { ctx, scope } = makeCtx(env, w);
    const m = mount(root, ctx);
    await settle();
    // precondiciones previas a destroy: en ciclos sin lectura colgada, una suscripción y un listener del monedero
    if (hold) {
      assert.ok(scope.live().timers >= 1, `ciclo ${i}: lectura colgada con timeout vivo`);
      assert.ok(env.liveTimers() > 0, `ciclo ${i}: timeout vivo`);
    } else {
      assert.equal(scope.live().subs, 1, `ciclo ${i}: suscripción viva antes de destroy`);
      assert.equal(w.listeners.size, 1, `ciclo ${i}: listener del wallet vivo antes de destroy`);
      assert.ok(root.listeners() > 0, `ciclo ${i}: listeners de botones vivos`);
    }
    m.destroy();
    assert.equal(w.listeners.size, 0, `ciclo ${i}: suscripción liberada`);
    assert.equal(env.liveTimers(), 0, `ciclo ${i}: timers liberados`);
    assert.equal(root.listeners(), 0, `ciclo ${i}: listeners liberados`);
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 }, `ciclo ${i}: scope vacío`);
  }
});
