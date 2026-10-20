import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRisk, holeSignals } from '../src/antibot/risk.js';
import { quantizeShot, shotVelocity, MAX_SHOT_SPEED, BALL_R } from '../src/game/physics.js';
import { COURSES } from '../src/game/courses.js';

let seed = 98765;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Simulación de jugador humano en escritorio con ratón:
// Tarda entre 1.5s y 4s en apuntar (waits = 180-480 ticks a 120Hz).
// Mantiene clic/espacio para cargar la potencia entre 0.2s y 0.9s (drags = 24-108 ticks).
// Realiza micro-correcciones de apuntado con el ratón (turns = 1-5 giros).
function desktopMouseHuman(n) {
  const pars = COURSES.map((c) => c.par);
  return Array.from({ length: n }, (_, i) => {
    const course = i % COURSES.length;
    const strokes = Math.max(1, pars[course] + Math.round((rng() - 0.45) * 2));
    const waits = Array.from({ length: strokes }, () => 180 + Math.floor(rng() * 320));
    const drags = Array.from({ length: strokes }, () => 24 + Math.floor(rng() * 85));
    const turns = Array.from({ length: strokes }, () => 1 + Math.floor(rng() * 4));
    return {
      course,
      par: pars[course],
      strokes,
      waits,
      drags,
      turns,
    };
  });
}

test('jugador de escritorio con ratón nunca es marcado por el sistema antibot', () => {
  for (let k = 0; k < 15; k++) {
    const holes = desktopMouseHuman(25);
    const result = assessRisk(holes);
    assert.deepEqual(result.flags, [], `Falsos positivos detectados en jugador de ratón: ${result.flags.join(', ')}`);
    assert.equal(result.score, 0);
  }
});

test('señales del hoyo procesan correctamente la telemetría de ratón', () => {
  const replay = {
    waits: [180, 240, 210],
  };
  const mouseAimTelemetry = [
    { d: 45, t: 2 },
    { d: 72, t: 3 },
    { d: 35, t: 1 },
  ];
  const signals = holeSignals(replay, mouseAimTelemetry);
  assert.deepEqual(signals.waits, [180, 240, 210]);
  assert.deepEqual(signals.drags, [45, 72, 35]);
  assert.deepEqual(signals.turns, [2, 3, 1]);
});

test('tiro de ratón se cuantifica de forma determinista para el servidor', () => {
  const rawYaw = 1.23456789;
  const rawPower = 0.654321;
  const shot = quantizeShot(rawYaw, rawPower);
  assert.equal(shot.yaw, 1.2346);
  assert.equal(shot.power, 0.654);

  const vel = shotVelocity(shot.yaw, shot.power);
  assert.ok(Math.abs(vel.vx) <= MAX_SHOT_SPEED);
  assert.ok(Math.abs(vel.vz) <= MAX_SHOT_SPEED);
  const totalSpeed = Math.hypot(vel.vx, vel.vz);
  assert.ok(Math.abs(totalSpeed - shot.power * MAX_SHOT_SPEED) < 0.05);
});

test('cálculo de límites de campo respeta el radio de la bola en escritorio', () => {
  for (const course of COURSES) {
    assert.ok(course.outline.length >= 3);
    assert.ok(course.tee.length === 2);
    assert.ok(course.cup.length === 2);
    const distToCup = Math.hypot(course.cup[0] - course.tee[0], course.cup[1] - course.tee[1]);
    assert.ok(distToCup > BALL_R * 4, `El hoyo ${course.name} tiene el tee demasiado cerca del hoyo`);
  }
});
