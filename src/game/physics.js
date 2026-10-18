// Física 2D del minigolf sobre el plano (x, z). Sin dependencias de Three.js
// para poder probarla en Node y, más adelante, validarla en el servidor.
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

export function segmentsOf(course) {
  const segs = [];
  const o = course.outline;
  for (let i = 0; i < o.length; i++) segs.push([o[i], o[(i + 1) % o.length]]);
  return segs.concat(course.walls);
}

export function spinnerSegment(sp, t) {
  const a = sp.speed * t;
  const dx = (Math.cos(a) * sp.len) / 2;
  const dz = (Math.sin(a) * sp.len) / 2;
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
  const d = Math.hypot(dx, dz);
  const minD = BALL_R + WALL_HALF;
  if (d < minD && d > 1e-6) return bounce(ball, dx / d, dz / d, minD - d, surfVx, surfVz);
  return 0;
}

export function inSand(course, x, z) {
  return course.sand.some((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2);
}

/**
 * Avanza la simulación dt segundos. Devuelve { sunk, hit, bumper }: hit es la
 * velocidad del choque más fuerte y bumper el índice de la seta golpeada (o -1).
 */
export function step(course, segs, ball, t, dt) {
  let hit = 0;
  let bumper = -1;
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed > 0) {
    const sand = inSand(course, ball.x, ball.z) ? SAND_FACTOR : 1;
    const newSpeed = Math.max(0, speed - (ROLL_DECEL * sand + ROLL_DRAG * sand * speed) * dt);
    const k = newSpeed / speed;
    ball.vx *= k;
    ball.vz *= k;
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
  course.bumpers.forEach((b, i) => {
    const dx = ball.x - b.x, dz = ball.z - b.z;
    const d = Math.hypot(dx, dz);
    const minD = BALL_R + b.r;
    if (d < minD && d > 1e-6) {
      const h = bounce(ball, dx / d, dz / d, minD - d);
      if (h > 0) bumper = i;
      hit = Math.max(hit, h);
    }
  });

  const [hx, hz] = course.cup;
  const toCup = Math.hypot(ball.x - hx, ball.z - hz);
  const v = Math.hypot(ball.vx, ball.vz);
  if (toCup < CUP_R && v < CUP_CAPTURE_SPEED) {
    ball.x = hx;
    ball.z = hz;
    ball.vx = ball.vz = 0;
    return { sunk: true, hit, bumper };
  }
  if (v < STOP_SPEED) ball.vx = ball.vz = 0;
  return { sunk: false, hit, bumper };
}

export function isMoving(ball) {
  return ball.vx !== 0 || ball.vz !== 0;
}
