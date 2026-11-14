// Laboratorio de la escena del hub: monta createHubScene y la expone en window.lab.
import { createHubScene, seededRng } from '../src/game/render/hubScene.js';

const p = new URLSearchParams(location.search);
const q = ['low', 'medium', 'high'].includes(p.get('q')) ? p.get('q') : 'medium';
const layer = p.get('layer');
const seed = Number(p.get('seed'));
const info = document.getElementById('info');
window.lab = { scene: null, error: null };

// ?nowebgl=1: simula un navegador sin WebGL para comprobar que la promesa se rechaza.
if (p.get('nowebgl') === '1') {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/i.test(type) ? null : real.call(this, type, ...rest);
  };
}

try {
  const scene = await createHubScene(document.getElementById('scene'), {
    quality: q,
    reducedMotion: false,
    rng: Number.isFinite(seed) && p.has('seed') ? seededRng(seed) : Math.random,
    transparent: !!layer && layer !== 'sky',
  });
  window.lab.scene = scene;
  let layerOk = !!layer;
  if (layer) {
    try { scene.renderLayer(layer); } catch (e) { layerOk = false; info.textContent = 'capa desconocida: ' + layer; console.warn(e.message); }
  }
  await scene.firstFrame.catch(() => {});
  addEventListener('resize', () => { scene.resize(); if (layerOk) scene.renderLayer(layer); });
  // Medición de FPS en reposo, 10 s: cuenta los frames DE LA ESCENA (stats.renderCalls), no los rAF de la página.
  // Con la escena pausada o tapada marca ~0; con la pestaña oculta en algún momento la medida no es válida.
  let measuring = '', busy = false;
  window.lab.measureFps = async () => {
    if (busy) return null;
    busy = true;
    measuring = 'midiendo 10 s…';
    let wasHidden = document.hidden;
    const onVis = () => { if (document.hidden) wasHidden = true; };
    document.addEventListener('visibilitychange', onVis);
    const c0 = scene.stats.renderCalls, t0 = performance.now();
    await new Promise((ok) => setTimeout(ok, 10000));
    const secs = (performance.now() - t0) / 1000;
    document.removeEventListener('visibilitychange', onVis);
    if (document.hidden) wasHidden = true;
    const fps = (scene.stats.renderCalls - c0) / secs;
    const valid = !wasHidden;
    const res = { fps: Number(fps.toFixed(1)), preset: q, width: innerWidth, height: innerHeight, visible: !wasHidden, valid };
    window.lab.lastFps = res;
    measuring = valid
      ? `MEDIA 10 s: ${res.fps} fps (q=${q}, ${innerWidth}x${innerHeight})`
      : `medida NO VÁLIDA (pestaña oculta): ${res.fps} fps (q=${q})`;
    busy = false;
    return res;
  };
  const btn = document.getElementById('measure');
  if (btn && (layer || p.get('capture') === '1')) btn.hidden = true; // fuera de las capturas
  if (btn) btn.onclick = () => window.lab.measureFps();
  setInterval(() => { if (layer && !layerOk) return; info.textContent = `q=${q}${layer ? ' layer=' + layer : ''}\nfps ${scene.stats.fps().toFixed(0)}  calls ${scene.stats.renderCalls}${measuring ? '\n' + measuring : ''}`; }, 500);
} catch (err) {
  window.lab.error = String(err?.message ?? err);
  info.textContent = 'rechazada: ' + window.lab.error;
}
