// Contexto inyectado en las pantallas (plan §3.4). main.js lo crea una vez; los tests pasan dobles.
import { t } from './texts/index.js';
import './texts/common.js';

const noop = () => {};
const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createContext(deps = {}) {
  const hubSceneWatchers = new Set();
  const ctx = {
    backend: null, wallet: null, progress: null, avatar: null, settings: null,
    router: null, scope: null, notifier: null, partyWatch: null,
    sfx: null, notify: noop, icon: null,
    quality: () => 'medium',
    testHole: null,
    hubScene: null,
    legacy: {}, // id de ruta -> función show* de main.js mientras la pantalla no se haya migrado
    ...deps,
    t,
    reducedMotion: deps.reducedMotion || prefersReduced,
    actions: {
      startMatch: noop, startPractice: noop, playFreePlay: noop,
      claimRewards: noop, toggleFullscreen: noop, toggleMute: noop,
      ...(deps.actions || {}),
    },
    // El host da a cada pantalla una COPIA del contexto: la escena del hub (que llega o se libera tarde) se lee y se
    // observa con estas funciones, que apuntan al contexto original.
    getHubScene: () => ctx.hubScene,
    watchHubScene(fn) { hubSceneWatchers.add(fn); return () => hubSceneWatchers.delete(fn); },
    setHubScene(scene) { ctx.hubScene = scene; for (const fn of [...hubSceneWatchers]) { try { fn(scene); } catch { /* un observador roto no frena a los demás */ } } },
  };
  return ctx;
}
