// Contador de FPS para probar la fluidez en el móvil: ?fps=1 en la URL, o la build
// de prueba con VITE_FPS=1. Muestra la media de FPS del último segundo y el peor fotograma.
export function maybeFpsMeter() {
  let on = import.meta.env.VITE_FPS === '1';
  try { on ||= new URLSearchParams(location.search).get('fps') === '1'; } catch { }
  if (!on) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);transform:translateX(-50%);z-index:99999;padding:3px 8px;border-radius:8px;background:rgba(0,0,0,.7);color:#7CFC9A;font:700 12px/1.2 ui-monospace,monospace;pointer-events:none';
  document.body.append(el);
  let frames = 0, worst = 0, last = performance.now(), t0 = last;
  const tick = (now) => {
    frames++;
    worst = Math.max(worst, now - last);
    last = now;
    if (now - t0 >= 1000) {
      const fps = Math.round((frames * 1000) / (now - t0));
      el.textContent = `${fps} FPS · peor ${Math.round(worst)} ms`;
      el.style.color = fps >= 50 ? '#7CFC9A' : fps >= 30 ? '#FFD23F' : '#FF6B6B';
      frames = 0; worst = 0; t0 = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
