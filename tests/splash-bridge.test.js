import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSplashBridge, createBoot, createHubPreloader, trackProgress, waitPainted, SCENE_MARGIN_MS } from '../src/ui/splashBridge.js';
import { fakeEnv } from './helpers/fakeEnv.js';

function fakeSplash() {
  const calls = [];
  return { calls, mark: (n) => calls.push(['mark', n]), done: () => calls.push(['done']), fail: (r) => calls.push(['fail', r]) };
}
const names = (s) => s.calls.map((c) => c.join(':'));
function setup(over = {}) {
  const env = fakeEnv();
  const splash = fakeSplash();
  const logs = [];
  const boot = createBoot({ splash, timers: env.timers, log: (...a) => logs.push(a.join(' ')), ...over });
  return { env, splash, logs, boot };
}
const tick = () => new Promise((r) => setImmediate(r));

test('sin window.gcbSplash el puente es no-op', () => {
  const s = createSplashBridge(() => undefined);
  assert.doesNotThrow(() => { s.mark('bundle'); s.done(); s.fail('x'); });
});

test('con gcbSplash reenvía mark, done y fail', () => {
  const g = fakeSplash();
  const s = createSplashBridge(() => g);
  s.mark('bundle'); s.done(); s.fail('r');
  assert.deepEqual(names(g), ['mark:bundle', 'done', 'fail:r']);
});

test('un gcbSplash roto no tira el arranque', () => {
  const s = createSplashBridge(() => ({ mark() { throw new Error('x'); }, done() { throw new Error('x'); }, fail() { throw new Error('x'); } }));
  assert.doesNotThrow(() => { s.mark('a'); s.done(); s.fail('b'); });
});

test('orden de hitos: bundle, session, progress, three, scene, hub', async () => {
  const { splash, boot, logs } = setup();
  const scene = { dispose() {} };
  boot.bundle();
  boot.session();
  boot.progress();
  const got = [];
  boot.preloadScene({ importScene: async () => ({}), createScene: async () => scene, onScene: (s) => got.push(s) });
  await tick(); await tick();
  boot.hub();
  assert.deepEqual(names(splash), ['mark:bundle', 'mark:session', 'mark:progress', 'mark:three', 'mark:scene', 'mark:hub']);
  assert.deepEqual(got, [scene]);
  assert.ok(logs.some((l) => l.includes('gcbSplash') && l.includes('bundle')));
});

test('sin sesión: done() directo', () => {
  const { splash, boot } = setup();
  boot.bundle();
  boot.noSession();
  assert.deepEqual(names(splash), ['mark:bundle', 'done']);
});

test('three/escena tardan más de 8 s tras session: se omiten y el splash termina', async () => {
  const { env, splash, boot } = setup();
  boot.session();
  boot.progress();
  let late = null;
  const never = new Promise(() => {});
  boot.preloadScene({ importScene: () => never, createScene: async () => ({}), onScene: (s) => { late = s; } });
  env.timers.advance(SCENE_MARGIN_MS - 1);
  assert.ok(!names(splash).includes('mark:scene'));
  env.timers.advance(1);
  assert.deepEqual(names(splash).slice(-2), ['mark:three', 'mark:scene']);
  boot.hub();
  assert.equal(names(splash).at(-1), 'mark:hub');
  assert.equal(late, null);
  assert.ok(!names(splash).some((n) => n.startsWith('fail')));
});

test('si la escena llega tras el margen se libera y no se entrega', async () => {
  const { env, boot } = setup();
  boot.session(); boot.progress();
  let resolve; let disposed = 0; let delivered = 0;
  boot.preloadScene({ importScene: async () => ({}), createScene: () => new Promise((r) => { resolve = r; }), onScene: () => { delivered++; } });
  await tick();
  env.timers.advance(SCENE_MARGIN_MS);
  resolve({ dispose() { disposed++; } });
  await tick();
  assert.equal(disposed, 1);
  assert.equal(delivered, 0);
});

test('sin WebGL (la escena rechaza): omitida, sin error ni fail', async () => {
  const { splash, boot, logs } = setup();
  boot.session(); boot.progress();
  boot.preloadScene({ importScene: async () => ({}), createScene: async () => { throw new Error('Sin WebGL'); }, onScene: () => assert.fail('no debe entregar') });
  await tick(); await tick();
  assert.deepEqual(names(splash).slice(-2), ['mark:three', 'mark:scene']);
  assert.ok(!names(splash).some((n) => n.startsWith('fail')));
  assert.ok(logs.some((l) => l.includes('omitida')));
});

test('fallo del import de three: omitida, no es error', async () => {
  const { splash, boot } = setup();
  boot.session(); boot.progress();
  boot.preloadScene({ importScene: async () => { throw new Error('chunk'); }, createScene: async () => ({}), onScene: () => {} });
  await tick(); await tick();
  assert.deepEqual(names(splash).slice(-2), ['mark:three', 'mark:scene']);
});

test('fallo de sesión/backend: fail con el motivo', () => {
  const { splash, boot } = setup();
  boot.bundle();
  boot.fail('backend');
  assert.deepEqual(names(splash), ['mark:bundle', 'fail:backend']);
});

test('hitos repetidos solo se marcan una vez', () => {
  const { splash, boot } = setup();
  boot.session(); boot.session(); boot.hub(); boot.hub();
  assert.deepEqual(names(splash), ['mark:session', 'mark:hub']);
});

test('three y scene tampoco se marcan dos veces (omitir tras entregar)', async () => {
  const { env, splash, boot } = setup();
  boot.session(); boot.progress();
  await boot.preloadScene({ importScene: async () => ({}), createScene: async () => ({}), onScene: () => {} });
  env.timers.advance(SCENE_MARGIN_MS * 2);
  const n = names(splash);
  assert.equal(n.filter((x) => x === 'mark:three').length, 1);
  assert.equal(n.filter((x) => x === 'mark:scene').length, 1);
});

test('import que no resuelve nunca: tras 8 s la promesa se resuelve con null y hub() se marca', async () => {
  const { env, splash, boot } = setup();
  boot.session(); boot.progress();
  const p = boot.preloadScene({ importScene: () => new Promise(() => {}), createScene: async () => ({}), onScene: () => {} });
  let hubCalled = false;
  const gate = p.then(() => { boot.hub(); hubCalled = true; });
  await tick();
  assert.equal(hubCalled, false);
  env.timers.advance(SCENE_MARGIN_MS);
  assert.equal(await p, null);
  await gate;
  assert.deepEqual(names(splash).slice(-3), ['mark:three', 'mark:scene', 'mark:hub']);
});

test('escena sin primer frame (pestaña oculta): se resuelve null tras 8 s, se cancela y se libera', async () => {
  const { env, boot } = setup();
  boot.session(); boot.progress();
  let sig = null, discarded = 0;
  const p = boot.preloadScene({
    importScene: async () => ({}),
    createScene: (m, signal) => { sig = signal; return new Promise(() => {}); },
    onScene: () => assert.fail('no entrega'),
    onDiscard: () => { discarded++; },
  });
  await tick();
  assert.equal(sig.cancelled, false);
  env.timers.advance(SCENE_MARGIN_MS);
  assert.equal(await p, null);
  assert.equal(sig.cancelled, true);
  assert.equal(discarded, 1);
});

test('llegada tardía: dispose de la escena y onDiscard (contenedor)', async () => {
  const { env, boot } = setup();
  boot.session(); boot.progress();
  let resolve, disposed = 0, discarded = 0;
  boot.preloadScene({ importScene: async () => ({}), createScene: () => new Promise((r) => { resolve = r; }), onScene: () => {}, onDiscard: () => { discarded++; } });
  await tick();
  env.timers.advance(SCENE_MARGIN_MS);
  resolve({ dispose() { disposed++; } });
  await tick();
  assert.equal(disposed, 1);
  assert.ok(discarded >= 1);
});

test('preloadScene tras el margen devuelve null sin importar nada', async () => {
  const { env, boot } = setup();
  boot.session();
  env.timers.advance(SCENE_MARGIN_MS);
  const r = await boot.preloadScene({ importScene: () => assert.fail('no importa'), createScene: async () => ({}), onScene: () => {} });
  assert.equal(r, null);
});

function fakeApp(painted = false) {
  const app = { firstElementChild: painted ? {} : null, loading: !painted, querySelector: (q) => (q === '.loading' && app.loading ? {} : null) };
  return app;
}
function fakeMO() {
  const st = { cb: null, disconnected: 0 };
  class MO { constructor(cb) { st.cb = cb; } observe() {} disconnect() { st.disconnected++; } }
  return { MO, st };
}

test('waitPainted: resuelve true al pintarse y desconecta', async () => {
  const env = fakeEnv(); const { MO, st } = fakeMO(); const app = fakeApp(false);
  const p = waitPainted(app, { maxMs: 1000, timers: env.timers, MO });
  app.firstElementChild = {}; app.loading = false; st.cb();
  assert.equal(await p, true);
  assert.equal(st.disconnected, 1);
});

test('waitPainted: sin pintar tras el tope resuelve false y desconecta', async () => {
  const env = fakeEnv(); const { MO, st } = fakeMO();
  const p = waitPainted(fakeApp(false), { maxMs: 1000, timers: env.timers, MO });
  env.timers.advance(1000);
  assert.equal(await p, false);
  assert.equal(st.disconnected, 1);
});

test('waitPainted: ya pintado resuelve true sin observar', async () => {
  const { MO, st } = fakeMO();
  assert.equal(await waitPainted(fakeApp(true), { MO }), true);
  assert.equal(st.cb, null);
});

test('getBalance colgado no bloquea: progress se marca a los 3 s y la llamada vuelve al instante', async () => {
  const { env, splash, boot } = setup();
  let returned = false;
  const p = trackProgress(boot, () => new Promise(() => {}), { timers: env.timers, maxMs: 3000 });
  returned = true; // trackProgress no se espera: el arranque sigue
  assert.ok(returned);
  await tick();
  assert.ok(!names(splash).includes('mark:progress'));
  env.timers.advance(3000);
  await p;
  assert.deepEqual(names(splash), ['mark:progress']);
});

test('trackProgress: saldo que llega o rechaza marca progress sin esperar al tope', async () => {
  for (const req of [async () => 5, async () => { throw new Error('x'); }]) {
    const { env, splash, boot } = setup();
    await trackProgress(boot, req, { timers: env.timers });
    assert.deepEqual(names(splash), ['mark:progress']);
  }
});

function fakeDoc() {
  const body = { kids: [], appendChild(c) { c.parent = body; body.kids.push(c); } };
  return { body, createElement: () => ({ style: {}, setAttribute() {}, remove() { this.removed = true; } }) };
}
function fakeHubScene(extra = {}) {
  const sc = { paused: false, disposed: 0, firstFrame: Promise.resolve(), pause() { sc.paused = true; }, dispose() { sc.disposed++; }, ...extra };
  return sc;
}
function preloader(createHubScene, over = {}) {
  const s = setup();
  const doc = fakeDoc();
  const released = [];
  const pre = createHubPreloader({ boot: s.boot, importScene: async () => ({ createHubScene }), doc, onReleased: (sc) => released.push(sc), ...over });
  s.boot.session(); s.boot.progress();
  return { ...s, doc, pre, released };
}

test('precarga: la escena se entrega pausada tras su primer frame y con su contenedor', async () => {
  const sc = fakeHubScene();
  const { pre, doc } = preloader(async () => sc);
  const got = await pre.preload();
  assert.equal(got, sc);
  assert.equal(sc.paused, true);
  assert.equal(sc.holder, doc.body.kids[0]);
  assert.equal(pre.current(), sc);
});

test('release libera la escena entregada y quita el contenedor', async () => {
  const sc = fakeHubScene();
  const { pre, doc, released } = preloader(async () => sc);
  await pre.preload();
  pre.release();
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
  assert.equal(pre.current(), null);
  assert.deepEqual(released, [sc]);
});

test('release mientras createHubScene está en vuelo: al resolver se libera y no se entrega', async () => {
  const sc = fakeHubScene();
  let resolve;
  const { pre, doc, splash } = preloader(() => new Promise((r) => { resolve = r; }));
  const p = pre.preload();
  await tick(); await tick();
  pre.release(); // p.ej. entrada directa a partida con #hoyoN
  resolve(sc);
  assert.equal(await p, null);
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
  assert.equal(pre.current(), null);
  assert.deepEqual(names(splash).slice(-2), ['mark:three', 'mark:scene']);
});

test('release con la escena creada pero sin primer frame: se libera y no se entrega', async () => {
  const sc = fakeHubScene({ firstFrame: new Promise(() => {}) });
  const { pre, doc } = preloader(async () => sc);
  const p = pre.preload();
  await tick(); await tick();
  pre.release();
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
  p.catch(() => {});
});

test('margen vencido con la escena sin primer frame: se libera sola', async () => {
  const sc = fakeHubScene({ firstFrame: new Promise(() => {}) });
  const { pre, doc, env } = preloader(async () => sc);
  const p = pre.preload();
  await tick(); await tick();
  env.timers.advance(SCENE_MARGIN_MS);
  assert.equal(await p, null);
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
});

test('sin WebGL: createHubScene rechaza, contenedor quitado y omitida', async () => {
  const { pre, doc, splash } = preloader(async () => { throw new Error('Sin WebGL'); });
  assert.equal(await pre.preload(), null);
  assert.equal(doc.body.kids[0].removed, true);
  assert.deepEqual(names(splash).slice(-2), ['mark:three', 'mark:scene']);
});

test('lobby sin pintar: el fallo se comunica con fail al splash', async () => {
  const { env, splash, boot } = setup(); const { MO } = fakeMO();
  const painted = waitPainted(fakeApp(false), { maxMs: 1000, timers: env.timers, MO });
  env.timers.advance(1000);
  if (!(await painted)) boot.fail('lobby sin pintar');
  assert.deepEqual(names(splash), ['fail:lobby sin pintar']);
});

// ---------- recreación de la escena tras una partida (reload) ----------
import { createGoHome } from '../src/screens/playLifecycle.js';

function reloader(createHubScene, over = {}) {
  const env = fakeEnv();
  const doc = fakeDoc();
  const released = [];
  const pre = createHubPreloader({ boot: setup().boot, importScene: async () => ({ createHubScene }), doc, timers: env.timers, onReleased: (sc) => released.push(sc), ...over });
  return { env, doc, pre, released };
}

test('reload tras release crea una escena nueva, pausada y con su contenedor', async () => {
  const made = [];
  const { pre, doc } = reloader(async () => { const sc = fakeHubScene(); made.push(sc); return sc; });
  pre.release();
  const sc = await pre.reload();
  assert.equal(sc, made[0]);
  assert.equal(sc.paused, true);
  assert.equal(sc.holder, doc.body.kids[0]);
  assert.equal(pre.current(), sc);
});

test('reload no crea escena si hay partida activa (canCreate false)', async () => {
  let n = 0;
  const { pre } = reloader(async () => { n++; return fakeHubScene(); });
  assert.equal(await pre.reload({ canCreate: () => false }), null);
  assert.equal(n, 0);
  assert.equal(pre.current(), null);
});

test('reload no crea otra escena si ya hay una viva', async () => {
  let n = 0;
  const { pre } = reloader(async () => { n++; return fakeHubScene(); });
  const a = await pre.reload();
  const b = await pre.reload();
  assert.equal(a, b);
  assert.equal(n, 1);
});

test('dos vueltas rápidas al hub: una sola escena', async () => {
  let n = 0;
  const { pre } = reloader(async () => { n++; return fakeHubScene(); });
  const [a, b] = await Promise.all([pre.reload(), pre.reload()]);
  assert.equal(n, 1);
  assert.ok(a && b === null);
  assert.equal(pre.current(), a);
});

test('release durante la recreación descarta la escena tardía', async () => {
  const sc = fakeHubScene();
  let resolve;
  const { pre, doc } = reloader(() => new Promise((r) => { resolve = r; }));
  const p = pre.reload();
  await tick(); await tick();
  pre.release(); // empieza otra partida
  resolve(sc);
  assert.equal(await p, null);
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
  assert.equal(pre.current(), null);
});

test('createHubScene rechaza (sin WebGL): null sin error y sin reintentos en bucle', async () => {
  let n = 0;
  const { pre, doc } = reloader(async () => { n++; throw new Error('sin WebGL'); });
  assert.equal(await pre.reload(), null);
  assert.equal(await pre.reload(), null);
  assert.equal(n, 1); // rechazo real: broken, sin reintentos
  assert.equal(doc.body.kids[0].removed, true);
  assert.equal(pre.current(), null);
});

test('reload fuera de margen (8 s): libera lo tardío UNA vez y NO queda roto: el siguiente reload crea', async () => {
  const sc = fakeHubScene();
  let resolve, n = 0;
  const { pre, env } = reloader(() => { n++; return n === 1 ? new Promise((r) => { resolve = r; }) : Promise.resolve(fakeHubScene()); });
  const p = pre.reload();
  await tick(); await tick();
  env.timers.advance(SCENE_MARGIN_MS);
  assert.equal(await p, null);
  resolve(sc);
  await tick(); await tick();
  assert.equal(sc.disposed, 1);
  assert.equal(pre.current(), null);
  const next = await pre.reload();
  assert.ok(next);
  assert.equal(n, 2);
});

test('timeout con la escena creada y firstFrame tardío: un solo dispose', async () => {
  let ff;
  const sc = fakeHubScene({ firstFrame: new Promise((r) => { ff = r; }) });
  const { pre, env, doc } = reloader(async () => sc);
  const p = pre.reload();
  await tick(); await tick();
  env.timers.advance(SCENE_MARGIN_MS);
  assert.equal(await p, null);
  ff();
  await tick(); await tick();
  assert.equal(sc.disposed, 1);
  assert.equal(doc.body.kids[0].removed, true);
  assert.equal(pre.current(), null);
});

test('reload con la pestaña oculta no arranca (y no marca roto); visible, crea', async () => {
  let n = 0;
  const doc = fakeDoc(); doc.hidden = true;
  const { pre } = reloader(async () => { n++; return fakeHubScene(); }, { doc });
  assert.equal(await pre.reload(), null);
  assert.equal(n, 0);
  doc.hidden = false;
  assert.ok(await pre.reload());
});

test('reload no cancela ni pisa una preload() del arranque aún en vuelo', async () => {
  const sc = fakeHubScene();
  let resolve, n = 0;
  const s = setup();
  s.boot.session(); s.boot.progress();
  const doc = fakeDoc();
  const pre = createHubPreloader({ boot: s.boot, importScene: async () => ({ createHubScene: () => { n++; return new Promise((r) => { resolve = r; }); } }), doc, timers: s.env.timers });
  const p = pre.preload();
  await tick(); await tick();
  assert.equal(await pre.reload(), null); // hay una en vuelo: nada
  assert.equal(n, 1);
  resolve(sc);
  assert.equal(await p, sc); // la del arranque llega intacta
  assert.equal(sc.disposed, 0);
  assert.equal(await pre.reload(), sc); // y con escena viva, devuelve esa
  assert.equal(n, 1);
});

test('orden: reload tras goHome (la hub lo pide al llegar) crea la escena DESPUÉS de game.dispose', async () => {
  const order = [];
  const { pre } = reloader(async () => { order.push('createScene'); return fakeHubScene(); });
  let reloading = null;
  const goHome = createGoHome({
    leaveFinale: () => order.push('leaveFinale'),
    stopLive: () => order.push('stopLive'),
    releasePlay: () => order.push('game.dispose'),
    go: () => { order.push('go'); reloading = pre.reload(); }, // el hub monta y pide reviveHubScene
  });
  goHome();
  await reloading;
  assert.deepEqual(order, ['leaveFinale', 'stopLive', 'game.dispose', 'go', 'createScene']);
});
