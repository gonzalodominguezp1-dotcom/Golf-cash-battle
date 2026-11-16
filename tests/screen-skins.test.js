import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createRoutes } from '../src/screens/routes.js';
import { mount, __resetFilter } from '../src/screens/skins.js';
import { createThumbs } from '../src/screens/skinThumbsHook.js';
import { SKINS, TIERS, skinById } from '../src/progress/skins.js';

// Nodo falso: reconoce [data-x] y [data-x="v"] sobre su HTML (o el del padre si aún no pintó); la lista es un nodo hijo.
const BOXES = new Set(['data-sk-list']);
function fakeNode(env, parent = null) {
  const n = env.el('div');
  const stubs = new Map(), kids = new Map();
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const stub = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!stubs.has(k)) { const e = env.el('button'); e.dataset = { [camel(attr)]: val }; stubs.set(k, e); }
    return stubs.get(k);
  };
  n.isConnected = true;
  n.hay = () => n.innerHTML || parent?.hay() || '';
  n.querySelectorAll = (sel) => {
    const attr = sel.match(/^\[(data-[\w-]+)\]$/)?.[1];
    if (!attr) return [];
    return [...n.hay().matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => stub(attr, m[1]));
  };
  n.querySelector = (sel) => {
    const m = sel.match(/^\[(data-[\w-]+)(?:="([^"]+)")?\]$/);
    if (!m) return null;
    const has = m[2] === undefined ? n.hay().includes(m[1]) : n.hay().includes(`${m[1]}="${m[2]}"`);
    if (!has) return null;
    if (BOXES.has(m[1])) { if (!kids.has(m[1])) kids.set(m[1], fakeNode(env, n)); return kids.get(m[1]); }
    return stub(m[1], m[2] ?? '');
  };
  return n;
}

const settle = () => new Promise((r) => setImmediate(r));
const OPEN0 = ['classic', 'mint', 'sunset'];

function makeProgress(open = OPEN0) {
  const st = { open: new Set(open), equipped: 'classic' };
  return {
    st,
    level: { level: 3, into: 10, need: 100 },
    isUnlocked: (s) => st.open.has(s.id),
    instance: (id) => (st.open.has(id) ? { seed: 7 } : null),
    get skin() { return skinById(st.equipped); },
    equip(id) { if (!st.open.has(id)) return false; st.equipped = id; return true; },
  };
}

function nullThumbs() {
  const th = { warmCalls: 0, bound: 0, released: 0, items: [], warm: () => { th.warmCalls++; return Promise.resolve(); } };
  th.cached = () => null;
  th.preview = (skin) => `data:preview/${skin.id}`;
  th.bind = (items) => { th.bound++; th.items = items; let done = false; return { release() { if (!done) { done = true; th.released++; } } }; };
  return th;
}

function makeCtx(env, over = {}) {
  __resetFilter();
  const calls = { back: 0, push: [] };
  const thumbs = nullThumbs();
  const progress = makeProgress();
  const ctx = {
    router: { push: (...a) => calls.push.push(a), back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    progress, thumbs,
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    ...over,
  };
  return { ctx, calls, thumbs, progress };
}

const list = (root) => root.querySelector('[data-sk-list]');
const idsIn = (html) => [...html.matchAll(/data-skin-id="([^"]+)"/g)].map((m) => m[1]);
const clickCard = (root, id) => list(root).emit('click', { target: { closest: (s) => (s === '[data-skin-id]' ? { dataset: { skinId: id }, focus() {} } : null) } });
const tierBtn = (root, id) => root.querySelector(`[data-tier="${id}"]`);
const orderOf = (progress) => [...SKINS].sort((a, b) => progress.isUnlocked(b) - progress.isUnlocked(a) || (TIERS[b.tier]?.order ?? 0) - (TIERS[a.tier]?.order ?? 0) || a.name.localeCompare(b.name, 'es')).map((s) => s.id);

test('skins: lista con todas las skins con las desbloqueadas primero y estado en texto (Equipada/Obtenida/Bloqueada)', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, progress } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  const html = list(root).innerHTML;
  assert.match(html, /<ul class="sk-grid"/);
  assert.equal((html.match(/<li/g) ?? []).length, SKINS.length);
  assert.deepEqual(idsIn(html), orderOf(progress));
  const cardOf = (id) => html.split('<li').find((c) => c.includes(`data-skin-id="${id}"`));
  assert.match(cardOf('classic'), /sk-card[^"]* equipped/);
  assert.match(cardOf('classic'), /sk-state">Equipada</);
  assert.match(cardOf('mint'), /sk-state">Obtenida</);
  assert.doesNotMatch(cardOf('mint'), / equipped/);
  const locked = SKINS.find((s) => !OPEN0.includes(s.id));
  assert.match(cardOf(locked.id), /sk-state">Bloqueada</);
  assert.match(cardOf(locked.id), / locked/);
  assert.match(cardOf(locked.id), /data-icon="lock"/);
  assert.match(root.innerHTML, /3\/37 desbloqueadas|3\/\d+ desbloqueadas/);
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/); // sin volver en cabecera: lo hace el lobby
  assert.match(root.innerHTML, /data-lobby/);
});

test('skins: filtros por rareza, solo desbloqueadas y colección; vacío con mensaje', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  tierBtn(root, 'rare').emit('click');
  const rare = idsIn(list(root).innerHTML);
  assert.deepEqual(rare, SKINS.filter((s) => s.tier === 'rare').map((s) => s.id).sort((a, b) => rare.indexOf(a) - rare.indexOf(b)));
  assert.ok(rare.length > 0 && rare.every((id) => skinById(id).tier === 'rare'));
  assert.equal(tierBtn(root, 'rare').classList.contains('on'), true);
  tierBtn(root, 'all').emit('click');
  assert.equal(idsIn(list(root).innerHTML).length, SKINS.length);
  root.querySelector('[data-sk-owned="1"]').emit('click');
  assert.deepEqual(idsIn(list(root).innerHTML).sort(), [...OPEN0].sort());
  tierBtn(root, 'mythic').emit('click'); // sin ninguna desbloqueada de esa rareza
  assert.equal(list(root).dataset.state, 'empty');
  assert.match(list(root).innerHTML, /Ninguna skin cumple estos filtros\./);
  tierBtn(root, 'all').emit('click');
  root.querySelector('[data-sk-owned="1"]').emit('click'); // se apaga
  root.querySelector('[data-sk-coll="1"]').emit('change', { target: { value: 'prestigio' } });
  const coll = idsIn(list(root).innerHTML);
  assert.ok(coll.length > 0 && coll.every((id) => skinById(id).collection === 'prestigio'));
});

test('skins: pulsar una skin apila el inspector con router.push(skin, { id }) y la tarjeta lleva su clave de foco', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.match(list(root).innerHTML, /data-skin-id="mint" data-focus-key="skin-mint"/);
  clickCard(root, 'mint');
  assert.deepEqual(calls.push, [['skin', { id: 'mint' }]]);
});

test('skins: la pantalla solo tiene skins: sin tarjeta de nivel, XP ni bloque de logros; conserva el contador', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.doesNotMatch(root.innerHTML, /level-card|level-progress|XP|Nivel|sk-logros|Ver logros|data-go=/);
  assert.match(root.innerHTML, /<p class="sub">3\/\d+ desbloqueadas/);
});

test('skins: las desbloqueadas van primero aunque tengan menos rareza; dentro de cada grupo, rareza desc y nombre', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, progress } = makeCtx(env);
  const byRank = [...SKINS].sort((a, b) => (TIERS[b.tier]?.order ?? 0) - (TIERS[a.tier]?.order ?? 0));
  const high = byRank[0], low = byRank.at(-1);
  assert.ok((TIERS[high.tier].order) > (TIERS[low.tier].order));
  progress.st.open = new Set([low.id, 'classic']);
  await mount(root, ctx, {}); await settle();
  const ids = idsIn(list(root).innerHTML);
  assert.ok(ids.indexOf(low.id) < ids.indexOf(high.id), 'la desbloqueada de rareza baja antes que la bloqueada de rareza alta');
  const open = ids.filter((id) => progress.isUnlocked(skinById(id)));
  assert.deepEqual(ids.slice(0, open.length), open, 'todas las desbloqueadas forman el bloque inicial');
  for (const grp of [open, ids.slice(open.length)]) {
    const exp = [...grp].sort((a, b) => (TIERS[skinById(b).tier]?.order ?? 0) - (TIERS[skinById(a).tier]?.order ?? 0) || skinById(a).name.localeCompare(skinById(b).name, 'es'));
    assert.deepEqual(grp, exp);
  }
  root.querySelector('[data-sk-owned="1"]').emit('click'); // «Solo desbloqueadas» sigue igual
  assert.deepEqual(idsIn(list(root).innerHTML).sort(), [low.id, 'classic'].sort());
});

test('skins: sin botón Volver en la cabecera', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {});
  assert.doesNotMatch(root.innerHTML, /data-back|scr-back/);
});

test('skins: una caché que no responde nunca → la rejilla se pinta igualmente sin caché y mount no espera', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs } = makeCtx(env);
  thumbs.warm = () => new Promise(() => {});
  const handle = await Promise.race([mount(root, ctx, {}), new Promise((r) => setTimeout(() => r('colgado'), 200))]);
  assert.notEqual(handle, 'colgado');
  assert.equal(typeof handle.destroy, 'function');
  await settle();
  assert.match(list(root).innerHTML, /<ul class="sk-grid"/);
  assert.match(list(root).innerHTML, /data:preview\/classic/); // marcador 2D, sin caché
  env.timers.advance(60000); await settle();
  assert.match(list(root).innerHTML, /<ul class="sk-grid"/);
  assert.doesNotMatch(list(root).innerHTML, /Reintentar/);
  handle.destroy();
});

test('skins: cuando la caché responde tarde, las miniaturas se mejoran sin repintar la lista', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs } = makeCtx(env);
  let release;
  const url = new Map();
  thumbs.warm = () => new Promise((res) => { release = res; });
  thumbs.cached = (skin) => url.get(skin.id) ?? null;
  const handle = await mount(root, ctx, {}); await settle();
  const html = list(root).innerHTML;
  const binds = thumbs.bound;
  url.set('mint', 'blob:mint');
  release(); await settle();
  assert.equal(list(root).innerHTML, html); // misma lista
  assert.equal(thumbs.bound, binds); // sin volver a vincular
  assert.equal(thumbs.items.find((i) => i.skin.id === 'mint').img.src, 'blob:mint');
  assert.equal(thumbs.items.find((i) => i.skin.id === 'classic').img.src, undefined);
  handle.destroy();
});

test('skins: si la caché falla, la rejilla sigue; si falla el progreso, error con Reintentar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs, progress } = makeCtx(env);
  thumbs.warm = () => Promise.reject(new Error('idb'));
  const handle = await mount(root, ctx, {}); await settle();
  assert.match(list(root).innerHTML, /<ul class="sk-grid"/);
  handle.destroy();
  let root2 = fakeNode(env);
  const { ctx: c2, progress: p2 } = makeCtx(env);
  const real = p2.instance;
  p2.instance = () => { throw new Error('x'); };
  const h2 = await mount(root2, c2, {}); await settle();
  assert.match(list(root2).innerHTML, /No se han podido cargar las skins/);
  assert.match(list(root2).innerHTML, /Reintentar/);
  p2.instance = real;
  list(root2).querySelector('[data-retry]').emit('click');
  assert.match(list(root2).innerHTML, /<ul class="sk-grid"/);
  h2.destroy();
  void progress;
});

test('skins: destroy antes de que llegue la caché no toca las imágenes', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs } = makeCtx(env);
  let release;
  thumbs.warm = () => new Promise((res) => { release = res; });
  thumbs.cached = () => 'blob:x';
  const handle = await mount(root, ctx, {}); await settle();
  const imgs = thumbs.items.map((i) => i.img);
  handle.destroy();
  release(); await settle();
  assert.ok(imgs.length > 0 && imgs.every((i) => i.src === undefined));
});

test('skins: destroy deja el scope a {0,0,0} (medido antes de scope.dispose) y libera miniaturas', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs } = makeCtx(env);
  const handle = await mount(root, ctx, {}); await settle();
  const before = ctx.scope.live();
  assert.ok(before.listeners > 0, `había algo vivo: ${JSON.stringify(before)}`);
  assert.equal(thumbs.bound, 1);
  assert.equal(thumbs.released, 0);
  handle.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(thumbs.released, thumbs.bound);
  ctx.scope.dispose();
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('skins: 20 montajes y destroy sin fugas y sin miniaturas sin liberar', async () => {
  const env = fakeEnv();
  const { ctx, thumbs } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const root = fakeNode(env);
    const handle = await mount(root, ctx, {}); await settle();
    if (i === 0) assert.ok(ctx.scope.live().listeners > 0, 'el bucle no pasa en vacío');
    tierBtn(root, 'epic').emit('click'); // cada filtro vuelve a pintar: la vinculación anterior se libera
    handle.destroy();
  }
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(thumbs.released, thumbs.bound);
  assert.ok(thumbs.bound >= 40);
  ctx.scope.dispose();
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('skins: solo vincula miniaturas de las desbloqueadas, la equipada primero', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, thumbs } = makeCtx(env);
  await mount(root, ctx, {}); await settle();
  assert.deepEqual(thumbs.items.map((i) => i.skin.id).sort(), [...OPEN0].sort());
  assert.equal(thumbs.items.find((i) => i.skin.id === 'classic').priority, true);
  assert.equal(thumbs.items.find((i) => i.skin.id === 'mint').priority, false);
});

test('hook de miniaturas: el observador se libera y no mejora imágenes después', () => {
  const upgrades = [];
  const observers = [];
  class IO {
    constructor(cb) { this.cb = cb; this.watched = new Set(); this.disconnected = false; observers.push(this); }
    observe(el) { this.watched.add(el); }
    unobserve(el) { this.watched.delete(el); }
    disconnect() { this.disconnected = true; this.watched.clear(); }
  }
  const th = createThumbs({ upgrade: (...a) => upgrades.push(a), cached: () => null, preview: () => 'x', warm: () => Promise.resolve(), observe: IO });
  const a = { id: 'a' }, b = { id: 'b' };
  const bind = th.bind([{ img: a, skin: { id: 'a' }, inst: {}, priority: true }, { img: b, skin: { id: 'b' }, inst: {}, priority: false }]);
  assert.equal(observers[0].watched.size, 2);
  observers[0].cb([{ isIntersecting: true, target: a }]);
  assert.equal(upgrades.length, 1);
  bind.release();
  assert.equal(observers[0].disconnected, true);
  observers[0].cb([{ isIntersecting: true, target: b }]); // llega tarde
  assert.equal(upgrades.length, 1);
  // sin IntersectionObserver: mejora al momento
  const th2 = createThumbs({ upgrade: (...a2) => upgrades.push(a2), cached: () => null, preview: () => 'x', warm: () => Promise.resolve(), observe: null });
  th2.bind([{ img: a, skin: { id: 'a' }, inst: {}, priority: false }]).release();
  assert.equal(upgrades.length, 2);
});

test('skins: sin la palabra vieja de los logros en los archivos nuevos; CSS sin :hover', () => {
  const old = new RegExp(['de', 'saf'].join(''), 'i');
  for (const f of ['skins.js', 'skins.css', 'texts/skins.js', 'skinThumbsHook.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/screens/${f}`, import.meta.url), 'utf8'), old, f);
  }
  assert.doesNotMatch(readFileSync(new URL('../src/screens/skins.css', import.meta.url), 'utf8'), /:hover/);
});

test('skins: routes resuelve la ruta skins a esta pantalla y no al adaptador heredado', async () => {
  const modules = { './skins.js': () => import('../src/screens/skins.js') };
  const route = createRoutes({ modules }).find((r) => r.id === 'skins');
  const mod = await route.load();
  assert.equal(mod.mount, mount);
  assert.notEqual(mod.manages, true);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /async function showSkins/);
  assert.match(main, /import '\.\/screens\/skins\.css'/);
});

test('skins: el filtro y el scroll sobreviven a abrir el inspector y volver; un valor desconocido cae al defecto', async () => {
  const env = fakeEnv();
  const scrolls = [];
  env.win.scrollY = 480;
  env.win.scrollTo = (x, y) => scrolls.push(y);
  const { ctx, calls } = makeCtx(env);
  const root = fakeNode(env);
  const h = await mount(root, ctx, {}); await settle();
  tierBtn(root, 'rare').emit('click');
  clickCard(root, idsIn(list(root).innerHTML)[0]);
  assert.equal(calls.push.length, 1);
  h.destroy(); // el host destruye Skins al apilar el inspector
  assert.deepEqual(scrolls, []);
  let root2 = fakeNode(env);
  const h2 = await mount(root2, ctx, {}); await settle(); // vuelta
  const ids = idsIn(list(root2).innerHTML);
  assert.ok(ids.length > 0 && ids.every((id) => skinById(id).tier === 'rare'));
  assert.match(root2.innerHTML, /class="sk-fchip rarity-rare on" data-tier="rare" aria-pressed="true"/);
  assert.match(root2.innerHTML, /data-tier="all" aria-pressed="false"/);
  assert.deepEqual(scrolls, [480]);
  h2.destroy();
  const h3 = await mount(fakeNode(env), ctx, {}); // visita nueva: sin scroll pendiente
  assert.deepEqual(scrolls, [480]);
  h3.destroy();
  __resetFilter();
  root2 = fakeNode(env);
  const h4 = await mount(root2, ctx, {}); await settle();
  assert.equal(idsIn(list(root2).innerHTML).length, SKINS.length);
  h4.destroy();
});

test('skins: una colección o rareza guardadas que ya no existen caen a Todas', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  const root = fakeNode(env);
  const h = await mount(root, ctx, {}); await settle();
  root.querySelector('[data-sk-coll="1"]').emit('change', { target: { value: 'inventada' } });
  tierBtn(root, 'rare').emit('click');
  h.destroy();
  let root2 = fakeNode(env);
  const h2 = await mount(root2, ctx, {}); await settle();
  assert.match(root2.innerHTML, /<option value="all">/);
  assert.doesNotMatch(root2.innerHTML, /selected/);
  h2.destroy();
});
