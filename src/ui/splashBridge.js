// Puente del arranque hacia el splash (window.gcbSplash, public/splash.js).
// `splash` es no-op si no hay splash (?skinlab=1, fallo de carga del script).
// `createBoot` lleva el orden de hitos y el margen de 8 s de three/escena: es lógica pura y se prueba sin DOM.

/** Tras `session`, three y la escena tienen este margen; si no llegan, se omiten (el hub usa la imagen fija). */
export const SCENE_MARGIN_MS = 8000;

export function createSplashBridge(getSplash = () => (typeof window !== 'undefined' ? window.gcbSplash : undefined)) {
  const call = (fn, ...args) => {
    try { const s = getSplash(); if (s && typeof s[fn] === 'function') s[fn](...args); } catch { /* el splash nunca rompe el arranque */ }
  };
  return {
    mark: (name) => call('mark', name),
    done: () => call('done'),
    fail: (reason) => call('fail', reason),
  };
}

export const splash = createSplashBridge();

export function createBoot({ splash: sp = splash, timers = globalThis, log = (...a) => console.info(...a), marginMs = SCENE_MARGIN_MS, now = () => Date.now() } = {}) {
  const t0 = now();
  const seen = new Set();
  let timer = null;
  let sceneSkipped = false;
  let sceneSettled = false;
  let resolveScene = null; // resuelve la promesa de preloadScene
  let discard = null; // libera lo que la precarga haya creado (escena y contenedor)
  const signal = { cancelled: false };

  const mark = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    log(`gcbSplash hito ${name} +${now() - t0} ms`);
    sp.mark(name);
  };
  const clearTimer = () => { if (timer) { timers.clearTimeout(timer); timer = null; } };
  const skipScene = (why) => {
    if (sceneSettled) return;
    sceneSettled = true;
    sceneSkipped = true;
    signal.cancelled = true;
    log(`gcbSplash escena omitida (${why}): el hub usará la imagen fija`);
    try { discard?.(); } catch { /* ya liberada */ }
    mark('three');
    mark('scene');
    resolveScene?.(null); // quien espera a la escena sigue adelante sin ella
  };

  return {
    bundle: () => mark('bundle'),
    // sin sesión: se muestra el login de siempre y el splash termina
    noSession() {
      log('gcbSplash sin sesión: login');
      sp.done();
    },
    session() {
      mark('session');
      if (!timer && !sceneSettled) timer = timers.setTimeout(() => skipScene(`más de ${marginMs / 1000} s`), marginMs);
    },
    progress: () => mark('progress'),
    /**
     * Precarga three y la escena en segundo plano. Nunca bloquea el splash.
     * `importScene()` -> módulo; `createScene(mod, signal)` -> HubScene (signal.cancelled pasa a true si se omite);
     * `onScene(scene)` la entrega; `onDiscard()` libera lo creado si se omite o llega tarde.
     * Devuelve una promesa que se resuelve con la escena o con null EN EL MOMENTO en que se entrega u omite.
     */
    preloadScene({ importScene, createScene, onScene, onDiscard }) {
      if (sceneSettled) return Promise.resolve(null);
      discard = onDiscard || null;
      return new Promise((resolve) => {
        resolveScene = resolve;
        (async () => {
          let mod;
          try {
            mod = await importScene();
          } catch (err) {
            return skipScene(`three: ${err?.message ?? err}`);
          }
          if (sceneSettled) return;
          mark('three');
          let scene;
          try {
            scene = await createScene(mod, signal);
          } catch (err) {
            return skipScene(`escena: ${err?.message ?? err}`);
          }
          if (sceneSettled) { // llegó tarde: ya se marcó omitida
            try { scene?.dispose?.(); } catch { /* ya liberada */ }
            try { discard?.(); } catch { /* ya liberado */ }
            return;
          }
          sceneSettled = true;
          clearTimer();
          try { onScene(scene); } catch { /* la entrega no frena el splash */ }
          mark('scene');
          resolve(scene);
        })();
      });
    },
    hub() {
      clearTimer();
      mark('hub');
    },
    // solo backend/sesión bloquean con «Reintentar»
    fail(reason) {
      log(`gcbSplash error: ${reason}`);
      sp.fail(reason);
    },
  };
}

/**
 * Resuelve true cuando `el` tiene contenido y ya no hay `.loading`; false si pasan `maxMs` sin pintar
 * (quien llama debe dar el fallo con boot.fail: splash.js solo da error por su cuenta si falta `session`).
 * Siempre desconecta el observador.
 */
export function waitPainted(el, { maxMs = 15000, timers = globalThis, MO = globalThis.MutationObserver } = {}) {
  const ok = () => !!(el.firstElementChild && !el.querySelector('.loading'));
  if (ok()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let mo = null, t = null;
    const end = (v) => { mo?.disconnect(); if (t) timers.clearTimeout(t); resolve(v); };
    mo = new MO(() => { if (ok()) end(true); });
    mo.observe(el, { childList: true, subtree: true });
    t = timers.setTimeout(() => end(false), maxMs);
  });
}

/** Marca `progress` cuando acaba la petición inicial (saldo) o tras `maxMs`; nunca bloquea ni lanza. */
export function trackProgress(boot, request, { timers = globalThis, maxMs = 3000 } = {}) {
  let t = null;
  const timeout = new Promise((r) => { t = timers.setTimeout(r, maxMs); });
  const safe = Promise.resolve().then(() => request()).catch(() => {});
  return Promise.race([safe, timeout]).then(() => { timers.clearTimeout(t); boot.progress(); });
}

/**
 * Escena del hub precargada en un contenedor oculto. Contrato: se entrega PAUSADA tras su primer frame
 * (el hub llama a resume() al montarla). `release()` la libera en cualquier momento, también si aún se está creando:
 * la escena tardía se hace dispose al llegar y no se entrega.
 */
export function createHubPreloader({ boot, importScene, doc = globalThis.document, quality = () => 'medium', reducedMotion = () => false, onReleased = () => {} }) {
  let holder = null, scene = null, gen = 0;

  function release() {
    gen++; // cualquier creación en vuelo queda cancelada
    const sc = scene;
    scene = null;
    try { sc?.dispose?.(); } catch { /* ya liberada */ }
    holder?.remove();
    holder = null;
    onReleased(sc);
  }

  function preload() {
    const my = ++gen;
    const stale = () => my !== gen;
    return boot.preloadScene({
      importScene,
      createScene: async (mod, signal) => {
        if (stale() || signal.cancelled) throw new Error('cancelada');
        const box = doc.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:fixed;left:-99999px;top:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none';
        doc.body.appendChild(box);
        holder = box;
        let sc = null;
        try {
          sc = await mod.createHubScene(box, { quality: quality(), reducedMotion: reducedMotion() });
          if (!stale()) scene = sc; // desde aquí release() puede liberarla aunque el primer frame no llegue
          if (stale() || signal.cancelled) throw new Error('cancelada');
          await sc.firstFrame;
          if (stale() || signal.cancelled) throw new Error('cancelada');
          sc.pause();
          sc.holder = box;
          return sc;
        } catch (err) {
          if (!stale()) { release(); } else {
            // release() ya pasó mientras se creaba: libera esta escena tardía y su contenedor
            try { sc?.dispose?.(); } catch { /* ya liberada */ }
            box.remove();
          }
          throw err;
        }
      },
      onDiscard: () => { if (!stale()) release(); },
    });
  }

  return { preload, release, current: () => scene };
}
