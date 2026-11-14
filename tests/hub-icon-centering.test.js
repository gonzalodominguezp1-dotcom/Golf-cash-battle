import test from 'node:test';
import assert from 'node:assert/strict';
import { icon } from '../src/ui/icons.js';
import { ICON_NUDGE, nudgeVars } from '../src/screens/hubRules.js';
import { iconBounds, pathPoints } from './helpers/svgBounds.js';

// Centro del lienzo: viewBox -1 -1 51 51.
const C = 24.5;
const TOL = 0.12; // la tabla va redondeada a 0,1: el error esperado es <= 0,05
const HUB_ICONS = ['trophy', 'medal', 'skins', 'users', 'map', 'robot', 'gear', 'fullscreen', 'user', 'coins', 'lock', 'chains'];

const offCenter = (name, table = ICON_NUDGE) => {
  const b = iconBounds(icon(name));
  const [dx, dy] = table[name] ?? [0, 0];
  return { x: b.cx + dx - C, y: b.cy + dy - C };
};

test('el dibujo de cada icono del hub queda en el centro exacto de su caja tras aplicar ICON_NUDGE', () => {
  for (const name of HUB_ICONS) {
    const { x, y } = offCenter(name);
    assert.ok(Math.abs(x) <= TOL && Math.abs(y) <= TOL, `${name}: desvío (${x.toFixed(2)}, ${y.toFixed(2)}) > ${TOL}`);
  }
});

test('la tabla cubre todos los iconos del hub y nudgeVars da variables CSS', () => {
  for (const name of HUB_ICONS) assert.ok(name in ICON_NUDGE, name);
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
