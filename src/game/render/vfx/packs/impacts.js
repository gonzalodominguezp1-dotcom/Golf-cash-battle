// Choques de mundo: pared, bumper y hoyo. Luz primero, luego chispas; volúmenes suaves para el polvo.
// Escala: bola de radio 0.21, paredes de ~0.6 de alto.

export const choquePared = {
  id: 'choque-pared',
  name: 'Choque: pared',
  family: 'impact',
  duration: 0.8,
  loop: false,
  maxParticles: { low: 12, medium: 20, high: 28 },
  emitters: [
    // las chispas salen por la normal y caen: así se ve de qué pared rebotó la bola
    { cell: 'spark', n: 14, t0: 0, speed: 4, spread: 0.5, size: 0.08, life: 0.45, col: 'accent', dir: 'normal', grav: 6 },
    { cell: 'spark', n: 6, t0: 0, speed: 2, spread: 0.9, size: 0.06, life: 0.3, col: 'white', dir: 'normal' },
    { cell: 'soft', n: 4, t0: 0, speed: 1, spread: 1, size: 0.3, life: 0.6, col: 'base', dir: 'normal', drag: 3, grow: 1.4 },
    { cell: 'shard', n: 4, t0: 0.02, speed: 2.5, spread: 0.7, size: 0.07, life: 0.5, col: 'secondary', dir: 'normal', grav: 8 },
  ],
  rings: [{ t: 0, radius: 0.5, life: 0.3, col: 'accent', orient: 'wall' }],
  lights: [{ t: 0, radius: 1, life: 0.25, col: 'accent', k: 0.6 }],
};

export const choqueBumper = {
  id: 'choque-bumper',
  name: 'Choque: bumper',
  family: 'impact',
  duration: 0.9,
  loop: false,
  maxParticles: { low: 16, medium: 26, high: 35 },
  emitters: [
    // pop elástico: más brillo y un abanico más cerrado que el de la pared
    { cell: 'spark', n: 16, t0: 0, speed: 5, spread: 0.35, size: 0.09, life: 0.4, col: 'glow', dir: 'normal', grav: 5 },
    { cell: 'spark', n: 6, t0: 0, speed: 6, spread: 0.15, size: 0.07, life: 0.25, col: 'white', dir: 'normal' },
    { cell: 'soft', n: 3, t0: 0, speed: 0.8, spread: 1, size: 0.35, life: 0.35, col: 'secondary', dir: 'normal', drag: 3, grow: 2 },
    { cell: 'ember', n: 6, t0: 0.05, speed: 1.5, spread: 0.8, size: 0.08, life: 0.6, col: 'accent', dir: 'up', up: 1, grav: 3 },
    { cell: 'shard', n: 4, t0: 0.08, speed: 2, spread: 0.9, size: 0.06, life: 0.5, col: 'white', dir: 'normal', grav: 6 },
  ],
  rings: [
    { t: 0, radius: 0.7, life: 0.35, col: 'glow', orient: 'wall' },
    { t: 0.04, radius: 1, life: 0.5, col: 'accent', orient: 'floor' },
  ],
  lights: [{ t: 0, radius: 1.4, life: 0.3, col: 'glow', k: 0.8 }],
};

export const choqueHoyo = {
  id: 'choque-hoyo',
  name: 'Choque: hoyo',
  family: 'impact',
  duration: 1.6,
  loop: false,
  maxParticles: { low: 24, medium: 40, high: 63 },
  emitters: [
    // la bola cae: remolino que se recoge hacia el hoyo
    { cell: 'spark', n: 14, t0: 0, speed: 2.5, spread: 0.9, size: 0.08, life: 0.5, col: 'glow', dir: 'in' },
    { cell: 'soft', n: 3, t0: 0, speed: 1, spread: 1, size: 0.4, life: 0.5, col: 'secondary', dir: 'in', drag: 2 },
    // fuente de celebración
    { cell: 'spark', n: 20, t0: 0.45, speed: 4, spread: 0.25, size: 0.09, life: 0.8, col: 'accent', dir: 'up', grav: 7 },
    { cell: 'ember', n: 10, t0: 0.45, speed: 2, spread: 0.5, size: 0.08, life: 0.9, col: 'secondary', dir: 'up', grav: 2 },
    { cell: 'coin', n: 6, t0: 0.5, speed: 3.5, spread: 0.3, size: 0.12, life: 1, col: 'white', dir: 'up', grav: 8, spin: 4 },
    { cell: 'soft', n: 4, t0: 0.45, speed: 1.2, spread: 0.4, size: 0.4, life: 0.8, col: 'glow', dir: 'up', drag: 2.5, grow: 1.5 },
    // destellos finales que se apagan despacio
    { cell: 'spark', n: 6, t0: 0.9, speed: 1, spread: 1, size: 0.06, life: 0.6, col: 'white', dir: 'up', grav: 1 },
  ],
  rings: [
    { t: 0.45, radius: 0.9, life: 0.6, col: 'accent', orient: 'floor' },
    { t: 0.65, radius: 1.5, life: 0.8, col: 'glow', orient: 'floor' },
  ],
  lights: [{ t: 0.45, radius: 1.8, life: 0.7, col: 'accent', k: 0.9 }],
};

export default [choquePared, choqueBumper, choqueHoyo];
