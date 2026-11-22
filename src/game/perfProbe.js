// Instrumento de medición de la carga de partida (F0). Solo actúa con ?perf=1.
// Núcleo puro (derive, fiabilidad, histograma de frames, forcedCourses) + una sonda inyectable (createProbe)
// + una fachada (createPerf) que sin ?perf=1 es un conjunto de funciones vacías: ni performance.mark ni observadores.

export const SCHEMA = 1;
const PREFIX = 'gcb:';
const STORAGE_KEY = 'gcb.perf.runs';
const MAX_RUNS = 10;
const RELIABLE_TAIL_MS = 6000; // se vigila hasta «jugable» + 6 s
const SOFTWARE_GPU = /SwiftShader|llvmpipe|Basic Render|software/i;

// ---------- núcleo puro ----------

/** true solo con ?perf=1 */
export function perfEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  try {
    return new URLSearchParams(search).get('perf') === '1';
  } catch {
    return false;
  }
}

/**
 * ?perfcourses=3,7,11: mapas forzados, solo con perf=1 y solo en práctica (entryFee === 0).
 * Devuelve la lista de índices o null (se ignora si algún índice no vale).
 */
export function forcedCourses(search, tier, total) {
  if (!perfEnabled(search) || !tier || tier.entryFee !== 0) return null;
  let raw;
  try {
    raw = new URLSearchParams(search).get('perfcourses');
  } catch {
    return null;
  }
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim());
  if (!list.length || list.some((s) => !/^\d+$/.test(s))) return null;
  const idx = list.map(Number);
  return idx.every((i) => i >= 0 && i < total) ? idx : null;
}

/** Ajusta la lista forzada al número de hoyos de la partida (recorta o repite). */
export function fitCourses(list, n) {
  return Array.from({ length: n }, (_, k) => list[k % list.length]);
}

/** Estadísticas de frame a partir de los intervalos (ms) entre frames. */
export function frameStats(dts) {
  const n = dts.length;
  if (!n) return { n: 0, p50: 0, p95: 0, max: 0, gt33: 0, gt50: 0, gt100: 0 };
  const s = [...dts].sort((a, b) => a - b);
  const pick = (p) => s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  const r = (x) => Math.round(x * 10) / 10;
  return {
    n,
    p50: r(pick(0.5)),
    p95: r(pick(0.95)),
    max: r(s[n - 1]),
    gt33: dts.filter((d) => d > 33.4).length,
    gt50: dts.filter((d) => d > 50).length,
    gt100: dts.filter((d) => d > 100).length,
  };
}

/**
 * Una tanda es NO FIABLE si entre `click` y `playable + 6 s` alguna marca tuvo la pestaña oculta o sin foco,
 * o si la GPU es por software. Marcas: { name, t, visible, focus }.
 */
export function assessReliability(marks, { softwareGpu = false } = {}) {
  const reasons = [];
  const start = marks.find((m) => m.name === 'click')?.t ?? marks[0]?.t ?? 0;
  const playable = marks.find((m) => m.name === 'playable');
  const end = playable ? playable.t + RELIABLE_TAIL_MS : Infinity;
  const win = marks.filter((m) => m.t >= start && m.t <= end);
  if (win.some((m) => m.visible === false)) reasons.push('pestaña oculta');
  if (win.some((m) => m.focus === false)) reasons.push('sin foco');
  if (softwareGpu) reasons.push('GPU por software');
  return { ok: reasons.length === 0, reasons };
}

const first = (marks, name, pred = () => true) => marks.find((m) => m.name === name && pred(m));
const holeOf = (m) => m.detail?.hole;
const maxLong = (list, a, b) => {
  let mx = 0;
  for (const l of list) if (l.t >= a && l.t <= b && l.duration > mx) mx = l.duration;
  return Math.round(mx);
};
const round = (x) => (x == null ? null : Math.round(x));

/**
 * Métricas derivadas de las marcas de una tanda. `marks`: [{name, t, detail}] sin prefijo; `longtasks`: [{t, duration}].
 * Los arrays por hoyo se indexan por detail.hole (0-based); lo que no se midió queda en null
 * (p. ej. en vivo reanudado no hay click ni room:end: sala_ms y post_sala_ms son null).
 */
export function derive(marks, longtasks = []) {
  const click = first(marks, 'click');
  const roomEnd = first(marks, 'room:end');
  const playable = first(marks, 'playable');
  const frame1End = marks.filter((m) => m.name === 'frame1:end');
  const firstFrame = roomEnd ? frame1End.find((m) => m.t >= roomEnd.t) : null;
  const holes = [...new Set(marks.map(holeOf).filter((h) => Number.isInteger(h)))].sort((a, b) => a - b);
  const nHoles = holes.length ? holes[holes.length - 1] + 1 : 0;
  const forHole = (name, i) => first(marks, name, (m) => holeOf(m) === i);

  const out = {
    sala_ms: click && roomEnd ? round(roomEnd.t - click.t) : null,
    post_sala_ms: roomEnd && firstFrame ? round(firstFrame.t - roomEnd.t) : null,
    jugable_ms: click && playable ? round(playable.t - click.t) : null,
    transicion_ms: [],
    max_longtask_sala_ms: click && roomEnd ? maxLong(longtasks, click.t, roomEnd.t) : null,
    max_longtask_post_sala_ms: roomEnd && firstFrame ? maxLong(longtasks, roomEnd.t, firstFrame.t) : null,
    max_longtask_transicion_ms: [],
    programas_frame1: [],
    load_desglose: [],
    contextos_partida: {
      creados: marks.filter((m) => m.name === 'ctx:create').length,
      perdidos: marks.filter((m) => m.name === 'ctx:lost').length,
    },
  };
  for (let i = 0; i < nHoles; i++) {
    const f1 = forHole('frame1:end', i);
    const next = i > 0 ? forHole('hole:next:click', i - 1) : null;
    out.transicion_ms[i] = next && f1 ? round(f1.t - next.t) : null;
    out.max_longtask_transicion_ms[i] = next && f1 ? maxLong(longtasks, next.t, f1.t) : null;
    const f1s = forHole('frame1:start', i);
    out.programas_frame1[i] = f1 ? { antes: f1s?.detail?.gl?.programs ?? null, despues: f1.detail?.gl?.programs ?? null } : null;
    const span = (n) => {
      const a = forHole(`${n}:start`, i), b = forHole(`${n}:end`, i);
      return a && b ? b.t - a.t : null;
    };
    const bots = span('bots');
    const ballTotal = span('ball');
    out.load_desglose[i] = {
      env: round(span('env')),
      course: round(span('course')),
      pmrem: round(span('pmrem')),
      // «ball» envuelve a «bots» en GolfGame: se resta para no contarlo dos veces
      ball: round(ballTotal == null ? null : ballTotal - (bots ?? 0)),
      bots: round(bots),
    };
  }
  return out;
}

// ---------- sonda ----------

const noop = () => {};

/**
 * Sonda inyectable. deps: now(), mark(name, opts), measure(name, opts), doc, nav, storage,
 * observe(type, cb) -> void (opcional), raf/caf (opcional), dpr(), quality(), url().
 */
export function createProbe(deps = {}) {
  const { now = () => 0, mark: pmark, measure: pmeasure, doc = {}, nav = {}, storage, observe, raf, caf } = deps;
  const device = {
    ua: nav.userAgent ?? '',
    dpr: deps.dpr?.() ?? null,
    cores: nav.hardwareConcurrency ?? null,
    memory: nav.deviceMemory ?? null,
    gpu: null,
    softwareGpu: false,
    parallelCompile: null,
  };
  let runs = [];
  let ctx = { hole: null, course: null, courseIndex: null };
  const active = new Map(); // etiqueta -> { dts, last, id }

  const blank = () => ({ id: runs.length ? runs[runs.length - 1].id + 1 : 1, startedAt: now(), marks: [], spans: [], gl: [], counts: {}, frames: {}, longtasks: [], loaf: [] });
  const cur = () => runs[runs.length - 1] ?? (runs.push(blank()), runs[runs.length - 1]);

  // tandas anteriores (por si se recarga la página a mitad de prueba)
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved)) runs = saved.slice(-MAX_RUNS).map((r) => ({ ...r, restored: true }));
  } catch { /* sin almacenamiento */ }

  function mark(name, detail) {
    const d = { ...ctx, ...detail };
    if (name === 'click') {
      runs.push(blank());
      if (runs.length > MAX_RUNS) runs.shift();
    }
    const m = { name, t: now(), visible: doc.visibilityState === 'visible', focus: typeof doc.hasFocus === 'function' ? !!doc.hasFocus() : true, detail: d };
    cur().marks.push(m);
    try { pmark?.(PREFIX + name, { detail: d }); } catch { /* sin User Timing */ }
    return m;
  }

  function span(name) {
    const t0 = now();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const t1 = now();
      cur().spans.push({ name, t0, dur: t1 - t0 });
      try { pmeasure?.(PREFIX + name, { start: t0, end: t1 }); } catch { /* sin User Timing */ }
    };
  }

  function gl(renderer, label) {
    const info = renderer?.info ?? {};
    const snap = {
      label,
      programs: info.programs?.length ?? null,
      geometries: info.memory?.geometries ?? null,
      textures: info.memory?.textures ?? null,
      calls: info.render?.calls ?? null,
    };
    cur().gl.push(snap);
    return snap;
  }

  function count(name, delta = 1) {
    const c = cur().counts;
    c[name] = (c[name] ?? 0) + delta;
  }

  const frames = {
    start(label) {
      if (active.has(label)) return;
      const f = { dts: [], last: null, id: null, stopped: false };
      active.set(label, f);
      if (!raf) return;
      const tick = () => {
        if (f.stopped) return;
        const t = now();
        if (f.last != null) f.dts.push(t - f.last);
        f.last = t;
        f.id = raf(tick);
      };
      f.id = raf(tick);
    },
    stop(label) {
      const f = active.get(label);
      if (!f) return null;
      f.stopped = true;
      if (f.id != null) caf?.(f.id);
      active.delete(label);
      const stats = frameStats(f.dts);
      cur().frames[label] = stats;
      return stats;
    },
    stopAll() { for (const l of [...active.keys()]) frames.stop(l); },
  };

  function setRenderer(renderer) {
    if (device.gpu != null || !renderer) return;
    try {
      const g = renderer.getContext?.();
      const ext = g?.getExtension?.('WEBGL_debug_renderer_info');
      device.gpu = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconocida';
      device.softwareGpu = SOFTWARE_GPU.test(device.gpu);
    } catch {
      device.gpu = 'desconocida';
    }
    try {
      device.parallelCompile = !!renderer.extensions?.has?.('KHR_parallel_shader_compile');
    } catch {
      device.parallelCompile = null;
    }
  }

  function summarize(run) {
    const reliability = assessReliability(run.marks, device);
    const derived = derive(run.marks, run.longtasks);
    if (reliability.ok) derived.frames = run.frames; // sin fiabilidad no se dan FPS
    return { reliability, derived };
  }

  function persist() {
    try {
      frames.stopAll();
      const out = runs.slice(-MAX_RUNS).map((r) => ({ ...r, ...summarize(r) }));
      storage?.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch { /* cuota o modo privado */ }
  }

  function report() {
    const all = runs.map((r) => ({ ...r, ...summarize(r) }));
    const last = all[all.length - 1];
    return {
      schema: SCHEMA,
      device: { ...device },
      quality: deps.quality?.() ?? null,
      url: deps.url?.() ?? null,
      runs: all,
      longtasks: last?.longtasks ?? [],
      loaf: last?.loaf ?? [],
      reliability: last?.reliability ?? { ok: false, reasons: ['sin datos'] },
      derived: last?.derived ?? null,
    };
  }

  function reset() {
    frames.stopAll();
    runs = [];
    try { storage?.removeItem(STORAGE_KEY); } catch { /* nada */ }
  }

  // observadores (longtask y long-animation-frame); cada tipo es opcional
  if (observe) {
    observe('longtask', (entries) => {
      for (const e of entries) cur().longtasks.push({ t: Math.round(e.startTime), duration: Math.round(e.duration) });
    });
    observe('long-animation-frame', (entries) => {
      for (const e of entries) {
        cur().loaf.push({
          t: Math.round(e.startTime),
          duration: Math.round(e.duration),
          blockingDuration: Math.round(e.blockingDuration ?? 0),
          scripts: (e.scripts ?? []).slice(0, 3).map((s) => ({ sourceURL: s.sourceURL, invoker: s.invoker })),
        });
      }
    });
  }
  // cambios de visibilidad: dejan marca para que la fiabilidad los vea aunque no cayeran junto a otra marca
  try { doc.addEventListener?.('visibilitychange', () => mark('vis')); } catch { /* sin DOM */ }

  return {
    mark,
    span,
    gl,
    count,
    frames,
    report,
    reset,
    persist,
    setRenderer,
    setQuality(fn) { deps.quality = fn; },
    hole: () => ctx.hole ?? 0,
    setContext(c) { ctx = { hole: null, course: null, courseIndex: null, ...c }; },
    device,
  };
}

// ---------- fachada ----------

/** Sin `enabled`, todo son funciones vacías y `makeDeps` ni se llama (cero marcas, cero observadores). */
export function createPerf(enabled, makeDeps) {
  if (!enabled) {
    return { enabled: false, mark: noop, span: () => noop, gl: () => null, count: noop, setContext: noop, setRenderer: noop, setQuality: noop, hole: () => 0, startFrames: noop, stopFrames: noop, persist: noop, probe: null };
  }
  const probe = createProbe(makeDeps());
  return {
    enabled: true,
    probe,
    mark: probe.mark,
    span: probe.span,
    gl: probe.gl,
    count: probe.count,
    setContext: probe.setContext,
    setRenderer: probe.setRenderer,
    setQuality: probe.setQuality,
    hole: probe.hole,
    startFrames: probe.frames.start,
    stopFrames: probe.frames.stop,
    persist: probe.persist,
  };
}

function realDeps() {
  const observe = (type, cb) => {
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      new PerformanceObserver((list) => cb(list.getEntries())).observe({ type, buffered: true });
    } catch { /* tipo no soportado */ }
  };
  let storage = null;
  try { storage = localStorage; } catch { /* bloqueado */ }
  return {
    now: () => performance.now(),
    mark: (n, o) => performance.mark(n, o),
    measure: (n, o) => performance.measure(n, o),
    doc: document,
    nav: navigator,
    storage,
    observe,
    raf: (f) => requestAnimationFrame(f),
    caf: (i) => cancelAnimationFrame(i),
    dpr: () => window.devicePixelRatio,
    url: () => location.href,
  };
}

/** Constante evaluada una sola vez: sin ?perf=1 no hay nada que hacer. */
export const PERF = typeof location !== 'undefined' && perfEnabled(location.search);
export const perf = createPerf(PERF, realDeps);
if (PERF && typeof window !== 'undefined') {
  window.__gcbPerf = perf.probe;
  window.addEventListener('pagehide', () => perf.persist());
}
