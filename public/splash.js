/* Splash de arranque. Script clásico (ES5), se sirve tal cual desde public/ y habla
 * con el bundle solo por window.gcbSplash. Dos partes: el NÚCLEO lógico (sin DOM, T019)
 * y la capa VISUAL que lo conecta con #splash (T020b, al final del archivo). */
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

  // ---- Capa visual (T020b). Solo actúa si hay document y #splash; en vm de tests sin DOM no hace nada. ----
  var BASES = { sky: -6, forest: 10, green: 22 };     // px a máxima amplitud, como el boceto
  var SCALES = { sky: 1, forest: 1.04, green: 1.08 };
  var SAFETY_MS = 700;     // fundido = 500 ms en index.html; si no llega transitionend
  var POLL_MS = 500;       // sondeo de state() (el núcleo no usa timers) y del TIP
  var IDLE_MS = 3000;      // sin input durante este tiempo: deriva sola
  var FRAME_MS = 30;       // ~30 fps: se saltan frames intermedios
  var EPS = 0.001;         // convergencia del parallax

  // minimal = true: sin parallax ni listeners globales (modo de rescate si el completo falla).
  function build(minimal) {
    var doc = root.document;
    var splash = doc && doc.getElementById ? doc.getElementById('splash') : null;
    if (!splash || splash.hidden) return null;
    var ctl = { destroyed: false, minimal: minimal, quality: null, reduced: false };

    var reduced = !!minimal;                 // en modo mínimo se oculta sin fundido
    var paused = false, hiding = false, retried = false;
    var rafId = 0, pollId = 0, safetyId = 0, idleId = 0, unsub = null, lastTip = -1;
    var ptrOn = false, visOn = false, mqRemove = null, endOn = false, retryOn = false;
    var elPct = null, elBar = null, elFill = null, elTip = null, elRetry = null, elBall = null, elShadow = null;
    var layers = {};
    var written = {};                         // última transform escrita por elemento

    function cancelRaf() {
      if (rafId && root.cancelAnimationFrame) root.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    function clearIdle() { if (idleId) root.clearTimeout(idleId); idleId = 0; }
    function stopPoll() { if (pollId) root.clearInterval(pollId); pollId = 0; }
    function setT(key, el, value) {
      if (!el || written[key] === value) return;
      written[key] = value;
      el.style.transform = value;
    }

    function cleanup(hideIt) {
      if (ctl.destroyed) return;
      ctl.destroyed = true;
      cancelRaf();
      stopPoll();
      clearIdle();
      if (safetyId) root.clearTimeout(safetyId);
      safetyId = 0;
      if (unsub) unsub();
      unsub = null;
      if (ptrOn) root.removeEventListener('pointermove', onPointer);
      ptrOn = false;
      if (visOn) doc.removeEventListener('visibilitychange', onVis);
      visOn = false;
      if (mqRemove) mqRemove();
      mqRemove = null;
      if (retryOn) elRetry.removeEventListener('click', onRetry);
      retryOn = false;
      if (endOn) splash.removeEventListener('transitionend', onEnd);
      endOn = false;
      if (hideIt && !splash.hidden) {            // nunca dejar #splash enfocable a medias
        splash.hidden = true;
        splash.setAttribute('aria-hidden', 'true');
      }
    }
    ctl.destroy = function () { cleanup(true); };

    function render() {
      var p = core.pct();
      if (elPct) elPct.textContent = p + ' %';
      if (elFill) elFill.style.width = p + '%';
      if (elBar) elBar.setAttribute('aria-valuenow', String(p));
    }
    function setError(on) {
      if (on === (splash.getAttribute('data-state') === 'error')) return;
      if (on) splash.setAttribute('data-state', 'error'); else splash.removeAttribute('data-state');
      if (elBar) elBar.setAttribute('aria-label', on ? 'Error de carga' : 'Cargando');
    }
    function check() {
      if (ctl.destroyed) return;
      render();
      var st = core.state();
      setError(st === 'error');
      if (st === 'ready') hide();
    }
    function tickTip() {
      if (!elTip) return;
      var i = core.tipAt(undefined, TIPS, 4000);
      if (i !== lastTip) { lastTip = i; elTip.textContent = TIPS[i]; }
    }
    function startPoll() {
      stopPoll();
      pollId = root.setInterval(function () { tickTip(); check(); }, POLL_MS);
    }

    // Parallax: x normalizada en [-1, 1]; 1 = posición del boceto (reposo inicial).
    var cur = 1, target = 1, lastInput = null, lastFrame = -1e9, lastTs = 0;
    function apply(ts) {
      var k = 0.5 + 0.5 * cur;
      for (var n in layers) {
        if (layers[n] && !layers[n].hidden) {
          setT(n, layers[n], 'translate3d(' + (BASES[n] * k).toFixed(2) + 'px,0,0) scale(' + SCALES[n] + ')');
        }
      }
      // Pelota: vaivén suave; el periodo nunca baja de FLASH_MIN_MS (AC33). La estela anima por CSS.
      var bob = ts === null ? 0 : Math.sin((2 * Math.PI * ts) / flashPeriod(1600)) * 3;
      setT('ball', elBall, 'translate3d(0,' + bob.toFixed(2) + 'px,0)');
      setT('shadow', elShadow, 'scaleX(' + (1 - bob * 0.02).toFixed(3) + ')');
    }
    function schedule() {
      if (rafId || ctl.destroyed || paused || reduced || minimal || !root.requestAnimationFrame) return;
      rafId = root.requestAnimationFrame(frame);
    }
    function resumeLoop() { idleId = 0; schedule(); }
    function frame(ts) {
      rafId = 0;
      if (ctl.destroyed || paused || reduced) return;
      ts = ts || 0;
      if (ts - lastFrame < FRAME_MS) { schedule(); return; }  // ~30 fps
      lastFrame = ts; lastTs = ts;
      var nowMs = Date.now();
      if (lastInput !== null && nowMs - lastInput > IDLE_MS) lastInput = null;
      var drifting = lastInput === null;
      if (drifting) target = Math.sin(ts / 7000);              // deriva lenta sin input
      cur += (target - cur) * 0.08;
      if (!drifting && Math.abs(target - cur) < EPS) {
        // Convergido y con el puntero quieto: se para el bucle hasta nuevo input o fin del reposo.
        cur = target;
        apply(null);
        idleId = root.setTimeout(resumeLoop, Math.max(50, IDLE_MS - (nowMs - lastInput) + 20));
        return;
      }
      apply(ts);
      schedule();
    }
    function onPointer(e) {
      if (ctl.destroyed || paused || reduced) return;
      var w = root.innerWidth || 1;
      var x = e && typeof e.clientX === 'number' ? e.clientX : w / 2;
      target = Math.max(-1, Math.min(1, (x / w) * 2 - 1));
      lastInput = Date.now();
      clearIdle();
      schedule();
    }

    function goReduced() {
      if (reduced) return;
      reduced = true;
      ctl.reduced = true;
      cancelRaf();
      clearIdle();
      if (ptrOn) root.removeEventListener('pointermove', onPointer);
      ptrOn = false;
      for (var n in layers) if (layers[n]) { layers[n].style.transform = ''; }
      if (elBall) elBall.style.transform = '';
      if (elShadow) elShadow.style.transform = '';
      written = {};
      if (layers.forest) layers.forest.hidden = false;       // reduced: 3 capas estáticas
    }
    function onMq(e) {
      if (e && e.matches === true) goReduced();
    }
    function onVis() {
      if (ctl.destroyed) return;
      var hidden = !!doc.hidden;
      if (hidden && !paused) {
        paused = true;
        cancelRaf(); stopPoll(); clearIdle();
      } else if (!hidden && paused) {
        paused = false;
        startPoll();
        schedule();
        tickTip();
        check();
      }
    }

    function onRetry() {
      if (retried) return;
      retried = true;
      if (elRetry) elRetry.disabled = true;      // evita un doble reload
      root.location.reload();
    }
    function finish() { cleanup(true); }
    function onEnd(e) {
      if (e && e.target && e.target !== splash) return;   // solo el propio #splash
      finish();
    }
    function hide() {
      if (hiding || ctl.destroyed) return;
      hiding = true;
      cancelRaf(); clearIdle();
      splash.classList.add('is-hiding');
      if (reduced) { finish(); return; }                   // sin transición: no hay transitionend
      splash.addEventListener('transitionend', onEnd);
      endOn = true;
      safetyId = root.setTimeout(finish, SAFETY_MS);
    }

    try {
      elPct = splash.querySelector('.pct'); elBar = splash.querySelector('.bar');
      elFill = splash.querySelector('.bar > i'); elTip = splash.querySelector('.tip-text');
      elRetry = splash.querySelector('.retry'); elBall = splash.querySelector('.ball');
      elShadow = splash.querySelector('.ball-shadow');
      layers = { sky: splash.querySelector('.sky'), forest: splash.querySelector('.forest'), green: splash.querySelector('.green') };

      var mql = null;
      if (!minimal) {
        try { mql = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e1) { mql = null; }
        reduced = !!(mql && mql.matches);
      }
      ctl.reduced = reduced;
      var coarse = false;
      try { coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e2) { coarse = false; }
      var nav = root.navigator || {};
      var storage = null;
      try { storage = root.localStorage; } catch (e3) { storage = null; }
      var stored = storage ? readStoredQuality(storage, qualityKind({ coarsePointer: coarse })) : undefined;
      ctl.quality = qualityFor({
        stored: stored, width: root.innerWidth, finePointer: !coarse,
        deviceMemory: nav.deviceMemory, cores: nav.hardwareConcurrency, userAgent: nav.userAgent
      });

      var maxAttr = splash.dataset ? Number(splash.dataset.maxMs) : NaN;
      if (isFinite(maxAttr) && maxAttr > 0) root.gcbSplash.configure({ maxMs: maxAttr });

      // Calidad baja: 2 capas (se omite el bosque). Con reduced-motion, 3 estáticas.
      if (layers.forest) layers.forest.hidden = core.layersFor(ctl.quality, reduced) < 3;

      if (elTip) elTip.setAttribute('aria-live', 'off');
      if (elRetry) { elRetry.addEventListener('click', onRetry); retryOn = true; }
      unsub = root.gcbSplash.subscribe(check);
      startPoll();
      if (!minimal) {
        if (mql) {
          if (mql.addEventListener) {
            mql.addEventListener('change', onMq);
            mqRemove = function () { mql.removeEventListener('change', onMq); };
          } else if (mql.addListener) {
            mql.addListener(onMq);
            mqRemove = function () { mql.removeListener(onMq); };
          }
        }
        if (doc.addEventListener) { doc.addEventListener('visibilitychange', onVis); visOn = true; }
        if (!reduced) {
          if (splash.style) splash.style.touchAction = 'none';
          root.addEventListener('pointermove', onPointer);
          ptrOn = true;
          schedule();
        }
        if (doc.hidden) onVis();
      }
      tickTip();
      check();
      return ctl;
    } catch (err) {
      try { cleanup(false); } catch (err2) { /* nada más que limpiar */ }
      return null;
    }
  }

  function initView() {
    var inst = root.__gcbSplashView && root.__gcbSplashView.instance;
    if (inst && !inst.destroyed) return inst;           // init doble: misma instancia
    var c = null;
    try { c = build(false); } catch (e) { c = null; }
    if (!c) { try { c = build(true); } catch (e2) { c = null; } }
    if (root.__gcbSplashView) root.__gcbSplashView.instance = c;
    return c;
  }

  root.__gcbSplashView = { init: initView, instance: null };
  if (root.document) initView();
})(window);
