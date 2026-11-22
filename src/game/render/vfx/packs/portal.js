// Pack de portal: entrada (se abre), estable (bucle) y salida (colapsa).
// Datos puros y serializables; el runtime los orienta con la normal de la superficie.
// Fases: carga (dir 'in') -> estallido (luz + anillo + chispas) -> volutas suaves -> brasas que se apagan.

export const portalEntrada = {
  id: 'portal-entrada',
  name: 'Portal: apertura',
  family: 'portal',
  duration: 1.4,
  loop: false,
  maxParticles: { low: 24, medium: 40, high: 60 },
  emitters: [
    // anticipación: el aire se pliega hacia el centro antes del estallido
    { cell: 'spark', n: 14, t0: 0, speed: 2.2, spread: 0.9, size: 0.09, life: 0.5, col: 'glow', dir: 'in', drag: 1.2 },
    { cell: 'soft', n: 4, t0: 0, speed: 1, spread: 1, size: 0.5, life: 0.6, col: 'secondary', dir: 'in', drag: 2 },
    // liberación: ráfaga que sale rebotando por la superficie
    { cell: 'spark', n: 16, t0: 0.5, speed: 3.5, spread: 0.8, size: 0.1, life: 0.7, col: 'accent', dir: 'normal', grav: 3 },
    { cell: 'soft', n: 5, t0: 0.5, speed: 1.2, spread: 1, size: 0.4, life: 0.8, col: 'glow', dir: 'normal', drag: 3, grow: 1.6 },
    // sostén: brasas y destellos que dejan el portal listo para el bucle estable
    { cell: 'ember', n: 12, t0: 0.55, speed: 1.1, spread: 0.7, size: 0.08, life: 0.85, col: 'secondary', dir: 'normal', up: 0.8, grav: -0.5 },
    { cell: 'shard', n: 9, t0: 0.7, speed: 0.8, spread: 1, size: 0.06, life: 0.6, col: 'white', dir: 'normal', drag: 2 },
  ],
  rings: [
    { t: 0.5, radius: 1.3, life: 0.6, col: 'glow', orient: 'wall' },
    { t: 0.62, radius: 1.9, life: 0.7, col: 'accent', orient: 'wall' },
  ],
  lights: [{ t: 0.5, radius: 2.2, life: 0.8, col: 'glow', k: 0.9 }],
  flashes: [0.5],
};

export const portalEstable = {
  id: 'portal-estable',
  name: 'Portal: estable',
  family: 'portal',
  duration: 2,
  loop: true,
  maxParticles: { low: 24, medium: 40, high: 52 },
  emitters: [
    // remolino de motas que caen hacia el centro, sin salto al cerrar el bucle (rate × duración entero)
    { cell: 'spark', rate: 12, t0: 0, t1: 2, speed: 1.2, spread: 0.8, size: 0.07, life: 0.9, col: 'glow', dir: 'in', drag: 1 },
    { cell: 'soft', rate: 3, t0: 0, t1: 2, speed: 0.7, spread: 1, size: 0.4, life: 1.2, col: 'secondary', dir: 'in', grow: 0.6, drag: 2 },
    { cell: 'ember', rate: 6, t0: 0, t1: 2, speed: 0.5, spread: 0.6, size: 0.07, life: 1.2, col: 'accent', dir: 'up', grav: -0.3 },
    { cell: 'shard', rate: 5, t0: 0, t1: 2, speed: 0.5, spread: 1, size: 0.06, life: 0.7, col: 'white', dir: 'normal', drag: 2 },
  ],
  rings: [{ t: 0, radius: 1.1, life: 2, col: 'glow', orient: 'floor' }],
  lights: [{ t: 0, radius: 1.6, life: 2, col: 'glow', k: 0.45 }],
};

export const portalSalida = {
  id: 'portal-salida',
  name: 'Portal: colapso',
  family: 'portal',
  duration: 1.2,
  loop: false,
  maxParticles: { low: 24, medium: 40, high: 65 },
  emitters: [
    // implosión rápida: todo se traga hacia el centro (los anillos no pueden encogerse)
    { cell: 'spark', n: 24, t0: 0, speed: 3.5, spread: 0.9, size: 0.09, life: 0.45, col: 'glow', dir: 'in', drag: 0.8 },
    { cell: 'soft', n: 5, t0: 0, speed: 1.5, spread: 1, size: 0.45, life: 0.5, col: 'secondary', dir: 'in', drag: 2 },
    // golpe final: destello, anillo y chispas
    { cell: 'spark', n: 18, t0: 0.45, speed: 3.8, spread: 0.7, size: 0.1, life: 0.6, col: 'accent', dir: 'normal', grav: 4 },
    { cell: 'soft', n: 4, t0: 0.45, speed: 1, spread: 1, size: 0.4, life: 0.7, col: 'white', dir: 'normal', drag: 3, grow: 1.5 },
    { cell: 'ember', n: 8, t0: 0.5, speed: 1, spread: 0.8, size: 0.08, life: 0.7, col: 'secondary', dir: 'normal', up: 0.6, grav: -0.4 },
    { cell: 'shard', n: 6, t0: 0.5, speed: 2.2, spread: 0.9, size: 0.06, life: 0.6, col: 'white', dir: 'normal', grav: 5 },
  ],
  rings: [{ t: 0.45, radius: 1.4, life: 0.7, col: 'accent', orient: 'wall' }],
  lights: [{ t: 0.45, radius: 2, life: 0.7, col: 'white', k: 1 }],
  flashes: [0.45],
};

export default [portalEntrada, portalEstable, portalSalida];
