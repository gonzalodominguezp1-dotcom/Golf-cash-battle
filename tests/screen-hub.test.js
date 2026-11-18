import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount, fmtCoins } from '../src/screens/hub.js';
import { CHALLENGES } from '../src/progress/skins.js';
import { seenSet, markSeen } from '../src/screens/achievementsRules.js';
import { computeLocks } from '../src/screens/hubRules.js';
import { icon, ICON_NAMES } from '../src/ui/icons.js';
import { WHATS_NEW_KEY } from '../src/ui/whatsNewRules.js';
import { CURRENT_VERSION } from '../src/ui/releaseNotes.js';

// Raíz falsa: reconoce [data-x] y [data-x="v"] sobre el HTML pintado y devuelve elementos estables.
function fakeRoot(env) {
  const els = new Map();
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const get = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!els.has(k)) {
      const e = env.el('button'); e.dataset = { [camel(attr)]: val };
      const attrs = new Map();
      Object.assign(e, { // atributos y foco reales para poder comprobarlos
        setAttribute: (n, v) => attrs.set(n, String(v)), getAttribute: (n) => attrs.get(n) ?? null, removeAttribute: (n) => attrs.delete(n),
        focus: () => { env.doc.activeElement = e; },
      });
      els.set(k, e);
    }
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

// DOM mínimo para el diálogo: doc.body, createElement('div') con sus botones [data-rd] y remove().
function ensureDom(env) {
  if (env.doc.body) return;
  const body = { children: [], append(c) { this.children.push(c); } };
  env.doc.body = body;
  env.doc.activeElement = null;
  env.doc.createElement = () => {
    const el = env.el('div');
    const btns = new Map();
    return Object.assign(el, {
      querySelectorAll() {
        return [...this.innerHTML.matchAll(/data-rd="([^"]+)"/g)].map((m) => {
          if (!btns.has(m[1])) { const b = env.el('button'); b.dataset = { rd: m[1] }; b.focus = () => { env.doc.activeElement = b; }; btns.set(m[1], b); }
          return btns.get(m[1]);
        });
      },
      remove() { body.children.splice(body.children.indexOf(el), 1); },
    });
  };
}

function makeCtx(env, over = {}) {
  ensureDom(env);
  const calls = { push: [], params: [], actions: [] };
  const subs = new Set();
  const notifier = {
    counts: { friendRequests: 0, partyInvites: 0 },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(c) { this.counts = c; for (const f of [...subs]) f(c); },
  };
  const store = new Map([[WHATS_NEW_KEY, CURRENT_VERSION]]); // novedades ya vistas: no sale el modal en el montaje
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

// ---------- accesos bloqueados ----------
const guestBackend = () => ({ user: { id: 'g' }, account: { profile: { is_anonymous: true } } });
const friendsBtn = (root) => root.querySelector('[data-hub="friends"]');
const dialogs = (env) => env.doc.body.children;

test('computeLocks: invitado bloquea Amigos con la acción «Ir a Cuenta»; con cuenta no hay bloqueos', () => {
  assert.deepEqual(computeLocks({ guest: false, hasBackend: true }), {});
  const g = computeLocks({ guest: true, hasBackend: true });
  assert.deepEqual(Object.keys(g), ['friends']);
  assert.equal(g.friends.reasonKey, 'hub.lock.friendsNeedsAccount');
  assert.equal(g.friends.actionKey, 'hub.goAccount');
  assert.equal(g.friends.go, 'account');
  assert.deepEqual(computeLocks(), {}); // sin datos = nada bloqueado
});

test('computeLocks: cuenta real sin nombre de usuario bloquea Amigos con el motivo real y «Ir a Cuenta»; con nombre, libre', () => {
  const n = computeLocks({ guest: false, hasBackend: true, hasName: false });
  assert.deepEqual(Object.keys(n), ['friends']);
  assert.equal(n.friends.reasonKey, 'hub.lock.friendsNeedsName');
  assert.equal(n.friends.actionKey, 'hub.goAccount');
  assert.equal(n.friends.go, 'account');
  assert.deepEqual(computeLocks({ guest: false, hasBackend: true, hasName: true }), {});
  assert.equal(computeLocks({ guest: true, hasBackend: true, hasName: false }).friends.reasonKey, 'hub.lock.friendsNeedsAccount'); // el invitado conserva su motivo
  assert.equal(computeLocks({ guest: true, hasBackend: false, hasName: false }).friends.reasonKey, 'hub.lock.friendsOffline');
});

test('hub: cuenta sin nombre de usuario: popup con el mensaje de main.js y botón «Ir a Cuenta»; con nombre no hay cadenas', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: { user: { id: 'u' }, account: { profile: { username: '', is_anonymous: false } } } });
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /aria-label="Amigos y grupo, bloqueado: requiere nombre de usuario"/);
  click(root, 'friends');
  assert.match(dialogs(env)[0].innerHTML, /Ponte primero un nombre de usuario para añadir amigos./);
  const go = dialogs(env)[0].querySelectorAll().find((b) => b.dataset.rd === 'a0');
  go.emit('click');
  assert.deepEqual(calls.push, ['account']);
  assert.doesNotMatch((await (async () => { const r = fakeRoot(env); await mount(r, makeCtx(env).ctx, {}); return r; })()).innerHTML, /data-icon="chains"/);
});

test('computeLocks: sin backend se bloquean Amigos y Ranking, sin acción (no hay cuenta que crear)', () => {
  const l = computeLocks({ guest: true, hasBackend: false });
  assert.deepEqual(Object.keys(l).sort(), ['friends', 'ranking']);
  assert.equal(l.ranking.reasonKey, 'hub.lock.rankingOffline');
  assert.equal(l.friends.actionKey, undefined);
  assert.equal(l.friends.go, undefined);
});

test('hub: invitado ve Amigos encadenado, con aria-disabled (nunca disabled) y el requisito en el nombre accesible', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { backend: guestBackend() });
  await mount(root, ctx, {});
  const html = root.innerHTML;
  const at = html.indexOf('data-hub="friends"');
  const btn = html.slice(at - 40, html.indexOf('</button>', at));
  assert.match(btn, /aria-disabled="true"/);
  assert.match(btn, /aria-label="Amigos y grupo, bloqueado: requiere cuenta"/);
  assert.match(btn, /data-icon="chains"/);
  assert.match(btn, /data-icon="users"/); // el icono normal sigue debajo
  assert.equal((btn.match(/data-icon="lock"/g) || []).length, 1);
  assert.doesNotMatch(html, /\sdisabled[\s=>]/);
  assert.doesNotMatch(html, /hub-needs-account|Requiere cuenta/); // sin variantes de estado ni sr-only viejo
  assert.equal((html.match(/data-icon="chains"/g) || []).length, 1); // solo Amigos
  const { ctx: ctx2 } = makeCtx(env);
  const root2 = fakeRoot(env);
  await mount(root2, ctx2, {});
  assert.doesNotMatch(root2.innerHTML, /data-icon="chains"|aria-disabled/);
});

test('hub: pulsar un acceso bloqueado abre el popup y NO navega; uno libre navega como siempre', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: guestBackend() });
  await mount(root, ctx, {});
  let prevented = false;
  friendsBtn(root).emit('click', { preventDefault() { prevented = true; } });
  assert.deepEqual(calls.push, []);
  assert.ok(prevented);
  assert.equal(dialogs(env).length, 1);
  const html = dialogs(env)[0].innerHTML;
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
  assert.match(html, /Amigos y grupo/);
  assert.match(html, /Necesitas una cuenta para usar Amigos y grupo/);
  assert.match(html, /data-icon="lock"/);
  assert.equal(dialogs(env)[0].className, 'overlay reason-overlay'); // lo reconoce el manejador global de Esc de main.js
  assert.equal(env.doc.activeElement.dataset.rd, 'close'); // foco inicial dentro, en «Entendido» (la acción útil queda a un Tab)
  friendsBtn(root).emit('click'); // segundo clic con el popup abierto: no se duplica
  assert.equal(dialogs(env).length, 1);
  dialogs(env)[0].querySelectorAll()[0].emit('click');
  click(root, 'ranking');
  assert.deepEqual(calls.push, ['ranking']);
});

test('popup: «Entendido», Esc y el fondo lo cierran y devuelven el foco al botón; el hub sigue en pie', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: guestBackend() });
  await mount(root, ctx, {});
  const closers = [
    () => dialogs(env)[0].querySelectorAll().find((b) => b.dataset.rd === 'close').emit('click'),
    () => { let stopped = false; dialogs(env)[0].emit('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } }); assert.ok(stopped); },
    () => { const o = dialogs(env)[0]; o.emit('click', { target: {} }); assert.equal(dialogs(env).length, 1, 'un clic dentro de la tarjeta no cierra'); o.emit('click', { target: o }); },
  ];
  for (const close of closers) {
    friendsBtn(root).emit('click');
    assert.equal(dialogs(env).length, 1);
    close();
    assert.equal(dialogs(env).length, 0);
    assert.equal(env.doc.activeElement, friendsBtn(root));
  }
  assert.deepEqual(calls.push, []);
  assert.equal(ctx.scope.live().subs, 1);
  assert.equal(env.liveTimers(), 0);
});

test('popup: «Ir a Cuenta» cierra y navega a Cuenta; Tab da la vuelta dentro del diálogo', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: guestBackend() });
  await mount(root, ctx, {});
  friendsBtn(root).emit('click');
  const [close, go] = dialogs(env)[0].querySelectorAll();
  assert.equal(env.doc.activeElement, close);
  go.focus(); // Tab desde «Entendido» llega a la acción; otro Tab da la vuelta
  let tabbed = false;
  dialogs(env)[0].emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() { tabbed = true; } });
  assert.ok(tabbed);
  assert.equal(env.doc.activeElement, close);
  go.emit('click');
  assert.equal(dialogs(env).length, 0);
  assert.deepEqual(calls.push, ['account']);
});

test('popup: onCover y destroy cierran SIN robar el foco a la pantalla nueva; el usuario sí lo recupera al cerrar', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { backend: guestBackend() });
  const s = await mount(root, ctx, {});
  friendsBtn(root).emit('click');
  const other = { focus() { env.doc.activeElement = other; } };
  other.focus();
  s.onCover();
  assert.equal(dialogs(env).length, 0);
  assert.equal(env.doc.activeElement, other);
  s.onUncover();
  friendsBtn(root).emit('click');
  other.focus();
  s.destroy();
  assert.equal(dialogs(env).length, 0);
  assert.equal(env.doc.activeElement, other);
});

test('hub: onUncover sin cambios no regenera las cadenas; un cambio sí actualiza', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const backend = guestBackend();
  let gen = 0;
  const { ctx } = makeCtx(env, { backend, icon: (n) => { if (n === 'chains') gen++; return `<svg data-icon="${n}"></svg>`; } });
  const s = await mount(root, ctx, {});
  assert.equal(gen, 1);
  s.onCover(); s.onUncover(); s.onCover(); s.onUncover();
  assert.equal(gen, 1, 'sin cambio no se vuelve a generar');
  backend.account.profile.is_anonymous = false;
  backend.account.profile.username = 'ana';
  s.onCover(); s.onUncover();
  assert.equal(gen, 1);
  assert.equal(root.querySelector('[data-lock="friends"]').innerHTML, '');
  backend.account.profile.username = '';
  s.onCover(); s.onUncover();
  assert.equal(gen, 2, 'un cambio sí regenera');
  assert.match(root.querySelector('[data-lock="friends"]').innerHTML, /chains/);
});

test('popup: destruir el hub con el popup abierto lo cierra y deja el scope a cero; cerrar dos veces no falla', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env, { backend: guestBackend() });
  const root = fakeRoot(env);
  const s = await mount(root, ctx, {});
  friendsBtn(root).emit('click');
  const btn = dialogs(env)[0].querySelectorAll()[0];
  s.destroy();
  assert.equal(dialogs(env).length, 0);
  btn.emit('click'); // listener ya liberado: no hace nada
  s.destroy();
  ctx.scope.dispose();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(env.liveListeners(), 0);
});

test('popup: 20 montajes con el popup abierto y destruidos no dejan nada', async () => {
  const env = fakeEnv();
  const { ctx: base } = makeCtx(env, { backend: guestBackend() });
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const root = fakeRoot(env);
    const s = await mount(root, { ...base, scope }, {});
    friendsBtn(root).emit('click');
    assert.equal(dialogs(env).length, 1);
    if (i % 2) dialogs(env)[0].querySelectorAll()[0].emit('click');
    s.destroy();
    scope.dispose();
    assert.equal(dialogs(env).length, 0);
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  assert.equal(env.liveListeners(), 0);
});

test('hub: al crear la cuenta y volver (onUncover) se quitan las cadenas y el acceso navega', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const backend = guestBackend();
  const { ctx, calls } = makeCtx(env, { backend });
  const s = await mount(root, ctx, {});
  const layer = root.querySelector('[data-lock="friends"]');
  assert.match(root.innerHTML, /data-lock="friends"[^>]*><span class="hub-chains"/);
  assert.match(root.innerHTML, /data-hub="friends"[^>]*aria-disabled="true"/);
  s.onCover();
  backend.account.profile.is_anonymous = false; backend.account.profile.username = 'ana'; // la cuenta se crea (con nombre) en la pantalla Cuenta
  s.onUncover('account');
  assert.equal(layer.innerHTML, '');
  assert.equal(friendsBtn(root).getAttribute('aria-disabled'), null);
  assert.equal(friendsBtn(root).getAttribute('aria-label'), null);
  click(root, 'friends');
  assert.deepEqual(calls.push, ['friends']);
  backend.account.profile.is_anonymous = true; // y se vuelve a bloquear si la sesión vuelve a ser de invitado
  s.onCover(); s.onUncover();
  assert.match(layer.innerHTML, /chains/);
  assert.equal(friendsBtn(root).getAttribute('aria-disabled'), 'true');
  assert.match(friendsBtn(root).getAttribute('aria-label'), /bloqueado: requiere cuenta/);
});

test('hub: sin conexión se bloquean Amigos y Ranking; el popup solo trae «Entendido» y el mensaje real del ranking', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { backend: { user: { id: 'l' }, account: null } });
  await mount(root, ctx, {});
  assert.equal((root.innerHTML.match(/data-icon="chains"/g) || []).length, 2);
  click(root, 'ranking');
  assert.match(dialogs(env)[0].innerHTML, /El ranking de victorias necesita conexión con el servidor\./);
  assert.doesNotMatch(dialogs(env)[0].innerHTML, /data-rd="a0"/);
  assert.deepEqual(calls.push, []);
});

test('icono chains: svg válido registrado, con muchos eslabones', () => {
  assert.ok(ICON_NAMES.includes('chains'));
  const svg = icon('chains');
  assert.match(svg, /^<svg class="gi gi-chains/);
  assert.match(svg, /viewBox="-1 -1 51 51"/);
  assert.equal((svg.match(/<\/svg>/g) || []).length, 1);
  assert.ok((svg.match(/<path/g) || []).length > 60);
});

test('CSS del hub: ningún acceso cambia de borde ni de opacidad por su estado, y sin :hover', () => {
  assert.doesNotMatch(HUB_CSS, /needs-account|dashed/);
  assert.equal((HUB_CSS.match(/:hover/g) || []).length, 0);
  assert.doesNotMatch(rule('.hub-nav[data-locked] .hub-ico > svg'), /border|opacity:/);
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

test('hub: pulsar la píldora abre la pantalla Monedero (#/monedero)', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env, { wallet: fakeWallet() });
  await mount(root, ctx, {});
  click(root, 'wallet');
  assert.deepEqual(calls.push, ['wallet']);
  assert.equal(calls.params[0], undefined);
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

test('el candado de un acceso bloqueado no tiene fondo ni borde y es grande', () => {
  const r = rule('.hub-padlock');
  assert.ok(r, 'existe la regla .hub-padlock');
  assert.match(r, /background:\s*none/);
  assert.match(r, /border:\s*0/);
  assert.match(r, /box-shadow:\s*none/);
  assert.doesNotMatch(r, /border-radius|radial-gradient|var\(--gold\)/);
  const w = Number(/width:\s*(\d+)%/.exec(r)?.[1]);
  assert.ok(w >= 70, `el candado ocupa ${w}% del recuadro (mín. 70 %)`);
});

test('las cadenas se leen como cadena: muchos eslabones pequeños por diagonal', () => {
  const svg = icon('chains');
  const paths = (svg.match(/<path/g) || []).length;
  assert.ok(paths >= 120, `${paths} paths: con 11 eslabones por cadena debería haber bastantes más que con 6`);
  // el óvalo de frente mide ~9,2×5,8 unidades (antes 14×8,8): ningún eslabón de frente debe volver a ser grande
  const src = readFileSync(new URL('../src/ui/icons.js', import.meta.url), 'utf8');
  const m = /Math\.cos\(a\) \* ([\d.]+), Math\.sin\(a\) \* ([\d.]+)/.exec(src);
  assert.ok(m, 'se encontró el óvalo del eslabón');
  assert.ok(Number(m[1]) <= 5.2 && Number(m[2]) <= 3.3, `eslabón ${m[1]}×${m[2]} demasiado grande`);
  assert.match(src, /chains: \(\) => \[\.\.\.chainParts\(2, 2, 47, 47, 1\d, true\)/); // ≥ 10 eslabones por cadena
});
