// Reglas puras de la sala de matchmaking (sin DOM): cuenta atrás, posición de
// los rivales en el radar y frases de ánimo. Se prueban en tests/matchmaking.test.js.

/** Segundos finales en los que la sala entra en modo "urgente" (temblor, destello, tic). */
export const URGENT_SECS = 3;

/**
 * Estado de la cuenta atrás. La duración total no se fija en el cliente: es
 * lo máximo que ha faltado desde que se abrió la sala (si el servidor retrasa
 * el arranque, crece). Así el anillo se adapta a 10 s, 15 s o lo que sea.
 * @param {number} msLeft milisegundos que faltan (puede ser negativo)
 * @param {number} prevTotal duración total vista hasta ahora (0 al empezar)
 */
export function countdownState(msLeft, prevTotal = 0) {
  const left = Math.max(0, Number(msLeft) || 0);
  const total = Math.max(prevTotal || 0, left);
  const secs = Math.ceil(left / 1000);
  return {
    secs,
    total,
    frac: total > 0 ? left / total : 0,
    urgent: secs > 0 && secs <= URGENT_SECS,
    // ritmo del latido: más rápido cuanto menos queda
    beat: secs <= URGENT_SECS ? 0.45 : secs <= 6 ? 0.8 : 1.2,
  };
}

/** Punto del radar de un asiento: ángulo repartido en círculo y radio alterno. */
export function seatBlip(seat, seats) {
  const n = Math.max(1, seats);
  const angle = (seat / n) * Math.PI * 2 - Math.PI / 2 + 0.35;
  const r = seat % 2 ? 0.62 : 0.8;
  return { x: 50 + Math.cos(angle) * r * 50, y: 50 + Math.sin(angle) * r * 50 };
}

const HYPE = {
  live: [
    'Tu rival ya está calentando…',
    'El bote sube con cada jugador',
    'Todos salís a la vez: que no te pillen frío',
    'Cada golpe cuenta. Respira.',
    'El primero en embocar pone el reloj en marcha',
  ],
  local: [
    'Buscando rivales a tu altura…',
    'El bote sube con cada jugador',
    'Tu rival ya está calentando…',
    'Prepara el primer golpe',
  ],
  practice: [
    'Buscando rivales a tu altura…',
    'Calienta el putt: aquí no se pierde nada',
    'Tus rivales simulados ya están en el tee',
    'Prepara el primer golpe',
  ],
};

/** Frases que van rotando bajo el título. */
export const hypeLines = (mode) => HYPE[mode] ?? HYPE.practice;
