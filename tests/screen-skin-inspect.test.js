import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createRoutes } from '../src/screens/routes.js';
import { createRouter, parseHash, formatHash } from '../src/screens/router.js';
import { mount } from '../src/screens/skinInspect.js';
import { SKINS, skinById } from '../src/progress/skins.js';

const settle = () => new Promise((r) => setImmediate(r));
const OPEN0 = ['classic', 'mint'];
const LOCKED = SKINS.find((s) => !OPEN0.includes(s.id) && s.unlock?.level);
const LOGRO = SKINS.find((s) => s.unlock?.challenge);

// Raíz falsa: querySelector devuelve un nodo estable por selector; el html pintado queda en root.innerHTML.
function fakeRoot(env) {
  const root = env.el('div');
  const nodes = new Map();
  root.querySelector = (sel) => {
    if (sel === '.sk-stage') return null;
    if (!nodes.has(sel)) { const n = env.el('div'); n.hidden = false; n.disabled = false; n.focused = 0; n.focus = () => { n.focused++; }; n.style = {}; nodes.set(sel, n); }
    return nodes.get(sel);
  };
  root.nodes = nodes;
  return root;
}

function makeProgress(open = OPEN0) {
  const st = { open: new Set(open), equipped: 'classic' };
  return {
    st,
    isUnlocked: (s) => st.open.has(s.id),
    requirement: (s) => (st.open.has(s.id) ? { text: s.unlock ? 'cumplido' : 'De serie', ratio: 1 } : { text: s.unlock?.challenge ? 'Reto X' : `Nivel ${s.unlock?.level}`, ratio: 0.4 }),
    instance: (id) => (st.open.has(id) ? { seed: 7 } : null),
    get skin() { return skinById(st.equipped); },
    equip(id) { if (!st.open.has(id)) return false; st.equipped = id; return true; },
  };
}

function fakeViewer(over = {}) {
  const v = { created: [], destroyed: 0, webgl: true, ...over };
  v.load = () => Promise.resolve((container, opts) => {
    v.created.push({ container, opts });
    return { destroy() { v.destroyed++; }, stats: () => ({ webgl: v.webgl }) };
  });
  return v;
}

function makeCtx(env, over = {}) {
  const calls = { back: 0, push: [], replace: [], notify: [] };
  const viewer = fakeViewer();
  const ctx = {
    router: { push: (...a) => calls.push.push(a), replace: (...a) => calls.replace.push(a), back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    progress: makeProgress(),
    thumbs: { cached: () => null, preview: (s) => `data:preview/${s.id}` },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    notify: (n) => calls.notify.push(n),
    loadViewer: viewer.load,
    ...over,
  };
  return { ctx, calls, viewer };
}

const text = (root, sel) => root.querySelector(sel).textContent;

test('skin-inspect: Equipada / Obtenida / Bloqueada con texto y botón acorde', async () => {
  const env = fakeEnv();
  for (const [id, state, label, disabled] of [['classic', 'Equipada', 'Equipada', true], ['mint', 'Obtenida', 'Equipar', false], [LOCKED.id, 'Bloqueada', 'Bloqueada', true]]) {
    const root = fakeRoot(env);
    const { ctx } = makeCtx(env);
    const h = await mount(root, ctx, { id });
    assert.equal(text(root, '[data-sk-state]'), state, id);
    assert.equal(root.querySelector('[data-sk-equip]').innerHTML.includes(label), true, id);
    assert.equal(root.querySelector('[data-sk-equip]').disabled, disabled, id);
    assert.equal(root.querySelector('[data-sk-lock]').hidden, id !== LOCKED.id);
    assert.match(root.innerHTML, /data-back/);
    h.destroy();
  }
});

test('skin-inspect: cómo conseguirla (requisito o logro, nunca la palabra vieja) y barra de progreso', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  const h = await mount(root, ctx, { id: LOCKED.id });
  assert.equal(text(root, '[data-sk-how]'), `Requisito: Nivel ${LOCKED.unlock.level}`);
  assert.equal(root.querySelector('[data-sk-bar]').style.width, '40%');
  assert.doesNotMatch(root.innerHTML, /data-go="achievements"/);
  h.destroy();
  const root2 = fakeRoot(env);
  const h2 = await mount(root2, ctx, { id: LOGRO.id });
  assert.equal(text(root2, '[data-sk-how]'), 'Se consigue con un logro: Reto X');
  assert.match(root2.innerHTML, /data-go="achievements"/);
  root2.querySelector('[data-go="achievements"]').emit('click');
  assert.deepEqual(calls.push, [['achievements']]);
  h2.destroy();
  assert.doesNotMatch(root2.innerHTML + text(root2, '[data-sk-how]'), new RegExp(['de', 'saf'].join(''), 'i'));
});

test('skin-inspect: mount no espera al visor, pinta Cargando y el marcador 2D, y el visor se crea al llegar three', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let release;
  const { ctx, viewer } = makeCtx(env, { loadViewer: () => new Promise((res) => { release = res; }) });
  const h = await Promise.race([mount(root, ctx, { id: 'mint' }), new Promise((r) => setTimeout(() => r('colgado'), 200))]);
  assert.notEqual(h, 'colgado');
  assert.match(root.innerHTML, /Cargando/);
  assert.match(root.innerHTML, /<img class="sk-view-poster" src="data:preview\/mint"/);
  assert.equal(viewer.created.length, 0);
  release(viewer.load.call(null).then((f) => f));
  await settle(); await settle();
  assert.equal(viewer.created.length, 1);
  const { opts, container } = viewer.created[0];
  assert.equal(opts.skin.id, 'mint');
  assert.equal(opts.mode, 'fullscreen');
  assert.deepEqual(opts.instance, { seed: 7 });
  assert.equal(container, root.querySelector('[data-sk-canvas]'));
  assert.equal(root.querySelector('[data-sk-loading]').hidden, true);
  h.destroy();
  assert.equal(viewer.destroyed, 1);
});

test('skin-inspect: Equipar usa progress.equip, repinta el estado y avisa', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  const h = await mount(root, ctx, { id: 'mint' });
  root.querySelector('[data-sk-equip]').emit('click');
  assert.equal(ctx.progress.st.equipped, 'mint');
  assert.equal(text(root, '[data-sk-state]'), 'Equipada');
  assert.equal(root.querySelector('[data-sk-equip]').disabled, true);
  assert.match(text(root, '[data-sk-live]'), /Skin equipada/);
  h.destroy();
});

test('skin-inspect: bloqueada no se puede equipar aunque se fuerce el clic', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  const h = await mount(root, ctx, { id: LOCKED.id });
  root.querySelector('[data-sk-equip]').emit('click');
  assert.equal(ctx.progress.st.equipped, 'classic');
  h.destroy();
});

test('skin-inspect: id desconocido o ausente no rompe: aviso y vuelta a Skins', async () => {
  const env = fakeEnv();
  for (const params of [{ id: 'no-existe' }, {}, undefined]) {
    const root = fakeRoot(env);
    const { ctx, calls, viewer } = makeCtx(env);
    const h = await mount(root, ctx, params);
    assert.equal(calls.back, 1);
    assert.equal(calls.notify.length, 1);
    assert.match(calls.notify[0].title, /no existe|no está disponible/);
    assert.equal(viewer.created.length, 0);
    h.destroy();
  }
});

test('skin-inspect: si three o WebGL fallan queda el marcador 2D y lo demás funciona', async () => {
  const env = fakeEnv();
  // 1) la importación de three falla
  let root = fakeRoot(env);
  let { ctx } = makeCtx(env, { loadViewer: () => Promise.reject(new Error('chunk')) });
  let h = await mount(root, ctx, { id: 'mint' });
  await settle();
  assert.match(root.innerHTML, /sk-view-poster/);
  assert.equal(root.querySelector('[data-sk-loading]').hidden, true);
  root.querySelector('[data-sk-equip]').emit('click');
  assert.equal(ctx.progress.st.equipped, 'mint');
  h.destroy();
  // 2) el visor se crea pero no hay WebGL: se libera y vuelve el marcador
  root = fakeRoot(env);
  const viewer = fakeViewer({ webgl: false });
  ({ ctx } = makeCtx(env, { loadViewer: viewer.load }));
  h = await mount(root, ctx, { id: 'mint' });
  await settle();
  assert.equal(viewer.created.length, 1);
  assert.equal(viewer.destroyed, 1);
  assert.match(root.querySelector('[data-sk-canvas]').innerHTML, /sk-view-poster/);
  h.destroy();
  assert.equal(viewer.destroyed, 1); // no se libera dos veces
  // 3) el creador lanza
  root = fakeRoot(env);
  ({ ctx } = makeCtx(env, { loadViewer: () => Promise.resolve(() => { throw new Error('webgl'); }) }));
  h = await mount(root, ctx, { id: 'mint' });
  await settle();
  assert.equal(root.querySelector('[data-sk-loading]').hidden, true);
  h.destroy();
});

test('skin-inspect: destroy libera el visor y deja el scope a {0,0,0} (medido antes de scope.dispose)', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, viewer } = makeCtx(env);
  const h = await mount(root, ctx, { id: 'mint' });
  await settle();
  const before = ctx.scope.live();
  assert.ok(before.listeners > 0, `había algo vivo: ${JSON.stringify(before)}`);
  assert.equal(viewer.created.length, 1);
  assert.equal(viewer.destroyed, 0);
  h.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(viewer.destroyed, 1);
  ctx.scope.dispose();
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('skin-inspect: destroy antes de que llegue three no crea el visor', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let release;
  const { ctx, viewer } = makeCtx(env, { loadViewer: () => new Promise((res) => { release = res; }) });
  const h = await mount(root, ctx, { id: 'mint' });
  h.destroy();
  release((...a) => { viewer.created.push(a); return { destroy() { viewer.destroyed++; } }; });
  await settle(); await settle();
  assert.equal(viewer.created.length, 0);
});

test('skin-inspect: 20 ciclos mount/destroy sin fugas (medido tras destroy y SIN dispose)', async () => {
  const env = fakeEnv();
  const { ctx, viewer } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const root = fakeRoot(env);
    const h = await mount(root, ctx, { id: i % 2 ? 'mint' : LOCKED.id });
    await settle();
    const alive = ctx.scope.live();
    assert.ok(alive.listeners > 0, `el ciclo ${i} no tenía nada vivo: ${JSON.stringify(alive)}`);
    assert.equal(viewer.created.length, i + 1, `el visor ${i} no se creó`);
    h.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 }, `fuga en el ciclo ${i}`);
    assert.equal(env.liveListeners(), 0, `listeners del DOM vivos en el ciclo ${i}`);
    assert.equal(env.liveTimers(), 0, `timers vivos en el ciclo ${i}`);
  }
  assert.equal(viewer.created.length, 20);
  assert.equal(viewer.destroyed, 20);
});

test('skin-inspect: flechas pasan a la skin anterior/siguiente con replace y dan la vuelta', async () => {
  const env = fakeEnv();
  const first = SKINS[0].id, last = SKINS[SKINS.length - 1].id;
  let root = fakeRoot(env);
  let { ctx, calls } = makeCtx(env);
  let h = await mount(root, ctx, { id: first });
  root.querySelector('.sk-view-nav.prev').emit('click');
  assert.deepEqual(calls.replace, [['skin', { id: last }]], 'anterior desde la primera da la vuelta a la última');
  h.destroy();
  root = fakeRoot(env);
  ({ ctx, calls } = makeCtx(env));
  h = await mount(root, ctx, { id: last });
  root.querySelector('.sk-view-nav.next').emit('click');
  assert.deepEqual(calls.replace, [['skin', { id: first }]], 'siguiente desde la última da la vuelta a la primera');
  assert.equal(calls.push.length, 0);
  h.destroy();
});

test('skin-inspect: flechas del teclado cambian de skin mientras la pantalla vive y dejan de escucharse al destruir', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  const mid = SKINS[1].id;
  const h = await mount(root, ctx, { id: mid });
  env.doc.emit('keydown', { key: 'ArrowRight' });
  assert.deepEqual(calls.replace, [['skin', { id: SKINS[2].id }]]);
  // dos flechas seguidas (la pantalla nueva aún no ha montado) = dos skins, no una
  env.doc.emit('keydown', { key: 'ArrowRight' });
  assert.deepEqual(calls.replace.at(-1), ['skin', { id: SKINS[3].id }]);
  env.doc.emit('keydown', { key: 'a' });
  env.doc.emit('keydown', { key: 'ArrowLeft', altKey: true }); // Alt+flecha es atrás del navegador
  env.doc.emit('keydown', { key: 'ArrowRight', repeat: true }); // tecla mantenida no navega
  assert.equal(calls.replace.length, 2);
  h.destroy();
  env.doc.emit('keydown', { key: 'ArrowRight' });
  assert.equal(calls.replace.length, 2, 'tras destroy no responde');
});

test('skin-inspect: título con la categoría del tier, texto de flechas por t() y animación de categoría anulada con reduced-motion', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  const h = await mount(root, ctx, { id: 'mint' });
  assert.match(root.innerHTML, /sk-view-title/);
  assert.match(root.innerHTML, /aria-label="Skin anterior"/);
  assert.match(root.innerHTML, /aria-label="Skin siguiente"/);
  h.destroy();
  const css = readFileSync(new URL('../src/screens/skinInspect.css', import.meta.url), 'utf8');
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(rm.includes('.sk-view-title small { animation: none'), 'la categoría deja de animarse con reduced-motion');
});

test('skin-inspect: el botón Volver llama al router', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  const h = await mount(root, ctx, { id: 'mint' });
  root.querySelector('[data-back]').emit('click');
  assert.equal(calls.back, 1);
  h.destroy();
});

test('skin-inspect: routes carga esta pantalla; entrada directa #/skins/<id> = [hub, skins, skin]; id con símbolos', async () => {
  const modules = { './skinInspect.js': () => import('../src/screens/skinInspect.js') };
  const routes = createRoutes({ root: 'hub', modules });
  const route = routes.find((r) => r.id === 'skin');
  assert.equal((await route.load()).mount, mount);
  assert.equal(route.restorable, true);
  assert.deepEqual(parseHash('#/skins/mint', routes), { id: 'skin', params: { id: 'mint' } });
  assert.equal(formatHash('skin', { id: 'a b' }, routes), '#/skins/a%20b');
  const win = { location: { hash: '#/skins/mint' }, history: { state: null, pushState() {}, replaceState() {}, back() {}, go() {} }, addEventListener() {}, removeEventListener() {} };
  const router = createRouter({ routes, root: 'hub', win });
  router.start();
  assert.deepEqual(router.stack.map((e) => e.id), ['hub', 'skins', 'skin']);
  assert.equal(router.top.params.id, 'mint');
});

test('skin-inspect: skins.js hace router.push(skin, { id }) y el legado desaparece de main.js', () => {
  const skins = readFileSync(new URL('../src/screens/skins.js', import.meta.url), 'utf8');
  assert.match(skins, /router\.push\('skin', \{ id: skin\.id \}\)/);
  assert.doesNotMatch(skins, /legacy/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const w of ['openSkinInspect', 'closeSkinInspect', 'activeSkinInspector', 'inspectSkin', 'skinInspect =']) assert.doesNotMatch(main, new RegExp(w), w);
  assert.doesNotMatch(main, /classList\.(add|remove)\('sk-noscroll'\)/);
  assert.match(main, /import '\.\/screens\/skinInspect\.css'/);
  assert.match(main, /loadViewer/);
});

test('skin-inspect: sin la palabra vieja de los logros; CSS sin :hover; three no se importa de forma estática', () => {
  const old = new RegExp(['de', 'saf'].join(''), 'i');
  for (const f of ['skinInspect.js', 'skinInspect.css', 'texts/skins.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/screens/${f}`, import.meta.url), 'utf8'), old, f);
  }
  assert.doesNotMatch(readFileSync(new URL('../src/screens/skinInspect.css', import.meta.url), 'utf8'), /:hover/);
  for (const f of ['skinInspect.js', 'skinInspect.css', '../ui/skinInspector.js', '../ui/skinInspector.css']) {
    assert.doesNotMatch(readFileSync(new URL('../src/screens/' + f, import.meta.url), 'utf8'), /desaf.{1,2}o/i, f);
  }
  const src = readFileSync(new URL('../src/screens/skinInspect.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from 'three'|skinInspector\.js/);
});
