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
function ramp({ x, z, w = 1.7, d = 1.6, dir = [0, -1], h = 0.32, lift = 0.42, maxV }) {
  const along = dir[0] !== 0;
  const hw = along ? d / 2 : w / 2, hl = along ? w / 2 : d / 2;
  // lados: paralelos a dir, a hw del centro
  const sx = along ? 0 : hw, sz = along ? hw : 0, lx = dir[0] * hl, lz = dir[1] * hl;
  const walls = [
    [[x - sx - lx, z - sz - lz], [x - sx + lx, z - sz + lz]],
    [[x + sx - lx, z + sz - lz], [x + sx + lx, z + sz + lz]],
  ];
  return { ramp: { x, z, w, d, dir, h, lift, ...(maxV ? { maxV } : {}) }, walls };
}

// Dentro del Volcán: se sale en un sendero de la ladera, la cueva lleva por un
// tubo de lava que cae dentro, a una cámara en U con lava en medio. Al caer la
// bola queda entre dos rampas: la de delante salta el río del brazo izquierdo
// (el camino largo, por abajo) y la de la derecha cruza la U de un salto (atajo).
const VOLCANO_RAMP_A = ramp({ x: -3.4, z: 4.2 });
const VOLCANO_SHORTCUT = ramp({ x: -2.15, z: 6.2, w: 1.6, d: 1.7, dir: [1, 0] });
const VOLCANO_RAMP_B = ramp({ x: 3.4, z: -4.6, dir: [0, 1] });

// El Abismo: dos agujeros de pared a pared; cada uno se salta desde su rampa
const ABYSS_RAMP_A = ramp({ x: -1.3, z: 7.2, w: 1.4 });
const ABYSS_RAMP_B = ramp({ x: 0, z: -5.4, w: 2 });
const band = (z0, z1) => ({ poly: [[-3, z0], [3, z0], [3, z1], [-3, z1]] });

const LOOP_A = { x: 0, z: 1, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
const LOOP_B1 = { x: -3.6, z: 3, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
// el carril de entrada (a la derecha según dir) queda en línea con el acelerador (z = -7.8)
const LOOP_B2 = { x: -0.2, z: -8.16, dir: [1, 0], len: 4.4, w: 2, radius: 0.8 };
const MILL_N1 = windmill({ x: -1.2, z: 2.6, w: 1, left: -2.6, right: 2.6, speed: 1.2, blades: 3 });
const MILL_N2 = windmill({ x: 1.2, z: -4, w: 1, left: -2.6, right: 2.6, speed: -1.3, blades: 3, phase: 0.7 });
const MILL_PRADO = windmill({ x: 0, z: 0.8, w: 1.1, depth: 1.6, left: -1.6, right: 1.6, speed: 1.2 });
const LOOP_PRADO = { x: 2.4, z: -6.6, dir: [0, -1], len: 4.4, w: 1.6, radius: 0.8 };
// Cyberpunk2078: looping grande (radio 1,2) con la boca de entrada en z 0,6. El carril de entrada (x + LOOP_LANE = -1) queda en línea con el acelerador.
const LOOP_CYBER = { x: -1.36, z: -0.3, dir: [0, -1], len: 4.4, w: 2.6, radius: 1.2 };
const MILL_CYBER = windmill({ x: 2.2, z: -5.0, w: 1.0, depth: 1.4, left: 0.4, right: 4.0, speed: 1.2, blades: 3 });

// El Templo de la Selva: una U alrededor de la laguna de la selva. Tres
// maneras de llegar, parecidas en golpes pero con riesgos distintos:
// - la U entera (subir, cruzar el templo y bajar): larga pero segura;
// - el sendero del centro (por el paso de arriba de la calzada, bajando y
//   cruzando el puente): más corto, con aspa, charca y bloques en el puente;
// - saltar la escuadra de la calzada con la rampa: cae junto a la charca del
//   sendero, solo bien medido se libra del agua. La rampa frena (maxV): ni a
//   tope pasa del puente, así que no ahorra más de un golpe.
// Jugando perfecto: 6 golpes por la U, 5 por el sendero y 5 saltando
// (scripts/route-planner.mjs).
// Al final, el rincón del hoyo se entra por un hueco de abajo.
// water: es como la lava (vuelves al sitio del golpe), pero se ve agua. Nada
// toca el contorno: el agua se recorta en el césped y tiene que quedar dentro.
const JUNGLE_JUMP_W1 = ramp({ x: -10.4, z: 7.95, w: 1.6, d: 1.5 });
const JUNGLE_JUMP_W2 = ramp({ x: 10.4, z: -2.95, w: 1.6, d: 1.5, dir: [0, 1] });
const JUNGLE_CORNER_L = ramp({ x: -9.6, z: 0.6, w: 1.5, d: 1.5, dir: [1, 0], maxV: 7.5 });
const waterBox = (x0, x1, z0, z1, flow) => ({ poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], flow, water: true });

// El Glaciar: tres pistas en zigzag casi todas de hielo, donde la bola apenas
// frena (ice). Abajo, un lago helado con un agujero de agua en medio; al final,
// una grieta de pared a pared que se salta con la rampa o se cruza por el
// puente de hielo estrecho de la derecha.
const GLACIER_RAMP = ramp({ x: -3, z: -5.1, w: 1.6, d: 1.6 });

export const COURSES = [
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
    sand: [{ x: 2.3, z: 6.6, w: 2, d: 2 }, { x: 0.2, z: -8.6, w: 1.6, d: 1.4 }],
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
    sand: [{ x: -1.5, z: -8.8, w: 2, d: 2.2 }, { x: 1.4, z: 1, w: 1.4, d: 1.6 }],
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
    sand: [{ x: 0, z: 0.2, w: 2.4, d: 1.4 }, { x: -1.9, z: -8.6, w: 1.6, d: 1.6 }],
    spinners: [],
    movers: [
      { x: 0, z: 2.8, w: 1.8, d: 0.5, axis: 'x', range: 1.9, speed: 1.3 },
      { x: 0, z: -2.4, w: 1.8, d: 0.5, axis: 'x', range: 1.9, speed: 1.7, phase: Math.PI },
      { x: 0, z: -5.8, w: 0.6, d: 0.6, axis: 'x', range: 0.5, speed: 2 },
    ],
    waypoints: [[0, -4]],
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
    sand: [{ x: -1.7, z: -8.2, w: 2.2, d: 1.8 }, { x: -2, z: 1.6, w: 1.8, d: 1.6 }],
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
    sand: [{ x: -1.6, z: -8.4, w: 1.6, d: 1.4 }, { x: 1.7, z: 6.6, w: 1.4, d: 1.6 }],
    spinners: [
      { x: 0, z: 3.4, len: 3, speed: 1.3 },
      { x: 0, z: -3.4, len: 3, speed: -1.7 },
    ],
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
    sand: [{ x: 3.25, z: -1, w: 1.3, d: 2.4 }, { x: -3.3, z: 5.4, w: 1.2, d: 2 }],
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
    sand: [{ x: -1.1, z: -8.7, w: 1.6, d: 1.4 }],
    spinners: [],
    loops: [LOOP_A],
    waypoints: [[0.36, 3.6], [0.36, -2.8]],
  },
  {
    name: 'Doble Looping',
    tip: 'Pasa el primer looping: el acelerador te lanza al segundo',
    par: 3,
    theme: 'neonPink',
    tee: [-3.24, 8.6],
    cup: [4.6, -6],
    outline: [[-4.4, 10], [-2.8, 10], [-2.8, -7], [2.4, -7], [2.4, -4.6], [5.8, -4.6], [5.8, -10.6], [2.4, -10.6], [2.4, -9], [-4.4, -9]],
    walls: [],
    bumpers: [{ x: 4.2, z: -7.8, r: 0.35 }, { x: 5, z: -9.6, r: 0.3 }],
    sand: [{ x: 3.4, z: -9.9, w: 1.6, d: 1.2 }],
    spinners: [],
    boosts: [{ x: -3.6, z: -7.8, w: 1.4, d: 1.4, dir: [1, 0], speed: 9 }],
    loops: [LOOP_B1, LOOP_B2],
    waypoints: [[-3.24, 5], [-3.6, -7.8], [-2, -7.8], [3.4, -7.8], [3.2, -6.2]],
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
    sand: [{ x: -1.7, z: -7.9, w: 2, d: 1.8 }, { x: 2.2, z: -9, w: 1.4, d: 1.4 }],
    spinners: [],
    portals: [
      { a: [-1.8, 2.6], b: [1.8, -1.8], r: 0.42, out: [0, -1], tube: true },
      { a: [1.8, 2.6], b: [-1.8, -1.8], r: 0.42, out: [0, -1], tube: true },
    ],
    waypoints: [[-1.8, 2.6], [0.4, -4.6]],
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
    sand: [{ x: 1.4, z: -9.2, w: 1.8, d: 1.4 }],
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
    sand: [{ x: 1.6, z: -8.2, w: 2, d: 1.8 }],
    spinners: [{ x: 0.8, z: 5.2, len: 2.2, speed: 1.2 }],
    portals: [{ a: [1.8, 2.4], b: [2.2, -2.4], r: 0.42, out: [-1, 0], tube: true }],
    tunnels: [{ x: -2.55, z: 0, w: 0.9, d: 2.4 }],
    waypoints: [[-2.55, 2.2], [-2.55, -2.2]],
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
  {
    name: 'El Molino del Prado',
    tip: 'Cruza la puerta del molino o arriésgate por el carril del looping',
    par: 5,
    theme: 'meadowDay',
    tee: [0, 11.5],
    cup: [0, -11.6],
    // salida estrecha, ensanche con arena y setas, carriles a los lados del
    // molino, zona alta con montículo y pasillo hasta el green
    outline: [
      [-1.4, 13], [-1.4, 9], [-3.2, 7], [-3.2, -10.2],
      [-0.75, -10.2], [-0.75, -10.7], [-1.55, -11.3], [-1.55, -12.2], [-0.75, -12.9],
      [0.75, -12.9], [1.55, -12.2], [1.55, -11.3], [0.75, -10.7], [0.75, -10.2],
      [3.2, -10.2], [3.2, 6.5], [1.4, 9], [1.4, 13],
    ],
    grounded: true,
    // paredes del molino y las que separan los carriles laterales de la zona central
    walls: [...MILL_PRADO.walls, [[-1.6, 0.8], [-1.6, -5]], [[1.6, 0.8], [1.6, -9]]],
    bumpers: [{ x: -1, z: 3.8, r: 0.4 }, { x: 1.15, z: 5.6, r: 0.4 }],
    sand: [{ x: -2.35, z: 4, w: 1.5, d: 4 }],
    // aspas pegadas a la pared derecha del carril: hay que subir por la izquierda
    spinners: [{ x: 3, z: -1.6, len: 1.1, speed: 1.5 }, { x: 3, z: -3, len: 1.1, speed: -1.9 }],
    boosts: [{ x: 2.4, z: 3.4, w: 1, d: 2.4, dir: [0, -1], speed: 9 }],
    movers: [{ x: -2.4, z: -2.6, w: 0.6, d: 0.5, axis: 'x', range: 0.4, speed: 1.6 }],
    // montículo suave al centro-izquierda: con poca fuerza desvía, con fuerza se sube
    mounds: [{ x: -0.9, z: -7, top: 0.4, base: 1, accel: 5, tint: 0xdcffb0 }],
    loops: [LOOP_PRADO],
    windmills: [MILL_PRADO.windmill],
    // al salir del looping, el portal deja la bola frente al pasillo del green
    portals: [{ a: [2.4, -9.6], b: [0, -8.3], r: 0.42 }],
    waypoints: [[0, 2.6], [0, -2.4], [0.6, -8]], // delante de la puerta, detrás y la zona alta
  },
  {
    name: 'El Abismo',
    tip: 'Salta los agujeros con las rampas: si caes, vuelves a tirar desde donde estabas',
    par: 4,
    theme: 'canyon',
    tee: [-1.3, 11.6],
    cup: [-0.8, -15],
    outline: [[-3, 13.2], [3, 13.2], [3, -17.4], [-3, -17.4]],
    walls: [...ABYSS_RAMP_A.walls, ...ABYSS_RAMP_B.walls],
    bumpers: [{ x: 1.4, z: -13, r: 0.35 }],
    sand: [],
    spinners: [],
    ramps: [ABYSS_RAMP_A.ramp, ABYSS_RAMP_B.ramp],
    // de pared a pared: sin rampa no se puede pasar
    pits: [band(6.4, 3.8), band(-6.2, -9)],
    waypoints: [[-1.3, 9.6], [-1.3, 0.6], [0, -2.6], [0.8, -11.4]],
  },
  {
    name: 'Cyberpunk2078',
    tip: 'Ruta A: el portal te deja en el acelerador y el looping te lanza a la cup. Ruta B: rodea por la derecha entre el bloque y el molino',
    par: 4,
    theme: 'cyber2078',
    tee: [-1.0, 8.6],
    cup: [2.4, -8.4],
    outline: [[-4, 10], [4, 10], [4, -10], [-4, -10]],
    walls: [
      // W1 y W2 (en L) separan la bolsa del looping del tee. Los muros de la bolsa se quitaron por orden de la persona (spec, enmienda 2026-10-30)
      [[-4, 4.2], [0.4, 4.2]],
      [[0.4, 4.2], [0.4, 0.6]],
      ...MILL_CYBER.walls,
    ],
    bumpers: [{ x: 3.2, z: 2.6, r: 0.4 }, { x: 1.2, z: -0.8, r: 0.4 }],
    sand: [{ x: -0.6, z: -8.1, w: 1.8, d: 3.0 }],
    spinners: [],
    movers: [{ x: 2.2, z: 1.2, w: 1.2, d: 0.6, axis: 'x', range: 1.0, speed: 1.2 }],
    windmills: [MILL_CYBER.windmill],
    boosts: [{ x: -1.0, z: 1.5, w: 0.6, d: 1.4, dir: [0, -1], speed: 11 }],
    loops: [LOOP_CYBER],
    // el único acceso al looping: la entrada por la boca sin portal es rara (ver test)
    portals: [{ a: [-1.0, 5.6], b: [-1.0, 3.0], r: 0.42 }],
    waypoints: [[-1.0, 5.6], [2.4, 3.2], [2.2, 0.2], [1.0, -3.6], [2.2, -4.0]],
  },
  {
    name: 'El Templo de la Selva',
    tip: 'Tres caminos: la U entera, el sendero del puente o saltar la escuadra de la calzada. Llega suave: si vas fuerte la bola rebota en el borde del hoyo',
    par: 12,
    maxStrokes: 20,
    theme: 'jungle',
    // hoyo con borde: la bola cae en la boca y, si va fuerte, choca con el canto y se sale
    realCup: true,
    tee: [-10, 12.6],
    cup: [10.9, 12.3],
    // la U: calzada izquierda (x -12..-8), templo arriba (z -14..-10) y bajada
    // derecha (x 8..12) hasta el rincón del hoyo; el sendero (x -8..-4.6) y el
    // puente (z 2..4.5) rodean la laguna, encerrada por muros
    outline: [[-12, 14], [-12, -14], [12, -14], [12, 14], [8, 14], [8, 4.5], [-8, 4.5], [-8, 14]],
    walls: [
      // la laguna del centro
      [[-8, -4], [-8, -10]], [[-8, -10], [8, -10]], [[8, -10], [8, 2]], [[8, 2], [-4.6, 2]],
      [[-4.6, 2], [-4.6, -4]], [[-4.6, -4], [-8, -4]],
      // entre la calzada y el sendero (el paso queda arriba, de z -4 a -1.5)
      [[-8, -1.5], [-8, 4.5]],
      // las dos puertas del puente: solo se pasan pegado a la laguna (saltando la
      // primera, la segunda frena la bola)
      [[-4.6, 4.5], [-4.6, 3.1]],
      [[-1.6, 4.5], [-1.6, 3.1]],
      // el rincón del hoyo: se entra por abajo, por el hueco junto al muro de fuera
      [[9.6, 11.2], [12, 11.2]],
      [[9.6, 11.2], [9.6, 12.6]],
      // el templo de arriba: una isla parte la galería en dos caminos
      [[-4.5, -12], [4.5, -12]],
      // escuadras en diagonal en las esquinas de arriba
      [[-12, -12.4], [-10.4, -14]], [[10.4, -14], [12, -12.4]],
      // recodos de piedra que cortan los tiros largos
      [[-8, 10.6], [-10.2, 10.6]],
      [[-12, -0.5], [-9.6, -0.5]],
      [[-8, -6.5], [-10.4, -6.5]],
      [[0, -14], [0, -12.9]],
      [[8, -6], [9.6, -6]],
      [[8, 6.6], [10, 6.6]],
      ...JUNGLE_JUMP_W1.walls,
      ...JUNGLE_JUMP_W2.walls,
      ...JUNGLE_CORNER_L.walls,
    ],
    bumpers: [
      { x: -5.5, z: -0.2, r: 0.34 },
      { x: -2, z: -10.5, r: 0.34 },
      { x: 2.4, z: -10.5, r: 0.34 },
      { x: 9, z: -8, r: 0.38 },
    ],
    sand: [
      { x: -6.3, z: -2.9, w: 2.4, d: 1.4 },
      { x: -0.8, z: -11, w: 1.4, d: 1.2 },
      { x: 8.8, z: 9.6, w: 1.2, d: 1.2 },
    ],
    spinners: [{ x: -6.3, z: 0.9, len: 2.4, speed: 1.3 }],
    movers: [
      { x: -2.5, z: -13, w: 0.6, d: 0.6, axis: 'x', range: 1.5, speed: 1.1 },
      { x: 2.6, z: -13, w: 0.6, d: 0.6, axis: 'x', range: 1.4, speed: -1.5 },
      { x: 1, z: 3.25, w: 0.6, d: 0.6, axis: 'z', range: 0.7, speed: 1.4 },
      { x: 4.2, z: 3.25, w: 0.6, d: 0.6, axis: 'z', range: 0.7, speed: -1.2, phase: 1 },
    ],
    ramps: [JUNGLE_JUMP_W1.ramp, JUNGLE_JUMP_W2.ramp, JUNGLE_CORNER_L.ramp],
    lava: [
      // los dos saltos de agua; junto al muro de dentro queda un paso estrecho
      waterBox(-11.95, -8.9, 6, 7.2, [-1, 0]),
      waterBox(8.9, 11.95, -2.2, -1, [1, 0]),
      // la charca del sendero, donde cae el salto de la escuadra si no va bien medido
      waterBox(-7.8, -6.1, 2.2, 4.3, [0, 1]),
      // la laguna (si saltas mal por encima de un muro, acabas aquí)
      { poly: [[-7.8, -9.8], [7.8, -9.8], [7.8, 1.8], [-4.4, 1.8], [-4.4, -4.2], [-7.8, -4.2]], flow: [0, 1], water: true },
    ],
    waypoints: [
      [-11, 10], [-10.4, 9.6], [-10.4, 5.2], [-8.45, 2.6], [-8.45, -1.6], [-11.3, -6],
      [-11.2, -7.8], [-10, -11.5], [-5, -11.5], [5, -11.5], [10, -11.5], [11, -9], [10.4, -6.6], [10.4, 0.4],
      [11, 5.5], [11, 8], [8.8, 10.4], [8.9, 13.5],
    ],
  },
  {
    name: 'El Glaciar',
    tip: 'El hielo resbala: la bola apenas frena. Salta la grieta con la rampa o arriésgate por el puente de hielo',
    par: 6,
    maxStrokes: 12,
    theme: 'glacier',
    tee: [-2.6, 13],
    cup: [1.2, -12.6],
    outline: [[-4, 15], [4, 15], [4, -15], [-4, -15]],
    walls: [
      // primera pista: se sale por la derecha; segunda: por la izquierda
      [[-4, 5], [2, 5]],
      [[-2, -3.6], [4, -3.6]],
      ...GLACIER_RAMP.walls,
    ],
    bumpers: [
      { x: -0.8, z: 9.8, r: 0.38 },
      { x: 2, z: 8.2, r: 0.38 },
      { x: -2.2, z: -11.4, r: 0.34 },
      { x: 2.8, z: -13.6, r: 0.34 },
    ],
    // nieve polvo: frena como la arena (detrás del hoyo, para el que llega pasado)
    sand: [{ x: 1.2, z: -14.3, w: 2.6, d: 1 }],
    // aspa en la salida de abajo del lago
    spinners: [{ x: 1.6, z: -2.2, len: 2.2, speed: 1.4 }],
    // bloque de hielo que cruza el paso de arriba del lago
    movers: [{ x: -0.6, z: 3.6, w: 0.7, d: 0.6, axis: 'x', range: 1.6, speed: 1.1 }],
    ice: [
      { x: 0, z: 9.6, w: 8, d: 4.6 },
      { x: 0, z: 0.7, w: 8, d: 6.4 },
      // franja antes de la grieta y el puente de hielo
      { x: 1, z: -4.75, w: 6, d: 2.3 },
      { x: 3.3, z: -7.05, w: 1.4, d: 2.3 },
      // placa delante del hoyo: hay que llegar suave
      { x: 0.2, z: -10.4, w: 5.4, d: 1.8 },
    ],
    ramps: [GLACIER_RAMP.ramp],
    // la grieta: de la pared izquierda al puente de la derecha
    pits: [{ poly: [[-4, -5.9], [2.6, -5.9], [2.6, -8.2], [-4, -8.2]] }],
    lava: [
      // el agujero del lago helado: agua (vuelves al sitio del golpe)
      { poly: [[-0.6, 2.4], [0.8, 2.6], [1.8, 1.6], [1.6, -0.6], [0.4, -1.3], [-0.9, -0.8], [-1.4, 0.8]], flow: [1, 0], water: true },
    ],
    waypoints: [[3, 6.4], [3, 3.6], [-2.8, 2.4], [-3, -2.6], [-3, -9.6]],
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
