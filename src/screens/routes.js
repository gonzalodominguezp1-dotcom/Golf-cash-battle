// Tabla de rutas de las pantallas. Cada ruta carga su archivo por convención (`./<archivo>.js`);
// si el archivo aún no existe, cae al adaptador de legado de main.js (ctx.legacy[id]) o a un marcador.
import { header, bindHeader } from './components.js';
import { t } from './texts/index.js';
import './texts/common.js';

// id de ruta -> archivo de la pantalla en src/screens/ (sin extensión)
const FILES = {
  hub: 'hub', tables: 'tables', achievements: 'achievements', friends: 'friends', ranking: 'ranking',
  skins: 'skins', skin: 'skinInspect', account: 'account', wallet: 'monedero', settings: 'settings', maps: 'maps',
};

// Glob por nombres literales: Vite tolera los que aún no existen (un import() literal fallaría).
export const screenModules = () => import.meta.glob([
  './hub.js', './tables.js', './achievements.js', './friends.js', './ranking.js',
  './skins.js', './skinInspect.js', './account.js', './monedero.js', './settings.js', './maps.js',
]);

// Adaptador de legado o marcador «en construcción». `manages`: la pantalla pinta #app por su cuenta.
function fallbackModule(id) {
  return {
    manages: true,
    async mount(root, ctx, params) {
      const fn = ctx.legacy && ctx.legacy[id];
      if (typeof fn === 'function') {
        await fn(params);
        return { destroy() {} };
      }
      root.innerHTML = `<main class="screen">${header({ title: t('common.underConstruction') })}<p class="scr-state">${t('common.underConstructionText')}</p></main>`;
      bindHeader(root, ctx);
      return { destroy() {} };
    },
  };
}

/**
 * `root` es la pantalla raíz: lleva el hash '#/'. En F1 es 'lobby'; en F3 pasará a 'hub'.
 * La otra de las dos conserva un hash propio para seguir siendo declarable.
 */
export function createRoutes({ root = 'lobby', modules = screenModules() } = {}) {
  const loader = (id) => async () => {
    const file = FILES[id];
    const fromFile = file && modules[`./${file}.js`];
    return fromFile ? fromFile() : fallbackModule(id);
  };
  const r = (id, hash, extra = {}) => ({ id, hash, parent: id === root ? undefined : root, restorable: true, load: loader(id), ...extra });
  return [
    r('hub', root === 'hub' ? '#/' : '#/inicio', { keepAlive: true }),
    r('lobby', root === 'lobby' ? '#/' : '#/lobby'),
    r('tables', '#/mesas'),
    r('achievements', '#/logros'),
    r('friends', '#/amigos'),
    r('ranking', '#/ranking'),
    r('skins', '#/skins'),
    r('skin', '#/skins/:id', { parent: 'skins' }),
    r('account', '#/cuenta/:tab?'),
    r('wallet', '#/monedero'),
    r('settings', '#/ajustes'),
    r('maps', '#/mapas'),
    r('play', '#/jugar', { restorable: false }),
  ];
}
