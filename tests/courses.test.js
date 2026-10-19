import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, MIN_SLOPE_ACCEL, inSand, isMoving, portalAt, quantizeShot, segmentsOf, shotVelocity, step } from '../src/game/physics.js';
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
