// Iconos del juego, estilo "dibujado a mano en 3D".
//
// Todos salen de la misma receta para que el set se vea como uno solo:
//  1. Extrusión: la silueta repetida abajo-derecha en tinta, que le da grosor.
//  2. Cuerpo con sombreado de celda: tono oscuro abajo-derecha, tono base arriba-izquierda.
//  3. Brillo: un filo blanco dentro del borde superior izquierdo y, a veces, un destello.
//  4. Contorno de tinta grueso con un segundo trazo fino desplazado, como un boceto a mano.
// Las formas llevan un pequeño temblor (determinista por icono) para que no parezcan vectoriales.
//
// Uso: icon('coin') devuelve un <svg> en texto; icon('star', { tone: 'red', size: 32, cls: 'x' }).
// Por defecto mide 1.25em y hereda el tamaño de letra del sitio donde se pone.

const INK = '#1c1233';
const SW = 2.6; // grosor del contorno, en unidades del viewBox de 48

// Pares [base, sombra]
export const TONES = {
  gold: ['#ffd447', '#e0930f'],
  green: ['#5fe38a', '#20a457'],
  grass: ['#7bd84f', '#3d9a2a'],
  red: ['#ff6a5c', '#d1343d'],
  blue: ['#5ccbff', '#2a86d4'],
  purple: ['#c28cff', '#8650dd'],
  white: ['#fbf8ff', '#c7c0dd'],
  gray: ['#b9c1cd', '#7c8698'],
  silver: ['#e3e9f0', '#98a6b7'],
  bronze: ['#e9975c', '#a65a2a'],
  brown: ['#c98b4c', '#8b5627'],
  wood: ['#f0c27a', '#c48a3f'],
  paper: ['#fff0c9', '#e3c27f'],
  orange: ['#ffa548', '#e0602a'],
  pink: ['#ff86b8', '#d64b88'],
  cyan: ['#6ff1e2', '#1fb0a3'],
  dark: ['#5a4e82', '#342a55'],
  dragon: ['#74e26a', '#2f9a45'],
  skin: ['#ffd2a6', '#e09a68'],
};

// Color del canto (la cara lateral de la extrusión): la sombra mezclada con tinta.
const side = (hex) => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(INK.slice(1), 16);
  const mix = (sh) => Math.round(((a >> sh) & 255) * 0.55 + ((b >> sh) & 255) * 0.45);
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`;
};

// ---------- utilidades de trazado ----------

const r1 = (n) => Math.round(n * 10) / 10;
let rand = () => 0.5;
const seedFrom = (str) => {
  let s = 2166136261;
  for (const ch of str) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const jit = (a) => (rand() - 0.5) * 2 * a;
const shake = (pts, a = 0.35) => pts.map(([x, y]) => [x + jit(a), y + jit(a)]);

/** Curva suave (Catmull-Rom) que pasa por los puntos. */
function smooth(pts, closed = true, a = 0.3) {
  const p = shake(pts, a);
  const n = p.length;
  const at = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, q1, q2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [q1[0] + (q2[0] - p0[0]) / 6, q1[1] + (q2[1] - p0[1]) / 6];
    const c2 = [q2[0] - (p3[0] - q1[0]) / 6, q2[1] - (p3[1] - q1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(q2[0])} ${r1(q2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/** Polígono con esquinas redondeadas. */
function rpoly(pts, r = 2.5, a = 0.35) {
  const p = shake(pts, a);
  const n = p.length;
  const toward = (from, to, dist) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(dist / len, 0.5);
    return [from[0] + dx * k, from[1] + dy * k];
  };
  let d = '';
  for (let i = 0; i < n; i++) {
    const c = p[i];
    const a1 = toward(c, p[(i - 1 + n) % n], r);
    const b1 = toward(c, p[(i + 1) % n], r);
    d += `${i ? 'L' : 'M'}${r1(a1[0])} ${r1(a1[1])}Q${r1(c[0])} ${r1(c[1])} ${r1(b1[0])} ${r1(b1[1])}`;
  }
  return d + 'Z';
}

/** Círculo/elipse ligeramente irregular. */
function blob(cx, cy, rx, ry = rx, j = 0.03, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + jit(j);
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return smooth(pts, true, 0);
}

/** Puntos de una estrella. */
function starPts(cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const t = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(t) * rad, cy + Math.sin(t) * rad]);
  }
  return pts;
}

/** Hoja: almendra de base a punta con un poco de curva. */
function leaf(x0, y0, x1, y1, w = 4, bend = 2) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const c1 = [mx + nx * (w + bend), my + ny * (w + bend)];
  const c2 = [mx - nx * (w - bend), my - ny * (w - bend)];
  return `M${r1(x0)} ${r1(y0)}Q${r1(c1[0])} ${r1(c1[1])} ${r1(x1)} ${r1(y1)}Q${r1(c2[0])} ${r1(c2[1])} ${r1(x0)} ${r1(y0)}Z`;
}

// ---------- piezas ----------
// S: sólido con volumen · T: tubo con volumen · F: relleno plano con contorno fino
// L: línea de tinta · G: destello blanco
const tone = (t) => (Array.isArray(t) ? t : TONES[t] ?? TONES.gray);
const S = (d, t, extra = {}) => ({ k: 'S', d, t: tone(t), ...extra });
const T = (d, t, w = 4.5) => ({ k: 'T', d, t: tone(t), w });
const F = (d, fill, ow = 1.8) => ({ k: 'F', d, fill, ow });
const L = (d, w = 2, color = INK, op = 1) => ({ k: 'L', d, w, color, op });
const G = (cx, cy, rx = 2.2, ry = rx * 0.75) => ({ k: 'G', d: blob(cx, cy, rx, ry, 0), cx, cy });

// ---------- definiciones ----------
// Cada icono es una función (tono) => piezas. El tono solo lo usan los que cambian de color.

const coinFace = (cx, cy, r) => [
  S(blob(cx, cy, r, r), 'gold'),
  L(blob(cx, cy, r * 0.68, r * 0.68, 0.02), 1.5, INK, 0.55),
  L(`M${cx + 3.6} ${cy - 4.6}c-1-1.5-2.6-2.1-4.1-2-2.2.1-3.6 1.3-3.6 2.9 0 4 8.3 2.4 8.3 6.7 0 1.9-1.8 3.2-4.2 3.2-2 0-3.6-.8-4.5-2.4M${cx} ${cy - 9}v2.4M${cx} ${cy + 6.6}v2.4`, 2.1),
];

const personParts = (ox, oy, s, t) => [
  S(smooth([[ox - 13 * s, oy + 14 * s], [ox - 11.5 * s, oy + 5 * s], [ox - 6 * s, oy + 0.5 * s], [ox, oy - 0.5 * s], [ox + 6 * s, oy + 0.5 * s], [ox + 11.5 * s, oy + 5 * s], [ox + 13 * s, oy + 14 * s]], true), t),
  S(blob(ox, oy - 10 * s, 7.2 * s, 7.8 * s), t),
];

const speaker = () => S(rpoly([[6, 18], [14, 18], [24, 9], [24, 39], [14, 30], [6, 30]], 2.5), 'white');

const ICONS = {
  // --- dinero ---
  coin: () => [...coinFace(23, 22, 17), G(15, 13)],
  coins: () => {
    const c = (y) => [
      S(`M10.5 ${y}v4.5a13.5 4.8 0 0 0 27 0V${y}`, 'gold'),
      S(blob(24, y, 13.5, 4.8, 0.02), 'gold'),
    ];
    return [...c(34), ...c(26.5), ...c(19), L('M18 18.8h12', 1.6, INK, 0.5), ...coinFace(31, 13, 8).slice(0, 1), L(blob(31, 13, 5, 5, 0.02), 1.3, INK, 0.55), G(27.5, 9.5, 1.5)];
  },
  wallet: () => [
    S(rpoly([[11, 9], [35, 6], [36.5, 16], [12, 18]], 2), 'green'),
    L('M17 11.5l12-1.4', 1.6, INK, 0.5),
    S(rpoly([[6, 15], [38, 15], [38, 41], [6, 41]], 4.5), 'brown'),
    S(rpoly([[27, 22], [42, 22], [42, 33], [27, 33]], 3), 'bronze'),
    F(blob(32.5, 27.5, 2.4, 2.4, 0), TONES.gold[0]),
    L('M9.5 20h15', 1.5, INK, 0.45),
  ],

  // --- navegación ---
  play: () => [S(rpoly([[14, 8], [40, 24], [14, 40]], 5), 'green'), G(19, 16, 2)],
  flag: () => [
    S(blob(21, 40, 15, 4.2, 0.02), 'grass'),
    F(blob(21, 40, 5, 1.6, 0), INK, 0),
    S(rpoly([[18.5, 5], [22, 5], [22, 40], [18.5, 40]], 1.5, 0.2), 'white'),
    S(smooth([[21.5, 6.5], [31, 7.5], [40, 9.5], [35, 15], [40.5, 21.5], [30, 21], [21.5, 21]], true, 0.3), 'red'),
    G(27, 10, 1.8),
  ],
  tee: () => [
    S(rpoly([[16, 30], [32, 30], [26, 34], [25.4, 43], [22.6, 43], [22, 34]], 1.6), 'wood'),
    S(blob(24, 18, 12, 12), 'white'),
    ...[[19, 14], [25, 12], [29.5, 17], [24, 19], [19, 21], [28, 23], [23.5, 25.5]].map(([x, y]) => F(blob(x, y, 1.3, 1.3, 0), 'rgba(28,18,51,.22)', 0)),
    G(17.5, 11.5, 2.2),
  ],
  skins: () => [
    S(smooth([[24, 6], [36, 9], [42, 19], [40, 30], [33, 37], [24, 39], [20, 35], [21, 31], [17, 29], [11, 33], [6, 28], [6, 18], [12, 10]], true, 0.3), 'paper'),
    F(blob(13, 23.5, 3, 2.6), TONES.dark[1]),
    F(blob(18, 14, 3.3, 3), TONES.red[0]),
    F(blob(27, 12, 3.3, 3), TONES.gold[0]),
    F(blob(35, 18, 3.3, 3), TONES.blue[0]),
    F(blob(34, 28, 3.3, 3), TONES.green[0]),
    G(22, 9.5, 1.6),
  ],
  trophy: () => [
    T('M14 12.5c-6.5-1-8 8 1 10.5M34 12.5c6.5-1 8 8-1 10.5', 'gold', 4),
    S(rpoly([[21.5, 27], [26.5, 27], [27.5, 34], [20.5, 34]], 1.5), 'gold'),
    S('M12.5 7.5H35.5V16.5C35.5 25 30.5 29.5 24 29.5S12.5 25 12.5 16.5Z', 'gold'),
    S(rpoly([[13, 34], [35, 34], [36.5, 42], [11.5, 42]], 2.5), 'dark'),
    F(rpoly([[19, 36.5], [29, 36.5], [29, 39.5], [19, 39.5]], 1), TONES.gold[0], 1.4),
    F(rpoly(starPts(24, 17, 5.2, 2.2), 0.6, 0.1), '#fff6c8', 1.4),
    G(16.5, 12, 1.6),
  ],
  medal: (t = 'gold', num = 1) => [
    S(rpoly([[12, 4], [20, 4], [26, 20], [18, 20]], 1.5), 'red'),
    S(rpoly([[36, 4], [28, 4], [22, 20], [30, 20]], 1.5), 'blue'),
    S(blob(24, 29, 12.5, 12.5), t),
    L(blob(24, 29, 8.8, 8.8, 0.02), 1.4, INK, 0.5),
    L({ 1: 'M21.6 25.6l3.4-2.4v12.2', 2: 'M20.5 25.5c.6-2.3 6.6-2.9 6.8.5.2 2.6-6.6 5.4-6.9 9.2h7.4', 3: 'M20.8 24.2h6.6l-3.8 4.3c3.3-.4 4.7 1.2 4.6 3.3-.1 3.1-5 4.1-7.3 1.8' }[num] ?? '', 2.4),
    G(18, 23, 2),
  ],
  user: (t = 'blue') => [...personParts(24, 28, 1, t), G(20.5, 14.5, 1.8)],
  users: () => [...personParts(31, 25, 0.82, 'purple'), ...personParts(19, 29, 0.95, 'blue'), G(16, 16.5, 1.6)],
  'user-plus': () => [...personParts(20, 28, 0.95, 'blue'), S(blob(36, 33, 8.5, 8.5), 'green'), T('M36 28.5v9M31.5 33h9', 'white', 2.6), G(16.5, 15, 1.6)],

  // --- controles ---
  sound: () => [speaker(), T('M29.5 18c3 2.6 3 9.4 0 12', 'cyan', 3.4), T('M34.5 12.5c6 4.5 6 18.5 0 23', 'cyan', 3.4), G(10, 21, 1.4)],
  mute: () => [speaker(), T('M30 18l11 12M41 18L30 30', 'red', 3.6), G(10, 21, 1.4)],
  fullscreen: () => ['M7 18V8h10', 'M31 8h10v10', 'M41 30v10H31', 'M17 40H7V30'].map((d) => T(d, 'white', 4.6)),
  gear: () => {
    const pts = [];
    const teeth = 8;
    for (let i = 0; i < teeth * 4; i++) {
      const t = -Math.PI / 2 + (i / (teeth * 4)) * Math.PI * 2 - Math.PI / (teeth * 4) * 1.5;
      const rad = i % 4 < 2 ? 18 : 13;
      pts.push([24 + Math.cos(t) * rad, 24 + Math.sin(t) * rad]);
    }
    return [S(rpoly(pts, 1.4, 0.25), 'silver'), F(blob(24, 24, 6, 6), TONES.dark[1]), G(15, 13, 1.6)];
  },
  restart: () => [T('M37.5 27.5A14 14 0 1 1 33.5 13.5', 'green', 4.8), S(rpoly([[28, 17], [36, 6.5], [41.5, 20.5]], 2), 'green')],
  map: () => [
    S(rpoly([[5, 12], [17, 7.5], [17, 37], [5, 41.5]], 1.6), 'paper'),
    S(rpoly([[17, 7.5], [31, 12], [31, 41.5], [17, 37]], 1.6), 'wood'),
    S(rpoly([[31, 12], [43, 7.5], [43, 37], [31, 41.5]], 1.6), 'paper'),
    L('M9 34c3-6 9-2 12-8s8-3 10-7', 1.8, TONES.red[1], 1),
    T('M34 16.5l5 5M39 16.5l-5 5', 'red', 2.2),
  ],
  eye: () => [
    S(smooth([[4, 24], [14, 13], [24, 10], [34, 13], [44, 24], [34, 35], [24, 38], [14, 35]], true, 0.2), 'white'),
    S(blob(24, 24, 9, 9), 'blue'),
    F(blob(24, 24, 4.2, 4.2, 0), INK, 0),
    G(21, 20.5, 2),
  ],
  lock: () => [
    T('M15.5 22v-7a8.5 8.5 0 0 1 17 0v7', 'silver', 4.6),
    S(rpoly([[9, 21], [39, 21], [39, 42], [9, 42]], 4.5), 'gold'),
    F('M24 27a3.2 3.2 0 0 0-1.8 5.8l-.9 4.7h5.4l-.9-4.7A3.2 3.2 0 0 0 24 27z', TONES.dark[1], 0),
    G(14, 25, 1.6),
  ],
  check: (t = 'green') => [T('M9 25l9.5 9.5L39 13', t, 6.5)],
  close: (t = 'red') => [T('M13 13l22 22M35 13L13 35', t, 6.5)],
  plus: (t = 'green') => [T('M24 9v30M9 24h30', t, 6.5)],
  back: () => [S(rpoly([[5, 24], [21, 9], [21, 18], [42, 18], [42, 30], [21, 30], [21, 39]], 2.4), 'white')],
  next: () => [S(rpoly([[43, 24], [27, 9], [27, 18], [6, 18], [6, 30], [27, 30], [27, 39]], 2.4), 'white')],
  logout: () => [
    S(rpoly([[8, 6], [29, 6], [29, 42], [8, 42]], 2.5), 'brown'),
    L('M12.5 11v26M24.5 11v26', 1.4, INK, 0.35),
    F(blob(24.5, 24.5, 1.8, 1.8, 0), TONES.gold[0], 1.2),
    S(rpoly([[20, 20], [31, 20], [31, 13], [43, 24], [31, 35], [31, 28], [20, 28]], 2), 'red'),
  ],
  shield: () => [
    S('M24 4.5L40.5 10.5V22C40.5 32 33.5 39 24 43.5 14.5 39 7.5 32 7.5 22V10.5Z', 'blue'),
    T('M16.5 23.5l5.5 5.5 10-11', 'white', 3.4),
  ],
  pencil: () => [
    S(rpoly([[10.8, 30.8], [17.2, 37.2], [6.5, 41.5]], 0.8), 'wood'),
    F(rpoly([[6.5, 41.5], [8.3, 36.6], [11.4, 39.7]], 0.4, 0.05), INK, 0),
    S(rpoly([[10.8, 30.8], [28.8, 12.8], [35.2, 19.2], [17.2, 37.2]], 1), 'gold'),
    S(rpoly([[28.8, 12.8], [32.8, 8.8], [39.2, 15.2], [35.2, 19.2]], 1), 'silver'),
    S(rpoly([[32.8, 8.8], [35.5, 6], [42, 12.5], [39.2, 15.2]], 1.8), 'pink'),
    L('M14 34l18-18', 1.3, INK, 0.35),
  ],
  upload: () => [
    S(rpoly([[5, 9], [37, 9], [37, 35], [5, 35]], 3.5), 'white'),
    F(rpoly([[8, 31], [16, 20], [22, 27], [27, 22], [34, 31]], 1.2, 0.2), TONES.grass[0], 1.5),
    F(blob(28, 16, 3, 3), TONES.gold[0], 1.5),
    S(blob(36, 35, 8.5, 8.5), 'green'),
    T('M36 39.5v-9M32 34l4-4 4 4', 'white', 2.6),
  ],
  trash: () => [
    S(rpoly([[11, 15], [37, 15], [34, 42], [14, 42]], 2.5), 'gray'),
    L('M19 20l1 17M24 20v17M29 20l-1 17', 1.6, INK, 0.45),
    T('M19 9.5h10', 'gray', 3),
    S(rpoly([[8, 10], [40, 10], [40, 16], [8, 16]], 2), 'silver'),
  ],
  hourglass: () => [
    S(smooth([[13, 9], [35, 9], [33, 18], [26, 24], [33, 30], [35, 39], [13, 39], [15, 30], [22, 24], [15, 18]], true, 0.2), ['#e8f6ff', '#9cc7e6']),
    F(smooth([[17, 15], [31, 15], [24, 22]], true, 0), TONES.gold[0], 1.4),
    F(smooth([[16.5, 37], [24, 29], [31.5, 37]], true, 0), TONES.gold[0], 1.4),
    S(rpoly([[9, 5], [39, 5], [39, 10], [9, 10]], 2), 'wood'),
    S(rpoly([[9, 38], [39, 38], [39, 43], [9, 43]], 2), 'wood'),
  ],

  // --- peligros del campo ---
  fire: () => [
    S(smooth([[24, 3.5], [30, 12], [36.5, 18.5], [39, 28.5], [34, 39], [24, 43.5], [14, 39], [9.5, 30], [12.5, 20.5], [18, 25], [19, 14]], true, 0.3), 'orange'),
    F(smooth([[24, 20], [29.5, 27.5], [31, 35], [24, 40], [17.5, 35.5], [18.5, 28.5], [22, 31]], true, 0.2), TONES.gold[0], 1.6),
    G(17, 21, 1.4),
  ],
  drop: () => [
    S(smooth([[24, 4], [31, 15], [37.5, 26], [35.5, 36], [24, 43], [12.5, 36], [10.5, 26], [17, 15]], true, 0.2), 'blue'),
    T('M17 29c0 4 2.5 6.5 5.5 7.5', 'white', 2.2),
    G(19, 22, 1.4),
  ],
  palm: () => [
    S(blob(26, 41, 14, 3.6, 0.02), 'paper'),
    T('M27.5 40C27.5 31 25.5 24 22 18', 'brown', 5),
    L('M24.6 25.5l4.4-1M26.2 31.5l4-.6M23 21l4.2-1.6', 1.3, INK, 0.5),
    S(smooth([[22, 16], [14, 12.5], [6, 15], [3, 22], [8, 19.5], [14, 19]], true, 0.2), 'green', { sh: 0.6 }),
    S(smooth([[22, 16], [31, 13], [40, 15.5], [44.5, 23], [38, 20], [31, 20]], true, 0.2), 'green', { sh: 0.6 }),
    S(smooth([[22, 16], [16, 9], [10, 4.5], [17, 4], [23, 8]], true, 0.2), 'green', { sh: 0.6 }),
    S(smooth([[22, 16], [26, 7.5], [33, 3.5], [38, 7], [30, 10]], true, 0.2), 'green', { sh: 0.6 }),
    S(blob(20, 19.5, 2.7, 2.7), 'brown'),
    S(blob(25, 20, 2.7, 2.7), 'brown'),
  ],
  pit: () => [
    S(blob(24, 33, 20, 9, 0.03, 12), 'grass'),
    F(blob(24, 33, 10.5, 4.6, 0.02), INK, 0),
    S(blob(24, 15, 7, 7), 'white'),
    L('M14 9v5M34 9v5M18 4.5v4M30 4.5v4', 2, '#fff', 0.55),
    G(21.5, 12.5, 1.5),
  ],

  // --- formas sueltas (rarezas, premios) ---
  star: (t = 'gold') => [S(rpoly(starPts(24, 25.5, 20, 9), 2.2, 0.3), t), G(19, 17, 2)],
  sparkle: (t = 'gold') => [
    S(rpoly([[22, 5], [26.5, 19.5], [42, 24], [26.5, 28.5], [22, 44], [17.5, 28.5], [3, 24], [17.5, 19.5]], 2.2, 0.2), t, { sh: 0.7 }),
    S(rpoly([[38.5, 3], [40.5, 8.5], [46, 10.5], [40.5, 12.5], [38.5, 18], [36.5, 12.5], [31, 10.5], [36.5, 8.5]], 1, 0.05), 'white', { sh: 0.4 }),
  ],
  dot: (t = 'gray') => [S(blob(24, 24, 15, 15), t), G(18.5, 17.5, 2.6)],
  diamond: (t = 'green') => [S(rpoly([[24, 4], [42, 24], [24, 44], [6, 24]], 3), t), G(18, 20, 2)],
  triangle: (t = 'blue') => [S(rpoly([[24, 6], [43, 40], [5, 40]], 4), t), G(20, 22, 2)],
  pentagon: (t = 'purple') => [S(rpoly(starPts(24, 25, 19, 19, 5).filter((_, i) => i % 2 === 0), 3.5), t), G(18, 17, 2)],
  gem: (t = 'cyan') => [
    S(rpoly([[13, 8], [35, 8], [43.5, 18.5], [24, 42.5], [4.5, 18.5]], 1.6), t),
    L('M5 18.5h38.5M13 8l5 10.5L24 8l6 10.5L35 8M18 18.5l6 24 6-24', 1.4, INK, 0.75),
    G(14, 12.5, 1.6),
  ],
  bolt: () => [S(rpoly([[28, 3], [10, 27], [22, 27], [17.5, 45], [38, 19.5], [26.5, 19.5], [32, 3]], 1.6), 'gold'), G(23, 11, 1.4)],

  // --- avatares ---
  clubs: () => [
    T('M11 6l23 33', 'silver', 3.4),
    T('M37 6L14 39', 'silver', 3.4),
    S(rpoly([[30, 37], [38, 37.5], [39, 43], [29, 42]], 2), 'gray'),
    S(rpoly([[18, 37], [10, 37.5], [9, 43], [19, 42]], 2), 'gray'),
    S(blob(24, 22, 7.5, 7.5), 'white'),
    ...[[22, 19.5], [26.5, 21], [23, 24.5]].map(([x, y]) => F(blob(x, y, 1.1, 1.1, 0), 'rgba(28,18,51,.25)', 0)),
    G(21, 18.5, 1.4),
  ],
  crown: () => [
    S(rpoly([[6, 15], [15, 27], [24, 11], [33, 27], [42, 15], [38, 38], [10, 38]], 2.2), 'gold'),
    S(blob(6, 13.5, 3.2, 3.2), 'gold'),
    S(blob(24, 9, 3.4, 3.4), 'gold'),
    S(blob(42, 13.5, 3.2, 3.2), 'gold'),
    L('M11.5 32.5h25', 1.6, INK, 0.45),
    F(rpoly([[24, 26], [27.5, 29.5], [24, 33], [20.5, 29.5]], 1, 0.1), TONES.red[0], 1.5),
    F(blob(15.5, 30, 2, 2, 0), TONES.blue[0], 1.4),
    F(blob(32.5, 30, 2, 2, 0), TONES.green[0], 1.4),
  ],
  skull: () => [
    S(smooth([[24, 5], [35.5, 9], [40.5, 20], [37.5, 29.5], [33, 31], [33, 39], [15, 39], [15, 31], [10.5, 29.5], [7.5, 20], [12.5, 9]], true, 0.3), 'white'),
    F(blob(17, 21.5, 4.6, 5), INK, 0),
    F(blob(31, 21.5, 4.6, 5), INK, 0),
    F(rpoly([[24, 26], [26.5, 30.5], [21.5, 30.5]], 0.8, 0.1), INK, 0),
    L('M19.5 33.5v5M24 33.5v5.5M28.5 33.5v5', 1.6),
    G(17, 11, 2),
  ],
  robot: () => [
    T('M24 11V5', 'gray', 2.4),
    S(blob(24, 4.5, 3, 3), 'red'),
    S(rpoly([[4, 20], [9, 20], [9, 31], [4, 31]], 1.5), 'gray'),
    S(rpoly([[39, 20], [44, 20], [44, 31], [39, 31]], 1.5), 'gray'),
    S(rpoly([[8.5, 11], [39.5, 11], [39.5, 40], [8.5, 40]], 6), 'silver'),
    F(rpoly([[14, 18.5], [21.5, 18.5], [21.5, 25.5], [14, 25.5]], 2), TONES.cyan[0], 1.6),
    F(rpoly([[26.5, 18.5], [34, 18.5], [34, 25.5], [26.5, 25.5]], 2), TONES.cyan[0], 1.6),
    F(rpoly([[15, 30], [33, 30], [33, 35], [15, 35]], 1.5), TONES.dark[1], 1.4),
    L('M19.5 30v5M24 30v5M28.5 30v5', 1.2, '#a9b6c7', 1),
    G(14, 14.5, 1.6),
  ],
  wolf: () => [
    S(rpoly([[8, 3], [18, 13], [30, 13], [40, 3], [42, 20], [38.5, 30], [29, 40], [24, 43.5], [19, 40], [9.5, 30], [6, 20]], 2.2), 'gray'),
    F(rpoly([[11, 9], [17, 14.5], [12.5, 18]], 1, 0.1), TONES.pink[0], 1.3),
    F(rpoly([[37, 9], [31, 14.5], [35.5, 18]], 1, 0.1), TONES.pink[0], 1.3),
    F(smooth([[24, 24.5], [31, 28], [30, 36], [24, 40.5], [18, 36], [17, 28]], true, 0.2), TONES.white[0], 1.6),
    F(blob(24, 29, 3.4, 2.4), INK, 0),
    F(smooth([[12.5, 21.5], [17, 18.5], [20.5, 21.5], [16, 23.5]], true, 0), TONES.gold[0], 1.4),
    F(smooth([[35.5, 21.5], [31, 18.5], [27.5, 21.5], [32, 23.5]], true, 0), TONES.gold[0], 1.4),
    L('M24 31.5v3.5M21 36.5c1.5 1 4.5 1 6 0', 1.4),
  ],
  eagle: () => [
    S(smooth([[12, 44], [16, 35], [27, 31], [40, 35], [44, 44]], true, 0.3), 'brown'),
    S(smooth([[14, 15], [21, 7.5], [31, 6.5], [39.5, 12.5], [41, 23], [37, 32], [28, 38], [20, 36.5], [23, 28.5], [18, 24]], true, 0.3), 'white'),
    S(smooth([[17, 13], [9, 13], [3.5, 18.5], [4, 26.5], [8, 22.5], [13.5, 23.5], [19.5, 21.5]], true, 0.2), 'gold'),
    F(blob(25, 17, 2.6, 2.6, 0), INK, 0),
    L('M19.5 12.5l9 2.5', 2.4),
    G(31, 11, 1.6),
  ],
  dragon: () => [
    S(rpoly([[12.5, 16], [5, 3], [19.5, 11]], 2), 'gold'),
    S(rpoly([[35.5, 16], [43, 3], [28.5, 11]], 2), 'gold'),
    S(smooth([[12, 14], [24, 10], [36, 14], [41, 26], [35.5, 38], [24, 43.5], [12.5, 38], [7, 26]], true, 0.3), 'dragon'),
    F(blob(24, 33.5, 10, 6.5), '#b8f5a8', 1.6),
    F(blob(20.5, 32.5, 1.3, 1.6, 0), INK, 0),
    F(blob(27.5, 32.5, 1.3, 1.6, 0), INK, 0),
    F(smooth([[12, 21.5], [16.5, 18.5], [20.5, 22], [16, 24.5]], true, 0), TONES.gold[0], 1.4),
    F(smooth([[36, 21.5], [31.5, 18.5], [27.5, 22], [32, 24.5]], true, 0), TONES.gold[0], 1.4),
    L('M16.3 19.5v4.5M31.7 19.5v4.5', 1.5),
    L('M20 13.5l4 3 4-3', 1.6, INK, 0.5),
  ],
};

// Avatares: id guardado en la cuenta → icono. 'golf' y 'ball' se mantienen por compatibilidad.
export const AVATAR_ICON_MAP = {
  golf: 'flag', ball: 'clubs', crown: 'crown', fire: 'fire', bolt: 'bolt', skull: 'skull',
  dragon: 'dragon', wolf: 'wolf', eagle: 'eagle', robot: 'robot', gem: 'gem', star: 'star',
};

// Rarezas de skin → forma y tono
export const TIER_ICONS = {
  common: ['dot', 'gray'],
  uncommon: ['diamond', 'green'],
  rare: ['triangle', 'blue'],
  epic: ['pentagon', 'purple'],
  legendary: ['star', 'gold'],
  mythic: ['sparkle', 'red'],
};

export const ICON_NAMES = Object.keys(ICONS);

// ---------- pintado ----------

const cache = new Map();
function parts(name, t, arg) {
  const key = `${name}|${t ?? ''}|${arg ?? ''}`;
  if (!cache.has(key)) {
    rand = seedFrom(key);
    cache.set(key, ICONS[name](t, arg));
  }
  return cache.get(key);
}

let uid = 0;
const EXT = 'translate(1.3 2.6)';

function body(ps, id) {
  const ext = ps
    .filter((p) => p.k === 'S' || p.k === 'T')
    .map((p) => (p.k === 'T'
      ? `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width="${p.w + SW}" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${p.d}" fill="none" stroke="${side(p.t[1])}" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${p.d}" fill="${side(p.t[1])}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`))
    .join('');
  let defs = '';
  let out = `<g transform="${EXT}">${ext}</g>`;
  ps.forEach((p, i) => {
    if (p.k === 'S') {
      const cid = `${id}${i}`;
      defs += `<clipPath id="${cid}"><path d="${p.d}"/></clipPath>`;
      out += `<path d="${p.d}" fill="${p.t[1]}"/>`
        + `<g clip-path="url(#${cid})"><path d="${p.d}" fill="${p.t[0]}" transform="translate(${r1(-2.2 * (p.sh ?? 1))} ${r1(-2.8 * (p.sh ?? 1))})"/>`
        + `<path d="${p.d}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.8" transform="translate(2.1 2.3)"/></g>`
        + `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`
        + `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width=".8" stroke-opacity=".35" transform="translate(-.8 .6)"/>`;
    } else if (p.k === 'T') {
      const base = `d="${p.d}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
      out += `<path ${base} stroke="${INK}" stroke-width="${p.w + SW}"/>`
        + `<path ${base} stroke="${p.t[1]}" stroke-width="${p.w}"/>`
        + `<path ${base} stroke="${p.t[0]}" stroke-width="${Math.max(p.w - 2, 1)}" transform="translate(-.6 -.8)"/>`
        + `<path ${base} stroke="#fff" stroke-opacity=".55" stroke-width="${Math.max(p.w * 0.22, 0.8)}" transform="translate(-1 -1.3)"/>`;
    } else if (p.k === 'F') {
      out += `<path d="${p.d}" fill="${p.fill}"${p.ow ? ` stroke="${INK}" stroke-width="${p.ow}" stroke-linejoin="round"` : ''}/>`;
    } else if (p.k === 'L') {
      out += `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-width="${p.w}" stroke-opacity="${p.op}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (p.k === 'G') {
      out += `<path d="${p.d}" fill="#fff" fill-opacity=".9" transform="rotate(-30 ${p.cx} ${p.cy})"/>`;
    }
  });
  return { defs, out };
}

/**
 * Devuelve el <svg> del icono como texto.
 * @param {string} name   nombre del icono (ver ICON_NAMES)
 * @param {object} [o]
 * @param {string} [o.tone]  tono para los que cambian de color (star, medal, check...)
 * @param {*}      [o.arg]   dato extra (medal: el número 1, 2 o 3)
 * @param {number|string} [o.size] tamaño; por defecto lo marca la clase .gi (1.25em)
 * @param {string} [o.cls]   clases extra
 * @param {string} [o.label] texto accesible; sin él el icono es decorativo
 */
export function icon(name, { tone: t, arg, size, cls = '', label } = {}) {
  if (!ICONS[name]) return '';
  const id = `gi${(uid++).toString(36)}_`;
  const { defs, out } = body(parts(name, t, arg), id);
  const dim = size != null ? ` width="${size}" height="${size}"` : '';
  const a11y = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="gi gi-${name} ${cls}" viewBox="-1 -1 51 51"${dim}${a11y} focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${out}</svg>`;
}

/** El mismo icono como data URL, para fondos CSS o <img>. */
export function iconUrl(name, o = {}) {
  const svg = icon(name, { ...o, size: o.size ?? 48 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Icono de una rareza de skin. */
export const tierIcon = (tier, o = {}) => {
  const [name, t] = TIER_ICONS[tier] ?? TIER_ICONS.common;
  return icon(name, { tone: t, ...o });
};

/** Icono de avatar por id guardado. */
export const avatarIcon = (id, o = {}) => icon(AVATAR_ICON_MAP[id] ?? 'flag', o);
