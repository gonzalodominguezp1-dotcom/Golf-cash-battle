// Física 2D del minigolf sobre el plano (x, z). Sin dependencias de Three.js:
// el servidor la usa para repetir cada golpe y validar el resultado.
//
// Tiene que dar exactamente los mismos números en cualquier navegador y en el
// servidor, así que solo usa + - * / y Math.sqrt (exactos según IEEE 754).
// Nada de Math.sin, Math.cos o Math.hypot, que cambian según el motor.
export const BALL_R = 0.13;
export const CUP_R = 0.24;
export const WALL_HALF = 0.15;
export const MAX_SHOT_SPEED = 13;
const ROLL_DRAG = 0.42; // proporcional a la velocidad
const ROLL_DECEL = 1.1; // constante
const SAND_FACTOR = 6.5;
// en el hielo la bola apenas frena: resbala y llega mucho más lejos
const ICE_FACTOR = 0.3;
const RESTITUTION = 0.72;
const CUP_CAPTURE_SPEED = 3.5;
const STOP_SPEED = 0.06;
const BOOST_ACCEL = 40;
// en una pendiente más fuerte que el rozamiento la bola nunca se queda quieta:
// rueda hasta llano (las pendientes siempre acaban en llano, nunca en pared)
export const MIN_SLOPE_ACCEL = 1.5;

export const DT = 1 / 120; // paso fijo de la simulación

const HALF_PI = 1.5707963267948966;
const hyp = (x, z) => Math.sqrt(x * x + z * z);

// seno y coseno deterministas: reducción a [-π/4, π/4] y polinomio de Taylor
function sinPoly(r) {
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))));
}
function cosPoly(r) {
  const r2 = r * r;
  return 1 + r2 * (-1 / 2 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600 + r2 * (-1 / 87178291200 + r2 / 20922789888000)))))));
}
export function dsin(x) {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  return q === 0 ? sinPoly(r) : q === 1 ? cosPoly(r) : q === 2 ? -sinPoly(r) : -cosPoly(r);
}
export const dcos = (x) => dsin(x + HALF_PI);

/**
 * Un golpe: dirección (yaw, 0 = hacia -z) y potencia 0..1. Se redondean para
 * que el servidor reciba exactamente lo mismo que se jugó.
 */
export function quantizeShot(yaw, power) {
  return { yaw: Math.round(yaw * 1e4) / 1e4, power: Math.round(Math.min(1, Math.max(0, power)) * 1e3) / 1e3 };
}

export function shotVelocity(yaw, power) {
  const speed = power * MAX_SHOT_SPEED;
  return { vx: dsin(yaw) * speed, vz: -dcos(yaw) * speed };
}

/** Paredes que se dibujan: el contorno, las zonas elevadas y las paredes del hoyo. */
export function wallSegmentsOf(course) {
  const segs = [];
  // el contorno y las zonas elevadas aparte (tiers), cada una cerrada por paredes
  for (const o of [course.outline, ...(course.tiers ?? []).map((t) => t.poly)]) {
    for (let i = 0; i < o.length; i++) segs.push([o[i], o[(i + 1) % o.length]]);
  }
  return segs.concat(course.walls);
}

/** Todo contra lo que choca la bola: las paredes y la estructura de los loopings (que ya dibuja su carril). */
export function segmentsOf(course) {
  return wallSegmentsOf(course).concat((course.loops ?? []).flatMap(loopWalls));
}

export function spinnerSegment(sp, t) {
  const a = sp.speed * t;
  const dx = (dcos(a) * sp.len) / 2;
  const dz = (dsin(a) * sp.len) / 2;
  return [[sp.x - dx, sp.z - dz], [sp.x + dx, sp.z + dz]];
}

function closestOnSegment(px, pz, [[ax, az], [bx, bz]]) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return [ax + vx * t, az + vz * t];
}

function bounce(ball, nx, nz, overlap, surfVx = 0, surfVz = 0) {
  ball.x += nx * overlap;
  ball.z += nz * overlap;
  const rvx = ball.vx - surfVx, rvz = ball.vz - surfVz;
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) {
    ball.vx -= (1 + RESTITUTION) * vn * nx;
    ball.vz -= (1 + RESTITUTION) * vn * nz;
    return Math.abs(vn);
  }
  return 0;
}

function collideSegment(ball, seg, surfVx, surfVz) {
  const [cx, cz] = closestOnSegment(ball.x, ball.z, seg);
  const dx = ball.x - cx, dz = ball.z - cz;
  const d = hyp(dx, dz);
  const minD = BALL_R + WALL_HALF;
  if (d < minD && d > 1e-6) return bounce(ball, dx / d, dz / d, minD - d, surfVx, surfVz);
  return 0;
}

export function moverPos(m, t) {
  const o = dsin(t * m.speed + (m.phase ?? 0)) * m.range;
  const v = dcos(t * m.speed + (m.phase ?? 0)) * m.range * m.speed;
  return m.axis === 'x' ? { x: m.x + o, z: m.z, vx: v, vz: 0 } : { x: m.x, z: m.z + o, vx: 0, vz: v };
}

function collideBox(ball, cx, cz, hw, hd, svx, svz) {
  const px = Math.max(cx - hw, Math.min(ball.x, cx + hw));
  const pz = Math.max(cz - hd, Math.min(ball.z, cz + hd));
  let dx = ball.x - px, dz = ball.z - pz;
  let d = hyp(dx, dz);
  if (d < 1e-6) {
    // centro dentro de la caja: sale por el lado más cercano
    const ox = hw - Math.abs(ball.x - cx), oz = hd - Math.abs(ball.z - cz);
    if (ox < oz) return bounce(ball, Math.sign(ball.x - cx) || 1, 0, ox + BALL_R, svx, svz);
    return bounce(ball, 0, Math.sign(ball.z - cz) || 1, oz + BALL_R, svx, svz);
  }
  if (d < BALL_R) return bounce(ball, dx / d, dz / d, BALL_R - d, svx, svz);
  return 0;
}

const inRect = (r, x, z) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
export const onBoost = (course, x, z) => (course.boosts ?? []).find((b) => inRect(b, x, z));

export function inSand(course, x, z) {
  return course.sand.some((s) => inRect(s, x, z));
}

/** Placas de hielo: rectángulos como la arena, pero casi sin rozamiento. */
export const onIce = (course, x, z) => (course.ice ?? []).some((r) => inRect(r, x, z));

// cuánto frena el suelo: la arena mucho, el hielo casi nada
const grip = (course, x, z) => (inSand(course, x, z) ? SAND_FACTOR : course.ice && onIce(course, x, z) ? ICE_FACTOR : 1);

/** Pendientes: rectángulos que empujan la bola cuesta abajo (dir) con aceleración accel. */
export const onSlope = (course, x, z) => (course.slopes ?? []).find((s) => inRect(s, x, z));

// Las cuestas no empiezan de golpe: en los bordes (EASE metros) la inclinación
// sube suave, como un césped de verdad. smooth es el smoothstep de 0 a 1.
const EASE = 0.6;
const smooth = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : t * t * (3 - 2 * t));
/** Qué parte de la inclinación máxima hay a distancia a del borde de arriba en una cuesta de largo len. */
export function easeFactor(a, len) {
  const e = Math.min(EASE, len / 4);
  return smooth(a / e) * smooth((len - a) / e);
}
const slopeLen = (s) => (s.dir[0] !== 0 ? s.w : s.d);
/** Aceleración de la pendiente en (x, z), ya suavizada en los bordes. */
export function slopeAccel(s, x, z) {
  const len = slopeLen(s);
  const a = (x - s.x) * s.dir[0] + (z - s.z) * s.dir[1] + len / 2;
  return s.accel * easeFactor(a, len);
}

/**
 * Montículos (el volcán): ladera circular entre top y base que echa la bola
 * hacia fuera con accel. Dentro de top (la cima) y fuera de base es llano.
 */
export function onMound(course, x, z) {
  for (const m of course.mounds ?? []) {
    const dx = x - m.x, dz = z - m.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > m.top * m.top && d2 < m.base * m.base) return m;
  }
  return null;
}
/** Aceleración hacia fuera del montículo a distancia d del centro, suavizada al pie y en la cima. */
export const moundAccel = (m, d) => m.accel * easeFactor(m.base - d, m.base - m.top);

/**
 * Molinos: las aspas tapan la puerta (de ancho w, a lo largo de x) cuando una
 * pasa por abajo. Solo usa + - * / y Math.floor para que sea igual en todas partes.
 */
export const BLADE_HALF = 0.3;
const TWO_PI = 6.283185307179586;
export function windmillBlocks(wm, t) {
  const period = TWO_PI / wm.blades;
  const a = wm.speed * t + (wm.phase ?? 0);
  const ph = a - Math.floor(a / period) * period;
  return ph < BLADE_HALF || ph > period - BLADE_HALF;
}
export const WINDMILL_GATE_HALF = 0.08;

// ---------- lava y rampas ----------
//
// La lava son polígonos: la bola que la toca (con el centro dentro) se quema
// y vuelve, parada, al sitio desde el que se golpeó (ball.from). El golpe
// cuenta: esa es la penalización.
// Una rampa es un rectángulo que sube h a lo largo de dir (como una pendiente
// pero hacia arriba). Si la bola pasa por el labio de arriba sale volando con
// el ángulo del labio (lift, la tangente; más empinado que la cuña):
// ball.air = { y, vy } mientras está en el aire, sin rozamiento y por encima
// de la lava, las setas y las aspas. Al caer bota una vez y sigue rodando.

// altura (de la parte de abajo de la bola) a la que pasa por encima de una pared
export const WALL_TOP = 0.36;
const LAND_KEEP = 0.8; // velocidad que conserva al tocar el suelo tras un salto
const HOP_KEEP = 0.3; // el bote: parte de la velocidad vertical que devuelve el suelo
const HOP_MIN = 1.6; // por debajo de esta velocidad de caída ya no bota

/** ¿Está (x, z) dentro del polígono? (regla par-impar, solo + - * /). */
export function insidePoly(poly, x, z) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ok = !ok;
  }
  return ok;
}

/** La lava en la que está el centro de la bola (o undefined). */
export const inLava = (course, x, z) => (course.lava ?? []).find((l) => insidePoly(l.poly, x, z));
/**
 * Agujeros (pits): polígonos sin suelo. Para la física son como la lava (la
 * bola que cae vuelve parada al sitio del golpe); solo se dibujan distinto.
 */
export const inPit = (course, x, z) => (course.pits ?? []).find((p) => insidePoly(p.poly, x, z));
const hasHazards = (course) => !!(course.lava || course.pits);

export const onRamp = (course, x, z) => (course.ramps ?? []).find((r) => inRect(r, x, z));
const rampLen = (r) => (r.dir[0] !== 0 ? r.w : r.d);
/** Lo recorrido desde el pie de la rampa (0) hasta el labio (su largo). */
export const rampAlong = (r, x, z) => (x - r.x) * r.dir[0] + (z - r.z) * r.dir[1] + rampLen(r) / 2;
/** Altura de la rampa en (x, z) (0 fuera). */
export function rampHeight(course, x, z) {
  const r = onRamp(course, x, z);
  return r ? (r.h * rampAlong(r, x, z)) / rampLen(r) : 0;
}
/** Lo que frena la rampa al subirla: g · inclinación. */
export const rampAccel = (r) => (GRAVITY * r.h) / rampLen(r);

/** ¿Ha pasado la bola (de p a ball) por el labio de una rampa hacia delante? */
function rampLaunch(course, ball, px, pz) {
  const ramps = course.ramps ?? [];
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const len = rampLen(r);
    const lat = (px - r.x) * r.dir[1] - (pz - r.z) * r.dir[0];
    const across = r.dir[0] !== 0 ? r.d : r.w;
    if (lat > across / 2 || lat < -across / 2) continue;
    const u = ball.vx * r.dir[0] + ball.vz * r.dir[1];
    if (u > 0 && rampAlong(r, px, pz) < len && rampAlong(r, ball.x, ball.z) >= len) {
      // el labio levanta la bola con la pendiente lift (tangente del ángulo de salida)
      const lift = r.lift ?? r.h / len;
      const k = 1 / Math.sqrt(1 + lift * lift);
      // maxV: rampa que frena (barro, tablas); el salto no pasa de cierto largo
      const v = Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz) * k;
      const cap = r.maxV && v > r.maxV ? r.maxV / v : 1;
      ball.vx *= k * cap;
      ball.vz *= k * cap;
      return { y: r.h, vy: u * lift * k * cap, ramp: i };
    }
  }
  return null;
}

/** La bola cae en la lava: vuelve parada al sitio del golpe. */
function burn(course, ball) {
  const at = [ball.x, ball.z];
  const [x, z] = ball.from ?? course.tee;
  Object.assign(ball, { x, z, vx: 0, vz: 0, air: null, from: null });
  return at;
}

/**
 * Un paso en el aire: vuelo parabólico. Las paredes solo paran la bola si va
 * más baja que su remate (WALL_TOP); por encima las salta, y si cae fuera
 * del campo vuelve al sitio del golpe, como en el agua.
 */
function airStep(course, segs, ball, dt) {
  const a = ball.air;
  const vy = a.vy - GRAVITY * dt;
  const y = a.y + vy * dt;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  let hit = 0;
  if (y < WALL_TOP) for (const seg of segs) hit = Math.max(hit, collideSegment(ball, seg, 0, 0));
  const out = { sunk: false, hit, bumper: -1, portal: -1, air: true, landed: false };
  if (y > 0) {
    ball.air = { y, vy };
    return out;
  }
  // toca el suelo: si cae en lava se quema; si no, bota o se queda rodando
  out.landed = true;
  out.impact = -vy;
  if (!insidePoly(course.outline, ball.x, ball.z)) {
    out.outside = true;
    out.lava = burn(course, ball);
    return out;
  }
  const pit = inPit(course, ball.x, ball.z);
  const lava = pit ? null : inLava(course, ball.x, ball.z);
  if (pit || lava) {
    out.pit = !!pit;
    out.water = !!lava?.water;
    out.lava = burn(course, ball);
    return out;
  }
  ball.vx *= LAND_KEEP;
  ball.vz *= LAND_KEEP;
  ball.air = -vy > HOP_MIN ? { y: 0, vy: -vy * HOP_KEEP } : null;
  return out;
}

// ---------- loopings y tubos: tramos en los que la bola va por un carril ----------
//
// Mientras la bola va por un carril lleva ball.track = { kind, i, s, u, lat }:
// s es lo recorrido por el carril, u la velocidad a lo largo de él y lat la
// posición lateral. ball.x/z siguen la proyección en el suelo para la cámara.
// El objeto track se sustituye en cada paso (nunca se modifica), así una copia
// de la bola ({ ...ball }) no comparte estado con la original.

export const GRAVITY = 9.8;
const LOOP_SAMPLES = 160;
const PAD_SAMPLES = 8;
const TUBE_SAMPLES = 64;
const TUBE_MIN_SPEED = 4;
const TRACK_DRAG = 0.3; // el carril es liso: frena menos que el césped
// al caerse dentro de la vuelta: velocidad que conserva al tocar el carril,
// rozamiento hasta la boca y velocidad mínima para que siempre salga
const FELL_KEEP = 0.3;
const FELL_DRAG = 1.2;
const FELL_MIN_SPEED = 0.9;
const FLY_MAX_TIME = 2;
const TRACK_MIN_SPEED = 0.4;
const FLY_KEEP_ALONG = 0.35;
const HALF_TURN = 3.141592653589793;
const tables = new WeakMap();
// El carril del looping va en espiral: entra por delante a la derecha (lado
// +LOOP_LANE del eje lateral), da la vuelta y sale por detrás a la izquierda.
// Solo entra la bola que llega centrada en el carril de entrada; el resto
// choca con los bordillos o con la parte baja del carril de salida.
export const LOOP_LANE = 0.36; // del eje del looping al centro de cada carril
export const LOOP_LANE_HALF = 0.33; // media anchura del carril con sus bordillos
export const LOOP_PAD = 0.9; // tramo recto en el suelo antes y después de la vuelta
export const LOOP_CAPTURE = LOOP_LANE_HALF - BALL_R; // la bola cabe entre los bordillos
const LOOP_GUARD = 0.3; // dónde choca, delante y detrás del centro, la bola que va por fuera

/**
 * Perfil del looping: un tramo recto de LOOP_PAD, un anillo vertical de radio
 * radius que apoya en el suelo en el centro del looping (la bola entra por
 * abajo, da la vuelta por dentro y sale por el mismo punto hacia delante) y
 * otro tramo recto de LOOP_PAD. along se mide desde la boca de entrada.
 * Muestras { s, along, y, th, kap, ny }:
 * s = longitud de carril, kap la curvatura y ny la componente vertical de la
 * normal hacia dentro de la vuelta.
 */
export function loopTable(loop) {
  let t = tables.get(loop);
  if (t) return t;
  const R = loop.radius, pad = LOOP_PAD;
  const pts = [];
  let s = 0;
  const push = (along, y, th, kap, ny) => {
    const o = pts[pts.length - 1];
    if (o) s += hyp(along - o.along, y - o.y);
    pts.push({ s, along, y, th, kap, ny });
  };
  for (let j = 0; j < PAD_SAMPLES; j++) push((pad * j) / PAD_SAMPLES, 0, 0, 0, 1);
  for (let j = 0; j <= LOOP_SAMPLES; j++) {
    const th = (TWO_PI * j) / LOOP_SAMPLES;
    const c = dcos(th);
    push(pad + R * dsin(th), R * (1 - c), th, 1 / R, c);
  }
  for (let j = 1; j <= PAD_SAMPLES; j++) push(pad + (pad * j) / PAD_SAMPLES, 0, TWO_PI, 0, 1);
  t = { pts, length: s };
  tables.set(loop, t);
  return t;
}

/**
 * Recorrido de un tubo: baja por la boca, sube por el aire y cae en b saliendo
 * hacia out. Curva de Bézier cúbica muestreada; muestras { s, x, y, z }.
 */
export function tubeTable(p) {
  let t = tables.get(p);
  if (t) return t;
  const [ax, az] = p.a, [bx, bz] = p.b, [ox, oz] = p.out;
  const dx = bx - ax, dz = bz - az;
  const H = 1.2 + hyp(dx, dz) * 0.12;
  // los tubos de caída (drop: altura de la boca) cruzan la roca casi en llano y
  // bajan por un tobogán hasta b
  const c = p.drop
    ? [
        [ax, p.drop - 0.3, az],
        [ax + dx * 0.55, p.drop + 0.1, az + dz * 0.55],
        [bx - ox * 1.4, 0.15, bz - oz * 1.4],
        [bx, BALL_R, bz],
      ]
    : [
        [ax, -0.35, az],
        [ax, H * 1.4, az],
        [bx - ox * 1.6, H * 1.4, bz - oz * 1.6],
        [bx, BALL_R, bz],
      ];
  const pts = [];
  let s = 0;
  for (let k = 0; k <= TUBE_SAMPLES; k++) {
    const u = k / TUBE_SAMPLES, v = 1 - u;
    const w0 = v * v * v, w1 = 3 * v * v * u, w2 = 3 * v * u * u, w3 = u * u * u;
    const q = [0, 1, 2].map((j) => w0 * c[0][j] + w1 * c[1][j] + w2 * c[2][j] + w3 * c[3][j]);
    if (k > 0) {
      const o = pts[k - 1];
      s += Math.sqrt((q[0] - o.x) * (q[0] - o.x) + (q[1] - o.y) * (q[1] - o.y) + (q[2] - o.z) * (q[2] - o.z));
    }
    pts.push({ s, x: q[0], y: q[1], z: q[2] });
  }
  t = { pts, length: s };
  tables.set(p, t);
  return t;
}

/** Muestra del carril en s (interpolada entre las dos más cercanas). */
export function sampleAt(table, s) {
  const pts = table.pts;
  let lo = 0, hi = pts.length - 1;
  if (s <= 0) return { ...pts[0], k: 0, f: 0 };
  if (s >= table.length) return { ...pts[hi], k: hi - 1, f: 1 };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const f = (s - a.s) / (b.s - a.s);
  const out = { k: lo, f };
  for (const key in a) out[key] = a[key] + (b[key] - a[key]) * f;
  return out;
}

// eje lateral del looping: dir girado 90°
const loopSide = (l) => [-l.dir[1], l.dir[0]];
/** Boca de entrada del looping (donde empieza el carril, en el suelo). */
const loopEntry = (l) => [l.x - l.dir[0] * LOOP_PAD, l.z - l.dir[1] * LOOP_PAD];

/**
 * Paredes de la estructura del looping, para la bola que no va por el carril:
 * los bordillos de los dos tramos rectos y, junto al centro, la parte baja del
 * carril de salida (por delante) y la del de entrada (por detrás).
 */
export function loopWalls(l) {
  const [sx, sz] = loopSide(l), [dx, dz] = l.dir;
  const p = (a, b) => [l.x + dx * a + sx * b, l.z + dz * a + sz * b];
  // las paredes tienen grosor (WALL_HALF): su eje queda por fuera del bordillo
  const inner = LOOP_LANE - LOOP_LANE_HALF - WALL_HALF, outer = LOOP_LANE + LOOP_LANE_HALF + WALL_HALF, side = l.w / 2;
  return [
    [p(-LOOP_PAD, inner), p(-LOOP_GUARD, inner)],
    [p(-LOOP_PAD, outer), p(-LOOP_GUARD, outer)],
    [p(-LOOP_GUARD, -side), p(-LOOP_GUARD, inner)],
    [p(LOOP_GUARD, -inner), p(LOOP_PAD, -inner)],
    [p(LOOP_GUARD, -outer), p(LOOP_PAD, -outer)],
    [p(LOOP_GUARD, -inner), p(LOOP_GUARD, side)],
  ];
}

/**
 * ¿Ha cruzado la bola (de p a ball) la boca de un looping centrada en su
 * carril? Devuelve el carril nuevo (lat: desvío respecto al centro del carril) o null.
 */
function enterLoop(course, ball, px, pz) {
  const loops = course.loops ?? [];
  for (let i = 0; i < loops.length; i++) {
    const l = loops[i];
    const [ex, ez] = loopEntry(l), [sx, sz] = loopSide(l);
    const off = (ball.x - ex) * sx + (ball.z - ez) * sz;
    const before = (px - ex) * l.dir[0] + (pz - ez) * l.dir[1];
    const after = (ball.x - ex) * l.dir[0] + (ball.z - ez) * l.dir[1];
    const u = ball.vx * l.dir[0] + ball.vz * l.dir[1];
    const len = loopTable(l).length, end = 2 * LOOP_PAD;
    // por la entrada (a la derecha) hacia delante o por la salida (a la izquierda) marcha atrás
    const inLat = off - LOOP_LANE, outLat = off + LOOP_LANE;
    if (before < 0 && after >= 0 && u > 0 && Math.abs(inLat) <= LOOP_CAPTURE) return { kind: 'loop', i, s: after, u, lat: inLat, from: 1 };
    if (before > end && after <= end && u < 0 && Math.abs(outLat) <= LOOP_CAPTURE) return { kind: 'loop', i, s: len - (end - after), u, lat: outLat, from: -1 };
  }
  return null;
}

/** Desvío lateral del carril respecto al eje del looping: +LOOP_LANE al entrar, −LOOP_LANE al salir. */
const loopLaneOffset = (th) => LOOP_LANE * dcos(th / 2);

/** Coloca ball.x/z/vx/vz según el carril (proyección en el suelo). */
function placeOnTrack(course, ball, loop) {
  const tr = ball.track;
  if (tr.kind === 'loop') {
    const l = loop ?? course.loops[tr.i];
    const q = tr.fly ? null : sampleAt(loopTable(l), tr.s);
    const along = q ? q.along : tr.fly.a, lat = tr.lat + (q ? loopLaneOffset(q.th) : 0);
    const [ex, ez] = loopEntry(l), [sx, sz] = loopSide(l);
    ball.x = ex + l.dir[0] * along + sx * lat;
    ball.z = ez + l.dir[1] * along + sz * lat;
    const u = tr.fly ? tr.fly.va : tr.u;
    ball.vx = l.dir[0] * u;
    ball.vz = l.dir[1] * u;
  } else {
    const q = sampleAt(tubeTable(course.portals[tr.i]), tr.s);
    const p = course.portals[tr.i];
    ball.x = q.x;
    ball.z = q.z;
    ball.vx = p.out[0] * tr.u;
    ball.vz = p.out[1] * tr.u;
  }
}

/**
 * Un paso por el carril. En el looping manda la gravedad: si en la mitad de
 * arriba la bola va más despacio de lo que pide la vuelta, se cae y vuelve
 * hacia atrás. En el tubo va a velocidad constante. Devuelve 'exit' al salir.
 */
function trackStep(course, ball, dt) {
  const tr = ball.track;
  if (tr.kind === 'tube') {
    const p = course.portals[tr.i];
    const table = tubeTable(p);
    let v = Math.max(tr.u, TUBE_MIN_SPEED);
    if (p.drop) {
      // al caer gana velocidad: v² = u² + 2·g·(lo que ha bajado desde la boca)
      const fall = table.pts[0].y - sampleAt(table, tr.s).y;
      if (fall > 0) v = Math.sqrt(v * v + 2 * GRAVITY * fall);
    }
    const s = tr.s + v * dt;
    if (s >= table.length) {
      // el tobogán suelta la bola siempre igual (exit) para que se sepa dónde para
      const out = p.exit ?? tr.u;
      ball.track = null;
      ball.x = p.b[0] + p.out[0] * 0.01;
      ball.z = p.b[1] + p.out[1] * 0.01;
      ball.vx = p.out[0] * out;
      ball.vz = p.out[1] * out;
      return 'exit';
    }
    ball.track = { ...tr, s };
    placeOnTrack(course, ball);
    return null;
  }
  const l = course.loops[tr.i];
  const table = loopTable(l);
  if (tr.fly) return flyStep(l, table, ball, dt);
  const q = sampleAt(table, tr.s);
  const a = table.pts[q.k], b = table.pts[q.k + 1];
  const grade = (b.y - a.y) / (b.s - a.s); // seno de la inclinación del carril
  let u = tr.u - GRAVITY * grade * dt;
  // rozamiento proporcional a la velocidad: nunca deja la bola quieta en el carril
  u -= (tr.fell ? FELL_DRAG : TRACK_DRAG) * u * dt;
  // después de caerse siempre vuelve por donde entró, y nunca se queda quieta
  if (tr.fell && u * tr.from > -FELL_MIN_SPEED) u = -tr.from * FELL_MIN_SPEED;
  // en los tramos rectos tampoco se queda parada: sigue hacia donde iba
  else if (grade === 0 && u < TRACK_MIN_SPEED && u > -TRACK_MIN_SPEED) u = (u > 0 || (u === 0 && tr.from > 0) ? 1 : -1) * TRACK_MIN_SPEED;
  // arriba el carril solo sujeta la bola si va rápida: si la gravedad tira hacia
  // dentro de la vuelta más de lo que pide la curva (u²·kap < −g·ny), se despega
  if (!tr.fell && q.ny < 0 && u * tr.from > 0 && u * u * q.kap + GRAVITY * q.ny < 0) {
    // cae casi en vertical: lo que avanzaba a lo largo del looping se pierde
    const ta = b.along - a.along, ty = b.y - a.y, tl = hyp(ta, ty);
    ball.track = { ...tr, u, fell: true, fly: { a: q.along, y: q.y, va: (FLY_KEEP_ALONG * u * ta) / tl, vy: (u * ty) / tl, t: 0, k0: q.k } };
    placeOnTrack(course, ball);
    return null;
  }
  const s = tr.s + u * dt;
  if (s >= table.length || s <= 0) return leaveLoop(l, ball, s >= table.length, tr.lat, u);
  ball.track = { ...tr, s, u };
  placeOnTrack(course, ball);
  return null;
}

/** Sale del looping al suelo por la salida (forward) o por la entrada. */
function leaveLoop(l, ball, forward, lat, u) {
  const [ex, ez] = loopEntry(l), [sx, sz] = loopSide(l);
  const along = forward ? 2 * LOOP_PAD + 0.001 : -0.001;
  const side = lat + (forward ? -LOOP_LANE : LOOP_LANE);
  ball.track = null;
  ball.x = ex + l.dir[0] * along + sx * side;
  ball.z = ez + l.dir[1] * along + sz * side;
  ball.vx = l.dir[0] * u;
  ball.vz = l.dir[1] * u;
  return 'exit';
}

/**
 * La bola despegada vuela dentro de la vuelta (tiro parabólico en el plano del
 * looping) hasta que vuelve a tocar el carril. Al caer pierde casi toda la
 * velocidad y sigue por el carril hacia la boca por la que entró.
 */
function flyStep(l, table, ball, dt) {
  const tr = ball.track, f = tr.fly;
  const vy = f.vy - GRAVITY * dt;
  const na = f.a + f.va * dt, ny = f.y + vy * dt;
  const pts = table.pts;
  let hit = -1, hitF = 0, best = 2;
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k], q = pts[k + 1];
    // solo cae en la mitad por la que entró (así siempre vuelve por esa boca),
    // y al despegarse no choca con el carril que acaba de dejar
    if ((tr.from > 0 ? p.th > HALF_TURN : q.th < HALF_TURN) || (f.t < 0.1 && k > f.k0 - 4 && k < f.k0 + 4)) continue;
    const ta = q.along - p.along, ty = q.y - p.y;
    // solo cuenta si la bola va hacia el carril (contra la normal hacia dentro)
    if (-ty * f.va + ta * vy >= 0) continue;
    // corte del vuelo (f → n) con el tramo (p → q)
    const da = na - f.a, dy = ny - f.y;
    const den = da * ty - dy * ta;
    if (den === 0) continue;
    const wa = p.along - f.a, wy = p.y - f.y;
    const tt = (wa * ty - wy * ta) / den; // a lo largo del vuelo
    const ss = (wa * dy - wy * da) / den; // a lo largo del tramo
    if (tt >= 0 && tt <= 1 && ss >= 0 && ss <= 1 && tt < best) {
      best = tt;
      hit = k;
      hitF = ss;
    }
  }
  if (hit >= 0) {
    const p = pts[hit], q = pts[hit + 1];
    const ta = q.along - p.along, ty = q.y - p.y, tl = hyp(ta, ty);
    const ut = (f.va * ta + vy * ty) / tl;
    const s = p.s + (q.s - p.s) * hitF;
    ball.track = { ...tr, s, u: ut * FELL_KEEP, fly: null };
    placeOnTrack(null, ball, l);
    return null;
  }
  if (f.t > FLY_MAX_TIME) return leaveLoop(l, ball, tr.from < 0, tr.lat, -tr.from * FELL_MIN_SPEED);
  ball.track = { ...tr, fly: { a: na, y: ny, va: f.va, vy, t: f.t + dt } };
  placeOnTrack(null, ball, l);
  return null;
}

/**
 * Portales de un solo sentido: la bola que entra en a sale por b con la misma
 * velocidad. Los tubos (portales con out) llevan la bola por dentro hasta b y
 * la sueltan hacia out.
 */
export function portalAt(course, x, z) {
  const ps = course.portals ?? [];
  for (let i = 0; i < ps.length; i++) {
    const dx = x - ps[i].a[0], dz = z - ps[i].a[1];
    if (dx * dx + dz * dz < ps[i].r * ps[i].r) return i;
  }
  return -1;
}

/**
 * Avanza la simulación dt segundos. Devuelve { sunk, hit, bumper, portal }: hit
 * es la velocidad del choque más fuerte, bumper el índice de la seta golpeada
 * y portal el del portal cruzado (o -1).
 */
export function step(course, segs, ball, t, dt) {
  let hit = 0;
  let bumper = -1;
  let portal = -1;
  // de dónde sale el golpe: allí vuelve la bola si cae en la lava
  if (!ball.from && hasHazards(course) && (ball.vx !== 0 || ball.vz !== 0)) ball.from = [ball.x, ball.z];
  if (ball.air) return airStep(course, segs, ball, dt);
  if (ball.track) {
    const ev = trackStep(course, ball, dt);
    return { sunk: false, hit, bumper, portal, track: ball.track?.kind ?? null, trackExit: ev === 'exit' };
  }
  const speed = hyp(ball.vx, ball.vz);
  if (speed > 0) {
    const g = grip(course, ball.x, ball.z);
    const newSpeed = Math.max(0, speed - (ROLL_DECEL * g + ROLL_DRAG * g * speed) * dt);
    const k = newSpeed / speed;
    ball.vx *= k;
    ball.vz *= k;
  }
  const boost = onBoost(course, ball.x, ball.z);
  if (boost) {
    // los aceleradores empujan la bola hasta su velocidad en su dirección
    const along = ball.vx * boost.dir[0] + ball.vz * boost.dir[1];
    if (along < boost.speed) {
      const a = Math.min(BOOST_ACCEL * dt, boost.speed - along);
      ball.vx += boost.dir[0] * a;
      ball.vz += boost.dir[1] * a;
    }
  }
  const slope = onSlope(course, ball.x, ball.z);
  let incline = 0;
  if (slope) {
    incline = slopeAccel(slope, ball.x, ball.z);
    ball.vx += slope.dir[0] * incline * dt;
    ball.vz += slope.dir[1] * incline * dt;
  }
  const mound = slope ? null : onMound(course, ball.x, ball.z);
  if (mound) {
    const dx = ball.x - mound.x, dz = ball.z - mound.z;
    const d = hyp(dx, dz);
    incline = moundAccel(mound, d);
    ball.vx += (dx / d) * incline * dt;
    ball.vz += (dz / d) * incline * dt;
  }
  const ramp = slope || mound ? null : onRamp(course, ball.x, ball.z);
  if (ramp) {
    // subir la rampa frena (y sin fuerza la bola vuelve rodando hacia abajo)
    incline = rampAccel(ramp);
    ball.vx -= ramp.dir[0] * incline * dt;
    ball.vz -= ramp.dir[1] * incline * dt;
  }
  const px = ball.x, pz = ball.z;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  const air = ramp ? rampLaunch(course, ball, px, pz) : null;
  if (air) {
    ball.air = { y: air.y, vy: air.vy };
    return { sunk: false, hit, bumper, portal, launch: true, ramp: air.ramp };
  }

  const loop = course.loops ? enterLoop(course, ball, px, pz) : null;
  if (loop) {
    ball.track = loop;
    placeOnTrack(course, ball);
    return { sunk: false, hit, bumper, portal, track: 'loop', trackExit: false };
  }

  for (const seg of segs) hit = Math.max(hit, collideSegment(ball, seg, 0, 0));
  for (const sp of course.spinners) {
    const seg = spinnerSegment(sp, t);
    // velocidad de la superficie del aspa en el punto de contacto
    const [cx, cz] = closestOnSegment(ball.x, ball.z, seg);
    const svx = -sp.speed * (cz - sp.z), svz = sp.speed * (cx - sp.x);
    hit = Math.max(hit, collideSegment(ball, seg, svx, svz));
  }
  for (const m of course.movers ?? []) {
    const p = moverPos(m, t);
    hit = Math.max(hit, collideBox(ball, p.x, p.z, m.w / 2, m.d / 2, p.vx, p.vz));
  }
  for (const wm of course.windmills ?? []) {
    if (windmillBlocks(wm, t)) hit = Math.max(hit, collideBox(ball, wm.x, wm.gateZ, wm.w / 2, WINDMILL_GATE_HALF, 0, 0));
  }
  course.bumpers.forEach((b, i) => {
    const dx = ball.x - b.x, dz = ball.z - b.z;
    const d = hyp(dx, dz);
    const minD = BALL_R + b.r;
    if (d < minD && d > 1e-6) {
      const h = bounce(ball, dx / d, dz / d, minD - d);
      if (h > 0) bumper = i;
      hit = Math.max(hit, h);
    }
  });

  const pi = portalAt(course, ball.x, ball.z);
  if (pi >= 0) {
    portal = pi;
    const p = course.portals[pi];
    if (p.out) {
      // el tubo se traga la bola y la lleva por dentro con la velocidad que traía
      ball.track = { kind: 'tube', i: pi, s: 0, u: hyp(ball.vx, ball.vz), lat: 0 };
      placeOnTrack(course, ball);
      return { sunk: false, hit, bumper, portal, track: 'tube', trackExit: false };
    }
    ball.x = p.b[0];
    ball.z = p.b[1];
  }

  const lava = course.lava ? inLava(course, ball.x, ball.z) : null;
  if (lava) return { sunk: false, hit, bumper, portal, lava: burn(course, ball), water: !!lava.water };
  if (course.pits && inPit(course, ball.x, ball.z)) return { sunk: false, hit, bumper, portal, pit: true, lava: burn(course, ball) };

  if (course.realCup && !course.noCup) {
    const cup = cupStep(course, ball, dt);
    if (cup) return { sunk: cup.sunk, hit, bumper, portal, lip: cup.lip };
  }
  const [hx, hz] = course.cup;
  const toCup = hyp(ball.x - hx, ball.z - hz);
  const v = hyp(ball.vx, ball.vz);
  if (!course.noCup && !course.realCup && toCup < CUP_R && v < CUP_CAPTURE_SPEED) {
    ball.x = hx;
    ball.z = hz;
    ball.vx = ball.vz = 0;
    return { sunk: true, hit, bumper, portal };
  }
  const rolls = incline > ROLL_DECEL * grip(course, ball.x, ball.z);
  if (v < STOP_SPEED && !rolls) ball.vx = ball.vz = 0;
  if (ball.from && ball.vx === 0 && ball.vz === 0) ball.from = null;
  return { sunk: false, hit, bumper, portal };
}

export function isMoving(ball) {
  return ball.vx !== 0 || ball.vz !== 0 || !!ball.track || !!ball.air || !!ball.cup;
}

// ---------- hoyo con borde (realCup) ----------
//
// En los hoyos con realCup la bola no entra solo por ir despacio: cuando su
// centro pasa por encima de la boca pierde el suelo y empieza a caer
// (ball.cup = { y, vy }, y es cuánto ha bajado respecto a rodar por el césped).
// Si baja hasta tener el centro a la altura del borde (CUP_DEPTH) ya no sale.
// Si antes toca el canto de la boca, choca con él como con una esquina: la
// normal va del canto al centro de la bola, en el plano (radial, altura). Una
// bola lenta ha caído mucho y choca de frente: rebota hacia dentro y entra.
// Una rápida apenas ha caído y choca por debajo: el canto la levanta, sale
// botando, frenada y torcida si no iba por el centro (se sale "de labio").
// Como el resto de la física, solo usa + - * / y Math.sqrt.

const CUP_DEPTH = BALL_R;
const RIM_RESTITUTION = 0.3;
const RIM_HOP_MAX = 1.3; // el bote al salir del hoyo, como mucho (m/s hacia arriba)
const RIM_KEEP = 0.85; // velocidad que conserva al salir botando del borde

/** Un paso de la bola sobre la boca del hoyo; null si no está en ella. */
function cupStep(course, ball, dt) {
  const [hx, hz] = course.cup;
  const dx = ball.x - hx, dz = ball.z - hz;
  const d = hyp(dx, dz);
  const c = ball.cup;
  if (!c && d >= CUP_R) return null;
  let y = c ? c.y : 0, vy = c ? c.vy : 0;
  // sobre la boca no hay suelo: cae
  if (d < CUP_R) {
    vy -= GRAVITY * dt;
    y += vy * dt;
  }
  if (y <= -CUP_DEPTH) {
    Object.assign(ball, { x: hx, z: hz, vx: 0, vz: 0, cup: null });
    return { sunk: true, lip: false };
  }
  let lip = false;
  if (d > 1e-6) {
    const rx = dx / d, rz = dz / d;
    // del canto (a CUP_R del centro, a ras de suelo) al centro de la bola
    const ex = d - CUP_R, ey = BALL_R + y;
    const el = hyp(ex, ey);
    if (el < BALL_R && el > 1e-9) {
      const nh = ex / el, ny = ey / el;
      const push = BALL_R - el;
      ball.x += rx * nh * push;
      ball.z += rz * nh * push;
      y += ny * push;
      const vr = ball.vx * rx + ball.vz * rz;
      const vn = vr * nh + vy * ny;
      if (vn < 0) {
        const j = -(1 + RIM_RESTITUTION) * vn;
        ball.vx += rx * nh * j;
        ball.vz += rz * nh * j;
        vy += ny * j;
        if (vy > RIM_HOP_MAX) vy = RIM_HOP_MAX;
        // un golpe de verdad contra el canto (no rodar por encima al entrar)
        lip = j > 0.6;
      }
    }
  }
  const dOut = hyp(ball.x - hx, ball.z - hz) - CUP_R;
  const out = dOut >= 0;
  // ya pasado el canto (sin tocarlo) vuelve a tener césped debajo
  if (out && y < 0 && dOut * dOut + (BALL_R + y) * (BALL_R + y) >= BALL_R * BALL_R) y = 0;
  if (out && y >= 0) {
    // fuera de la boca otra vez: rueda o sale botando
    ball.cup = null;
    if (vy > 0) {
      ball.vx *= RIM_KEEP;
      ball.vz *= RIM_KEEP;
      ball.air = { y, vy };
    }
    return { sunk: false, lip };
  }
  // sobre la boca, o tocando el canto por debajo del césped
  ball.cup = { y, vy };
  return { sunk: false, lip };
}
