import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount } from '../src/screens/friends.js';
import { mountPartyPanel } from '../src/screens/partyPanel.js';

// Nodo falso: reconoce [data-x] y [data-x="v"] sobre su HTML (o el del padre si aún no pintó nada) y devuelve elementos
// estables; las cajas contenedoras son nodos hijos con su propio innerHTML.
const BOXES = new Set(['data-friends-body', 'data-friends-box', 'data-party-box']);
function fakeNode(env, parent = null) {
  const stubs = new Map(), kids = new Map();
  let html = '';
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const stub = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!stubs.has(k)) { const e = env.el('button'); e.dataset = { [camel(attr)]: val }; stubs.set(k, e); }
    return stubs.get(k);
  };
  const node = {
    isConnected: true,
    dataset: {},
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; stubs.clear(); kids.clear(); },
    hay: () => html || parent?.hay() || '',
    querySelectorAll(sel) {
      const attr = sel.match(/^\[(data-[\w-]+)\]$/)?.[1];
      if (!attr) return [];
      return [...node.hay().matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => stub(attr, m[1]));
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)(?:="([^"]+)")?\]$/);
      if (!m) return null;
      const has = m[2] === undefined ? node.hay().includes(m[1]) : node.hay().includes(`${m[1]}="${m[2]}"`);
      if (!has) return null;
      if (BOXES.has(m[1])) { if (!kids.has(m[1])) kids.set(m[1], fakeNode(env, node)); return kids.get(m[1]); }
      return stub(m[1], m[2] ?? '');
    },
  };
  return node;
}

const settle = () => new Promise((r) => setImmediate(r));
const FRIENDS = () => ({
  friends: [{ name: 'Ana', level: 3, frame: null, avatar: null, online: true }],
  incoming: [{ name: 'Bo' }],
  outgoing: [{ name: 'Cy' }],
});

function makeCtx(env, over = {}) {
  const calls = { push: [], back: 0, friends: 0, respond: [], add: [], remove: [], invite: [], leave: 0, ready: [], start: 0, stop: 0 };
  const account = {
    profile: { username: 'yo' },
    friends: async () => { calls.friends++; return FRIENDS(); },
    respondFriend: async (n, ok) => { calls.respond.push([n, ok]); },
    addFriend: async (n) => { calls.add.push(n); return 'pending'; },
    removeFriend: async (n) => { calls.remove.push(n); },
  };
  const subs = new Set();
  const partyWatch = {
    state: null,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    start() { calls.start++; },
    stop() { calls.stop++; },
    async apply(job, ok = '') {
      this.state = await job();
      for (const fn of [...subs]) fn(this.state, { msg: ok });
    },
  };
  const parties = {
    invite: async (n) => { calls.invite.push(n); return { party: null, invites: [] }; },
    respond: async () => ({ party: null, invites: [] }),
    leave: async () => { calls.leave++; return { party: null, invites: [] }; },
    ready: async (v) => { calls.ready.push(v); return partyWatch.state; },
  };
  const ctx = {
    router: { push: (id) => { calls.push.push(id); }, back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    backend: { mode: 'remote', account, parties },
    partyWatch,
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    ...over,
  };
  return { ctx, calls, account, partyWatch, subs };
}

const submit = (root, name) => {
  const body = root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  body.querySelector('[data-friend-input]').value = name;
  body.querySelector('[data-friend-form]').emit('submit', { preventDefault() {} });
  return body;
};

test('friends: monta amigos, solicitudes y la caja de grupo con textos en español', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, partyWatch, subs } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.match(root.innerHTML, /Amigos y grupo/);
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/); // sin volver en cabecera: lo hace el lobby
  assert.match(root.innerHTML, /data-lobby/);
  assert.doesNotMatch(root.innerHTML, /desaf[ií]os/i);
  const box = root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.match(box.innerHTML, /Ana/);
  assert.match(box.innerHTML, /Peticiones recibidas/);
  assert.match(box.innerHTML, /Peticiones enviadas/);
  assert.match(box.innerHTML, /data-accept="Bo"/);
  assert.match(box.innerHTML, /data-remove="Cy"/);
  assert.match(box.innerHTML, /Nv\. 3/);
  // sin caja de grupo: la pantalla de amigos ya no monta el panel «Juega con amigos»
  assert.equal(root.querySelector('[data-friends-body]').querySelector('[data-party-box]'), null);
  assert.doesNotMatch(root.innerHTML, /Juega con amigos/);
  assert.equal(calls.start, 1); // amigos sondea las invitaciones de grupo mientras está abierta
  assert.equal(subs.size, 1); // el aviso de grupo de la pantalla
});

test('friends: invitar al grupo va a la izquierda de quitar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  const box = root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.ok(box.innerHTML.indexOf('data-invite="Ana"') < box.innerHTML.indexOf('data-remove="Ana"'));
  box.querySelector('[data-invite="Ana"]').emit('click'); await settle();
  assert.deepEqual(calls.invite, ['Ana']);
});

test('friends: aceptar, rechazar y quitar usan la cuenta y muestran el mensaje de siempre', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  const box = () => root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  box().querySelector('[data-accept="Bo"]').emit('click'); await settle();
  assert.deepEqual(calls.respond, [['Bo', true]]);
  assert.match(box().innerHTML, /Ahora eres amigo de Bo\./);
  box().querySelector('[data-decline="Bo"]').emit('click'); await settle();
  assert.deepEqual(calls.respond[1], ['Bo', false]);
  assert.match(box().innerHTML, /Petición rechazada\./);
  box().querySelector('[data-remove="Ana"]').emit('click'); await settle();
  assert.deepEqual(calls.remove, ['Ana']);
  assert.match(box().innerHTML, /Hecho\./);
});

test('friends: añadir por nombre de usuario, nombre inválido y errores del servidor', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  submit(root, '@Ana_1'); await settle();
  assert.deepEqual(calls.add, ['Ana_1']);
  const box = () => root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.match(box().innerHTML, /Petición enviada a Ana_1\./);
  account.addFriend = async () => 'accepted';
  submit(root, 'Zed'); await settle();
  assert.match(box().innerHTML, /Ya eres amigo de Zed\./);
  submit(root, 'a'); await settle(); // inválido: no llega a la cuenta
  assert.match(box().innerHTML, /Escribe un nombre de usuario válido/);
  assert.equal(box().querySelector('[data-friend-input]').value, 'a');
  account.addFriend = async () => { throw Object.assign(new Error('x'), { code: 'user_not_found' }); };
  submit(root, 'Nadie'); await settle();
  assert.match(box().innerHTML, /No existe ningún jugador con ese nombre\./);
  assert.match(box().innerHTML, /friend-msg err/);
  assert.equal(box().querySelector('[data-friend-input]').value, 'Nadie');
  account.addFriend = async () => { throw Object.assign(new Error('x'), { code: 'raro' }); };
  submit(root, 'Otro'); await settle();
  assert.match(box().innerHTML, /No se ha podido completar\. Prueba otra vez\./);
});

test('friends: bloqueos del hub: invitado, sin nombre de usuario y sin conexión', async () => {
  const cases = [
    [{ profile: { is_anonymous: true } }, /Necesitas una cuenta para usar Amigos y grupo/, 'account'],
    [{ profile: {} }, /Ponte primero un nombre de usuario para añadir amigos\./, 'account'],
    [null, /Amigos y grupo necesita conexión con el servidor/, null],
  ];
  for (const [acc, re, go] of cases) {
    const env = fakeEnv();
    const root = fakeNode(env);
    const { ctx, calls } = makeCtx(env);
    ctx.backend = { mode: 'local', account: acc, parties: null };
    const screen = await mount(root, ctx, {});
    assert.match(root.innerHTML, re);
    assert.equal(calls.friends, 0);
    assert.equal(calls.start, 0);
    if (go) {
      root.querySelector('[data-friends-body]').querySelector('[data-go="account"]').emit('click');
      assert.deepEqual(calls.push, [go]);
    } else assert.doesNotMatch(root.innerHTML, /data-go/);
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
});

test('friends: la carga no bloquea el montaje; tras el tope sale Reintentar y se recupera', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  let hang = true;
  account.friends = () => (hang ? new Promise(() => {}) : Promise.resolve(FRIENDS()));
  const screen = await mount(root, ctx, {}); // no espera a la red
  const body = () => root.querySelector('[data-friends-body]');
  assert.equal(body().dataset?.state ?? 'loading', 'loading');
  assert.match(body().innerHTML, /Cargando/);
  env.timers.advance(8000);
  await settle();
  assert.match(body().innerHTML, /No se pudieron cargar tus amigos/);
  assert.match(body().innerHTML, /Reintentar/);
  hang = false;
  body().querySelector('[data-retry]').emit('click');
  await settle();
  assert.match(root.querySelector('[data-friends-body]').querySelector('[data-friends-box]').innerHTML, /Ana/);
  screen.destroy();
});

test('friends: un error al refrescar tras una acción muestra el mensaje con Reintentar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  const box = () => root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  account.friends = async () => { throw new Error('red'); };
  box().querySelector('[data-remove="Ana"]').emit('click'); await settle();
  assert.match(box().innerHTML, /No se han podido cargar tus amigos\./);
  assert.match(box().innerHTML, /Reintentar/);
});

test('friends: destroy deja el scope a cero (comprobado que había algo vivo antes)', async () => {
  const env = fakeEnv();
  const { ctx, calls } = makeCtx(env);
  const screen = await mount(fakeNode(env), ctx, {}); await settle();
  const live = ctx.scope.live();
  assert.ok(live.listeners > 0 && live.subs > 0, 'había algo vivo');
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(calls.stop, 1); // al salir para el sondeo de grupo
});

test('friends: destroy durante la carga no pinta después ni deja timers', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account, calls } = makeCtx(env);
  let release;
  account.friends = () => new Promise((r) => { release = r; });
  const screen = await mount(root, ctx, {});
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  release(FRIENDS());
  env.timers.advance(20000);
  await settle();
  assert.doesNotMatch(root.innerHTML, /data-friends-box/);
  assert.equal(calls.start, 1);
  assert.equal(calls.stop, 1);
});

test('friends: 20 montajes y destroy sin fugas', async () => {
  const env = fakeEnv();
  for (let i = 0; i < 20; i++) {
    const { ctx, calls } = makeCtx(env);
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const screen = await mount(fakeNode(env), { ...ctx, scope }, {}); await settle();
    assert.ok(scope.live().listeners > 0, 'había algo vivo');
    screen.destroy();
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
    assert.equal(calls.stop, 1);
    scope.dispose();
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('partyPanel: grupo con miembros, listo, invitar y salir; destroy lo libera todo', async () => {
  const env = fakeEnv();
  const { ctx, calls, partyWatch, subs } = makeCtx(env);
  const box = fakeNode(env);
  const panel = mountPartyPanel(box, null, 0, ctx);
  await settle();
  assert.match(box.innerHTML, /Juega con amigos/);
  assert.match(box.innerHTML, /data-invite="Ana"/); // amigo sin grupo
  box.querySelector('[data-invite="Ana"]').emit('click'); await settle();
  assert.deepEqual(calls.invite, ['Ana']);
  // llega un grupo por el sondeo
  const state = { party: { size: 4, leader: true, tier_id: 'bronze', members: [{ name: 'yo', me: true, leader: true, ready: false }, { name: 'Ana', ready: true }], invited: [] }, invites: [] };
  partyWatch.state = state;
  for (const fn of [...subs]) fn(state, { msg: '' });
  assert.match(box.innerHTML, /Tu grupo · 2\/4/);
  assert.match(box.innerHTML, /Salir del grupo/);
  assert.match(box.innerHTML, /Buscar partida/);
  box.querySelector('[data-party-ready]').emit('click'); await settle();
  assert.deepEqual(calls.ready, [true]);
  box.querySelector('[data-party-leave]').emit('click'); await settle();
  assert.equal(calls.leave, 1);
  assert.match(box.innerHTML, /Juega con amigos/);
  panel.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(subs.size, 0);
  assert.equal(calls.stop, 1);
});

test('friends: al montar se lee la lista una sola vez y tras aceptar aparece el nuevo amigo con Invitar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.equal(calls.friends, 1);
  const box = () => root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.doesNotMatch(box().innerHTML, /data-invite="Bo"/);
  account.friends = async () => ({ friends: [...FRIENDS().friends, { name: 'Bo', level: 1, frame: null, avatar: null }], incoming: [], outgoing: [] });
  box().querySelector('[data-accept="Bo"]').emit('click');
  await settle();
  assert.match(box().innerHTML, /data-invite="Bo"/);
});

test('friends: una lectura vieja tardía no pisa a la nueva', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  const pending = [];
  account.friends = () => new Promise((r) => pending.push(r));
  const mk = (name) => ({ friends: [{ name, level: 1, frame: null, avatar: null }], incoming: [], outgoing: [] });
  submit(root, 'Aaa'); await settle();
  submit(root, 'Bbb'); await settle();
  assert.equal(pending.length, 2);
  pending[1](mk('Nuevo')); await settle();
  pending[0](mk('Viejo')); await settle();
  const box = root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.match(box.innerHTML, /Nuevo/);
  assert.doesNotMatch(box.innerHTML, /Viejo/);
});

test('partyPanel: sin amigos, en Amigos remite al formulario de arriba y en Mesas a la cuenta', async () => {
  for (const [tierList, re, goes] of [[null, /Añade amigos arriba para invitarlos a tu grupo\./, false], [{ querySelectorAll: () => [] }, /Añádelos en tu cuenta\./, true]]) {
    const env = fakeEnv();
    const { ctx } = makeCtx(env);
    const box = fakeNode(env);
    const panel = mountPartyPanel(box, tierList, 0, ctx, { friends: [] });
    assert.match(box.innerHTML, re);
    assert.equal(box.innerHTML.includes('data-go="account"'), goes);
    panel.destroy();
  }
});

test('amigos: invitaciones de grupo con Aceptar (borde verde) y Rechazar (borde rojo); responder usa el grupo', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, partyWatch } = makeCtx(env);
  const answers = [];
  // responder quita esa invitación y deja las demás pendientes, como el servidor
  ctx.backend.parties.respond = async (id, ok) => {
    answers.push([id, ok]);
    return { party: null, invites: partyWatch.state.invites.filter((i) => i.party !== id) };
  };
  partyWatch.state = { party: null, invites: [{ from: 'Dan', party: 'p1' }, { from: 'Eva', party: 'p2' }] };
  await mount(root, ctx, {}); await settle();
  const box = root.querySelector('[data-friends-body]').querySelector('[data-friends-box]');
  assert.match(box.innerHTML, /Invitaciones a grupo/);
  assert.match(box.innerHTML, /class="chip-btn btn-accept" data-join="p1"><svg[^>]*><\/svg>Aceptar<\/button>/);
  assert.match(box.innerHTML, /class="chip-btn btn-decline" data-no="p1"><svg[^>]*><\/svg>Rechazar<\/button>/);
  assert.doesNotMatch(box.innerHTML, /Unirme/);
  box.querySelector('[data-join="p1"]').emit('click'); await settle();
  box.querySelector('[data-no="p2"]').emit('click'); await settle();
  assert.deepEqual(answers, [['p1', true], ['p2', false]]);
});

test('mesas: solo invita y forma grupo con los amigos conectados', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  const box = fakeNode(env);
  const friends = [
    { name: 'Ana', level: 3, frame: null, avatar: null, online: true },
    { name: 'Bo', level: 1, frame: null, avatar: null, online: false },
  ];
  const panel = mountPartyPanel(box, fakeNode(env), 0, ctx, { friends });
  await settle();
  assert.match(box.innerHTML, /data-invite="Ana"/);
  assert.doesNotMatch(box.innerHTML, /data-invite="Bo"/);
  panel.destroy();
});

test('mesas: si ningún amigo está conectado lo dice y no ofrece invitar', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  const box = fakeNode(env);
  const friends = [{ name: 'Bo', level: 1, frame: null, avatar: null, online: false }];
  const panel = mountPartyPanel(box, fakeNode(env), 0, ctx, { friends });
  await settle();
  assert.match(box.innerHTML, /data-no-online="1"/);
  assert.match(box.innerHTML, /Ninguno de tus amigos está conectado ahora/);
  assert.doesNotMatch(box.innerHTML, /data-invite/);
  panel.destroy();
});
