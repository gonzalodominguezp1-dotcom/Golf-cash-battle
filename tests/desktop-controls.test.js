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

test('ajuste manual de fuerza por arrastre de ratón permite tirar más flojo o más fuerte', () => {
  const h = 800; // altura estándar del viewport
  const dragScale = h * 0.32; // 256px para 100%

  const calcPower = (dy, basePower = 0) => {
    return Math.max(0, Math.min(1, basePower + dy / dragScale));
  };

  // Arrastre hacia abajo (coger impulso)
  const powerHard = calcPower(220); // ~86% de fuerza (tiro fuerte)
  assert.ok(powerHard > 0.8 && powerHard < 0.9, `Fuerza alta esperada ~0.86, obtenida: ${powerHard}`);

  // Reducción de arrastre hacia arriba (rectificación para tirar más flojo)
  const powerSoft = calcPower(40); // ~15% de fuerza (tiro flojo)
  assert.ok(powerSoft > 0.1 && powerSoft < 0.2, `Fuerza baja esperada ~0.15, obtenida: ${powerSoft}`);
  assert.ok(powerSoft < powerHard, 'Mover el ratón hacia arriba debe reducir la fuerza');

  // Cancelación moviendo el ratón por encima del origen
  const powerCancelled = calcPower(-20);
  assert.equal(powerCancelled, 0, 'Arrastrar hacia arriba del origen debe dar fuerza 0');

  // Las velocidades de física reflejan directamente la diferencia de fuerza
  const shotHard = quantizeShot(0, powerHard);
  const shotSoft = quantizeShot(0, powerSoft);
  const velHard = shotVelocity(shotHard.yaw, shotHard.power);
  const velSoft = shotVelocity(shotSoft.yaw, shotSoft.power);

  assert.ok(Math.hypot(velHard.vx, velHard.vz) > Math.hypot(velSoft.vx, velSoft.vz) * 4);
});

test('ajuste fino de potencia mediante rueda de ratón y teclas W/S', () => {
  let power = 0;
  const step = 0.05;

  const adjustPower = (delta) => {
    power = Math.max(0, Math.min(1, Math.round((power + delta) * 100) / 100));
    return power;
  };

  // Subir potencia con W o rueda arriba (+5% cada paso)
  adjustPower(+step); // 0.05
  adjustPower(+step); // 0.10
  adjustPower(+step); // 0.15
  adjustPower(+step); // 0.20
  assert.equal(power, 0.20, 'Potencia tras 4 pasos arriba debe ser 0.20');

  // Bajar potencia con S o rueda abajo (tirar más flojo)
  adjustPower(-step); // 0.15
  assert.equal(power, 0.15, 'Potencia tras 1 paso abajo debe reducir a 0.15');

  // Ajuste a potencia máxima (techo 1.0)
  for (let i = 0; i < 25; i++) adjustPower(+step);
  assert.equal(power, 1.0, 'Potencia no debe exceder 1.0');

  // Ajuste a potencia mínima (suelo 0.0)
  for (let i = 0; i < 30; i++) adjustPower(-step);
  assert.equal(power, 0.0, 'Potencia no debe bajar de 0.0');
});

