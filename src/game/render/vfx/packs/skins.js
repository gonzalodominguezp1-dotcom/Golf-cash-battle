// Efectos de skin, uno por tier. Son bucles de aura: el id lleva el tier (sin campo extra).
// Sin curvas de animación: la variedad sale de varios emisores con distinta tasa, velocidad, gravedad y dir.

// Épico: aura cálida de brasas y esquirlas que orbitan.
export const skinEpicoBrasas = {
  id: 'skin-epico-brasas',
  name: 'Épico: aura de brasas',
  family: 'skin',
  duration: 2.4,
  loop: true,
  maxParticles: { low: 24, medium: 40, high: 54 },
  emitters: [
    { cell: 'ember', rate: 10, t0: 0, t1: 2.4, speed: 0.6, spread: 1, size: 0.08, life: 1.1, col: 'accent', dir: 'normal', up: 0.4, grav: -0.4 },
    { cell: 'shard', rate: 5, t0: 0, t1: 2.4, speed: 0.8, spread: 1, size: 0.06, life: 0.9, col: 'secondary', dir: 'normal', grav: 0.5 },
    { cell: 'spark', rate: 5, t0: 0, t1: 2.4, speed: 0.3, spread: 1, size: 0.05, life: 0.5, col: 'white', dir: 'normal' },
    { cell: 'soft', rate: 2.5, t0: 0, t1: 2.4, speed: 0.4, spread: 1, size: 0.35, life: 1.2, col: 'glow', dir: 'normal', grow: 0.8, drag: 2 },
  ],
  rings: [{ t: 0, radius: 0.45, life: 2.4, col: 'accent', orient: 'floor' }],
};

// Legendario: corona de chispas que sube y una voluta lenta.
export const skinLegendarioCorona = {
  id: 'skin-legendario-corona',
  name: 'Legendario: corona',
  family: 'skin',
  duration: 3,
  loop: true,
  maxParticles: { low: 24, medium: 48, high: 72 },
  emitters: [
    { cell: 'spark', rate: 11, t0: 0, t1: 3, speed: 1, spread: 0.15, size: 0.07, life: 0.8, col: 'accent', dir: 'up', grav: 1 },
    { cell: 'soft', rate: 2, t0: 0, t1: 3, speed: 0.5, spread: 0.2, size: 0.3, life: 1.6, col: 'glow', dir: 'up', grow: 1.5, drag: 2 },
    { cell: 'ember', rate: 7, t0: 0, t1: 3, speed: 0.9, spread: 1, size: 0.07, life: 1.2, col: 'secondary', dir: 'normal', up: 0.3, grav: -0.2 },
    { cell: 'spark', rate: 4, t0: 0, t1: 3, speed: 0.6, spread: 1, size: 0.05, life: 0.6, col: 'white', dir: 'in' },
  ],
  rings: [{ t: 0, radius: 0.6, life: 3, col: 'glow', orient: 'floor' }],
  lights: [{ t: 0, radius: 1.2, life: 3, col: 'glow', k: 0.35 }],
};

// Mítico: singularidad. Todo cae hacia la bola, un pulso hacia fuera y un anillo que late cada vuelta.
export const skinMiticoSingularidad = {
  id: 'skin-mitico-singularidad',
  name: 'Mítico: singularidad',
  family: 'skin',
  duration: 2,
  loop: true,
  maxParticles: { low: 24, medium: 56, high: 80 },
  emitters: [
    { cell: 'spark', rate: 18, t0: 0, t1: 2, speed: 2, spread: 1, size: 0.06, life: 0.7, col: 'glow', dir: 'in' },
    { cell: 'shard', rate: 7, t0: 0, t1: 2, speed: 1.5, spread: 1, size: 0.06, life: 0.8, col: 'secondary', dir: 'in' },
    { cell: 'soft', rate: 4, t0: 0, t1: 2, speed: 1, spread: 1, size: 0.5, life: 1, col: 'base', dir: 'in', drag: 2 },
    { cell: 'spark', rate: 6, t0: 0, t1: 2, speed: 2.5, spread: 1, size: 0.05, life: 0.5, col: 'white', dir: 'normal' },
    { cell: 'ember', rate: 5, t0: 0, t1: 2, speed: 0.6, spread: 0.5, size: 0.07, life: 1.2, col: 'accent', dir: 'up', grav: -0.3 },
  ],
  rings: [
    { t: 0, radius: 1, life: 2, col: 'glow', orient: 'floor' },
    { t: 1, radius: 0.7, life: 1, col: 'secondary', orient: 'floor' },
  ],
  lights: [{ t: 0, radius: 1.6, life: 2, col: 'glow', k: 0.5 }],
};

export default [skinEpicoBrasas, skinLegendarioCorona, skinMiticoSingularidad];
