import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopBlocksBall } from '../src/game/render/course.js';

// Looping de referencia: centro en (0, 0), eje hacia -z, radio 1,2 y semianchura lateral 0,69.
// El anillo vertical está centrado a altura R; la entrada queda en z > 0 y la salida en z < 0.
const LOOP = { x: 0, z: 0, dir: [0, -1], radius: 1.2, halfWidth: 0.69 };

test('loopBlocksBall: cámara detrás del anillo, con la bola al otro lado, lo bloquea', () => {
  const cam = { x: 0, y: 0.5, z: -3 };
  const ball = { x: 0, y: 0.2, z: 1 };
  assert.equal(loopBlocksBall(cam, ball, LOOP), true);
});

test('loopBlocksBall: cámara delante y bola antes del anillo (fuera del segmento) no bloquea', () => {
  const cam = { x: 0, y: 0.5, z: 3 };
  const ball = { x: 0, y: 0.5, z: 2.5 };
  assert.equal(loopBlocksBall(cam, ball, LOOP), false);
});

test('loopBlocksBall: cámara y bola dentro del looping no se tapan entre sí', () => {
  const cam = { x: 0, y: 1.2, z: 0.3 };
  const ball = { x: 0, y: 1.5, z: -0.4 };
  assert.equal(loopBlocksBall(cam, ball, LOOP), false);
});

test('loopBlocksBall: el corte solo cuenta si cae dentro de 0.02 < t < 0.98', () => {
  // El anillo solo toca el segmento en t entre 0.99 y 1.0: la bola está en el borde y no cuenta
  const camEdge = { x: 0, y: 1.2, z: -2.32 };
  const ballEdge = { x: 0, y: 1.2, z: -1.31 };
  assert.equal(loopBlocksBall(camEdge, ballEdge, LOOP), false);

  // Mismo recorrido, pero la bola pasa de largo el anillo: el corte cae a mitad del segmento y sí cuenta
  const ballPast = { x: 0, y: 1.2, z: 0.5 };
  assert.equal(loopBlocksBall(camEdge, ballPast, LOOP), true);

  // El anillo ya está en t < 0.02 (la cámara sale del anillo): no cuenta
  const camInBand = { x: 0, y: 1.2, z: -1.31 };
  const ballOut = { x: 0, y: 1.2, z: -2.31 };
  assert.equal(loopBlocksBall(camInBand, ballOut, LOOP), false);
});

test('loopBlocksBall: fuera de la franja lateral del looping no bloquea', () => {
  const cam = { x: 1.0, y: 0.5, z: -3 };
  const ball = { x: 1.0, y: 0.2, z: 1 };
  assert.equal(loopBlocksBall(cam, ball, LOOP), false);
});
