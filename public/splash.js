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
  // Texto de estado según el último hito alcanzado (en el orden de arranque).
  var PHASES = ['html', 'bundle', 'session', 'progress', 'three', 'scene', 'hub'];
  var LABELS = {
    html: 'Arrancando el juego…',
    bundle: 'Cargando el juego…',
    session: 'Comprobando tu sesión…',
    progress: 'Cargando tu saldo…',
    three: 'Preparando el campo 3D…',
    scene: 'Colocando las banderas…',
    hub: '¡Listo, a jugar!'
  };
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
    // Último hito alcanzado según el orden de arranque (para el texto de estado).
    function phase() {
      var last = null;
      for (var i = 0; i < PHASES.length; i++) if (marked[PHASES[i]]) last = PHASES[i];
      return last;
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
      mark: mark, pct: pct, state: state, canHide: canHide, tipAt: tipAt, layersFor: layersFor, phase: phase,
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

  // minMs: el splash se queda al menos este tiempo, para que dé tiempo a leer el estado y un consejo.
  var core = createSplashCore({ maxMs: 15000, minMs: 3000 });
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

  // ---- Capa visual: la moneda cae al hoyo. Solo actúa si hay document y #splash; en vm de tests sin DOM no hace nada. ----
  // .hole = foto del hoyo a pantalla completa (cover, en index.html); .coins = canvas con monedas, chispas y símbolos.
  // Sin sonido ni vibración: la escena solo pinta en el canvas (lo comprueba tests/splash-scene.test.js).
  var HOLE_W = 1376, HOLE_H = 768;          // public/splash/hole.jpg
  var HOLE_FX = 0.499, HOLE_FY = 0.502;     // centro del hoyo dentro de la foto (fracción)
  var HOLE_R = 0.1275;                      // radio del hoyo respecto al ancho pintado
  var ZOOM_LAND = 1.06, PORT_FILL = 1.5;    // paisaje: cover x 1,06; vertical: la foto mide 150 % del ancho y se funde a negro (CSS)
  var PAR_X = 14, PAR_Y = 10;               // desplazamiento del hoyo con el parallax (px)
  var HOLE_PORT_W = 1080, HOLE_PORT_H = 1920;   // public/splash/hole-portrait.jpg (vertical)
  var HOLE_PORT_FX = 0.5, HOLE_PORT_FY = 0.5;   // centro del hoyo en la foto vertical
  var HOLE_PORT_R = 0.125;                      // radio del hoyo respecto al ancho de la foto vertical
  var COIN_SRC = '/splash/coin.png';
  var MAX_COINS = 60;                       // monedas a la vez
  var SPAWN_MIN = 0.1, SPAWN_VAR = 0.12;    // una moneda cada 0,1–0,22 s
  var SAFETY_MS = 700;                      // fundido = 500 ms en index.html; si no llega transitionend
  var POLL_MS = 500;                        // sondeo de state() (el núcleo no usa timers) y del TIP

  function clamp1(v) { return v < -1 ? -1 : (v > 1 ? 1 : v); }

  function clampN(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Geometría del hoyo en pantalla (px, py en [-1, 1]). Sin DOM.
  // Horizontal: cover centrado con margen de 1,06 para el parallax.
  // Vertical: la foto va desde la mitad del logo (donde empieza la viñeta) hasta el 88 % de la altura
  // (mitad de la barra de progreso); el ancho sigue la proporción de la foto y se corta a los lados.
  function holeGeom(W, H, px, py) {
    var tx = -(px || 0) * PAR_X, ty = -(py || 0) * PAR_Y;
    var s, dw, dh, ox, oy;
    if (H > W) {
      // vertical: la foto ocupa toda la pantalla (cover centrado), con margen de parallax en los cuatro lados.
      dh = H + 2 * PAR_Y;
      dw = W + 2 * PAR_X;
      ox = -PAR_X + tx;
      oy = -PAR_Y + ty;
      var cover = Math.max(dw / HOLE_PORT_W, dh / HOLE_PORT_H);   // escala real de la foto dentro de la caja
      return { ox: ox, oy: oy, dw: dw, dh: dh, k: cover, tx: tx, ty: ty,
        hx: ox + dw * HOLE_PORT_FX, hy: oy + dh * HOLE_PORT_FY, holeR: HOLE_PORT_W * cover * HOLE_PORT_R };
    } else {
      s = Math.max(W / HOLE_W, H / HOLE_H) * ZOOM_LAND;
      dw = HOLE_W * s; dh = HOLE_H * s;
      ox = (W - dw) / 2 + tx;
      oy = (H - dh) / 2 + ty;
    }
    return { ox: ox, oy: oy, dw: dw, dh: dh, k: s, tx: tx, ty: ty,
      hx: ox + dw * HOLE_FX, hy: oy + dh * HOLE_FY, holeR: dw * HOLE_R };
  }

  // Simulación de la escena (sin DOM): monedas que entran por un borde y caen al hoyo; al entrar, chispas y «$»/«↑».
  function createCoinScene(rnd) {
    rnd = rnd || Math.random;
    var sc = { coins: [], sparks: [], pops: [], spawnT: 0, landed: 0 };
    function spawn(t0) {
      var edge = Math.floor(rnd() * 4), u = rnd(), m = 0.12;   // 0 arriba, 1 derecha, 2 abajo, 3 izquierda
      var fx = edge === 0 ? u : (edge === 1 ? 1 + m : (edge === 2 ? u : -m));
      var fy = edge === 0 ? -m : (edge === 1 ? u : (edge === 2 ? 1 + m : u));
      sc.coins.push({
        t: t0 || 0, dur: 2.6 + rnd() * 1.0, fx: fx, fy: fy,
        depth: 0.4 + rnd() * 0.6,                 // 0,4 lejos … 1 cerca
        spins: 3 + rnd() * 3, ph: rnd() * Math.PI * 2, fade: 1, landed: false,
        x: 0, y: 0, size: 0, flip: 1
      });
    }
    function land(g) {
      sc.landed++;
      for (var i = 0; i < 14; i++) {
        var a = rnd() * Math.PI * 2, v = 80 + rnd() * 180;
        sc.sparks.push({ x: g.hx, y: g.hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 1 });
      }
      for (var j = 0; j < 3; j++) {
        sc.pops.push({ x: g.hx + (rnd() - 0.5) * g.holeR * 1.6, y: g.hy, vy: -(110 + rnd() * 90),
          life: 1, ch: rnd() < 0.6 ? '$' : '↑', sc: 0.8 + rnd() * 0.6 });
      }
    }
    function alive(o) { return o.life > 0; }
    function notLanded(c) { return !c.landed; }
    function byDepth(a, b) { return a.depth - b.depth; }   // de lejos a cerca
    // monedas ya en vuelo desde el primer fotograma: así se ven caer aunque la carga sea corta
    sc.prewarm = function (n) { for (var i = 0; i < n; i++) spawn(rnd() * 0.8); };
    // dt en segundos; spawnOn = false deja terminar lo que hay sin crear monedas nuevas.
    sc.update = function (dt, W, H, g, px, py, spawnOn) {
      if (spawnOn) {
        sc.spawnT -= dt;
        if (sc.spawnT <= 0 && sc.coins.length < MAX_COINS) { spawn(); sc.spawnT = SPAWN_MIN + rnd() * SPAWN_VAR; }
      }
      var size = Math.min(W, H) * 0.2;
      sc.coins.sort(byDepth);
      for (var i = 0; i < sc.coins.length; i++) {
        var c = sc.coins[i];
        c.t += dt / c.dur;
        var t = c.t < 1 ? c.t : 1;
        var p = t * t;                              // acelera hacia el hoyo
        var x0 = c.fx * W, y0 = c.fy * H;
        c.x = x0 + (g.hx - x0) * p + px * c.depth * 22;
        c.y = y0 + (g.hy - y0) * p + py * c.depth * 14;
        c.size = size * (1 - 0.72 * t) * (0.55 + 0.45 * c.depth);
        if (t > 0.85) { c.fade = Math.max(0, 1 - (t - 0.85) / 0.15); c.y += (t - 0.85) * H * 0.05; }   // se hunde
        c.flip = Math.max(0.12, Math.abs(Math.cos(c.ph + t * c.spins * Math.PI * 2)));                  // giro en Y
        if (c.t >= 1 && !c.landed) { c.landed = true; land(g); }
      }
      sc.coins = sc.coins.filter(notLanded);
      for (var s = 0; s < sc.sparks.length; s++) {
        var k = sc.sparks[s];
        k.life -= dt * 1.6; k.vy += 520 * dt; k.x += k.vx * dt; k.y += k.vy * dt;
      }
      sc.sparks = sc.sparks.filter(alive);
      for (var q = 0; q < sc.pops.length; q++) {
        var o = sc.pops[q];
        o.life -= dt * 0.9; o.y += o.vy * dt;
      }
      sc.pops = sc.pops.filter(alive);
    };
    sc.draw = function (ctx, W, H, coinImg) {
      ctx.clearRect(0, 0, W, H);
      var i;
      if (coinImg) {
        for (i = 0; i < sc.coins.length; i++) {
          var c = sc.coins[i];
          ctx.save();
          ctx.globalAlpha = c.fade;
          ctx.translate(c.x, c.y);
          ctx.scale(c.flip, 1);
          ctx.drawImage(coinImg, -c.size / 2, -c.size / 2, c.size, c.size);
          ctx.restore();
        }
      }
      if (sc.sparks.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < sc.sparks.length; i++) {
          var k = sc.sparks[i], l = k.life > 0 ? k.life : 0;
          ctx.fillStyle = 'rgba(255, 214, 120, ' + l.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(k.x, k.y, 2.2 * Math.max(0.3, l) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (sc.pops.length) {
        var fs = Math.max(20, Math.min(W, H) * 0.07);
        ctx.font = '800 ' + Math.round(fs) + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (i = 0; i < sc.pops.length; i++) {
          var o = sc.pops[i];
          ctx.save();
          ctx.globalAlpha = o.life > 0 ? o.life : 0;
          ctx.translate(o.x, o.y);
          ctx.scale(o.sc, o.sc);
          ctx.fillStyle = '#3dff7a';
          ctx.shadowColor = 'rgba(0, 255, 90, 0.9)';
          ctx.shadowBlur = 14;
          ctx.fillText(o.ch, 0, 0);
          ctx.restore();
        }
      }
    };
    sc.clear = function () { sc.coins = []; sc.sparks = []; sc.pops = []; };
    return sc;
  }

  // minimal = true: sin escena ni listeners globales (modo de rescate si el completo falla).
  function build(minimal) {
    var doc = root.document;
    var splash = doc && doc.getElementById ? doc.getElementById('splash') : null;
    if (!splash || splash.hidden) return null;
    var ctl = { destroyed: false, minimal: minimal, quality: null, reduced: false, animated: false, scene: null };

    var reduced = !!minimal;                 // en modo mínimo se oculta sin fundido
    var paused = false, hiding = false, retried = false, full = false;
    var rafId = 0, pollId = 0, safetyId = 0, unsub = null, lastTip = -1;
    var ptrOn = false, oriOn = false, resizeOn = false, visOn = false, mqRemove = null, endOn = false, retryOn = false;
    var elPct = null, elBar = null, elFill = null, elTip = null, elRetry = null, elTicks = null, elHole = null, elCanvas = null, elLabel = null;
    var ctx = null, coinImg = null, coinReady = false, scene = null, animOn = false, saveData = false;
    var W = 0, H = 0, dpr = 1, px = 0, py = 0, tx = 0, ty = 0, lastTs = 0, holeT = '';
    var ticks = [];                           // hitos de la barra: { el, at, on }

    // Marcas de hito sobre la barra, en el % acumulado de cada peso (sin el primero ni el último).
    function buildTicks() {
      if (!elTicks || !doc.createElement) return;
      elTicks.textContent = '';                 // un reintento en modo mínimo no duplica marcas
      var keys = [], acc = 0;
      for (var k in WEIGHTS) keys.push(k);
      for (var i = 0; i < keys.length - 1; i++) {
        acc += WEIGHTS[keys[i]];
        if (i === 0) continue;
        var b = doc.createElement('b');
        b.className = 'tick';
        b.style.left = acc + '%';
        elTicks.appendChild(b);
        ticks.push({ el: b, at: acc, on: false });
      }
    }

    function cancelRaf() {
      if (rafId && root.cancelAnimationFrame) root.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    function stopPoll() { if (pollId) root.clearInterval(pollId); pollId = 0; }

    function onPointer(e) {
      if (!animOn || paused) return;
      var w = W || root.innerWidth || 1, h = H || root.innerHeight || 1;
      var x = e && typeof e.clientX === 'number' ? e.clientX : w / 2;
      var y = e && typeof e.clientY === 'number' ? e.clientY : h / 2;
      tx = clamp1((x / w) * 2 - 1);
      ty = clamp1((y / h) * 2 - 1);
    }
    // Android: llega sin pedir permiso. iOS: sin permiso no llega y manda el puntero (o el dedo).
    function onOrient(e) {
      if (!animOn || paused || !e || e.gamma == null) return;
      tx = clamp1(e.gamma / 30);
      ty = clamp1(((e.beta == null ? 45 : e.beta) - 45) / 30);
    }
    function resize() {
      W = root.innerWidth || 1;
      H = root.innerHeight || 1;
      if (!elCanvas) return;
      var max = ctl.quality === 'high' ? 2 : 1.5;
      dpr = Math.min(root.devicePixelRatio || 1, max);
      elCanvas.width = Math.round(W * dpr);
      elCanvas.height = Math.round(H * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Fija la foto con su tamaño real (cover en horizontal; 150 % del ancho en vertical) y el parallax.
    function setHole(g) {
      var v = [g.ox, g.oy, g.dw, g.dh].map(function (n) { return n.toFixed(1); }).join(',');
      if (!elHole || v === holeT) return;
      holeT = v;
      var st = elHole.style;
      st.transform = 'none'; st.right = 'auto'; st.bottom = 'auto';
      st.left = g.ox.toFixed(1) + 'px'; st.top = g.oy.toFixed(1) + 'px';
      st.width = g.dw.toFixed(1) + 'px'; st.height = g.dh.toFixed(1) + 'px';
    }
    function schedule() {
      if (rafId || ctl.destroyed || paused || !animOn || !root.requestAnimationFrame) return;
      rafId = root.requestAnimationFrame(frame);
    }
    function frame(ts) {
      rafId = 0;
      if (ctl.destroyed || paused || !animOn) return;
      ts = ts || 0;
      var dt = lastTs ? (ts - lastTs) / 1000 : 0;
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;
      lastTs = ts;
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      var g = holeGeom(W, H, px, py);
      setHole(g);
      scene.update(dt, W, H, g, px, py, coinReady);
      scene.draw(ctx, W, H, coinReady ? coinImg : null);
      schedule();
    }
    function removeMotionListeners() {
      if (ptrOn) root.removeEventListener('pointermove', onPointer);
      ptrOn = false;
      if (oriOn) root.removeEventListener('deviceorientation', onOrient);
      oriOn = false;
      if (resizeOn) root.removeEventListener('resize', resize);
      resizeOn = false;
    }
    function stopScene() {
      animOn = false;
      ctl.animated = false;
      cancelRaf();
      removeMotionListeners();
      if (coinImg) { coinImg.onload = null; coinImg.onerror = null; }
      if (scene) scene.clear();
      if (ctx && ctx.clearRect) ctx.clearRect(0, 0, W, H);
      if (elCanvas) elCanvas.hidden = true;
      if (elHole && holeT) {                                              // vuelve al tamaño fijo del CSS
        var es = elHole.style;
        es.transform = ''; es.left = ''; es.top = ''; es.width = ''; es.height = ''; es.right = ''; es.bottom = '';
        holeT = '';
      }
    }
    function startScene() {
      ctx = elCanvas.getContext ? elCanvas.getContext('2d') : null;
      if (!ctx) { elCanvas.hidden = true; return; }
      scene = createCoinScene();
      scene.prewarm(16);
      ctl.scene = scene;
      animOn = true;
      ctl.animated = true;
      elCanvas.hidden = false;
      resize();
      if (root.Image) {
        coinImg = new root.Image();
        coinImg.decoding = 'async';
        try { coinImg.fetchPriority = 'high'; } catch (e) { /* navegador sin fetchPriority */ }
        coinImg.onload = function () { coinReady = true; };
        coinImg.onerror = function () { coinReady = false; };   // sin moneda: queda el hoyo
        coinImg.src = COIN_SRC;
      }
      if (splash.style) splash.style.touchAction = 'none';    // arrastrar con el dedo mueve el parallax
      root.addEventListener('pointermove', onPointer, { passive: true });
      ptrOn = true;
      root.addEventListener('deviceorientation', onOrient);
      oriOn = true;
      root.addEventListener('resize', resize);
      resizeOn = true;
      schedule();
    }

    function cleanup(hideIt) {
      if (ctl.destroyed) return;
      ctl.destroyed = true;
      stopScene();
      stopPoll();
      if (safetyId) root.clearTimeout(safetyId);
      safetyId = 0;
      if (unsub) unsub();
      unsub = null;
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

    var lastPhase = null;
    function render() {
      var p = core.pct();
      var ph = core.phase();
      if (elLabel && ph !== lastPhase) { lastPhase = ph; elLabel.textContent = LABELS[ph] || LABELS.html; }
      if (elPct) elPct.textContent = p + ' %';
      if (elFill) elFill.style.width = p + '%';
      if (elBar) elBar.setAttribute('aria-valuenow', String(p));
      for (var i = 0; i < ticks.length; i++) {
        var on = p >= ticks[i].at;
        if (on !== ticks[i].on) { ticks[i].on = on; ticks[i].el.className = on ? 'tick on' : 'tick'; }
      }
      if (!full && p >= 100) { full = true; splash.classList.add('is-full'); }   // destello final de la barra
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

    function goReduced() {
      if (reduced) return;
      reduced = true;
      ctl.reduced = true;
      stopScene();                                           // hoyo estático, sin monedas
    }
    function onMq(e) {
      if (e && e.matches === true) goReduced();
    }
    function onVis() {
      if (ctl.destroyed) return;
      var hidden = !!doc.hidden;
      if (hidden && !paused) {
        paused = true;
        cancelRaf(); stopPoll();
      } else if (!hidden && paused) {
        paused = false;
        lastTs = 0;                                          // sin salto de tiempo al volver
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
      splash.classList.add('is-hiding');                   // las monedas siguen durante el fundido
      if (reduced) { finish(); return; }                   // sin transición: no hay transitionend
      splash.addEventListener('transitionend', onEnd);
      endOn = true;
      safetyId = root.setTimeout(finish, SAFETY_MS);
    }

    try {
      elPct = splash.querySelector('.pct'); elBar = splash.querySelector('.bar');
      elFill = splash.querySelector('.bar > i'); elTip = splash.querySelector('.tip-text');
      elLabel = splash.querySelector('.label');
      elRetry = splash.querySelector('.retry'); elTicks = splash.querySelector('.ticks');
      elHole = splash.querySelector('.hole'); elCanvas = splash.querySelector('.coins');

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
      saveData = !!(nav.connection && nav.connection.saveData);

      var maxAttr = splash.dataset ? Number(splash.dataset.maxMs) : NaN;
      if (isFinite(maxAttr) && maxAttr > 0) root.gcbSplash.configure({ maxMs: maxAttr });

      splash.setAttribute('data-quality', minimal ? 'low' : ctl.quality);
      buildTicks();

      if (elTip) elTip.setAttribute('aria-live', 'off');
      if (elRetry) { elRetry.addEventListener('click', onRetry); retryOn = true; }
      unsub = root.gcbSplash.subscribe(check);
      startPoll();
      // Escena animada solo con movimiento permitido y calidad media/alta (low = 2 capas: hoyo fijo, sin monedas ni chispas).
      var animate = !minimal && !reduced && !saveData && core.layersFor(ctl.quality, reduced) >= 3;
      if (elCanvas) {
        if (animate) startScene();
        else elCanvas.hidden = true;
      }
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

  root.__gcbSplashView = { init: initView, instance: null, holeGeom: holeGeom, createCoinScene: createCoinScene, MAX_COINS: MAX_COINS };
  if (root.document) initView();
})(window);
