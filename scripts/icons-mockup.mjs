// Genera la hoja de iconos numerada: 02-DOCS/wiki/juego/iconos/mockup.png
// Uso: node scripts/icons-mockup.mjs   (necesita Playwright con Chromium)
import { createRequire } from 'node:module';
import { icon } from '../src/ui/icons.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = new URL('../02-DOCS/wiki/juego/iconos/mockup.png', import.meta.url).pathname;

export const GROUPS = [
  ['Dinero', [['coin', 'Moneda del saldo'], ['coins', 'Depositar, reclamar'], ['wallet', 'Pestaña Wallet']]],
  ['Navegación', [['flag', 'Jugar · avatar'], ['tee', 'Juego libre'], ['skins', 'Skins'], ['trophy', 'Ranking · ganador'], ['user', 'Cuenta · perfil']]],
  ['Acciones', [['play', 'Jugar hoyo · reanudar'], ['next', 'Siguiente'], ['back', 'Volver · lobby'], ['restart', 'Reiniciar · revancha'], ['map', 'Elegir mapa'], ['eye', 'Ver mapa'], ['check', 'Aceptar · listo'], ['close', 'Cerrar · rechazar'], ['plus', 'Añadir · saldo +'], ['trash', 'Quitar'], ['pencil', 'Cambiar nombre'], ['upload', 'Subir imagen'], ['logout', 'Salir · cerrar sesión'], ['hourglass', 'Buscando rivales']]],
  ['Ajustes', [['gear', 'Ajustes'], ['fullscreen', 'Pantalla completa'], ['sound', 'Sonido'], ['mute', 'Silencio'], ['lock', 'Bloqueado'], ['shield', 'Verificar identidad']]],
  ['Social', [['users', 'Grupo / amigos (sin uso)'], ['user-plus', 'Invitar · añadir amigo']]],
  ['Peligros del campo', [['fire', 'Lava · avatar'], ['drop', 'Agua'], ['palm', 'Fuera del campo'], ['pit', 'Agujero']]],
  ['Rarezas de skin', [['dot', 'Común', 'gray'], ['diamond', 'Poco común', 'green'], ['triangle', 'Rara', 'blue'], ['pentagon', 'Épica', 'purple'], ['star', 'Legendaria · avatar', 'gold'], ['sparkle', 'Mítica · patrón raro', 'red']]],
  ['Podio', [['medal', '1.º', 'gold', 1], ['medal', '2.º', 'silver', 2], ['medal', '3.º', 'bronze', 3]]],
  ['Avatares', [['clubs', 'Palos de golf'], ['crown', 'Corona'], ['bolt', 'Rayo'], ['skull', 'Calavera'], ['dragon', 'Dragón'], ['wolf', 'Lobo'], ['eagle', 'Águila'], ['robot', 'Robot'], ['gem', 'Gema']]],
];

let n = 0;
const html = `<!doctype html><meta charset="utf-8"><style>
body{background:#111722;color:#cbd5e1;font:13px system-ui,sans-serif;margin:24px;width:1152px}
h1{font-size:22px;color:#fff;margin:0 0 4px}p{margin:0 0 12px;color:#8492a6}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#ffd447;margin:18px 0 8px}
.g{display:flex;flex-wrap:wrap;gap:10px}
.c{width:118px;height:132px;position:relative;background:#182030;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.c svg{width:64px;height:64px}.c b{position:absolute;top:6px;left:8px;color:#ffd447;font-size:13px}
.c span{color:#fff;font-weight:600}.c small{color:#8492a6;font-size:11px;text-align:center;padding:0 4px}
</style><h1>Iconos de Golf Cash Battle</h1><p>Estilo dibujado a mano en 3D · src/ui/icons.js · indica los números que quieras quitar</p>`
  + GROUPS.map(([title, items]) => `<h2>${title}</h2><div class="g">${items.map(([name, use, tone, arg]) => `<div class="c"><b>${++n}</b>${icon(name, { tone, arg })}<span>${name}</span><small>${use}</small></div>`).join('')}</div>`).join('');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.screenshot({ path: OUT, fullPage: true });
await b.close();
console.log(`${n} iconos → ${OUT}`);
