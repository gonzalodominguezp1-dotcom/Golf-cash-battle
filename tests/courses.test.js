import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL_R, DT, LOOP_LANE, LOOP_PAD, MIN_SLOPE_ACCEL, inLava, inPit, inSand, isMoving, onMound, onRamp, portalAt, quantizeShot, rampAccel, segmentsOf, shotVelocity, step, windmillBlocks } from '../src/game/physics.js';
import { ballPose } from '../src/game/render/terrain.js';
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
    assert.ok(!inLava(c, ...c.tee) && !inLava(c, ...c.cup), `${c.name}: salida u hoyo en la lava`);
    for (const r of c.ramps ?? []) {
      // como las pendientes: la bola nunca se queda quieta en la rampa
      assert.ok(rampAccel(r) >= MIN_SLOPE_ACCEL, `${c.name}: rampa demasiado suave`);
      assert.equal(Math.hypot(...r.dir), 1, `${c.name}: dir unitaria`);
    }
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
      if (bot.strokes < (c.maxStrokes ?? 8)) sunk++;
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

// tira la bola desde (x, z) hacia -z a velocidad v y la sigue hasta que se para o emboca
function loopRoll(c, x, z, v) {
  const segs = segmentsOf(c);
  const ball = { x, z, vx: 0, vz: -v };
  let entered = false;
  for (let t = 1; isMoving(ball) && t < 120 * 30; t++) {
    const r = step(c, segs, ball, t * DT, DT);
    if (ball.track) entered = true;
    if (r.sunk) return { sunk: true, entered };
  }
  return { ...ball, entered };
}

test('looping: flojo vuelve atrás, fuerte lo completa (por el carril de entrada)', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  const laneX = l.x + LOOP_LANE; // dir (0, -1): la derecha es +x
  const entry = l.z + LOOP_PAD, exit = l.z - LOOP_PAD;
  const weak = loopRoll(c, laneX, l.z + 3, 6);
  assert.ok(weak.entered && weak.z > entry, 'un tiro flojo sube, vuelve y sale por la entrada');
  const strong = loopRoll(c, laneX, l.z + 3, 11);
  assert.ok(strong.sunk || strong.z < exit, 'un tiro fuerte pasa al otro lado');
  // el looping no levanta el césped
  assert.ok(!hasRelief(c));
  assert.equal(groundHeight(c, l.x, l.z), 0);
});

test('looping: fuera del carril de entrada la bola choca con la estructura y no entra', () => {
  const c = COURSES.find((x) => x.name === 'Looping Neón');
  const [l] = c.loops;
  // por la izquierda (bajo el carril de salida), por el centro y rozando el bordillo
  for (const dx of [-0.5, -0.2, 0, 0.65]) {
    const r = loopRoll(c, l.x + dx, l.z + 3, 11);
    assert.ok(!r.sunk && !r.entered, `dx=${dx}: no entra en el looping`);
    assert.ok(r.z > l.z, `dx=${dx}: rebota hacia atrás`);
  }
  // centrada en el carril (aunque algo desviada) sí entra
  for (const dx of [0.2, 0.36, 0.5]) assert.ok(loopRoll(c, l.x + dx, l.z + 3, 11).entered, `dx=${dx}: entra`);
});

test('molino: las aspas tapan la puerta según el momento del golpe', () => {
  const c = COURSES.find((x) => x.name === 'El Molino del Prado');
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
  const ball = { x: l.x + LOOP_LANE, z: l.z + LOOP_PAD + 0.05, vx: 0, vz: -v };
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
      // sale por el carril de salida, a la izquierda
      assert.ok(r.ball.x < l.x, `v=${v.toFixed(1)}: sale por la izquierda`);
    } else {
      assert.equal(threshold, null, `v=${v.toFixed(1)}: por encima del umbral siempre pasa`);
      if (r.flew) assert.ok(r.out <= 0.4 * v, `v=${v.toFixed(1)}: tras caerse sale despacio (${r.out.toFixed(2)})`);
      // vuelve por el carril de entrada, a la derecha
      assert.ok(r.ball.x > l.x, `v=${v.toFixed(1)}: vuelve por la entrada`);
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
    const ball = { x: l.x + LOOP_LANE, z: l.z + LOOP_PAD + 0.3, vx: 0, vz: -v };
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

test('montículo: la ladera echa la bola hacia fuera y la cima es llana', () => {
  const c = COURSES.find((x) => x.name === 'El Molino del Prado');
  const [m] = c.mounds;
  const r = (m.top + m.base) / 2; // a mitad de la ladera
  assert.equal(onMound(c, m.x, m.z), null);
  assert.ok(onMound(c, m.x + r, m.z));
  const ball = { x: m.x + r, z: m.z, vx: 0, vz: 0 };
  step(c, segmentsOf(c), ball, DT, DT);
  assert.ok(ball.vx > 0 && ball.vz === 0);
  // el relieve que se dibuja: cima arriba, base abajo
  assert.ok(groundHeight(c, m.x, m.z) > groundHeight(c, m.x + m.base * 2, m.z));
  assert.equal(groundHeight(c, ...c.tee), 0);
});

// tiro recto desde (x, z) hacia -z: eventos y dónde para
function rollFrom(c, x, z, v) {
  const segs = segmentsOf(c);
  const ball = { x, z, vx: 0, vz: -v };
  const ev = { launch: false, lava: null, maxY: 0 };
  let t = 0;
  while (isMoving(ball) && t < 120 * 30) {
    const r = step(c, segs, ball, ++t * DT, DT);
    ev.launch ||= !!r.launch;
    ev.lava ??= r.lava ?? null;
    ev.maxY = Math.max(ev.maxY, ballPose(c, ball).y);
  }
  return { ball, ...ev };
}

test('dentro del volcán: la lava devuelve la bola al sitio del golpe', () => {
  const c = COURSES.find((x) => x.name === 'Dentro del Volcán');
  // entre la rampa y la lava del centro, directo al río del brazo izquierdo
  const r = rollFrom(c, -2.1, 4.8, 6);
  assert.ok(r.lava, 'cae en la lava');
  assert.ok(inLava(c, ...r.lava));
  assert.deepEqual([r.ball.x, r.ball.z, r.ball.vx, r.ball.vz], [-2.1, 4.8, 0, 0]);
  assert.ok(!r.ball.from && !r.ball.air);
  // por el puente de roca se cruza sin quemarse
  const bridge = rollFrom(c, -5.7, 6.4, 7);
  assert.equal(bridge.lava, null);
  assert.ok(bridge.ball.z < 1.8, 'cruza el puente');
});

test('dentro del volcán: la rampa hace saltar el río; flojo vuelve rodando', () => {
  const c = COURSES.find((x) => x.name === 'Dentro del Volcán');
  const [r1] = c.ramps;
  const foot = r1.z + r1.d / 2 + 0.6;
  // sin fuerza no llega arriba: rueda hacia atrás y se para fuera de la rampa
  const weak = rollFrom(c, r1.x, foot, 2.5);
  assert.ok(!weak.launch && !weak.lava);
  assert.ok(!onRamp(c, weak.ball.x, weak.ball.z) && weak.ball.z > r1.z);
  // con fuerza vuela por encima de la lava y sigue brazo abajo
  const jump = rollFrom(c, r1.x, foot, 7.5);
  assert.ok(jump.launch, 'despega');
  assert.equal(jump.lava, null, 'no se quema');
  assert.ok(jump.ball.z < 1.9, `cae pasado el río (${jump.ball.z.toFixed(2)})`);
  assert.ok(jump.maxY > r1.h + 0.2, 'se ve volar');
  // a medio gas despega pero cae dentro del río
  const short = rollFrom(c, r1.x, foot, 4.6);
  assert.ok(short.launch && short.lava);
});

// golpe desde (x, z) con la física completa del hoyo (aspas incluidas)
function shotFrom(c, x, z, yaw, power) {
  const segs = segmentsOf(c);
  const ball = { x, z, vx: 0, vz: 0 };
  Object.assign(ball, shotVelocity(yaw, power));
  const ev = { portal: -1, lava: null, launch: false, sunk: false };
  let t = 0;
  while (isMoving(ball) && t < 120 * 40) {
    const r = step(c, segs, ball, ++t * DT, DT);
    if (r.portal >= 0) ev.portal = r.portal;
    ev.lava ??= r.lava ?? null;
    ev.launch ||= !!r.launch;
    ev.sunk ||= r.sunk;
  }
  return { ball, ...ev };
}

test('dentro del volcán: la cueva de fuera cae dentro, entre las dos rampas', () => {
  const c = { ...COURSES.find((x) => x.name === 'Dentro del Volcán'), spinners: [] };
  // la salida está en el sendero elevado, por encima de la cámara
  assert.equal(groundHeight(c, ...c.tee), c.tiers[0].h);
  assert.equal(groundHeight(c, ...c.cup), 0);
  const ends = new Set();
  for (const p of [0.6, 0.8, 1]) {
    const r = shotFrom(c, ...c.tee, 0, p);
    assert.equal(r.portal, 0, `p=${p}: entra en la cueva`);
    ends.add(`${r.ball.x.toFixed(3)},${r.ball.z.toFixed(3)}`);
  }
  // el tobogán suelta la bola siempre igual: delante de la rampa y en la del atajo
  assert.equal(ends.size, 1);
  const [x, z] = [...ends][0].split(',').map(Number);
  const [rampA, shortcut] = c.ramps;
  assert.ok(Math.abs(x - rampA.x) < 0.3 && z > rampA.z + rampA.d / 2, 'delante de la rampa del río');
  assert.ok(Math.abs(z - shortcut.z) < 0.3 && x < shortcut.x - shortcut.w / 2, 'en línea con la rampa del atajo');
});

test('dentro del volcán: el atajo cruza la U de un salto', () => {
  const c = COURSES.find((x) => x.name === 'Dentro del Volcán');
  const sideways = (p) => shotFrom(c, -3.4, 6.2, Math.PI / 2, p);
  // flojo cae en la lava del centro; bien, aterriza en el brazo derecho
  assert.ok(sideways(0.4).lava || !sideways(0.4).launch);
  const ok = sideways(0.65);
  assert.ok(ok.launch && !ok.lava, 'salta la lava del centro');
  assert.ok(ok.ball.x > 1.5, `aterriza en el otro brazo (${ok.ball.x.toFixed(2)})`);
});

test('dentro del volcán: el servidor repite igual la cueva, los saltos y la lava', () => {
  const c = COURSES.find((x) => x.name === 'Dentro del Volcán');
  for (const p of [0.7, 0.8, 0.95]) {
    const shots = [{ tick: 10, ...quantizeShot(0, p) }, { tick: 2400, ...quantizeShot(Math.PI / 2, 0.65) }];
    const a = replayHole(c, shots, { maxStrokes: 2 }), b = replayHole(c, structuredClone(shots), { maxStrokes: 2 });
    assert.ok(a.ok, `p=${p}: ${a.reason}`);
    assert.deepEqual(a, b);
  }
});

test('abismo: los agujeros cruzan la pista de pared a pared y cada uno tiene su rampa', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  const xs = c.outline.map((p) => p[0]);
  for (const { poly } of c.pits) {
    const px = poly.map((p) => p[0]), pz = poly.map((p) => p[1]);
    assert.ok(Math.min(...px) <= Math.min(...xs) && Math.max(...px) >= Math.max(...xs), 'ocupa todo el ancho');
    // el labio de una rampa (hacia -z) está en el borde de arriba del agujero
    assert.ok(c.ramps.some((r) => r.dir[1] === -1 && Math.abs(r.z - r.d / 2 - Math.max(...pz)) < 1e-9));
  }
  assert.ok(!inPit(c, ...c.tee) && !inPit(c, ...c.cup));
});

test('abismo: sin rampa la bola cae y vuelve al sitio del golpe', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  for (const v of [4, 8, 13]) {
    const r = rollFrom(c, 1.6, 9, v);
    assert.ok(r.lava && inPit(c, ...r.lava), `v=${v}: cae al agujero`);
    assert.deepEqual([r.ball.x, r.ball.z], [1.6, 9], `v=${v}: vuelve a donde tiró`);
  }
});

test('abismo: por la rampa, flojo vuelve, a medias cae y bien fuerte salta', () => {
  const c = COURSES.find((x) => x.name === 'El Abismo');
  const [r] = c.ramps;
  const [x, z] = c.tee;
  const weak = rollFrom(c, x, z, 0.4 * 13);
  assert.ok(!weak.launch && !weak.lava && weak.ball.z > r.z + r.d / 2, 'flojo: la rampa la devuelve');
  const short = rollFrom(c, x, z, 0.6 * 13);
  assert.ok(short.launch && short.lava, 'a medias: despega pero cae al agujero');
  const good = rollFrom(c, x, z, 0.78 * 13);
  assert.ok(good.launch && !good.lava, 'fuerte: salta el agujero');
  assert.ok(good.ball.z < Math.min(...c.pits[0].poly.map((p) => p[1])), 'y para al otro lado');
});

// tira la bola hacia -z desde (x, z) con velocidad v y cuenta lo que pasa en el hoyo
function rollAtCup(c, x, z, v) {
  const segs = segmentsOf(c);
  const ball = { x, z, vx: 0, vz: -v };
  const ev = { sunk: false, lip: false, hop: false, minY: Infinity };
  let t = 0;
  while (isMoving(ball) && t < 120 * 20) {
    const r = step(c, segs, ball, ++t * DT, DT);
    ev.sunk ||= r.sunk;
    ev.lip ||= !!r.lip;
    ev.hop ||= !!ball.air;
    ev.minY = Math.min(ev.minY, ballPose(c, ball).y);
  }
  return { ball, ...ev };
}

test('hoyo con borde: despacio entra, fuerte rebota en el canto y se sale', () => {
  const c = COURSES.find((x) => x.realCup);
  const [hx, hz] = c.cup;
  for (const v of [1, 2, 3]) assert.ok(rollAtCup(c, hx, hz + 0.3, v).sunk, `v=${v}: entra por el centro`);
  for (const v of [5, 6]) {
    const r = rollAtCup(c, hx, hz + 0.3, v);
    assert.ok(!r.sunk && r.lip && r.hop, `v=${v}: choca con el borde, bota y no entra`);
    assert.ok(r.ball.z < hz - 0.4, `v=${v}: sigue de largo`);
  }
  // rozando el borde solo entra muy despacio: si no, la bola gira y se sale
  assert.ok(!rollAtCup(c, hx + 0.2, hz + 0.3, 2.5).sunk);
  // se ve caer dentro de la boca
  assert.ok(rollAtCup(c, hx, hz + 0.3, 2).minY < BALL_R - 0.05);
  // el mismo tiro da siempre lo mismo
  const a = rollAtCup(c, hx + 0.1, hz + 0.3, 4.2).ball, b = rollAtCup(c, hx + 0.1, hz + 0.3, 4.2).ball;
  assert.deepEqual([a.x, a.z, a.vx, a.vz], [b.x, b.z, b.vx, b.vz]);
});

test('el templo: cada rampa salta su río; floja vuelve y a medias cae al agua', () => {
  const c = COURSES.find((x) => x.name === 'El Templo de la Selva');
  for (const r of c.ramps) {
    const foot = r.z + r.d / 2 + 0.5;
    const weak = rollFrom(c, r.x, foot, 3);
    assert.ok(!weak.launch && !weak.lava, `rampa ${r.x}: floja no despega`);
    const short = rollFrom(c, r.x, foot, 4);
    assert.ok(short.launch && short.lava, `rampa ${r.x}: a medias cae al río`);
    const ok = rollFrom(c, r.x, foot, 6);
    assert.ok(ok.launch && !ok.lava && ok.ball.z < r.z - r.d / 2 - 0.8, `rampa ${r.x}: salta a la calle de arriba`);
  }
  // el agua devuelve la bola al sitio del golpe y avisa de que es agua
  const segs = segmentsOf(c);
  const ball = { x: -4, z: 12, vx: 0, vz: -6 };
  let r, t = 0;
  do r = step(c, segs, ball, ++t * DT, DT);
  while (!r.lava && t < 600);
  assert.ok(r.water && r.lava);
  assert.deepEqual([ball.x, ball.z], [-4, 12]);
  // es un hoyo largo: más golpes permitidos que en el resto
  assert.ok(c.par >= 10 && c.par <= 15 && c.maxStrokes > c.par + 4);
});
