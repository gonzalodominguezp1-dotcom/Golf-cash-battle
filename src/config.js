// Reglas económicas de la plataforma. Todo configurable desde aquí.
export const PLAYERS_PER_MATCH = 8;
export const PLATFORM_COMMISSION = 0.1; // 10% del bote
export const HOLES_PER_MATCH = 3;
export const MAX_STROKES_PER_HOLE = 8;
// cuando el primero emboca, los demás tienen estos segundos; quien no emboque
// queda descalificado en el hoyo y se apunta el máximo de golpes
export const HOLE_TIME_LIMIT = 20;
export const STARTING_DEMO_CREDITS = 100;

export const TIERS = [
  { id: 'practice', name: 'Práctica', entryFee: 0, color: '#7bc96f' },
  { id: 'bronze', name: 'Bronce', entryFee: 1, color: '#cd7f32' },
  { id: 'silver', name: 'Plata', entryFee: 5, color: '#b8c4cc' },
  { id: 'gold', name: 'Oro', entryFee: 10, color: '#f2c94c' },
  { id: 'diamond', name: 'Diamante', entryFee: 25, color: '#6fd3f2' },
  { id: 'emerald', name: 'Esmeralda', entryFee: 50, color: '#2ee59d' },
];

export function potFor(tier) {
  return tier.entryFee * PLAYERS_PER_MATCH;
}

export function prizeFor(tier) {
  return round2(potFor(tier) * (1 - PLATFORM_COMMISSION));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}
