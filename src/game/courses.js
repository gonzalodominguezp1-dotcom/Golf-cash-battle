// Cada hoyo: contorno (polígono cerrado de paredes), paredes internas,
// setas, arena, aspas giratorias, aceleradores, bloques móviles, pendientes,
// montículos, loopings, molinos, portales y tubos (portales con salida
// dirigida). Solo se añaden hoyos al final: el servidor guarda el índice.
// Coordenadas en el plano del suelo (x, z); -z es "hacia delante".
// waypoints: puntos de paso que usan los rivales para rodear paredes.
// Un looping: la bola entra por un extremo (a lo largo de dir) y va por un
// carril que da una vuelta de radio radius mientras avanza len por el suelo.
// Si no llega con fuerza arriba, se cae y vuelve por donde ha entrado.
// Un molino: casa que cruza la pista con una puerta de ancho w (a lo largo de
// x) y aspas delante (del lado face) que tapan la puerta al pasar por abajo.
function windmill({ x, z, w = 0.9, depth = 1.4, face = 1, left, right, speed, blades = 4, phase = 0 }) {
  const back = z - face * depth, l = x - w / 2, r = x + w / 2;
  const walls = [
    [[left, z], [l, z]], [[r, z], [right, z]],
    [[l, z], [l, back]], [[r, z], [r, back]],
    [[left, back], [l, back]], [[r, back], [right, back]],
  ];
  return { windmill: { x, z, w, depth, face, left, right, speed, blades, phase, gateZ: z + face * 0.3 }, walls };
}

// Una rampa de salto: sube h a lo largo de dir (solo ejes) y lleva paredes a
// los lados, así solo se entra por el pie. Al pasar por el labio la bola vuela
// con salida lift (tangente del ángulo: el labio es un trampolín).
function ramp({ x, z, w = 1.7, d = 1.6, dir = [0, -1], h = 0.32, lift = 0.42 }) {
  const along = dir[0] !== 0;
  const hw = along ? d / 2 : w / 2, hl = along ? w / 2 : d / 2;
  // lados: paralelos a dir, a hw del centro
  const sx = along ? 0 : hw, sz = along ? hw : 0, lx = dir[0] * hl, lz = dir[1] * hl;
  const walls = [
    [[x - sx - lx, z - sz - lz], [x - sx + lx, z - sz + lz]],
    [[x + sx - lx, z + sz - lz], [x + sx + lx, z + sz + lz]],
  ];
  return { ramp: { x, z, w, d, dir, h, lift }, walls };
}

// Dentro del Volcán: se sale en un sendero de la ladera, la cueva lleva por un
// tubo de lava que cae dentro, a una cámara en U con lava en medio. Al caer la
// bola queda entre dos rampas: la de delante salta el río del brazo izquierdo
// (el camino largo, por abajo) y la de la derecha cruza la U de un salto (atajo).
const VOLCANO_RAMP_A = ramp({ x: -3.4, z: 4.2 });
const VOLCANO_SHORTCUT = ramp({ x: -2.15, z: 6.2, w: 1.6, d: 1.7, dir: [1, 0] });
const VOLCANO_RAMP_B = ramp({ x: 3.4, z: -4.6, dir: [0, 1] });

const LOOP_A = { x: 0, z: 1, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
const LOOP_B1 = { x: -3.6, z: 3, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
const LOOP_B2 = { x: -0.2, z: -7.8, dir: [1, 0], len: 4.4, w: 1.6, radius: 0.8 };
const LOOP_N = { x: 0, z: 1.8, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
const MILL_NEON = windmill({ x: 0, z: 0, depth: 1.4, left: -2, right: 2, speed: 1.6 });
const MILL_DAY = windmill({ x: 0, z: -1.5, depth: 1.6, left: -2.6, right: 2.6, speed: 1.3 });
const MILL_N1 = windmill({ x: -1.2, z: 2.6, w: 1, left: -2.6, right: 2.6, speed: 1.2, blades: 3 });
const MILL_N2 = windmill({ x: 1.2, z: -4, w: 1, left: -2.6, right: 2.6, speed: -1.3, blades: 3, phase: 0.7 });









export const COURSES = [
  {
    name: 'La Recta',
    par: 2,
    theme: 'meadow',
    tee: [0, 11.5],
    cup: [0, -11],
    outline: [[-3.2, 13], [3.2, 13], [3.2, -13], [-3.2, -13]],
    grounded: true, // la pista va a ras del terreno, sin plataforma de tierra
    walls: [],
    bumpers: [{ x: 0, z: 0, r: 0.6 }, { x: -1.7, z: -6.5, r: 0.4 }, { x: 1.7, z: -6.5, r: 0.4 }],
    sand: [],
    spinners: [],
    waypoints: [[-1.9, 0], [1.9, 0]], // alternativas para esquivar la seta central
  },
  {
    name: 'El Codo',
    par: 3,
    theme: 'beach',
    aimYaw: 0,
    tee: [-1.5, 8],
    cup: [2.6, -7.2],
    outline: [[-3, 9.5], [0, 9.5], [0, -3], [4, -3], [4, -9.5], [-3, -9.5]],
    walls: [],
    bumpers: [{ x: 1.8, z: -5.2, r: 0.4 }],
    sand: [{ x: -1.5, z: -6.5, w: 2.2, d: 2.2 }],
    spinners: [],
    waypoints: [[-1.5, -4.5], [0.5, -6.5]],
  },
  {
    name: 'Zigzag',
    par: 4,
    theme: 'sunset',
    aimYaw: 0.73,
    tee: [-2, 8.5],
    cup: [2, -8.5],
    outline: [[-3.5, 10], [3.5, 10], [3.5, -10], [-3.5, -10]],
    walls: [
      [[-3.5, 3.5], [1.6, 3.5]],
      [[-1.6, -3.5], [3.5, -3.5]],
    ],
    bumpers: [{ x: -2.4, z: -7, r: 0.35 }],
    sand: [{ x: 2.3, z: 6.6, w: 1.6, d: 1.6 }],
    spinners: [{ x: 0, z: 0, len: 2.6, speed: 1.4 }],
    waypoints: [[2.5, 3.5], [-2.5, -3.5], [-2, -6]],
  },
  {
    name: 'Turbo',
    par: 4,
    theme: 'snow',
    aimYaw: 0.69,
    tee: [-1.2, 9.6],
    cup: [1.3, -10],
    outline: [[-2.6, 11.5], [2.6, 11.5], [2.6, -11.5], [-2.6, -11.5]],
    walls: [
      [[-2.6, 4.5], [0.9, 4.5]],
      [[-0.9, -3.5], [2.6, -3.5]],
    ],
    bumpers: [{ x: -1.6, z: 0.5, r: 0.35 }, { x: 0.2, z: -7.5, r: 0.4 }],
    sand: [{ x: -1.6, z: -8.6, w: 1.6, d: 1.8 }],
    spinners: [],
    boosts: [
      { x: 1.75, z: 6.2, w: 1, d: 1.6, dir: [0, -1], speed: 9 },
      { x: -1.75, z: -1.5, w: 1, d: 1.6, dir: [0, -1], speed: 9 },
    ],
    waypoints: [[1.75, 4.5], [-1.75, -3.5], [1.4, -6]],
  },
  {
    name: 'Bloques',
    par: 3,
    theme: 'canyon',
    tee: [0, 9],
    cup: [0, -8.8],
    outline: [[-3, 10.5], [3, 10.5], [3, -10.5], [-3, -10.5]],
    walls: [
      [[-3, -5.8], [-1.1, -5.8]],
      [[1.1, -5.8], [3, -5.8]],
    ],
    bumpers: [{ x: -1.6, z: 5, r: 0.35 }, { x: 1.6, z: 5, r: 0.35 }],
    sand: [{ x: 0, z: 0.4, w: 1.4, d: 1 }],
    spinners: [],
    movers: [
      { x: 0, z: 2.8, w: 1.8, d: 0.5, axis: 'x', range: 1.9, speed: 1.3 },
      { x: 0, z: -2.4, w: 1.8, d: 0.5, axis: 'x', range: 1.9, speed: 1.7, phase: Math.PI },
      { x: 0, z: -5.8, w: 0.6, d: 0.6, axis: 'x', range: 0.5, speed: 2 },
    ],
    waypoints: [[0, -4]],
  },
  {
    name: 'La Colina',
    tip: 'Cuesta arriba: si te quedas corto, la bola vuelve',
    par: 3,
    theme: 'autumn',
    tee: [0, 8.5],
    cup: [0, -7.6],
    outline: [[-2.4, 10], [2.4, 10], [2.4, -10], [-2.4, -10]],
    walls: [],
    bumpers: [{ x: -1.1, z: -5.6, r: 0.35 }, { x: 1.1, z: -5.6, r: 0.35 }],
    sand: [{ x: 1.3, z: 5.6, w: 1.2, d: 1.2 }],
    spinners: [],
    // cuesta arriba: sin fuerza la bola vuelve rodando
    slopes: [{ x: 0, z: 0, w: 4.8, d: 5.6, dir: [0, 1], accel: 3.2 }],
    waypoints: [],
  },
  {
    name: 'El Portal',
    tip: 'Entra en el portal morado para salir al otro lado',
    par: 3,
    theme: 'night',
    tee: [-1.6, 8.2],
    cup: [1.6, -7.4],
    outline: [[-3.2, 9.8], [3.2, 9.8], [3.2, -9.8], [-3.2, -9.8]],
    walls: [[[-3.2, 0], [3.2, 0]]],
    bumpers: [{ x: 0.2, z: -6, r: 0.4 }, { x: -1.8, z: 4.6, r: 0.35 }],
    sand: [{ x: -1.8, z: -8.2, w: 1.6, d: 1.4 }],
    spinners: [],
    portals: [{ a: [1.8, 2.6], b: [-1.8, -2.2], r: 0.42 }],
    waypoints: [[1.8, 2.6]],
  },
  {
    name: 'Molinos',
    tip: 'Espera el hueco entre las aspas',
    par: 3,
    theme: 'gardenNight',
    tee: [0, 9.2],
    cup: [0, -9],
    outline: [[-2.8, 10.6], [2.8, 10.6], [2.8, -10.6], [-2.8, -10.6]],
    walls: [],
    bumpers: [{ x: -2, z: 0, r: 0.35 }, { x: 2, z: 0, r: 0.35 }, { x: 0, z: -6.4, r: 0.3 }],
    sand: [],
    spinners: [
      { x: 0, z: 3.4, len: 3, speed: 1.3 },
      { x: 0, z: -3.4, len: 3, speed: -1.7 },
    ],
    waypoints: [],
  },
  {
    name: 'El Volcán',
    tip: 'El hoyo está en la cima: ni flojo ni fuerte',
    par: 2,
    theme: 'volcano',
    tee: [0, 9],
    cup: [0, -2],
    // pasillo de entrada y octógono alrededor del cono
    outline: [[-1.2, 10.4], [1.2, 10.4], [1.2, 2], [1.66, 2], [4, -0.34], [4, -3.66], [1.66, -6], [-1.66, -6], [-4, -3.66], [-4, -0.34], [-1.66, 2], [-1.2, 2]],
    walls: [],
    bumpers: [],
    sand: [],
    spinners: [],
    // cono con la cima llana y el hoyo en el cráter: las laderas echan la bola
    // hacia fuera, así que demasiado flojo vuelve y demasiado fuerte se pasa
    mounds: [{ x: 0, z: -2, top: 0.9, base: 3.4, accel: 5.5, tint: 0x5a3a30 }],
    waypoints: [],
  },
  {
    name: 'La Herradura',
    tip: 'Usa el acelerador y sube la cuesta del final',
    par: 4,
    theme: 'beachNight',
    aimYaw: 0,
    tee: [-2.5, 8.6],
    cup: [2.5, 8],
    outline: [[-4, 10], [-1, 10], [-1, -3.6], [1, -3.6], [1, 10], [4, 10], [4, -10], [-4, -10]],
    walls: [],
    bumpers: [{ x: -3.2, z: -8.6, r: 0.35 }, { x: 3.2, z: -8.6, r: 0.35 }],
    sand: [{ x: 3.2, z: -1, w: 1.2, d: 1.8 }],
    spinners: [{ x: 0, z: -7, len: 2.4, speed: 1.2 }],
    boosts: [{ x: -2.5, z: 2.5, w: 1, d: 1.6, dir: [0, -1], speed: 9 }],
    slopes: [{ x: 2.5, z: 3.6, w: 3, d: 2.4, dir: [0, -1], accel: 2.6 }],
    waypoints: [[-2.5, -6.8], [2.5, -6.8]],
  },
  {
    name: 'Looping Neón',
    tip: 'Dale fuerte para completar el looping',
    par: 2,
    theme: 'neon',
    tee: [0, 8.4],
    cup: [0.6, -7.4],
    outline: [[-1.6, 10], [1.6, 10], [1.6, 4.2], [0.8, 3.6], [0.8, -1.6], [2, -2.4], [2, -10], [-2, -10], [-2, -2.4], [-0.8, -1.6], [-0.8, 3.6], [-1.6, 4.2]],
    walls: [],
    bumpers: [{ x: -0.8, z: -4.6, r: 0.35 }, { x: 1.1, z: -5.2, r: 0.3 }],
    sand: [{ x: -1.2, z: -8.6, w: 1.2, d: 1 }],
    spinners: [],
    loops: [LOOP_A],
    waypoints: [[0, -2.8]],
  },
  {
    name: 'Doble Looping',
    tip: 'Pasa el primer looping: el acelerador te lanza al segundo',
    par: 3,
    theme: 'neonPink',
    tee: [-3.6, 8.6],
    cup: [4.6, -6],
    outline: [[-4.4, 10], [-2.8, 10], [-2.8, -7], [2.4, -7], [2.4, -4.6], [5.8, -4.6], [5.8, -10.6], [2.4, -10.6], [2.4, -8.6], [-4.4, -8.6]],
    walls: [],
    bumpers: [{ x: 4.2, z: -7.8, r: 0.35 }, { x: 5, z: -9.6, r: 0.3 }],
    sand: [{ x: 3.4, z: -9.8, w: 1.2, d: 1 }],
    spinners: [],
    boosts: [{ x: -3.6, z: -7.8, w: 1.4, d: 1.4, dir: [1, 0], speed: 9 }],
    loops: [LOOP_B1, LOOP_B2],
    waypoints: [[-3.6, -7.8], [3.4, -7.8]],
  },
  {
    name: 'Molino Neón',
    tip: 'Cruza la puerta cuando no pase un aspa',
    par: 2,
    theme: 'neon',
    tee: [0, 8.5],
    cup: [0.8, -6.8],
    outline: [[-2, 10], [2, 10], [2, -10], [-2, -10]],
    walls: MILL_NEON.walls,
    bumpers: [{ x: -1.1, z: 4.2, r: 0.35 }, { x: 1.1, z: 3.2, r: 0.35 }, { x: -0.4, z: -4.6, r: 0.3 }],
    sand: [],
    spinners: [],
    windmills: [MILL_NEON.windmill],
    waypoints: [[0, -2.2]],
  },
  {
    name: 'Tubos Neón',
    tip: 'Mete la bola en un tubo para cruzar el muro',
    par: 3,
    theme: 'neonPink',
    tee: [0, 8.5],
    cup: [1.6, -7.2],
    outline: [[-3, 10], [3, 10], [3, -10], [-3, -10]],
    walls: [[[-3, 0], [3, 0]]],
    bumpers: [{ x: 1.6, z: -4.6, r: 0.4 }, { x: -0.2, z: -6.4, r: 0.35 }, { x: 0, z: 5.2, r: 0.4 }],
    sand: [{ x: -1.8, z: -7.8, w: 1.6, d: 1.4 }],
    spinners: [],
    portals: [
      { a: [-1.8, 2.6], b: [1.8, -1.8], r: 0.42, out: [0, -1], tube: true },
      { a: [1.8, 2.6], b: [-1.8, -1.8], r: 0.42, out: [0, -1], tube: true },
    ],
    waypoints: [[-1.8, 2.6], [0.4, -4.6]],
  },
  {
    name: 'El Molino',
    tip: 'El clásico: pasa por la puerta del molino',
    par: 3,
    theme: 'meadow',
    tee: [0, 9],
    cup: [-1.2, -8],
    outline: [[-1.8, 10.4], [1.8, 10.4], [1.8, 3], [2.6, 2.2], [2.6, -10.4], [-2.6, -10.4], [-2.6, 2.2], [-1.8, 3]],
    walls: MILL_DAY.walls,
    bumpers: [{ x: -0.9, z: 5.4, r: 0.4 }, { x: 1, z: 4.2, r: 0.3 }, { x: 0.9, z: -6, r: 0.35 }],
    sand: [{ x: 1.4, z: -8.6, w: 1.4, d: 1.2 }],
    spinners: [],
    windmills: [MILL_DAY.windmill],
    waypoints: [[0, -4]],
  },
  {
    name: 'Molinos de Noche',
    tip: 'Dos molinos: busca el ritmo de cada uno',
    par: 4,
    theme: 'night',
    tee: [-1.2, 9],
    cup: [-0.6, -8.6],
    outline: [[-2.6, 10.4], [2.6, 10.4], [2.6, -10.4], [-2.6, -10.4]],
    walls: [...MILL_N1.walls, ...MILL_N2.walls],
    bumpers: [{ x: 1.2, z: 6, r: 0.4 }, { x: -1.6, z: -1.2, r: 0.35 }, { x: -1.6, z: -6.8, r: 0.3 }],
    sand: [],
    spinners: [],
    windmills: [MILL_N1.windmill, MILL_N2.windmill],
    waypoints: [[-1.2, 0.4], [1.2, -0.8], [1.2, -6.4]],
  },
  {
    name: 'Las Tuberías',
    tip: 'Por el pasadizo o por la tubería: tú eliges',
    par: 3,
    theme: 'beach',
    tee: [0, 8.6],
    cup: [-1, -7.6],
    outline: [[-3, 10], [3, 10], [3, -10], [-3, -10]],
    walls: [[[-2.1, 1.2], [-2.1, -1.2]], [[-2.1, 0], [3, 0]]],
    bumpers: [{ x: 0.4, z: -4.6, r: 0.4 }, { x: -2.2, z: -6.4, r: 0.3 }],
    sand: [{ x: 1.6, z: -8, w: 1.6, d: 1.4 }],
    spinners: [{ x: 0.8, z: 5.2, len: 2.2, speed: 1.2 }],
    portals: [{ a: [1.8, 2.4], b: [2.2, -2.4], r: 0.42, out: [-1, 0], tube: true }],
    tunnels: [{ x: -2.55, z: 0, w: 0.9, d: 2.4 }],
    waypoints: [[-2.55, 2.2], [-2.55, -2.2]],
  },
  {
    name: 'Looping Nocturno',
    tip: 'Looping y pasadizo: entra recto',
    par: 3,
    theme: 'night',
    tee: [0, 8.4],
    cup: [1.6, -8],
    outline: [[-1.8, 10], [1.8, 10], [1.8, 5], [0.8, 4.4], [0.8, -0.8], [2.8, -1.6], [2.8, -10], [-2.8, -10], [-2.8, -1.6], [-0.8, -0.8], [-0.8, 4.4], [-1.8, 5]],
    walls: [[[-2.8, -5], [-0.45, -5]], [[0.45, -5], [2.8, -5]], [[-0.45, -4.2], [-0.45, -5.8]], [[0.45, -4.2], [0.45, -5.8]]],
    bumpers: [{ x: -1.2, z: -2.8, r: 0.3 }, { x: 1.2, z: -2.8, r: 0.3 }, { x: 0, z: -7.4, r: 0.35 }],
    sand: [{ x: -1.8, z: -8.6, w: 1.4, d: 1.2 }],
    spinners: [],
    loops: [LOOP_N],
    tunnels: [{ x: 0, z: -5, w: 0.9, d: 1.6 }],
    waypoints: [[0, -6.4]],
  },
  {
    name: 'Dentro del Volcán',
    tip: 'Entra por la cueva y, dentro, salta la lava: recto por el camino largo o a la derecha por el atajo',
    par: 5,
    theme: 'caldera',
    tee: [-3.4, 26],
    cup: [4.2, 2],
    // la cámara de magma en U (dentro del volcán)
    outline: [[-5.4, 10], [5.4, 10], [6.4, 9], [6.4, -11], [5.4, -12], [-5.4, -12], [-6.4, -11], [-6.4, 9]],
    // el sendero de fuera, en la ladera, 4 m por encima del suelo de la cámara
    tiers: [{ poly: [[-4.9, 16.2], [-1.9, 16.2], [-1.9, 26.6], [-2.6, 27.4], [-4.2, 27.4], [-4.9, 26.6]], h: 4 }],
    walls: [...VOLCANO_RAMP_A.walls, ...VOLCANO_SHORTCUT.walls, ...VOLCANO_RAMP_B.walls],
    bumpers: [
      { x: -2.6, z: 23.2, r: 0.32 },
      { x: -4.4, z: -6.4, r: 0.4 },
      { x: 4.6, z: -9.2, r: 0.38 },
      { x: 5.6, z: 6.4, r: 0.36 },
    ],
    sand: [],
    // un aspa vigila el camino hacia la cueva
    spinners: [{ x: -3.4, z: 20, len: 2.2, speed: 1.3 }],
    movers: [{ x: 0, z: -6.2, w: 1.2, d: 0.6, axis: 'x', range: 2.6, speed: 1.1 }],
    ramps: [VOLCANO_RAMP_A.ramp, VOLCANO_SHORTCUT.ramp, VOLCANO_RAMP_B.ramp],
    // la cueva: tubo de lava que atraviesa la roca y cae dentro (drop: altura de la boca)
    portals: [{ a: [-3.4, 17.2], b: [-3.4, 8.6], r: 0.45, out: [0, -1], tube: true, drop: 4, exit: 3 }],
    // flow: hacia dónde corre la lava (solo se ve)
    lava: [
      // la lava del centro de la U con un río hacia cada brazo
      {
        poly: [
          [-1.3, 9.9], [1.3, 9.9], [1.35, 7], [1.25, 4], [1.3, 0.5], [1.3, -2.25],
          [2.4, -2.2], [3.4, -2.4], [4.2, -2.25], [5, -2.35], [5, -3.78], [2.4, -3.78], [1.6, -3.9],
          [1.3, -4.2], [0.7, -4.6], [0, -4.7], [-0.7, -4.6], [-1.3, -4.2],
          [-1.3, -1], [-1.25, 2], [-2.3, 1.95], [-4.2, 2], [-5, 2.1], [-5, 3.38], [-2.4, 3.38], [-1.3, 3.5], [-1.35, 6.5],
        ],
        flow: [0, -1],
      },
      // charcos: abajo, en la curva de la U, y antes del hoyo
      { poly: [[-1.1, -8.6], [0.2, -8.3], [1.3, -8.8], [1.5, -9.9], [0.6, -10.6], [-0.7, -10.5], [-1.5, -9.8]], flow: [1, 0] },
      { poly: [[-6.3, -10], [-5.2, -9.8], [-4.6, -10.6], [-5.2, -11.5], [-6.3, -11.2]], flow: [1, 0] },
      { poly: [[1.6, 4.6], [2.4, 4.8], [2.9, 4.2], [2.7, 3.4], [2, 3.2], [1.5, 3.7]], flow: [0, -1] },
    ],
    // los rivales cogen el atajo
    waypoints: [[-3.4, 17.2], [3.6, 6.2]],
  },
];

// Desempate: sin agujero. Un tiro cada uno y gana quien pare más cerca de la diana.
export const TIEBREAK_COURSE = {
  name: 'Desempate',
  par: 1,
  theme: 'sunset',
  noCup: true,
  tee: [0, 9],
  cup: [0, -6],
  outline: [[-3, 10.5], [3, 10.5], [3, -10.5], [-3, -10.5]],
  walls: [],
  bumpers: [{ x: -1.3, z: 0, r: 0.4 }, { x: 1.3, z: 0, r: 0.4 }],
  sand: [{ x: 0, z: -9, w: 3.2, d: 1.6 }],
  spinners: [],
  waypoints: [],
};
