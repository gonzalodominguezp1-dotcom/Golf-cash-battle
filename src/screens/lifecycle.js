// Scope de ciclo de vida: todo lo que una pantalla registra se libera en dispose().
export function createScope({ win = globalThis.window, doc = globalThis.document, timers = globalThis } = {}) {
  const listeners = new Set(); // off()
  const pending = new Set(); // cancel()
  const subs = new Set(); // unsubscribe()
  const children = new Set();
  let disposed = false;

  const scope = {
    win, doc,
    on(target, type, fn, opts) {
      if (disposed || !target) return () => {};
      target.addEventListener(type, fn, opts);
      let done = false;
      const off = () => {
        if (done) return;
        done = true;
        listeners.delete(off);
        target.removeEventListener(type, fn, opts);
      };
      listeners.add(off);
      return off;
    },
    timeout(fn, ms) {
      if (disposed) return () => {};
      let cancel;
      const id = timers.setTimeout(() => { pending.delete(cancel); fn(); }, ms);
      cancel = () => { if (pending.delete(cancel)) timers.clearTimeout(id); };
      pending.add(cancel);
      return cancel;
    },
    interval(fn, ms) {
      if (disposed) return () => {};
      const id = timers.setInterval(fn, ms);
      const cancel = () => { if (pending.delete(cancel)) timers.clearInterval(id); };
      pending.add(cancel);
      return cancel;
    },
    raf(fn) {
      if (disposed) return () => {};
      let cancel;
      const id = timers.requestAnimationFrame((t) => { pending.delete(cancel); fn(t); });
      cancel = () => { if (pending.delete(cancel)) timers.cancelAnimationFrame(id); };
      pending.add(cancel);
      return cancel;
    },
    sub(unsubscribe) {
      if (typeof unsubscribe !== 'function') return;
      if (disposed) { unsubscribe(); return; }
      subs.add(unsubscribe);
    },
    child() {
      const c = createScope({ win, doc, timers });
      if (disposed) { c.dispose(); return c; }
      children.add(c);
      const own = c.dispose;
      c.dispose = () => { children.delete(c); own(); };
      return c;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of [...children]) c.dispose();
      children.clear();
      for (const off of [...listeners]) off();
      for (const cancel of [...pending]) cancel();
      const s = [...subs];
      subs.clear();
      for (const u of s) { try { u(); } catch { /* una baja fallida no frena el resto */ } }
    },
    live() {
      const total = { listeners: listeners.size, timers: pending.size, subs: subs.size };
      for (const c of children) {
        const l = c.live();
        total.listeners += l.listeners; total.timers += l.timers; total.subs += l.subs;
      }
      return total;
    },
  };
  return scope;
}
