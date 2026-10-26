import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, MIN_SLOPE_ACCEL, inSand, isMoving, onMound, onRamp, pitAt, portalAt, quantizeShot, rampAccel, rampHeight, segmentsOf, shotVelocity, step, windmillBlocks } from '../src/game/physics.js';
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

// tira la bola recta al looping a velocidad v y la sigue hasta que sale del carril
function throughLoop(c, l, v) {
  const segs = segmentsOf(c);
  const ball = { x: l.x, z: l.z + l.len / 2 + 0.05, vx: 0, vz: -v };
  let t = 0, flew = false, r;
  do {
    r = step(c, segs, ball, ++t * DT, DT);
    if (ball.track?.fly) flew = true;
  } while (!r.trackExit && t < 120 * 10);
  assert.ok(r.trackExit, `v=${v}: sale del carril`);
  const out = Math.hypot(ball.vx, ball.vz);
  return { passed: ball.z < l.z, out, flew, ball, time: t * DT };
}

test('looping: un solo umbral; si no llega se cae y vuelve despacio por la entrada', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  let threshold = null;
  for (let v = 3; v <= 13.0001; v += 0.1) {
    const r = throughLoop(c, l, v);
    if (r.passed) {
      threshold ??= v;
      assert.ok(r.out > 0.74 * v && r.out < 0.86 * v, `v=${v.toFixed(1)}: pasa perdiendo un 15–25 % (sale a ${r.out.toFixed(2)})`);
      assert.ok(!r.flew, `v=${v.toFixed(1)}: si pasa no se despega`);
    } else {
      assert.equal(threshold, null, `v=${v.toFixed(1)}: por encima del umbral siempre pasa`);
      if (r.flew) assert.ok(r.out <= 0.35 * v, `v=${v.toFixed(1)}: tras caerse sale despacio (${r.out.toFixed(2)})`);
      assert.ok(r.time < 5, `v=${v.toFixed(1)}: no se queda dentro`);
    }
  }
  // hace falta buena potencia, pero no un tiro a tope
  assert.ok(threshold > 6 && threshold < 8.5, `umbral ${threshold}`);
  // justo por debajo del umbral se cae (no resbala pegada al carril)
  assert.ok(throughLoop(c, l, threshold - 0.3).flew);
});

test('looping: si la bola se cae arriba vuelve por la entrada y nunca se queda en el carril', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  const segs = segmentsOf(c);
  for (const v of [2, 4, 5.5, 6.5, 7, 8, 11]) {
    const ball = { x: l.x, z: l.z + l.len / 2 + 0.3, vx: 0, vz: -v };
    let t = 0;
    while (isMoving(ball) && t < 120 * 30) step(c, segs, ball, ++t * DT, DT);
    assert.ok(!ball.track && !isMoving(ball), `v=${v}: la bola se para fuera del carril`);
  }
});

test('looping: el mismo tiro da siempre el mismo resultado, bit a bit', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  for (const v of [6.8, 9]) {
    const a = throughLoop(c, l, v).ball, b = throughLoop(c, l, v).ball;
    assert.deepEqual([a.x, a.z, a.vx, a.vz], [b.x, b.z, b.vx, b.vz]);
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

test('abismo: los agujeros cruzan la pista de pared a pared y cada uno tiene su rampa', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  const xs = c.outline.map((p) => p[0]);
  for (const p of c.pits) {
    assert.ok(p.x - p.w / 2 <= Math.min(...xs) && p.x + p.w / 2 >= Math.max(...xs), 'el agujero ocupa todo el ancho');
    // el labio de una rampa está justo en el borde del agujero
    assert.ok(c.ramps.some((r) => Math.abs(r.z - r.d / 2 - (p.z + p.d / 2)) < 1e-9 && r.dir[1] === -1));
  }
  for (const r of c.ramps) assert.ok(rampAccel(r) >= MIN_SLOPE_ACCEL, 'en la rampa la bola nunca se queda quieta');
  assert.equal(pitAt(c, ...c.tee), -1);
  assert.equal(pitAt(c, ...c.cup), -1);
});

// tiro desde (x, z) hacia -z con potencia p: dónde acaba y qué ha pasado
function abyssShot(c, x, z, p, vx = 0) {
  const segs = segmentsOf(c);
  // parada antes del golpe, como en el juego: ese es el punto de tiro
  const ball = { x, z, vx: 0, vz: 0 };
  step(c, segs, ball, 0, DT);
  Object.assign(ball, { vx, vz: -p * 13 });
  const ev = { fell: false, respawn: false, flew: false };
  for (let t = 1; isMoving(ball) && t < 120 * 30; t++) {
    const r = step(c, segs, ball, t * DT, DT);
    if (r.sunk) return { ...ev, sunk: true, ball };
    ev.fell ||= !!r.fell;
    ev.respawn ||= !!r.respawn;
    ev.flew ||= !!ball.air && ball.air.y > 0.3;
  }
  return { ...ev, ball };
}

test('abismo: sin rampa la bola cae y vuelve al punto de tiro', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  // lejos de la rampa, a cualquier potencia
  for (const p of [0.3, 0.6, 1]) {
    const r = abyssShot(c, 1.6, 9, p);
    assert.ok(r.fell && r.respawn, `p=${p}: cae al agujero`);
    assert.deepEqual([r.ball.x, r.ball.z], [1.6, 9], `p=${p}: vuelve a donde tiró`);
    assert.ok(!isMoving(r.ball));
  }
  // la primera vez, sin haber parado nunca, vuelve a la salida
  const segs = segmentsOf(c);
  const ball = { x: c.tee[0], z: c.tee[1], vx: 2, vz: -10 };
  for (let t = 1; isMoving(ball) && t < 120 * 30; t++) step(c, segs, ball, t * DT, DT);
  assert.deepEqual([ball.x, ball.z], c.tee);
});

test('abismo: por la rampa, flojo vuelve, justo cae y bien fuerte salta', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  const [r] = c.ramps, [pit] = c.pits;
  const weak = abyssShot(c, r.x, r.z + 3, 0.3);
  assert.ok(!weak.fell && weak.ball.z > r.z + r.d / 2, 'flojo: se queda corta y la rampa la devuelve');
  const short = abyssShot(c, r.x, r.z + 3, 0.5);
  assert.ok(short.flew && short.fell && short.respawn, 'a medias: despega pero cae al agujero');
  const good = abyssShot(c, r.x, r.z + 3, 0.75);
  assert.ok(good.flew && !good.fell, 'fuerte: salta el agujero');
  assert.ok(good.ball.z < pit.z - pit.d / 2, 'y para al otro lado');
  assert.deepEqual(rampHeight(c, r.x, r.z), r.h / 2);
});

test('abismo: los laterales altos de la rampa son una pared', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  const [r] = c.ramps;
  const segs = segmentsOf(c);
  // rueda de lado contra la parte alta de la rampa
  const ball = { x: r.x + r.w / 2 + 0.6, z: r.z - r.d / 2 + 0.3, vx: -4, vz: 0 };
  let hit = 0;
  for (let t = 1; t < 60; t++) hit = Math.max(hit, step(c, segs, ball, t * DT, DT).hit);
  assert.ok(hit > 0 && ball.vx > 0, 'rebota');
  assert.ok(!onRamp(c, ball.x, ball.z));
});
