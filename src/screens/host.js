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
  let current = null; // { id, screen, scope }
  let kept = null; // pantalla keepAlive (hub) tapada: { id, screen, scope, nodes } con su DOM fuera de la raíz
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

  const destroyKept = () => {
    const k = kept;
    kept = null;
    if (!k) return;
    try { k.screen?.destroy?.(); } catch { /* idem */ }
    k.scope.dispose();
  };

  // Deja en la raíz solo `keep` (el escenario nuevo) o nada. Se llama en el mismo turno que el relevo: nunca hay un frame vacío.
  const clearRoot = (keep = null) => {
    if (!keep) {
      if (root.replaceChildren) root.replaceChildren(); else root.innerHTML = '';
      return;
    }
    for (const n of root.childNodes ? [...root.childNodes] : []) if (n !== keep) root.removeChild?.(n);
  };

  // Tapar sin destruir: el DOM de la saliente sale de la raíz (el escenario `keep` se queda).
  const cover = (keep = null) => {
    const c = current;
    current = null;
    try { c.screen?.onCover?.(); } catch { /* idem */ }
    c.nodes = root.childNodes ? [...root.childNodes].filter((n) => n !== keep) : [];
    clearRoot(keep);
    kept = c;
  };

  // Retira la saliente: se tapa (keepAlive) o se destruye, y se quita su DOM de la raíz salvo `keep`.
  const swapOut = (tapa, keep = null) => {
    if (tapa && current) cover(keep);
    else destroyCurrent();
    clearRoot(keep);
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
    if (kept && top.id === kept.id) return uncover(ev, my, depth);
    // NOTA: `router.reset` siempre deja una pila de una sola entrada ([id]), así que no puede dar [hub, X] con el hub montado:
    // reset(hub) destapa el hub guardado (arriba) o, si el hub es la pantalla actual, lo remonta a propósito.
    if (kept && !router.stack.some((s) => s.id === kept.id)) destroyKept();
    // La saliente NO se toca hasta que la entrante está montada: así no hay frame vacío ni pantalla muerta a la vista.
    const tapa = !!(current && ev.action === 'push' && byId.get(current.id)?.keepAlive && typeof current.screen?.onUncover === 'function' && current.id !== top.id);
    const scope = createScope({ win, doc, timers });
    let screen = null;
    let stage = null; // escenario aislado de la pantalla nueva (oculto hasta el relevo)
    const prev = inflight;
    let release;
    inflight = new Promise((r) => { release = r; });
    try {
      const mod = await byId.get(top.id).load();
      await prev; // espera al montaje anterior (acaba o falla) para que no pinte después del nuestro
      if (my !== token) { scope.dispose(); return; } // caducado antes de empezar: no pinta nada
      if (!mod.manages && doc?.createElement && root.appendChild) {
        stage = doc.createElement('div');
        stage.className = 'scr-stage scr-stage-wait';
        root.appendChild(stage);
        screen = await mod.mount(stage, { ...ctx, scope }, top.params);
      } else {
        swapOut(tapa); // legado (manages) o sin escenario: se retira la saliente antes de montar
        if (!mod.manages) root.innerHTML = '';
        screen = await mod.mount(root, { ...ctx, scope }, top.params);
      }
      if (my !== token) { try { screen?.destroy?.(); } catch { /* ya no se usa */ } stage?.remove?.(); scope.dispose(); return; }
    } catch {
      scope.dispose();
      stage?.remove?.();
      if (my !== token) return;
      notify({ kind: 'info', title: t('common.screenError') });
      // el hub tapado vuelve a destaparse, no se destruye. En legado, swapOut(tapa) ya lo tapó y current es null: no se vuelve a tapar
      if (top.id !== rootId) { if (tapa && current) cover(); router.reset(); }
      else { destroyCurrent(); showRootError(); }
      setIdle();
      return;
    } finally {
      release();
    }
    // Relevo: en el mismo turno sale la saliente y el escenario nuevo se hace visible (sin frame vacío).
    if (stage) {
      swapOut(tapa, stage);
      stage.classList?.remove?.('scr-stage-wait');
    }
    current = { id: top.id, screen, scope };
    if (ev.action === 'pop' || ev.action === 'reset') restoreFocus(depth);
    beginTransition();
  }

  // Vuelta a una pantalla keepAlive: se destruye lo de encima y se devuelve el DOM guardado, sin remontar.
  async function uncover(ev, my, depth) {
    const prev = inflight;
    let release;
    inflight = new Promise((r) => { release = r; });
    try { await prev; } finally { release(); } // un montaje heredado lento de la pantalla tapadora no pinta después
    if (my !== token) return; // otra navegación manda; `kept` sigue intacto para ella
    destroyCurrent();
    const k = kept;
    kept = null;
    root.innerHTML = '';
    if (root.append && k.nodes.length) root.append(...k.nodes);
    current = k;
    try { k.screen?.onUncover?.(ev.prev?.id); } catch { /* una pantalla que falla al destaparse no frena la navegación */ }
    restoreFocus(depth);
    beginTransition();
  }

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
      destroyKept();
    },
  };
}
