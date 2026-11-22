// F2: prepara el hoyo 1 durante la sala en un contenedor oculto (sin three ni DOM propios: todo se inyecta).
// Mismo patrón de generación que createHubPreloader (src/ui/splashBridge.js): `gen` invalida lo que esté en vuelo.
// Nunca hay dos juegos preparados, y antes de crear el renderer se liberan el juego actual y la escena del hub
// (como mucho un contexto WebGL de partida).

import { keyOf, withCap } from './warmupRules.js';

const HOLDER_CSS = 'position:fixed;left:-99999px;top:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none';

/** Contenedor oculto fuera de pantalla para el juego preparado. */
export function makeHiddenHolder(doc = globalThis.document) {
  const box = doc.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = HOLDER_CSS;
  doc.body.appendChild(box);
  return box;
}

const offHandle = () => ({ ready: Promise.resolve(false), progress: 0, key: null, settled: true, cancelled: false, cancel() {} });

/**
 * deps: importGame() -> Promise<GolfGame>, releaseHub(), releaseCurrentGame(), makeHolder() -> elemento,
 * enabled() -> boolean, timers ({ setTimeout, clearTimeout }), probe ({ mark(name, detail) }).
 * req = { course, courseIndex, skin, instance, ghosts, quality }.
 */
export function createGamePreloader({ importGame, releaseHub = () => {}, releaseCurrentGame = () => {}, makeHolder = makeHiddenHolder, enabled = () => true, timers = globalThis, probe = null } = {}) {
  const mark = (name, detail) => { try { probe?.mark?.(name, detail); } catch { /* sin sonda */ } };
  let gen = 0;
  let state = 'idle'; // 'idle' | 'preparing' | 'ready'
  let game = null, holder = null, current = null, abortCurrent = null;

  function release() {
    gen++; // cualquier preparación en vuelo queda cancelada
    const g = game, box = holder;
    // el handle en vuelo se da por terminado ya (ready = false): la sala no espera a algo descartado
    if (current) current.cancelled = true;
    abortCurrent?.();
    game = null;
    holder = null;
    current = null;
    abortCurrent = null;
    state = 'idle';
    try { g?.dispose?.(); } catch { /* ya liberado */ }
    box?.remove?.();
  }

  function warm(req) {
    if (!enabled()) return offHandle();
    release(); // nunca dos juegos preparados
    const my = gen;
    const stale = () => my !== gen;
    const handle = {
      ready: null,
      progress: 0,
      key: keyOf(req.course, req.skin, req.instance, req.quality),
      settled: false,
      cancelled: false,
      cancel() {
        if (handle.cancelled) return;
        if (!stale()) {
          mark('warm:cancel');
          release();
        }
        handle.cancelled = true;
      },
    };
    let abort;
    const aborted = new Promise((resolve) => { abort = () => { handle.settled = true; resolve(false); }; });
    current = handle;
    abortCurrent = abort;
    state = 'preparing';
    mark('warm:start', { courseIndex: req.courseIndex ?? null });
    const work = (async () => {
      let g = null, box = null;
      // libera lo creado por esta preparación cuando release() ya pasó (o no llegó a guardarlo)
      const free = () => {
        try { g?.dispose?.(); } catch { /* ya liberado */ }
        box?.remove?.();
      };
      try {
        releaseCurrentGame();
        releaseHub();
        const GolfGame = await importGame();
        if (stale()) return false;
        box = makeHolder();
        holder = box;
        g = new GolfGame(box, {});
        g.holder = box; // attach() lo quita al pasar la canvas a la pantalla de juego
        game = g;
        const signal = { get cancelled() { return stale(); } };
        const ok = await g.prepare(req.course, {
          skin: req.skin,
          instance: req.instance,
          ghosts: req.ghosts ?? 0,
          signal,
          onProgress: (p) => { handle.progress = p; },
          onStep: (name) => mark(`warm:step:${name}`),
        });
        if (stale()) { free(); return false; }
        if (!ok) { release(); return false; }
        state = 'ready';
        mark('warm:ready');
        return true;
      } catch (err) {
        console.warn('warm: no se ha podido preparar el hoyo:', err?.message ?? err);
        if (!stale()) release();
        else free();
        return false;
      } finally {
        handle.settled = true;
      }
    })();
    handle.ready = Promise.race([work, aborted]);
    return handle;
  }

  /** Entrega el juego preparado si es el de esta clave y está listo; si no, libera lo que hubiera y da null. */
  function take(handle, key) {
    const hit = !!handle && handle === current && !handle.cancelled && state === 'ready' && handle.key === key && !!game;
    if (!hit) {
      mark('warm:take:miss', { reason: !handle || handle !== current ? 'none' : handle.key !== key ? 'key' : state });
      if (state !== 'idle') release();
      return null;
    }
    const g = game;
    gen++; // el juego ya no es del preloader: un release() posterior no lo toca
    game = null;
    holder = null; // el juego lo quita en attach() (g.holder)
    current = null;
    abortCurrent = null;
    state = 'idle';
    mark('warm:take:hit');
    return g;
  }

  return {
    warm,
    take,
    release,
    holds: () => state !== 'idle',
    hold: (handle, search, capMs, opts = {}) => holdForWarm(handle, search, capMs, { timers, mark, ...opts }),
  };
}

/**
 * Antes del «¡YA!»: si la preparación no ha terminado, la sala dice «Preparando el campo…» y espera
 * como mucho `capMs`. Devuelve true si el hoyo quedó listo.
 */
export async function holdForWarm(handle, search, capMs, { timers = globalThis, mark = () => {}, text = 'Preparando el campo…' } = {}) {
  if (!handle || handle.cancelled) return false;
  if (handle.settled) return handle.ready;
  mark('hold:start');
  const prev = search?.status ?? null;
  search?.setStatus?.(text);
  let r;
  try {
    r = await withCap(handle.ready, capMs, timers);
  } catch {
    r = { ok: false };
  }
  const ok = !!(r.ok && r.value === true);
  mark('hold:end', { ok, timeout: !!r.timeout });
  if (!search?.ended) search?.setStatus?.(prev);
  return ok;
}
