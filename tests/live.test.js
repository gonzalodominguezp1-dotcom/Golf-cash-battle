import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, isMoving, quantizeShot, segmentsOf, shotVelocity, step } from '../src/game/physics.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES } from '../src/game/courses.js';
import { RemoteBall, cleanShots, mergeShots, newFeed } from '../src/game/remoteBall.js';
import { buildRoster, humanLeaders, liveStandings, roundComplete, roundReady, seededRng } from '../src/match/liveRules.js';

// Juega un hoyo como lo haría alguien: tira hacia el hoyo cuando la bola se para.
function playStraight(course, k, max = 8) {
  const segs = segmentsOf(course);
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  const shots = [];
  let tick = 0, rest = 0, sunk = false;
  while (!sunk && tick < 120 * 120) {
    if (!isMoving(ball) && tick - rest >= 90 && shots.length < max) {
      const yaw = Math.atan2(course.cup[0] - ball.x, -(course.cup[1] - ball.z));
      const d = Math.hypot(course.cup[0] - ball.x, course.cup[1] - ball.z);
      const s = { tick, ...quantizeShot(yaw, Math.min(1, Math.max(0.06, d * k))) };
      Object.assign(ball, shotVelocity(s.yaw, s.power));
      shots.push(s);
    } else if (!isMoving(ball) && shots.length >= max) break;
    const was = isMoving(ball);
    sunk = step(course, segs, ball, (tick + 1) * DT, DT).sunk;
    tick++;
    if (was && !isMoving(ball)) rest = tick;
  }
  return { shots, ball };
}

function runRemote(course, feed, perFrame = () => {}) {
  const rb = new RemoteBall({ id: 'x' }, course, segmentsOf(course), feed);
  let sunkTick = null;
  for (let i = 0; i < 120 * 200 && !rb.done; i++) {
    perFrame(rb, i);
    const r = rb.tick();
    if (r?.sunk) sunkTick = r.sunkTick;
  }
  return { rb, sunkTick };
}

test('la bola remota repite los tiros igual que el servidor', () => {
  const course = COURSES[8];
  const { shots } = playStraight(course, 0.1);
  const server = replayHole(course, shots);
  assert.equal(server.ok, true);
  assert.equal(server.sunk, true);
  const feed = newFeed();
  feed.shots = shots;
  const { rb, sunkTick } = runRemote(course, feed);
  assert.equal(rb.sunk, true);
  assert.equal(rb.strokes, server.strokes);
  assert.equal(sunkTick, server.sunkTick);
});

test('aunque los tiros lleguen de uno en uno y con retraso, el resultado es el mismo', () => {
  const course = COURSES[8];
  const { shots } = playStraight(course, 0.1);
  const server = replayHole(course, shots);
  const feed = newFeed();
  // cada tiro llega 2 s de pantalla después del anterior, la lista entera cada vez
  const { rb, sunkTick } = runRemote(course, feed, (_rb, frame) => {
    const n = Math.min(shots.length, Math.floor(frame / 240) + 1);
    if (n > feed.shots.length) mergeShots(feed, shots.slice(0, n));
  });
  assert.equal(rb.sunk, true);
  assert.equal(rb.strokes, server.strokes);
  assert.equal(sunkTick, server.sunkTick);
});

test('sin embocar: termina cuando llega su resultado; descalificado al momento', () => {
  const course = COURSES[0];
  const { shots } = playStraight(course, 0.02, 1);
  const feed = newFeed();
  feed.shots = shots;
  const rb = new RemoteBall({ id: 'x' }, course, segmentsOf(course), feed);
  for (let i = 0; i < 2000; i++) rb.tick();
  assert.equal(rb.done, false); // espera a su siguiente tiro
  feed.final = { strokes: 8, sunk: false, dq: true, sunkTick: null };
  const r = rb.tick();
  assert.equal(r.finished, true);
  assert.equal(rb.dq, true);
  assert.equal(rb.strokes, 8);
});

test('los tiros que llegan por la red se filtran', () => {
  assert.equal(cleanShots([{ tick: 5, yaw: 1, power: 0.5 }, { tick: 4, yaw: 1, power: 0.5 }]), null);
  assert.equal(cleanShots([{ tick: 5, yaw: 'x', power: 0.5 }]), null);
  assert.equal(cleanShots('nope'), null);
  const feed = newFeed();
  assert.equal(mergeShots(feed, [{ tick: 5, yaw: 1, power: 0.5 }, { tick: 50, yaw: 1, power: 0.5 }]), true);
  // una lista más corta (mensaje viejo) no borra lo que ya se sabe
  assert.equal(mergeShots(feed, [{ tick: 5, yaw: 1, power: 0.5 }]), false);
  assert.equal(feed.shots.length, 2);
});

test('bots de relleno: mismos en todos los móviles y solo en los huecos', () => {
  const match = {
    id: 'abc-123',
    seats: 8,
    players: [
      { id: 'me', seat: 0, name: 'Gonzalo', color: '#ff4d4d' },
      { id: 'e2', seat: 3, name: 'Ana', color: '#3ecf6e' },
    ],
  };
  const a = buildRoster(match);
  const b = buildRoster({ ...match, players: [{ ...match.players[0], id: 'x' }, { ...match.players[1], id: 'me' }] });
  assert.equal(a.length, 8);
  assert.equal(a.filter((r) => r.isBot).length, 6);
  assert.deepEqual(a.filter((r) => r.isBot).map((r) => [r.seat, r.name, r.skill]), b.filter((r) => r.isBot).map((r) => [r.seat, r.name, r.skill]));
  assert.equal(a[0].name, 'Tú');
  assert.equal(a[3].name, 'Ana');
  assert.equal(seededRng('x')(), seededRng('x')());
});

test('marcador: los bots no cuentan para el empate de cabeza', () => {
  const match = {
    id: 'm',
    seats: 3,
    players: [
      { id: 'me', seat: 0, name: 'Yo', scores: [2, 3], total: 5 },
      { id: 'e2', seat: 1, name: 'Ana', scores: [3, 2], total: 5 },
    ],
  };
  const roster = buildRoster(match);
  assert.deepEqual(humanLeaders(match.players, 2).map((p) => p.id), ['me', 'e2']);
  const rows = liveStandings(match, roster, [{ bot2: 1 }, { bot2: 1 }]);
  assert.equal(rows[0].isBot, true);
  assert.equal(rows[0].total, 2);
  assert.equal(rows.find((r) => r.id === 'me').position, 2);
});

test('desempate: no se decide hasta que todos hayan cerrado su ronda (o se desconecten)', () => {
  // A acaba primero: B aún juega el último hoyo, así que A no sabe si empata
  const aWaitsB = [
    { id: 'me', seat: 0, scores: [2, 3], total: 5, online: true },
    { id: 'b', seat: 1, scores: [3], total: 3, online: true },
  ];
  assert.equal(roundReady(aWaitsB, 2), false);
  // B se desconecta: no bloquea a nadie
  aWaitsB[1].online = false;
  assert.equal(roundReady(aWaitsB, 2), true);
  // ambos han cerrado: se decide con los dos totales
  const done = [
    { id: 'me', seat: 0, scores: [2, 3], total: 5, online: true },
    { id: 'b', seat: 1, scores: [2, 3], total: 5, online: true },
  ];
  assert.equal(roundReady(done, 2), true);
  assert.deepEqual(humanLeaders(done, 2).map((p) => p.id), ['me', 'b']);
});

test('desempate: la tarjeta solo lista a quien tiene la ronda cerrada y está empatado en cabeza', () => {
  // A y yo a 50, B aún jugando con 46: B no cuenta todavía y no hay empate con B
  const players = [
    { id: 'me', seat: 0, scores: [25, 25], total: 50, online: true },
    { id: 'a', seat: 1, scores: [25, 25], total: 50, online: true },
    { id: 'b', seat: 2, scores: [23], total: 23, online: true },
  ];
  assert.equal(roundComplete(players[2], 2), false);
  assert.deepEqual(humanLeaders(players, 2).map((p) => p.id), ['me', 'a']);
  // cuando B cierra con 46 gana él y ya no hay empate para ti
  players[2] = { id: 'b', seat: 2, scores: [23, 23], total: 46, online: true };
  assert.deepEqual(humanLeaders(players, 2).map((p) => p.id), ['b']);
});

test('desempate: un jugador terminado en el servidor cuenta como ronda cerrada', () => {
  const players = [
    { id: 'me', seat: 0, scores: [2, 2], total: 4, online: true },
    { id: 'a', seat: 1, scores: [2], total: 4, finished: true, online: false },
  ];
  assert.equal(roundReady(players, 2), true);
  assert.deepEqual(humanLeaders(players, 2).map((p) => p.id), ['me', 'a']);
});
