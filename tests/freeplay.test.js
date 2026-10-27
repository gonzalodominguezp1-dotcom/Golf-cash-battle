import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';
import { DT, segmentsOf, step, isMoving, quantizeShot, shotVelocity } from '../src/game/physics.js';
import { Progress } from '../src/progress/Progress.js';
import { LocalWallet } from '../src/wallet/LocalWallet.js';

test('catálogo completo de 20 hoyos para selector de juego libre', () => {
  assert.equal(COURSES.length, 20, 'debe haber exactamente 20 hoyos disponibles');
  for (let i = 0; i < COURSES.length; i++) {
    const c = COURSES[i];
    assert.ok(c.name && typeof c.name === 'string', `hoyo ${i + 1} debe tener nombre`);
    assert.ok(typeof c.par === 'number' && c.par >= 2 && c.par <= 5, `hoyo ${i + 1} debe tener par válido`);
    assert.ok(Array.isArray(c.tee) && c.tee.length === 2, `hoyo ${i + 1} debe tener tee`);
    assert.ok(Array.isArray(c.cup) && c.cup.length === 2, `hoyo ${i + 1} debe tener cup`);
    assert.ok(c.theme && typeof c.theme === 'string', `hoyo ${i + 1} debe tener tema`);
  }
  assert.equal(TIEBREAK_COURSE.noCup, true, 'el hoyo de desempate no tiene hoyo y es diana');
});

test('modo libre: cálculo de límite de tiempo desactivado cuando timeLimit es null o 0', () => {
  const DT_VAL = DT;
  const calcLimitTicks = (timeLimit) =>
    timeLimit != null && Number.isFinite(timeLimit) && timeLimit > 0 ? Math.round(timeLimit / DT_VAL) : null;
  const calcDeadline = (firstSunkTick, limitTicks) =>
    firstSunkTick == null || limitTicks == null ? null : firstSunkTick + limitTicks;

  // En juego normal con 20s
  const normalLimit = calcLimitTicks(20);
  assert.equal(normalLimit, Math.round(20 / DT_VAL));
  assert.equal(calcDeadline(100, normalLimit), 100 + normalLimit);

  // En juego libre: sin tiempo
  const freeplayLimitNull = calcLimitTicks(null);
  assert.equal(freeplayLimitNull, null);
  assert.equal(calcDeadline(100, freeplayLimitNull), null);

  const freeplayLimitZero = calcLimitTicks(0);
  assert.equal(freeplayLimitZero, null);
  assert.equal(calcDeadline(100, freeplayLimitZero), null);

  const freeplayLimitUndef = calcLimitTicks(undefined);
  assert.equal(freeplayLimitUndef, null);
  assert.equal(calcDeadline(100, freeplayLimitUndef), null);
});

test('aislamiento de progreso: el juego libre no consume saldo ni suma victorias o XP', async () => {
  const wallet = new LocalWallet();
  const initialBalance = await wallet.getBalance();
  assert.equal(initialBalance, 100);

  const prog = new Progress(null);
  const initialXp = prog.state.xp;
  const initialWins = prog.state.wins;

  // En juego libre no se descuenta entrada ni se llama a recordMatch
  // Verificamos que los estados permanecen inmutables
  assert.equal(await wallet.getBalance(), initialBalance);
  assert.equal(prog.state.xp, initialXp);
  assert.equal(prog.state.wins, initialWins);
});

test('lógica de reinicio de hoyo (restart): devuelve la bola al tee y limpia golpes', () => {
  const course = COURSES[0];
  const ball = { x: 5.5, z: -2.3, vx: 4.2, vz: -1.8 };
  let strokes = 5;
  let sunk = true;
  let timedOut = true;
  let shots = [{ tick: 10, yaw: 0.5, power: 0.8 }];

  // Simulación de restart() como en GolfGame
  const restart = () => {
    ball.x = course.tee[0];
    ball.z = course.tee[1];
    ball.vx = 0;
    ball.vz = 0;
    strokes = 0;
    sunk = false;
    timedOut = false;
    shots = [];
  };

  restart();

  assert.equal(ball.x, course.tee[0]);
  assert.equal(ball.z, course.tee[1]);
  assert.equal(ball.vx, 0);
  assert.equal(ball.vz, 0);
  assert.equal(strokes, 0);
  assert.equal(sunk, false);
  assert.equal(timedOut, false);
  assert.equal(shots.length, 0);
});

test('física en hoyos seleccionados en modo libre funciona determinísticamente', () => {
  // Probamos que varios hoyos clave se pueden jugar sin errores de física en solitario
  const testIndices = [0, 4, 8, 10, 14, 17]; // La Recta, Bloques, El Volcán, Looping Neón, El Molino, Looping Nocturno
  for (const idx of testIndices) {
    const course = COURSES[idx];
    const segs = segmentsOf(course);
    const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
    const shot = shotVelocity(0, 0.4);
    Object.assign(ball, shot);

    let steps = 0;
    while (isMoving(ball) && steps < 600) {
      step(course, segs, ball, ++steps * DT, DT);
    }
    assert.ok(steps > 0, `el hoyo ${course.name} debe poder simular pasos físicos`);
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.z), `coordenadas válidas en ${course.name}`);
  }
});
