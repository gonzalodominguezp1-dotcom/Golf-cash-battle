import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, MIN_SLOPE_ACCEL, inSand, isMoving, onMound, portalAt, quantizeShot, segmentsOf, shotVelocity, step, windmillBlocks } from '../src/game/physics.js';
import { groundHeight, hasRelief } from '../src/game/render/terrain.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES } from '../src/game/courses.js';
import { Bot } from '../src/game/bots.js';
import { THEMES } from '../src/game/themes.js';

const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;

test('los hoyos están bien hechos', () => {
  for (const c of COURSES) {
    assert.ok(THEMES[c.theme], `${c.name}: tema ${c.theme}`);
    for (const s of c.slopes ?? []) {
      // más flojo que el rozamiento la bola se arrastraría sin pararse nunca
      assert.ok(s.accel >= MIN_SLOPE_ACCEL, `${c.name}: pendiente demasiado suave`);
      assert.equal(Math.hypot(...s.dir), 1, `${c.name}: dir unitaria`);
      for (const sand of c.sand) assert.ok(!overlaps(s, sand), `${c.name}: pendiente sobre arena`);
      assert.ok(!inSlope(c, c.cup), `${c.name}: hoyo en pendiente`);
    }
    for (const p of c.portals ?? []) assert.equal(portalAt(c, p.b[0], p.b[1]), -1, `${c.name}: la salida cae en otro portal`);
    assert.ok(!inSlope(c, c.tee), `${c.name}: salida en pendiente`);
  }
});

const inSlope = (c, [x, z]) => (c.slopes ?? []).some((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2);

test('la bola siempre acaba parada (también en pendientes y portales)', () => {
  let s = 12345;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const c of COURSES) {
    const segs = segmentsOf(c);
    const ball = { x: c.tee[0], z: c.tee[1], vx: 0, vz: 0 };
    let tick = 0;
    for (let shot = 0; shot < 60; shot++) {
      const q = quantizeShot(rng() * 6.28 - 3.14, 0.05 + rng() * 0.95);
      Object.assign(ball, shotVelocity(q.yaw, q.power));
      let n = 0;
      do {
        tick++;
        if (step(c, segs, ball, tick * DT, DT).sunk) Object.assign(ball, { x: c.tee[0], z: c.tee[1], vx: 0, vz: 0 });
      } while (isMoving(ball) && ++n < 120 * 30);
      assert.ok(n < 120 * 30, `${c.name}: la bola no se para en ${ball.x.toFixed(2)},${ball.z.toFixed(2)}`);
      assert.ok(!inSand(c, ball.x, ball.z) || !inSlope(c, [ball.x, ball.z]));
    }
  }
});

test('los rivales pueden terminar cada hoyo nuevo', () => {
  let s = 777;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const c of COURSES) {
    const segs = segmentsOf(c);
    let total = 0, sunk = 0;
    for (let i = 0; i < 12; i++) {
      const bot = new Bot({ id: 'b', skill: 0.85 }, c, segs, rng);
      total += bot.finishInstantly(0);
      if (bot.strokes < 8) sunk++;
    }
    assert.ok(total / 12 <= c.par + 2.5, `${c.name}: media ${(total / 12).toFixed(1)} golpes`);
    assert.ok(sunk >= 9, `${c.name}: solo ${sunk}/12 terminan`);
  }
});

test('el servidor repite bien un golpe que cruza el portal', () => {
  const c = COURSES.find((x) => x.portals);
  const [ax, az] = c.portals[0].a;
  const yaw = Math.atan2(ax - c.tee[0], -(az - c.tee[1]));
  let best = null;
  for (let p = 0.3; p <= 1 && !best; p += 0.01) {
    const q = quantizeShot(yaw, p);
    const r = replayHole(c, [{ tick: 10, ...q }], { maxStrokes: 1 });
    if (r.ok && r.distance !== null) {
      const segs = segmentsOf(c);
      const ball = { x: c.tee[0], z: c.tee[1], vx: 0, vz: 0 };
      let crossed = false;
      Object.assign(ball, shotVelocity(q.yaw, q.power));
      for (let t = 11; isMoving(ball) && t < 120 * 30; t++) crossed ||= step(c, segs, ball, t * DT, DT).portal >= 0;
      if (crossed) best = { r, ball };
    }
  }
  assert.ok(best, 'algún golpe cruza el portal');
  assert.ok(best.ball.z < 0, 'sale al otro lado de la pared');
});

// tiro recto desde la salida: dónde para la bola (o null si entra)
function straightShot(c, power, tick0 = 0) {
  const segs = segmentsOf(c);
  const ball = { x: c.tee[0], z: c.tee[1], vx: 0, vz: 0 };
  Object.assign(ball, shotVelocity(c.aimYaw ?? 0, power));
  let crossed = -1;
  for (let t = tick0 + 1; isMoving(ball) && t < tick0 + 120 * 30; t++) {
    const r = step(c, segs, ball, t * DT, DT);
    if (r.sunk) return null;
    if (r.portal >= 0) crossed = r.portal;
  }
  return { ...ball, crossed };
}

test('looping: flojo vuelve atrás, fuerte lo completa', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  const entry = l.z + l.len / 2, exit = l.z - l.len / 2;
  assert.ok(straightShot(c, 0.4).z > entry, 'un tiro flojo vuelve antes del looping');
  const strong = straightShot(c, 0.9);
  assert.ok(strong === null || strong.z < exit, 'un tiro fuerte pasa al otro lado');
  // el looping no levanta el césped
  assert.ok(!hasRelief(c));
  assert.equal(groundHeight(c, l.x, l.z), 0);
});

test('molino: las aspas tapan la puerta según el momento del golpe', () => {
  const c = COURSES.find((x) => x.name === 'Molino Neón');
  const [wm] = c.windmills;
  let blocked = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (windmillBlocks(wm, i * 0.01)) blocked++;
  const share = blocked / N;
  assert.ok(share > 0.25 && share < 0.5, `tapa la puerta el ${(share * 100).toFixed(0)}% del tiempo`);
  // el mismo tiro, en momentos distintos, a veces cruza la puerta y a veces rebota
  const results = new Set();
  for (let tick = 0; tick < 240; tick += 6) {
    const end = straightShot(c, 0.75, tick);
    results.add(end === null || end.z < wm.z - wm.depth ? 'cruza' : 'rebota');
  }
  assert.deepEqual([...results].sort(), ['cruza', 'rebota']);
});

test('tubos: la bola viaja por dentro y sale en la dirección del tubo', () => {
  const c = COURSES.find((x) => x.name === 'Las Tuberías');
  const p = c.portals[0];
  const ball = { x: p.a[0], z: p.a[1] + 1, vx: 0, vz: -4 };
  const segs = segmentsOf(c);
  let t = 1, r = step(c, segs, ball, DT, DT);
  while (r.portal < 0 && t < 240) r = step(c, segs, ball, ++t * DT, DT);
  assert.equal(r.portal, 0);
  assert.equal(ball.track.kind, 'tube');
  const entered = t;
  while (ball.track && t < 1200) r = step(c, segs, ball, ++t * DT, DT);
  assert.ok(r.trackExit, 'sale del tubo');
  assert.ok((t - entered) * DT > 0.3, 'tarda en recorrerlo');
  assert.ok(Math.abs(ball.x - p.b[0]) < 0.05 && Math.abs(ball.z - p.b[1]) < 0.05, 'sale por b');
  assert.ok(ball.vx < -3.5 && ball.vz === 0, 'sale hacia -x con la velocidad que traía');
});

test('looping: si la bola se cae arriba vuelve por la entrada y nunca se queda en el carril', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  const segs = segmentsOf(c);
  // como en un looping de verdad hace falta v ≥ √(5·g·R) en la entrada, algo más por el rozamiento
  const needed = Math.sqrt(5 * 9.8 * l.radius);
  for (const v of [2, 4, 5.5, needed, needed + 1, 11]) {
    const ball = { x: l.x, z: l.z + l.len / 2 + 0.3, vx: 0, vz: -v };
    let t = 0;
    while (isMoving(ball) && t < 120 * 30) step(c, segs, ball, ++t * DT, DT);
    assert.ok(!ball.track && !isMoving(ball), `v=${v}: la bola se para fuera del carril`);
    const passed = ball.z < l.z - l.len / 2;
    assert.equal(passed, v > needed, `v=${v}: ${passed ? 'pasa' : 'vuelve'}`);
  }
});

test('volcán: la ladera echa la bola hacia fuera y la cima es llana', () => {
  const c = COURSES.find((x) => x.name === 'El Volcán');
  const [m] = c.mounds;
  assert.equal(onMound(c, m.x, m.z), null);
  assert.ok(onMound(c, m.x + 2, m.z));
  const ball = { x: m.x + 2, z: m.z, vx: 0, vz: 0 };
  step(c, segmentsOf(c), ball, DT, DT);
  assert.ok(ball.vx > 0 && ball.vz === 0);
  // el relieve que se dibuja: cima arriba, base abajo
  assert.ok(groundHeight(c, ...c.cup) > 1);
  assert.equal(groundHeight(c, ...c.tee), 0);
});
