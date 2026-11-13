// Contexto inyectado en las pantallas (plan §3.4). main.js lo crea una vez; los tests pasan dobles.
import { t } from './texts/index.js';
import './texts/common.js';

const noop = () => {};
const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createContext(deps = {}) {
  return {
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
  };
}
