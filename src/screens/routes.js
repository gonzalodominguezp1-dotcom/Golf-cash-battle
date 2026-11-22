// Tabla de rutas de las pantallas. Cada ruta carga su archivo por convención (`./<archivo>.js`);
// si el archivo aún no existe, cae a un marcador «en construcción».
import { header, bindHeader } from './components.js';
import { t } from './texts/index.js';
import './texts/common.js';

// id de ruta -> archivo de la pantalla en src/screens/ (sin extensión)
const FILES = {
  hub: 'hub', tables: 'tables', achievements: 'achievements', friends: 'friends', ranking: 'ranking',
  skins: 'skins', skin: 'skinInspect', account: 'account', wallet: 'monedero', settings: 'settings', maps: 'maps',
  matchmaking: 'matchmaking', novedades: 'novedades',
};

// Glob por nombres literales: Vite tolera los que aún no existen (un import() literal fallaría).
export const screenModules = () => import.meta.glob([
  './hub.js', './tables.js', './achievements.js', './friends.js', './ranking.js',
  './skins.js', './skinInspect.js', './account.js', './monedero.js', './settings.js', './maps.js',
  './matchmaking.js', './novedades.js',
]);

// Marcador «en construcción» para una ruta sin archivo. `manages`: la pantalla pinta #app por su cuenta.
function fallbackModule() {
  return {
    manages: true,
    async mount(root, ctx) {
      root.innerHTML = `<main class="screen">${header({ title: t('common.underConstruction') })}<p class="scr-state">${t('common.underConstructionText')}</p></main>`;
      bindHeader(root, ctx);
      return { destroy() {} };
    },
  };
}

/**
 * `root` es la pantalla raíz: lleva el hash '#/'. Por defecto es 'hub' (la pantalla de inicio).
 * La otra de las dos conserva un hash propio para seguir siendo declarable.
 */
export function createRoutes({ root = 'hub', modules = screenModules() } = {}) {
  const loader = (id) => async () => {
    const file = FILES[id];
    const fromFile = file && modules[`./${file}.js`];
    return fromFile ? fromFile() : fallbackModule();
  };
  const r = (id, hash, extra = {}) => ({ id, hash, parent: id === root ? undefined : root, restorable: true, load: loader(id), ...extra });
  return [
    r('hub', root === 'hub' ? '#/' : '#/inicio', { keepAlive: true }),
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
    r('novedades', '#/novedades'),
    r('matchmaking', '#/emparejar', { restorable: false }), // sin sesión abierta no tiene nada que mostrar al recargar
  ];
}
