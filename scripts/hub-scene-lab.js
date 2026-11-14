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
  setInterval(() => { if (layer && !layerOk) return; info.textContent = `q=${q}${layer ? ' layer=' + layer : ''}\nfps ${scene.stats.fps().toFixed(0)}  calls ${scene.stats.renderCalls}`; }, 500);
} catch (err) {
  window.lab.error = String(err?.message ?? err);
  info.textContent = 'rechazada: ' + window.lab.error;
}
