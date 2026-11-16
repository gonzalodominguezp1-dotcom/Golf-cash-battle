import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createRoutes } from '../src/screens/routes.js';
import { mount } from '../src/screens/settings.js';

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
        const kids = new Map(); // los hijos también son estables (el botón Reintentar)
        e.querySelector = (q) => { if (!kids.has(q)) kids.set(q, env.el(q)); return kids.get(q); };
        els.set(m[1], e);
      }
      return els.get(m[1]);
    },
  };
}

// Panel doble: cuenta altas y bajas y recuerda con qué opciones se montó.
function fakePanel() {
  const st = { mounts: 0, destroys: 0, opts: null, live: 0, throwOnMount: false };
  const mod = {
    lastSection: () => 'sound',
    mountSettingsPanel(host, opts) {
      if (st.throwOnMount) throw new Error('x');
      st.mounts++; st.live++; st.opts = opts;
      host.innerHTML = '<div class="sp"></div>';
      return { destroy() { st.destroys++; st.live--; } };
    },
  };
  return { st, mod };
}

function makeCtx(env, { account } = {}) {
  const panel = fakePanel();
  const back = { n: 0 };
  const ctx = {
    router: { back: () => { back.n++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    backend: account === undefined ? null : { account },
    loadPanel: () => Promise.resolve(panel.mod),
  };
  return { ctx, panel, back };
}
const flush = () => new Promise((r) => setImmediate(r));
const host = (root) => root.querySelector('[data-settings-host]');

test('ajustes: mount devuelve al momento, pinta «Cargando» y luego monta el panel en layout pantalla', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, panel } = makeCtx(env);
  const screen = mount(root, ctx, {});
  assert.equal(typeof screen.destroy, 'function'); // síncrono: no bloquea al host
  assert.equal(host(root).dataset.state, 'loading');
  assert.match(host(root).innerHTML, /Cargando/);
  await flush();
  assert.equal(host(root).dataset.state, 'ready');
  assert.equal(panel.st.mounts, 1);
  assert.equal(panel.st.opts.layout, 'screen');
  assert.equal(panel.st.opts.section, 'sound'); // la última sección abierta
});

test('ajustes: synced solo con cuenta que no sea de invitado', async () => {
  for (const [account, want] of [[undefined, false], [{ profile: { is_anonymous: true } }, false], [{ profile: { is_anonymous: false } }, true]]) {
    const env = fakeEnv();
    const { ctx, panel } = makeCtx(env, { account });
    mount(fakeRoot(env), ctx, {});
    await flush();
    assert.equal(panel.st.opts.synced, want);
  }
});

test('ajustes: la pantalla no pasa onBack al panel (el volver es el lobby flotante)', async () => {
  const env = fakeEnv();
  const { ctx, panel } = makeCtx(env);
  mount(fakeRoot(env), ctx, {});
  await flush();
  assert.equal(panel.st.opts.onBack, undefined);
});

test('ajustes: la carga del panel tiene tope de 8 s y Reintentar la repite', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, panel } = makeCtx(env);
  ctx.loadPanel = () => new Promise(() => {}); // la red no responde
  mount(root, ctx, {});
  env.timers.advance(7999);
  await flush();
  assert.equal(host(root).dataset.state, 'loading');
  env.timers.advance(1);
  await flush();
  assert.equal(host(root).dataset.state, 'error');
  assert.match(host(root).innerHTML, /No se pudieron cargar los ajustes/);
  assert.equal(ctx.scope.live().listeners, 2); // el botón Reintentar y el botón Lobby
  ctx.loadPanel = () => Promise.resolve(panel.mod);
  host(root).querySelector('[data-retry]').emit('click');
  assert.equal(host(root).dataset.state, 'loading');
  await flush();
  assert.equal(host(root).dataset.state, 'ready');
  assert.equal(panel.st.mounts, 1);
  // el repintado soltó el scope del estado anterior: solo queda la baja del panel
  assert.deepEqual(ctx.scope.live(), { listeners: 1, timers: 0, subs: 1 }); // solo el botón Lobby (de la raíz de la pantalla) y la baja del panel
});

test('ajustes: un fallo al cargar o al montar el panel da error, no pantalla vacía', async () => {
  const env = fakeEnv();
  const a = makeCtx(env);
  a.ctx.loadPanel = () => Promise.reject(new Error('net'));
  const r1 = fakeRoot(env);
  mount(r1, a.ctx, {});
  await flush();
  assert.equal(host(r1).dataset.state, 'error');
  const b = makeCtx(env);
  b.panel.st.throwOnMount = true;
  const r2 = fakeRoot(env);
  mount(r2, b.ctx, {});
  await flush();
  assert.equal(host(r2).dataset.state, 'error');
});

test('ajustes: destroy antes de que llegue el panel no lo monta y no deja nada vivo', async () => {
  const env = fakeEnv();
  const { ctx, panel } = makeCtx(env);
  const screen = mount(fakeRoot(env), ctx, {});
  assert.equal(ctx.scope.live().timers, 1); // el tope de 8 s
  screen.destroy();
  await flush();
  assert.equal(panel.st.mounts, 0);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('ajustes: destroy baja el panel; 20 montajes no dejan fugas (medido antes de scope.dispose)', async () => {
  const env = fakeEnv();
  const { ctx, panel } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const screen = mount(fakeRoot(env), ctx, {});
    await flush();
    assert.ok(ctx.scope.live().subs > 0, 'había algo vivo antes de destruir'); // la baja del panel
    assert.equal(panel.st.live, 1);
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 }); // sin haber llamado a ctx.scope.dispose()
    assert.equal(panel.st.live, 0);
  }
  assert.equal(panel.st.mounts, 20);
  assert.equal(panel.st.destroys, 20);
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('ajustes: la pantalla avisa a main.js al entrar (cierra final y sala en vivo)', () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  let n = 0;
  ctx.legacy = { enterSettings: () => { n++; } };
  mount(fakeRoot(env), ctx, {});
  assert.equal(n, 1);
});

test('ajustes: routes resuelve la ruta a esta pantalla y no al marcador', async () => {
  const modules = { './settings.js': () => import('../src/screens/settings.js') };
  const route = createRoutes({ modules }).find((r) => r.id === 'settings');
  const mod = await route.load();
  assert.equal(mod.mount, mount);
  assert.equal(route.hash, '#/ajustes');
  assert.notEqual(mod.manages, true);
});

test('ajustes: main.js ya no tiene showSettings ni la entrada legacy settings; sin «desafío»', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /showSettings/);
  assert.doesNotMatch(main, /^\s*settings: \(\) =>/m);
  const src = readFileSync(new URL('../src/screens/settings.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/screens/texts/settings.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /desaf[ií]o/i);
});
