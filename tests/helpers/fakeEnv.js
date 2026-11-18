// Entorno falso para probar ciclo de vida sin DOM (T005).
function fakeTarget() {
  const map = new Map(); // type -> Set(fn)
  return {
    addEventListener(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const s = map.get(type);
      if (s) { s.delete(fn); if (!s.size) map.delete(type); }
    },
    emit(type, ev = {}) { for (const fn of [...(map.get(type) || [])]) fn(ev); },
    _count() { let n = 0; for (const s of map.values()) n += s.size; return n; },
  };
}

export function fakeEnv() {
  const targets = [];
  const track = (t) => { targets.push(t); return t; };
  const win = track(fakeTarget());
  const doc = track(fakeTarget());

  let now = 0;
  let seq = 0;
  const live = new Map(); // id -> { at, fn, every }
  const timers = {
    setTimeout(fn, ms = 0) { const id = ++seq; live.set(id, { at: now + ms, fn, every: 0 }); return id; },
    clearTimeout(id) { live.delete(id); },
    setInterval(fn, ms = 1) { const id = ++seq; live.set(id, { at: now + ms, fn, every: Math.max(1, ms) }); return id; },
    clearInterval(id) { live.delete(id); },
    requestAnimationFrame(fn) { const id = ++seq; live.set(id, { at: now + 16, fn, every: 0, raf: true }); return id; },
    cancelAnimationFrame(id) { live.delete(id); },
    /** hora del reloj falso (ms desde el inicio) */
    now: () => now,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let nextId = null, next = null;
        for (const [id, t] of live) if (t.at <= end && (!next || t.at < next.at)) { nextId = id; next = t; }
        if (!next) break;
        now = next.at;
        if (next.every) next.at += next.every; else live.delete(nextId);
        next.fn(next.raf ? now : undefined);
      }
      now = end;
    },
  };

  function el(tag = 'div') {
    const classes = new Set();
    const e = track(fakeTarget());
    return Object.assign(e, {
      tag,
      innerHTML: '',
      textContent: '',
      dataset: {},
      style: {},
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => { const on = force ?? !classes.has(c); on ? classes.add(c) : classes.delete(c); return on; },
        contains: (c) => classes.has(c),
      },
      querySelector: (sel) => el(sel),
      querySelectorAll: () => [],
      appendChild: (c) => c,
      remove() {},
      setAttribute() {},
      getAttribute: () => null,
    });
  }

  return {
    win, doc, timers, el,
    liveListeners: () => targets.reduce((n, t) => n + t._count(), 0),
    liveTimers: () => live.size,
  };
}
