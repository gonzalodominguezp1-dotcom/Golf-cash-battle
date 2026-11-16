import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount, __setLastTab } from '../src/screens/ranking.js';
import { t } from '../src/screens/texts/index.js';
import '../src/screens/texts/hub.js';

// Nodo falso: reconoce [data-x] y [data-x="v"] sobre su HTML (o el del padre si aún no pintó nada); las cajas son nodos hijos.
const BOXES = new Set(['data-ranking-list', 'data-ranking-me', 'data-ranking-period']);
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
    textContent: '',
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
const DAY = 86400000;
const RANK = (over = {}) => ({
  from: Date.UTC(2026, 10, 9), to: Date.UTC(2026, 10, 9) + 7 * DAY,
  top: [
    { pos: 1, name: 'Ana', level: 7, frame: null, wins: 5, me: false },
    { pos: 2, name: 'Yo', level: 3, frame: null, wins: 2, me: true },
    { pos: 4, name: 'Dan', level: 1, frame: null, wins: 1, me: false },
  ],
  me: null,
  ...over,
});

function makeCtx(env, over = {}, ranking = async () => RANK()) {
  __setLastTab(); // el estado de módulo (pestaña recordada) se reinicia para que los tests no se contaminen
  const calls = { back: 0, tabs: [], icons: [] };
  const account = { profile: {}, ranking: async (tab) => { calls.tabs.push(tab); return ranking(tab); } };
  const ctx = {
    router: { push() {}, back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    backend: { mode: 'remote', account },
    avatar: { get: () => null },
    icon: (n, o) => { calls.icons.push([n, o]); return `<svg data-icon="${n}"${o?.label ? ` aria-label="${o.label}"` : ''}></svg>`; },
    ...over,
  };
  return { ctx, calls, account };
}

const list = (root) => root.querySelector('[data-ranking-list]');
const tab = (root, id) => root.querySelector(`[data-ranking-tab="${id}"]`);

test('ranking: lista con medallas con texto alternativo, tu puesto destacado y cabecera con Volver', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.match(root.innerHTML, /Ranking/);
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/); // sin volver en cabecera: lo hace el lobby
  assert.match(root.innerHTML, /data-lobby/);
  assert.deepEqual(calls.tabs, ['weekly']);
  const html = list(root).innerHTML;
  assert.match(html, /<ol class="rank-list"/);
  assert.match(html, /Ana/);
  assert.match(html, /Nv\. 7/);
  assert.match(html, /rank-row me/); // tu puesto destacado
  assert.match(html, /aria-current="true"/);
  assert.match(html, /5<\/b><small>victorias/);
  assert.match(html, /2<\/b><small>victorias/);
  assert.match(html, /1<\/b><small>victoria</);
  const medals = calls.icons.filter(([n]) => n === 'medal');
  assert.deepEqual(medals.map(([, o]) => [o.tone, o.label]), [['gold', 'Puesto 1'], ['silver', 'Puesto 2']]);
  assert.match(html, /rank-pos">4</);
  assert.match(root.querySelector('[data-ranking-period]').textContent, /–/);
});

test('ranking: tu posición fuera del top y sin victorias', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, {}, async () => RANK({ top: [{ pos: 1, name: 'Ana', level: 7, frame: null, wins: 5, me: false }], me: { pos: 12, wins: 1 } }));
  await mount(root, ctx, {}); await settle();
  assert.match(root.querySelector('[data-ranking-me]').innerHTML, /Tu posición: <b>#12<\/b> · 1 victoria\b/);
  const { ctx: c2 } = makeCtx(env, {}, async () => RANK({ top: [{ pos: 1, name: 'Ana', level: 7, frame: null, wins: 5, me: false }], me: null }));
  const root2 = fakeNode(env);
  await mount(root2, c2, {}); await settle();
  assert.match(root2.querySelector('[data-ranking-me]').innerHTML, /Aún no tienes victorias en este periodo\. Gana una mesa online para entrar\./);
});

test('ranking: cambiar de periodo pide otra lectura; histórico dice «Desde el principio»', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  tab(root, 'historic').emit('click'); await settle();
  assert.deepEqual(calls.tabs, ['weekly', 'historic']);
  assert.equal(root.querySelector('[data-ranking-period]').textContent, 'Desde el principio');
  tab(root, 'monthly').emit('click'); await settle();
  assert.deepEqual(calls.tabs, ['weekly', 'historic', 'monthly']);
});

test('ranking: vacío', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, {}, async () => RANK({ top: [] }));
  await mount(root, ctx, {}); await settle();
  assert.match(list(root).innerHTML, /Aún no hay victorias en este periodo\. ¡Sé el primero!/);
});

test('ranking: sin conexión muestra el mensaje real del hub y no falla', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, { backend: { mode: 'local' } });
  const handle = await mount(root, ctx, {}); await settle();
  assert.match(root.innerHTML, /El ranking de victorias necesita conexión con el servidor\./);
  assert.equal(t('ranking.offline'), t('hub.lock.rankingOffline'));
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/);
  handle.destroy();
  const { ctx: c2 } = makeCtx(env, { backend: null });
  await mount(fakeNode(env), c2, {}); // sin backend tampoco falla
});

test('ranking: error con Reintentar que vuelve a leer', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  let fail = true;
  const { ctx, calls } = makeCtx(env, {}, async () => { if (fail) throw new Error('x'); return RANK(); });
  await mount(root, ctx, {}); await settle();
  assert.match(list(root).innerHTML, /No se ha podido cargar el ranking\. Prueba otra vez\./);
  assert.match(list(root).innerHTML, /Reintentar/);
  fail = false;
  list(root).querySelector('[data-retry]').emit('click'); await settle();
  assert.deepEqual(calls.tabs, ['weekly', 'weekly']);
  assert.match(list(root).innerHTML, /Ana/);
});

test('ranking: mount no espera a la red y pinta «Cargando»; a los 8 s da error con Reintentar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, {}, () => new Promise(() => {}));
  const handle = await Promise.race([mount(root, ctx, {}), new Promise((r) => setTimeout(() => r('colgado'), 200))]);
  assert.notEqual(handle, 'colgado');
  assert.equal(typeof handle.destroy, 'function');
  assert.match(list(root).innerHTML, /Cargando/);
  env.timers.advance(7999); await settle();
  assert.match(list(root).innerHTML, /Cargando/);
  env.timers.advance(1); await settle();
  assert.match(list(root).innerHTML, /Reintentar/);
  handle.destroy();
});

test('ranking: una respuesta vieja no pisa a la nueva', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const pend = {};
  const { ctx } = makeCtx(env, {}, (tabId) => new Promise((res) => { pend[tabId] = res; }));
  await mount(root, ctx, {}); await settle();
  tab(root, 'monthly').emit('click'); await settle();
  pend.monthly(RANK({ top: [{ pos: 1, name: 'Nueva', level: 1, frame: null, wins: 9, me: false }] })); await settle();
  pend.weekly(RANK({ top: [{ pos: 1, name: 'Vieja', level: 1, frame: null, wins: 1, me: false }] })); await settle();
  assert.match(list(root).innerHTML, /Nueva/);
  assert.doesNotMatch(list(root).innerHTML, /Vieja/);
});

test('ranking: destroy durante la carga no pinta después', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  let release;
  const { ctx } = makeCtx(env, {}, () => new Promise((res) => { release = res; }));
  const handle = await mount(root, ctx, {}); await settle();
  handle.destroy();
  release(RANK()); await settle();
  assert.doesNotMatch(list(root).innerHTML, /Ana/);
});

test('ranking: destroy deja el scope a {0,0,0}', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, {}, () => new Promise(() => {}));
  const handle = await mount(root, ctx, {});
  const before = ctx.scope.live();
  assert.ok(before.listeners > 0 && before.timers > 0, `había algo vivo: ${JSON.stringify(before)}`);
  handle.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  ctx.scope.dispose();
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('ranking: 20 montajes y destroy sin fugas', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const root = fakeNode(env);
    const handle = await mount(root, ctx, {}); await settle();
    if (i === 0) assert.ok(ctx.scope.live().listeners > 0, 'el bucle no pasa en vacío: hay listeners vivos');
    tab(root, 'monthly').emit('click');
    handle.destroy();
    await settle();
  }
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  ctx.scope.dispose();
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('ranking: la pestaña elegida se recuerda al remontar; un valor desconocido cae en Semanal', async () => {
  const env = fakeEnv();
  const { ctx, calls } = makeCtx(env);
  const root = fakeNode(env);
  const h1 = await mount(root, ctx, {}); await settle();
  tab(root, 'historic').emit('click'); await settle();
  h1.destroy();
  const root2 = fakeNode(env);
  const h2 = await mount(root2, ctx, {}); await settle();
  assert.deepEqual(calls.tabs, ['weekly', 'historic', 'historic']);
  assert.equal(root2.querySelector('[data-ranking-tab="historic"]').classList.contains('on'), true);
  assert.equal(root2.querySelector('[data-ranking-period]').textContent, 'Desde el principio');
  h2.destroy();
  __setLastTab('raro');
  const root3 = fakeNode(env);
  await mount(root3, ctx, {}); await settle();
  assert.equal(calls.tabs.at(-1), 'weekly');
});

test('ranking: al cambiar de pestaña el periodo anterior se borra durante «Cargando»', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  let hold = false;
  const { ctx } = makeCtx(env, {}, () => (hold ? new Promise(() => {}) : Promise.resolve(RANK())));
  await mount(root, ctx, {}); await settle();
  assert.match(root.querySelector('[data-ranking-period]').textContent, /–/);
  hold = true;
  tab(root, 'monthly').emit('click'); await settle();
  assert.equal(root.querySelector('[data-ranking-period]').textContent, '');
});
