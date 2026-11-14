/* Splash de arranque: NÚCLEO lógico (sin DOM). Script clásico, se sirve tal cual
 * desde public/ y habla con el bundle solo por window.gcbSplash.
 * La capa visual (parallax, estela, deriva) y el HTML son otras tareas (T020a/b). */
(function (root) {
  'use strict';

  var WEIGHTS = { html: 5, bundle: 20, session: 20, progress: 15, three: 20, scene: 15, hub: 5 };
  var TIPS = [
    'Un golpe suave en el green vale más que uno fuerte.',
    'Mira la pendiente antes de golpear: la bola siempre sigue la bajada.',
    'Arrastra hacia atrás para apuntar; cuanto más largo, más fuerte.',
    'Practica el hoyo gratis antes de jugarte las monedas.'
  ];
  var FLASH_MIN_MS = 500; // AC33: como mucho 2 destellos por segundo

  function flashPeriod(ms) {
    var n = Number(ms);
    return isFinite(n) && n > FLASH_MIN_MS ? n : FLASH_MIN_MS;
  }

  // Misma heurística que defaultQuality() de src/game/render/quality.js.
  function qualityFor(env) {
    env = env || {};
    if (env.stored === 'low' || env.stored === 'medium' || env.stored === 'high') return env.stored;
    if (env.width >= 900 && env.finePointer !== false) return 'high';
    var mem = env.deviceMemory, cores = env.cores;
    var android = /Android/i.test(env.userAgent || '');
    var weak = (mem != null && mem <= 3) || (android && cores != null && cores <= 4);
    return weak ? 'low' : 'medium';
  }

  var QUALITIES = ['low', 'medium', 'high'];

  // Equivale a deviceKind() de src/settings/settings.js: puntero grueso = 'mobile'.
  function qualityKind(env) {
    return env && env.coarsePointer ? 'mobile' : 'desktop';
  }

  // Lee gcb.settings.v1 .quality[kind]; ante cualquier fallo o valor inválido, undefined.
  function readStoredQuality(storage, kind) {
    try {
      var raw = storage.getItem('gcb.settings.v1');
      if (!raw) return undefined;
      var data = JSON.parse(raw);
      var q = data && data.quality && data.quality[kind];
      return QUALITIES.indexOf(q) >= 0 ? q : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // Todos los `t` que se pasan a state/canHide/tipAt deben estar en el mismo reloj que `now`.
  function createSplashCore(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var weights = opts.weights || WEIGHTS;
    var minMs = opts.minMs == null ? 600 : opts.minMs;
    var maxMs = opts.maxMs == null ? 15000 : opts.maxMs;
    var start = now();
    function since(t) {
      var e = (t == null ? now() : t) - start;
      return e > 0 ? e : 0; // salto atrás o reloj distinto: cuenta como 0
    }
    var marked = {};
    var failed = false;
    var forced = false;
    var shown = 0;

    function pct() {
      var sum = 0;
      for (var k in marked) if (marked[k]) sum += weights[k];
      if (sum > 100) sum = 100;
      if (!marked.hub && sum > 99) sum = 99;
      sum = Math.round(sum);
      if (sum > shown) shown = sum; // nunca baja
      return shown;
    }
    function mark(name) {
      if (Object.prototype.hasOwnProperty.call(weights, name)) marked[name] = true;
      return pct();
    }
    function state(t) {
      if (failed) return 'error';
      if (canHide(t)) return 'ready';
      // Decisión del plan §3.10: solo la falta de `session` bloquea con error; con
      // `session` marcada y sin `hub` no hay error (three/escena se omiten, no bloquean).
      if (!marked.session && !marked.hub && since(t) >= maxMs) return 'error';
      return 'loading';
    }
    function canHide(t) {
      if (forced) return true;
      return !!marked.hub && since(t) >= minMs;
    }
    function tipAt(t, tips, everyMs) {
      var n = tips ? tips.length : 0;
      if (!n) return 0;
      var step = everyMs > 0 ? everyMs : 4000;
      return Math.floor(since(t) / step) % n;
    }
    function layersFor(quality, reduced) {
      if (reduced) return 3;
      return quality === 'low' ? 2 : 3;
    }
    return {
      mark: mark, pct: pct, state: state, canHide: canHide, tipAt: tipAt, layersFor: layersFor,
      fail: function () { failed = true; },
      forceHide: function () { forced = true; },
      setMaxMs: function (v) { if (typeof v === 'number' && isFinite(v) && v > 0) maxMs = v; },
      getMaxMs: function () { return maxMs; },
      done: function () { for (var k in weights) marked[k] = true; return pct(); },
      startedAt: function () { return start; }
    };
  }

  var api = {
    createSplashCore: createSplashCore, qualityFor: qualityFor,
    qualityKind: qualityKind, readStoredQuality: readStoredQuality, flashPeriod: flashPeriod,
    WEIGHTS: WEIGHTS, TIPS: TIPS, FLASH_MIN_MS: FLASH_MIN_MS
  };
  root.__gcbSplashCore = api;

  var core = createSplashCore({ maxMs: 15000 });
  var listeners = [];
  function emit() {
    var copy = listeners.slice();
    for (var i = 0; i < copy.length; i++) { try { copy[i](); } catch (e) { /* un oyente roto no frena */ } }
  }
  root.gcbSplash = {
    core: core,
    configure: function (o) { if (o) core.setMaxMs(o.maxMs); },
    mark: function (name) { var p = core.mark(name); emit(); return p; },
    done: function () { var p = core.done(); emit(); return p; },
    fail: function (reason) { core.fail(reason); root.gcbSplash.reason = reason; emit(); },
    hideNow: function () { core.forceHide(); emit(); },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    reason: null
  };
  core.mark('html');
})(window);
