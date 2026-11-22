import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { assessReliability, createPerf, createProbe, derive, fitCourses, forcedCourses, frameStats, perfEnabled } from '../src/game/perfProbe.js';

const m = (name, t, detail = {}, extra = {}) => ({ name, t, visible: true, focus: true, detail, ...extra });
const H = (hole) => ({ hole, course: `c${hole}`, courseIndex: hole });

test('perfEnabled: solo con perf=1', () => {
  assert.equal(perfEnabled('?perf=1'), true);
  assert.equal(perfEnabled('?a=2&perf=1'), true);
  assert.equal(perfEnabled(''), false);
  assert.equal(perfEnabled('?perf=0'), false);
  assert.equal(perfEnabled('?perf=true'), false);
  assert.equal(perfEnabled('?perfcourses=1'), false);
});

test('forcedCourses: solo práctica con perf=1 e índices válidos', () => {
  const free = { entryFee: 0 }, paid = { entryFee: 5 };
  assert.deepEqual(forcedCourses('?perf=1&perfcourses=3,7,11', free, 20), [3, 7, 11]);
  assert.equal(forcedCourses('?perfcourses=3,7,11', free, 20), null, 'sin perf=1 se ignora');
  assert.equal(forcedCourses('?perf=1&perfcourses=3,7,11', paid, 20), null, 'mesa de pago: se ignora');
  assert.equal(forcedCourses('?perf=1&perfcourses=3,20', free, 20), null, 'fuera de rango');
  assert.equal(forcedCourses('?perf=1&perfcourses=-1,2', free, 20), null, 'negativo');
  assert.equal(forcedCourses('?perf=1&perfcourses=a,2', free, 20), null, 'no numérico');
  assert.equal(forcedCourses('?perf=1&perfcourses=', free, 20), null, 'vacío');
  assert.equal(forcedCourses('?perf=1', free, 20), null);
  assert.deepEqual(fitCourses([3, 7], 3), [3, 7, 3]);
  assert.deepEqual(fitCourses([3, 7, 11, 1], 3), [3, 7, 11]);
});

test('derive: tanda completa de 3 hoyos', () => {
  const marks = [
    m('click', 1000),
    m('join:end', 1100),
    m('room:end', 4000),
    m('env:start', 4100, H(0)), m('env:end', 4200, H(0)),
    m('course:start', 4200, H(0)), m('course:end', 4300, H(0)),
    m('pmrem:start', 4300, H(0)), m('pmrem:end', 4350, H(0)),
    m('ball:start', 4350, H(0)), m('bots:start', 4400, H(0)), m('bots:end', 4440, H(0)), m('ball:end', 4500, H(0)),
    m('frame1:start', 4600, { ...H(0), gl: { programs: 3 } }),
    m('frame1:end', 4900, { ...H(0), gl: { programs: 40 } }),
    m('playable', 7200, H(0)),
    m('hole:done', 20000, H(0)),
    m('hole:next:click', 21000, H(0)),
    m('frame1:end', 21800, { ...H(1), gl: { programs: 12 } }),
    m('hole:next:click', 30000, H(1)),
    m('frame1:end', 30500, { ...H(2), gl: { programs: 9 } }),
    m('ctx:create', 4000, H(0)),
    m('ctx:lost', 20500, H(0)),
  ];
  const longtasks = [
    { t: 2000, duration: 300 }, { t: 3000, duration: 120 }, // sala
    { t: 4100, duration: 700 }, // post sala
    { t: 21200, duration: 400 }, // transición 1
    { t: 25000, duration: 999 }, // fuera de toda ventana
  ];
  const d = derive(marks, longtasks);
  assert.equal(d.sala_ms, 3000);
  assert.equal(d.post_sala_ms, 900);
  assert.equal(d.jugable_ms, 6200);
  assert.deepEqual(d.transicion_ms, [null, 800, 500]);
  assert.equal(d.max_longtask_sala_ms, 300);
  assert.equal(d.max_longtask_post_sala_ms, 700);
  assert.deepEqual(d.max_longtask_transicion_ms, [null, 400, 0]);
  assert.deepEqual(d.programas_frame1[0], { antes: 3, despues: 40 });
  assert.equal(d.programas_frame1[2].despues, 9);
  assert.deepEqual(d.load_desglose[0], { env: 100, course: 100, pmrem: 50, ball: 110, bots: 40 });
  assert.equal(d.load_desglose[1].env, null);
  assert.deepEqual(d.contextos_partida, { creados: 1, perdidos: 1 });
});

test('derive: vivo reanudado (sin click ni room:end) no inventa sala', () => {
  const marks = [
    m('frame1:end', 500, H(2)),
    m('playable', 3000, H(2)),
    m('hole:next:click', 9000, H(2), { auto: true }),
    m('frame1:end', 9600, H(3)),
  ];
  const d = derive(marks, []);
  assert.equal(d.sala_ms, null);
  assert.equal(d.post_sala_ms, null);
  assert.equal(d.jugable_ms, null);
  assert.equal(d.max_longtask_sala_ms, null);
  assert.equal(d.transicion_ms[3], 600);
  assert.equal(d.transicion_ms[0], null);
});

test('derive: sin marcas no revienta', () => {
  const d = derive([], []);
  assert.equal(d.sala_ms, null);
  assert.deepEqual(d.transicion_ms, []);
});

test('fiabilidad: focus=false, pestaña oculta o GPU por software marcan NO FIABLE', () => {
  const ok = [m('click', 0), m('playable', 3000)];
  assert.deepEqual(assessReliability(ok, {}), { ok: true, reasons: [] });
  const nofocus = [m('click', 0), m('room:end', 500, {}, { focus: false }), m('playable', 3000)];
  assert.equal(assessReliability(nofocus).ok, false);
  assert.match(assessReliability(nofocus).reasons[0], /foco/);
  const hidden = [m('click', 0), m('room:end', 500, {}, { visible: false }), m('playable', 3000)];
  assert.equal(assessReliability(hidden).ok, false);
  assert.equal(assessReliability(ok, { softwareGpu: true }).ok, false);
  assert.match(assessReliability(ok, { softwareGpu: true }).reasons[0], /software/);
  // dentro de playable + 6 s cuenta; después ya no
  const late = [m('click', 0), m('playable', 3000), m('hole:done', 8000, {}, { focus: false })];
  assert.equal(assessReliability(late).ok, false);
  const later = [m('click', 0), m('playable', 3000), m('hole:done', 9500, {}, { focus: false })];
  assert.equal(assessReliability(later).ok, true);
  // lo anterior al click no cuenta
  const before = [m('vis', -50, {}, { visible: false }), m('click', 0), m('playable', 3000)];
  assert.equal(assessReliability(before).ok, true);
});

test('frameStats: p50 / p95 / max y umbrales', () => {
  const dts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 150];
  const s = frameStats(dts);
  assert.equal(s.n, 10);
  assert.equal(s.p50, 50);
  assert.equal(s.p95, 150);
  assert.equal(s.max, 150);
  assert.equal(s.gt33, 7);
  assert.equal(s.gt50, 5);
  assert.equal(s.gt100, 1);
  assert.deepEqual(frameStats([]), { n: 0, p50: 0, p95: 0, max: 0, gt33: 0, gt50: 0, gt100: 0 });
});

function probeWith(env, extra = {}) {
  const calls = { mark: [], measure: [] };
  const doc = Object.assign(env.doc, { visibilityState: 'visible', hasFocus: () => true });
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const deps = {
    now: env.timers.now,
    mark: (n, o) => calls.mark.push([n, o]),
    measure: (n, o) => calls.measure.push([n, o]),
    doc,
    nav: { userAgent: 'UA', hardwareConcurrency: 8, deviceMemory: 4 },
    storage,
    raf: env.timers.requestAnimationFrame,
    caf: env.timers.cancelAnimationFrame,
    dpr: () => 3,
    quality: () => 'low',
    url: () => 'http://x/?perf=1',
    ...extra,
  };
  return { probe: createProbe(deps), calls, doc, store };
}

test('sonda: marcas con prefijo gcb:, visible y focus; informe con esquema', () => {
  const env = fakeEnv();
  const { probe, calls, doc } = probeWith(env);
  probe.setContext({ hole: 0, course: 'Prado', courseIndex: 4 });
  probe.mark('click');
  env.timers.advance(100);
  doc.hasFocus = () => false;
  probe.mark('room:end');
  assert.equal(calls.mark[0][0], 'gcb:click');
  assert.deepEqual(calls.mark[0][1].detail, { hole: 0, course: 'Prado', courseIndex: 4 });
  const r = probe.report();
  assert.equal(r.schema, 1);
  assert.equal(r.device.ua, 'UA');
  assert.equal(r.device.dpr, 3);
  assert.equal(r.quality, 'low');
  assert.equal(r.runs.length, 1);
  assert.equal(r.runs[0].marks[1].focus, false);
  assert.equal(r.reliability.ok, false);
  assert.equal(r.derived.sala_ms, 100);
});

test('sonda: GPU por software y compilación paralela salen del renderer', () => {
  const env = fakeEnv();
  const { probe } = probeWith(env);
  const gl = { getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => 'Google SwiftShader' };
  probe.setRenderer({ getContext: () => gl, extensions: { has: (n) => n === 'KHR_parallel_shader_compile' } });
  probe.mark('click');
  probe.mark('playable');
  const r = probe.report();
  assert.equal(r.device.softwareGpu, true);
  assert.equal(r.device.parallelCompile, true);
  assert.equal(r.reliability.ok, false);
  assert.equal(r.derived.frames, undefined, 'sin fiabilidad no hay FPS');
});

test('sonda: histograma de frames con rAF propio; solo se incluye si es fiable', () => {
  const env = fakeEnv();
  const { probe } = probeWith(env);
  probe.mark('click');
  probe.frames.start('h0');
  env.timers.advance(16 * 11);
  const st = probe.frames.stop('h0');
  assert.equal(st.n, 10);
  assert.equal(st.p50, 16);
  assert.equal(st.max, 16);
  assert.equal(env.timers.liveTimers?.() ?? 0, 0);
  const r = probe.report();
  assert.equal(r.derived.frames.h0.n, 10);
});

test('sonda: span, gl y count', () => {
  const env = fakeEnv();
  const { probe, calls } = probeWith(env);
  probe.mark('click');
  const end = probe.span('load');
  env.timers.advance(50);
  end(); end();
  assert.equal(calls.measure.length, 1);
  assert.equal(calls.measure[0][0], 'gcb:load');
  const snap = probe.gl({ info: { programs: [1, 2], memory: { geometries: 5, textures: 6 }, render: { calls: 7 } } }, 'x');
  assert.deepEqual(snap, { label: 'x', programs: 2, geometries: 5, textures: 6, calls: 7 });
  probe.count('tex'); probe.count('tex', 2);
  assert.equal(probe.report().runs[0].counts.tex, 3);
});

test('sonda: longtask y LoAF por observer, persistencia de 10 tandas y reset', () => {
  const env = fakeEnv();
  let cbs = {};
  const { probe, store } = probeWith(env, { observe: (type, cb) => { cbs[type] = cb; } });
  probe.mark('click');
  cbs.longtask([{ startTime: 10, duration: 80 }]);
  cbs['long-animation-frame']([{ startTime: 10, duration: 120, blockingDuration: 60, scripts: [1, 2, 3, 4].map((i) => ({ sourceURL: `u${i}`, invoker: `i${i}` })) }]);
  const r = probe.report();
  assert.deepEqual(r.longtasks, [{ t: 10, duration: 80 }]);
  assert.equal(r.loaf[0].scripts.length, 3);
  for (let i = 0; i < 12; i++) probe.mark('click');
  probe.persist();
  assert.equal(JSON.parse(store.get('gcb.perf.runs')).length, 10);
  probe.reset();
  assert.equal(store.has('gcb.perf.runs'), false);
  assert.equal(probe.report().runs.length, 0);
});

test('sonda desactivada: no se llama a mark ni a los observadores ni se crea la sonda', () => {
  let called = 0;
  const p = createPerf(false, () => { called++; return { mark: () => called++, observe: () => called++ }; });
  p.mark('click');
  p.span('x')();
  p.gl({}, 'x');
  p.count('x');
  p.setContext({});
  p.startFrames('a'); p.stopFrames('a'); p.persist();
  assert.equal(p.enabled, false);
  assert.equal(p.probe, null);
  assert.equal(called, 0);
});

test('sonda activada: la fachada sí marca', () => {
  const env = fakeEnv();
  let n = 0;
  const p = createPerf(true, () => ({ now: env.timers.now, mark: () => n++, doc: env.doc, nav: {} }));
  p.mark('click');
  assert.equal(n, 1);
  assert.equal(p.enabled, true);
});
