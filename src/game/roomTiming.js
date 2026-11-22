// Reparto de tiempos de la sala de práctica (tarea F5-A). Pura: no toca la animación, solo cuánto se espera entre pasos.
import { ROOM_MIN_MS } from './loadingFlags.js';

export const SEAT_FIRST_MS = 200;
export const SEAT_MIN_MS = 250;
export const SEAT_SPREAD_MS = 350;
export const LAUNCH_WAIT_MS = 250; // pausa entre el último asiento y la fase «launching»
export const GO_MS = 650; // «¡YA!» hasta empezar la salida
export const LEAVE_MS = 520; // salida animada (search.leave)
export const SEAT_FLOOR_MS = 60; // un asiento nunca va más rápido que esto

/**
 * @param {{players:number, rnd?:()=>number, elapsedMs?:number, minMs?:number}} o
 * @returns {{seatWaits:number[], launchWaitMs:number}} esperas por asiento y hasta «launching».
 * Con minMs > 0 se cumple: elapsedMs + sum(seatWaits) + launchWaitMs + GO_MS + LEAVE_MS >= minMs.
 * Con minMs = 0 son los tiempos originales (mismo orden de llamadas a rnd).
 */
export function roomDelays({ players, rnd = Math.random, elapsedMs = 0, minMs = ROOM_MIN_MS } = {}) {
  const n = Math.max(0, players | 0);
  const base = [];
  for (let i = 0; i < n; i++) base.push(i === 0 ? SEAT_FIRST_MS : SEAT_MIN_MS + rnd() * SEAT_SPREAD_MS);
  if (!(minMs > 0)) return { seatWaits: base, launchWaitMs: LAUNCH_WAIT_MS };
  const tail = LAUNCH_WAIT_MS + GO_MS + LEAVE_MS;
  const baseSum = base.reduce((a, b) => a + b, 0);
  const budget = Math.max(0, minMs - Math.max(0, elapsedMs) - tail);
  let seatWaits = base;
  if (baseSum > budget) {
    const k = baseSum > 0 ? budget / baseSum : 0;
    seatWaits = base.map((w) => Math.max(SEAT_FLOOR_MS, w * k));
  }
  const total = Math.max(0, elapsedMs) + seatWaits.reduce((a, b) => a + b, 0) + tail;
  // si aun así se queda corta (pocos jugadores, base ya corta), el resto va a la pausa previa al «launching»
  const launchWaitMs = LAUNCH_WAIT_MS + Math.max(0, minMs - total);
  return { seatWaits, launchWaitMs };
}
