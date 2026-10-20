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
const SAND_FACTOR = 4;
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

export function segmentsOf(course) {
  const segs = [];
  const o = course.outline;
  for (let i = 0; i < o.length; i++) segs.push([o[i], o[(i + 1) % o.length]]);
  return segs.concat(course.walls);
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

/** Pendientes: rectángulos que empujan la bola cuesta abajo (dir) con aceleración accel. */
export const onSlope = (course, x, z) => (course.slopes ?? []).find((s) => inRect(s, x, z));

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

/**
 * Portales de un solo sentido: la bola que entra en a sale por b con la misma
 * velocidad. Los tubos son portales con out: la dirección en la que sale.
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
  const speed = hyp(ball.vx, ball.vz);
  if (speed > 0) {
    const sand = inSand(course, ball.x, ball.z) ? SAND_FACTOR : 1;
    const newSpeed = Math.max(0, speed - (ROLL_DECEL * sand + ROLL_DRAG * sand * speed) * dt);
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
  if (slope) {
    ball.vx += slope.dir[0] * slope.accel * dt;
    ball.vz += slope.dir[1] * slope.accel * dt;
  }
  const mound = slope ? null : onMound(course, ball.x, ball.z);
  if (mound) {
    const dx = ball.x - mound.x, dz = ball.z - mound.z;
    const d = hyp(dx, dz);
    ball.vx += (dx / d) * mound.accel * dt;
    ball.vz += (dz / d) * mound.accel * dt;
  }
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

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
    ball.x = p.b[0];
    ball.z = p.b[1];
    if (p.out) {
      // los tubos sueltan la bola en su dirección, con la misma velocidad
      const v = hyp(ball.vx, ball.vz);
      ball.vx = p.out[0] * v;
      ball.vz = p.out[1] * v;
    }
  }

  const [hx, hz] = course.cup;
  const toCup = hyp(ball.x - hx, ball.z - hz);
  const v = hyp(ball.vx, ball.vz);
  if (!course.noCup && toCup < CUP_R && v < CUP_CAPTURE_SPEED) {
    ball.x = hx;
    ball.z = hz;
    ball.vx = ball.vz = 0;
    return { sunk: true, hit, bumper, portal };
  }
  const incline = slope ?? mound;
  const rolls = incline && incline.accel > ROLL_DECEL * (inSand(course, ball.x, ball.z) ? SAND_FACTOR : 1);
  if (v < STOP_SPEED && !rolls) ball.vx = ball.vz = 0;
  return { sunk: false, hit, bumper, portal };
}

export function isMoving(ball) {
  return ball.vx !== 0 || ball.vz !== 0;
}
