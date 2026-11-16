import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createRoutes } from '../src/screens/routes.js';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';
import { mount, courseFeatureKeys } from '../src/screens/maps.js';

// Raíz falsa: reconoce [data-x] sobre el HTML pintado y devuelve elementos estables.
function fakeRoot(env) {
  const els = new Map();
  return {
    innerHTML: '',
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      if (!m || !this.innerHTML.includes(m[1])) return null;
      if (!els.has(m[1])) {
        const e = env.el(m[1]);
        const kids = new Map();
        e.querySelector = (q) => { if (!kids.has(q)) kids.set(q, env.el(q)); return kids.get(q); };
        els.set(m[1], e);
      }
      return els.get(m[1]);
    },
  };
}

function makeCtx(env, extra = {}) {
  const played = [];
  const back = { n: 0, reset: 0 };
  const ctx = {
    router: { back: () => { back.n++; }, reset: () => { back.reset++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    icon: () => '<i></i>',
    actions: { playFreePlay: (i) => played.push(i) },
    legacy: {},
    ...extra,
  };
  return { ctx, played, back };
}
const flush = () => new Promise((r) => setImmediate(r));
const host = (root) => root.querySelector('[data-maps-host]');
const click = (host, attr, value) => {
  const el = { dataset: { [attr]: value }, closest: () => el };
  host.emit('click', { target: el });
};

test('mapas: mount devuelve al momento, pinta «Cargando» y luego los 17 hoyos y el desempate', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  const screen = mount(root, ctx, {});
  assert.equal(typeof screen.destroy, 'function');
  assert.equal(host(root).dataset.state, 'loading');
  assert.match(host(root).innerHTML, /Cargando/);
  await flush();
  assert.equal(host(root).dataset.state, 'ready');
  const html = host(root).innerHTML;
  assert.equal((html.match(/class="course-card /g) || []).length, COURSES.length + 1);
  assert.match(html, /Hoyo 17/);
  assert.match(html, /Desempate: Diana/);
  assert.match(html, /Elige cualquier hoyo/);
  assert.match(html, /sin logros ni misiones/);
});

test('mapas: elegir un hoyo o el desempate llama a playFreePlay', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, played } = makeCtx(env);
  mount(root, ctx, {});
  await flush();
  click(host(root), 'play', '3');
  click(host(root), 'play', 'tiebreak');
  assert.deepEqual(played, [3, 'tiebreak']);
});

test('mapas: «Volver al Menú Principal» va al lobby (router.reset), no atrás', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, back, played } = makeCtx(env);
  mount(root, ctx, {});
  await flush();
  click(host(root), 'home', '');
  assert.equal(back.reset, 1);
  assert.equal(back.n, 0);
  assert.deepEqual(played, []);
});

test('mapas: al entrar avisa al legado (cierra final y sala en vivo)', () => {
  const env = fakeEnv();
  let n = 0;
  const { ctx } = makeCtx(env, { legacy: { enterMaps: () => { n++; } } });
  mount(fakeRoot(env), ctx, {});
  assert.equal(n, 1);
});

test('mapas: sin vista previa estática, la descarga tiene tope de 8 s y Reintentar la repite', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const odd = { ...COURSES[0], name: 'Sin WebP inventado' };
  const { ctx } = makeCtx(env, { courses: [odd], loadPreviews: () => new Promise(() => {}) });
  mount(root, ctx, {});
  env.timers.advance(7999);
  await flush();
  assert.equal(host(root).dataset.state, 'loading');
  env.timers.advance(1);
  await flush();
  assert.equal(host(root).dataset.state, 'error');
  assert.match(host(root).innerHTML, /No se pudieron cargar los mapas/);
  ctx.loadPreviews = () => Promise.resolve({ getCoursePreview: () => 'data:img' });
  host(root).querySelector('[data-retry]').emit('click');
  assert.equal(host(root).dataset.state, 'loading');
  await flush();
  assert.equal(host(root).dataset.state, 'ready');
  assert.match(host(root).innerHTML, /data:img/);
  // el repintado soltó el estado de error: solo queda el clic de la cuadrícula y el de la cabecera
  assert.equal(ctx.scope.live().listeners, 2);
});

test('mapas: un mapa sin WebP y con la descarga rota da error, no pantalla vacía', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const odd = { ...COURSES[0], name: 'Sin WebP inventado' };
  const { ctx } = makeCtx(env, { courses: [odd], loadPreviews: () => Promise.reject(new Error('net')) });
  mount(root, ctx, {});
  await flush();
  assert.equal(host(root).dataset.state, 'error');
});

test('mapas: 20 ciclos de montar y destruir no dejan nada vivo (medido antes de liberar el scope padre)', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const screen = mount(fakeRoot(env), ctx, {});
    await flush();
    const alive = ctx.scope.live();
    assert.ok(alive.listeners > 0, 'la pantalla montada tiene algo vivo');
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
  ctx.scope.dispose();
});

test('mapas: destruir mientras carga cancela el tope y no pinta después', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const odd = { ...COURSES[0], name: 'Sin WebP inventado' };
  let release;
  const { ctx } = makeCtx(env, { courses: [odd], loadPreviews: () => new Promise((r) => { release = r; }) });
  const screen = mount(root, ctx, {});
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  release({ getCoursePreview: () => 'x' });
  await flush();
  assert.equal(host(root).dataset.state, 'loading');
});

test('mapas: particularidades de un mapa y ruta cargable', () => {
  assert.deepEqual(courseFeatureKeys({ loops: [1], portals: [{ tube: true }], sand: [1] }), ['loop', 'tubes', 'sand']);
  assert.deepEqual(courseFeatureKeys(TIEBREAK_COURSE).includes('loop'), false);
  const routes = createRoutes({ root: 'hub', modules: { './maps.js': () => 'ok' } });
  assert.equal(routes.find((r) => r.id === 'maps').hash, '#/mapas');
});

test('mapas: «desafíos» ya no aparece y los textos viven en texts/maps.js', () => {
  const dir = new URL('../src/screens/', import.meta.url);
  const text = readFileSync(new URL('texts/maps.js', dir), 'utf8');
  assert.match(text, /Elige cualquier hoyo/);
  for (const f of ['maps.js', 'maps.css', 'texts/maps.js']) assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /desaf.{1,2}o/i);
  const main = readFileSync(new URL('../main.js', dir), 'utf8');
  assert.doesNotMatch(main, /function showFreePlayCourseSelect/);
  assert.doesNotMatch(main, /Elige cualquier hoyo/);
});
