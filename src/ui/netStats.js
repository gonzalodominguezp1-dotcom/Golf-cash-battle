// Indicador de FPS y latencia del HUD en partida. La latencia es el tiempo de
// ida y vuelta de una petición pequeña al servidor (backend.ping), cada pocos segundos.

const PING_EVERY_MS = 3000;

/** Texto del indicador: «60 FPS · 45 ms» (sin latencia: «60 FPS · — ms»). */
export function formatNetStats(fps, ms) {
  const f = Number.isFinite(fps) ? Math.round(fps) : '—';
  const l = Number.isFinite(ms) ? Math.round(ms) : '—';
  return `${f} FPS · ${l} ms`;
}

/** Color según lo bien que va: verde, amarillo o rojo (lo peor de los dos manda). */
export function netStatsLevel(fps, ms) {
  const bad = (Number.isFinite(fps) && fps < 30) || (Number.isFinite(ms) && ms > 250);
  const meh = (Number.isFinite(fps) && fps < 50) || (Number.isFinite(ms) && ms > 120);
  return bad ? 'bad' : meh ? 'meh' : 'ok';
}

/**
 * Pone en marcha el indicador dentro de `el`. Se para solo cuando `el` sale
 * de la página. `ping`: función que devuelve los ms de ida y vuelta; sin ella
 * (modo sin servidor) la latencia se queda en «—».
 */
export function mountNetStats(el, { ping = null } = {}) {
  let fps = null;
  let ms = null;
  let frames = 0;
  let t0 = performance.now();
  let stopped = false;
  let seen = false; // se para al salir de la página, no antes de entrar
  const gone = () => (el.isConnected ? ((seen = true), false) : seen);
  const paint = () => {
    el.textContent = formatNetStats(fps, ms);
    el.dataset.level = netStatsLevel(fps, ms);
  };
  const tick = (now) => {
    if (stopped) return;
    if (gone()) return stop();
    frames++;
    if (now - t0 >= 1000) {
      fps = (frames * 1000) / (now - t0);
      frames = 0;
      t0 = now;
      paint();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  let iv = null;
  const measure = () => {
    if (stopped) return;
    if (gone()) return stop();
    ping().then((v) => (ms = v), () => (ms = null)).finally(paint);
  };
  if (ping) {
    measure();
    iv = setInterval(measure, PING_EVERY_MS);
  }
  function stop() {
    stopped = true;
    clearInterval(iv);
  }
  paint();
  return stop;
}
