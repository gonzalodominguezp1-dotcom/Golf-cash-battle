import test from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../src/ui/icons.js';
import { ICON_NUDGE, nudgeVars } from '../src/screens/hubRules.js';
import { iconBounds, pathPoints } from './helpers/svgBounds.js';

// Centro del lienzo: viewBox -1 -1 51 51.
const C = 24.5;
const TOL = 0.12; // la tabla va redondeada a 0,1: el error esperado es <= 0,05
const GEO_TOL = 0.3; // máximo desvío entre la caja geométrica que mide este test y la caja visible medida en píxeles
const HUB_ICONS = ['trophy', 'medal', 'skins', 'users', 'map', 'robot', 'gear', 'fullscreen', 'user', 'coins', 'lock', 'chains'];
const OPTS = { medal: { tone: 'gold' } }; // el hub pinta Logros con la medalla dorada

// Cajas VISIBLES esperadas [minX, minY, maxX, maxY], en unidades del viewBox: píxeles con alfa > 40 del render real (Chrome),
// sin filtros CSS. Este test no puede abrir un navegador, así que compara la caja geométrica con esta tabla.
// Para regenerarla (si cambia un icono de src/ui/icons.js):  node scripts/measure-hub-icons.mjs --json
// y pegar la línea «VISIBLE_BOX»; después actualizar ICON_NUDGE con la línea «ICON_NUDGE» y revisar los márgenes que imprime.
const VISIBLE_BOX = {
  trophy: [5.4, 6.2, 44, 46.2],
  medal: [10.4, 2.4, 39.2, 45.2],
  skins: [4, 4.8, 44.6, 43.2],
  users: [3.6, 9, 45.8, 47.2],
  map: [3.4, 6.2, 45.4, 45.2],
  robot: [2.8, 0, 46.8, 43.8],
  gear: [4.8, 4.8, 44.4, 46],
  fullscreen: [3.4, 4.4, 46, 46.2],
  user: [8, 9, 41.4, 46.8],
  coins: [9.2, 3.8, 41.6, 47.2],
  lock: [7.4, 2.8, 41.8, 46],
  // Las cadenas se salen del lienzo (el recuadro las recorta): en píxeles la caja sería todo el lienzo y no sirve; se fija la
  // caja geométrica y el nudge centra el cruce de la X (comprobado a mano contra los márgenes reales del recuadro, <= 0,4 px).
  chains: [-4.1, -4.1, 54.4, 55.7],
};

const boxOf = (name) => iconBounds(icon(name, OPTS[name] ?? {}));
const offCenter = (name, table = ICON_NUDGE) => {
  const [x0, y0, x1, y1] = VISIBLE_BOX[name];
  const [dx, dy] = table[name] ?? [0, 0];
  return { x: (x0 + x1) / 2 + dx - C, y: (y0 + y1) / 2 + dy - C };
};

test('la caja geométrica medida coincide con la caja visible medida en píxeles (la tabla no se ha quedado vieja)', () => {
  for (const name of HUB_ICONS) {
    const g = boxOf(name);
    const got = [g.minX, g.minY, g.maxX, g.maxY];
    VISIBLE_BOX[name].forEach((v, i) => {
      assert.ok(Math.abs(got[i] - v) <= GEO_TOL, `${name}: lado ${['minX', 'minY', 'maxX', 'maxY'][i]} geométrico ${got[i].toFixed(2)} vs visible ${v} (> ${GEO_TOL}); si cambiaste el icono, regenera con node scripts/measure-hub-icons.mjs --json`);
    });
  }
});

test('la caja visible de cada icono del hub queda en el centro exacto de su recuadro tras aplicar ICON_NUDGE', () => {
  for (const name of HUB_ICONS) {
    const { x, y } = offCenter(name);
    assert.ok(Math.abs(x) <= TOL && Math.abs(y) <= TOL, `${name}: desvío (${x.toFixed(2)}, ${y.toFixed(2)}) > ${TOL}`);
  }
});

test('la tabla cubre todos los iconos del hub y nudgeVars da variables CSS', () => {
  for (const name of HUB_ICONS) assert.ok(name in ICON_NUDGE && name in VISIBLE_BOX, name);
  assert.equal(nudgeVars('medal'), `--nx:${ICON_NUDGE.medal[0]};--ny:${ICON_NUDGE.medal[1]}`);
  assert.equal(nudgeVars('no-existe'), '--nx:0;--ny:0');
});

test('el test puede fallar: anular dx o dy por separado de CUALQUIER icono con |nudge| > tolerancia se detecta', () => {
  let mutants = 0;
  for (const name of HUB_ICONS) {
    for (const axis of [0, 1]) {
      if (Math.abs(ICON_NUDGE[name][axis]) <= TOL) continue; // un nudge dentro de la tolerancia no cambia el veredicto
      const n = [...ICON_NUDGE[name]];
      n[axis] = 0;
      const o = offCenter(name, { ...ICON_NUDGE, [name]: n });
      assert.ok(Math.abs(axis ? o.y : o.x) > TOL, `${name} con ${axis ? 'dy' : 'dx'}=0 debería detectarse`);
      mutants++;
    }
  }
  assert.ok(mutants >= 12, `mutantes probados: ${mutants}`);
  assert.ok(Math.abs(offCenter('users', {}).y) > 2, 'sin tabla, Amigos queda claramente bajo');
});

test('el test puede fallar: una caja visible vieja (icono cambiado 0,5 unidades) o un icono ajeno se detecta', () => {
  const fits = (name, box) => { const g = boxOf(name); return [g.minX, g.minY, g.maxX, g.maxY].every((v, i) => Math.abs(v - box[i]) <= GEO_TOL); };
  for (const name of HUB_ICONS) {
    assert.ok(fits(name, VISIBLE_BOX[name]), `${name} encaja con su caja`);
    for (const i of [0, 1, 2, 3]) {
      const moved = [...VISIBLE_BOX[name]];
      moved[i] += 0.5;
      assert.ok(!fits(name, moved), `${name}: lado ${i} movido 0,5 debería detectarse`);
    }
    const other = HUB_ICONS[(HUB_ICONS.indexOf(name) + 1) % HUB_ICONS.length];
    assert.ok(!fits(name, VISIBLE_BOX[other]), `${name} no puede encajar con la caja de ${other}`);
  }
});

test('el CSS del recuadro mete svg y marca de novedades en UNA celda (si no, el icono queda ~5 px alto)', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/screens/hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-ico > svg,\s*\.hub-ico > \[data-badge\]\s*\{\s*grid-area:\s*1 \/ 1;?\s*\}/);
});

test('el medidor falla ruidosamente ante lo que no sabe medir', () => {
  assert.throws(() => iconBounds('<svg><circle cx="1" cy="1" r="2"/></svg>'), /no sé medir/);
  assert.throws(() => pathPoints('M0 0 X5 5'), /desconocido/);
  assert.throws(() => iconBounds('<svg><path d="M0 0L1 1" transform="scale(2)"/></svg>'), /transform desconocido/);
  assert.throws(() => iconBounds('<svg></svg>'), /sin geometría/);
  // y mide bien lo conocido: relativos, H/V y arcos
  const p = pathPoints('M10 10h5v5a5 5 0 0 1 -5 5Z');
  assert.deepEqual(p.slice(0, 3), [[10, 10], [15, 10], [15, 15]]);
  const arc = pathPoints('M0 0a5 5 0 0 1 10 0'); // semicírculo por arriba o abajo: altura 5
  assert.ok(Math.max(...arc.map(([, y]) => Math.abs(y))) > 4.9);
});
