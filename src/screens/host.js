// Host de pantallas: aplica la pila del router al DOM (monta la cima, desmonta lo tapado, transición, foco).
import { createScope } from './lifecycle.js';
import { transitionFor } from './transitionRules.js';
import { listState } from './components.js';
import { t } from './texts/index.js';
import './texts/common.js';

export function createHost({ router, routes, root, ctx, notify, win, doc, timers = globalThis }) {
  const byId = new Map(routes.map((r) => [r.id, r]));
  const rootId = router.stack[0].id;
  const focusKeys = []; // profundidad -> data-focus-key del elemento activo al hacer push
  let current = null; // { screen, scope }
  let busy = false;
  let token = 0;
  let endTimer = null;
  let off = null;
  let inflight = Promise.resolve(); // montajes en serie: un show* heredado lento no pinta encima de uno posterior
  let idleCbs = [];

  const destroyCurrent = () => {
    const c = current;
    current = null;
    if (!c) return;
    try { c.screen?.destroy?.(); } catch { /* una pantalla que falla al cerrar no frena la navegación */ }
    c.scope.dispose(); // red de seguridad: quita lo que la pantalla olvidó
  };

  const setIdle = () => {
    busy = false;
    const cbs = idleCbs;
    idleCbs = [];
    for (const fn of cbs) fn();
  };

  const endTransition = () => {
    endTimer = null;
    for (const c of ['scr-t-slide', 'scr-t-fade']) root.classList?.remove(c);
    setIdle();
  };

  function beginTransition() {
    const { ms, kind } = transitionFor({ reduced: !!ctx.reducedMotion() });
    root.style?.setProperty?.('--scr-ms', `${ms}ms`);
    root.classList?.add(`scr-t-${kind}`);
    if (endTimer) timers.clearTimeout(endTimer);
    endTimer = timers.setTimeout(endTransition, ms);
  }

  function restoreFocus(depth) {
    const key = focusKeys[depth];
    const target = (key && root.querySelector?.(`[data-focus-key="${key}"]`)) || root.querySelector?.('h1');
    target?.focus?.();
  }

  // La raíz no tiene a dónde volver: se deja un aviso con «Reintentar» en vez de un #app vacío.
  function showRootError() {
    root.innerHTML = '<main class="screen"><div data-root-error></div></main>';
    const box = root.querySelector('[data-root-error]');
    if (box) listState(box, { state: 'error', errorText: t('common.rootError'), onRetry: () => { show({ action: 'replace' }); } });
  }

  async function show(ev) {
    const my = ++token;
    busy = true;
    if (endTimer) { timers.clearTimeout(endTimer); endTimer = null; }
    const top = router.top;
    const depth = router.stack.length - 1;
    if (ev.action === 'push') focusKeys[depth - 1] = doc?.activeElement?.dataset?.focusKey ?? null;
    focusKeys.length = Math.min(focusKeys.length, depth + 1);
    destroyCurrent();
    const scope = createScope({ win, doc, timers });
    let screen = null;
    const prev = inflight;
    let release;
    inflight = new Promise((r) => { release = r; });
    try {
      const mod = await byId.get(top.id).load();
      await prev; // espera al montaje anterior (acaba o falla) para que no pinte después del nuestro
      if (my !== token) { scope.dispose(); return; } // caducado antes de empezar: no pinta nada
      if (!mod.manages) root.innerHTML = '';
      screen = await mod.mount(root, { ...ctx, scope }, top.params);
      if (my !== token) { try { screen?.destroy?.(); } catch { /* ya no se usa */ } scope.dispose(); return; }
    } catch {
      scope.dispose();
      if (my !== token) return;
      notify({ kind: 'info', title: t('common.screenError') });
      if (top.id !== rootId) router.reset();
      else showRootError();
      setIdle();
      return;
    } finally {
      release();
    }
    current = { screen, scope };
    if (ev.action === 'pop' || ev.action === 'reset') restoreFocus(depth);
    beginTransition();
  }

  // TODO(F3 T026): keepAlive (hub) aún se ignora: toda pantalla se destruye al taparse; falta onCover/onUncover.
  return {
    /** Se suscribe al router; la primera pantalla se monta con el 'start' de router.start(). */
    attach() { off = router.subscribe((ev) => { show(ev); }); },
    /** Vuelve a pintar la cima (p. ej. atajo a la pantalla en la que ya se está). */
    refresh() { return show({ action: 'replace' }); },
    isBusy: () => busy,
    /** Llama a fn una vez cuando termine la carga y la transición en curso (o ya, si no hay). */
    whenIdle(fn) { if (busy) idleCbs.push(fn); else fn(); },
    dispose() {
      off?.();
      token++;
      if (endTimer) timers.clearTimeout(endTimer);
      destroyCurrent();
    },
  };
}
