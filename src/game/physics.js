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
const BOOST_ACCEL = 40;

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

export function moverPos(m, t) {
  const o = Math.sin(t * m.speed + (m.phase ?? 0)) * m.range;
  const v = Math.cos(t * m.speed + (m.phase ?? 0)) * m.range * m.speed;
  return m.axis === 'x' ? { x: m.x + o, z: m.z, vx: v, vz: 0 } : { x: m.x, z: m.z + o, vx: 0, vz: v };
}

function collideBox(ball, cx, cz, hw, hd, svx, svz) {
  const px = Math.max(cx - hw, Math.min(ball.x, cx + hw));
  const pz = Math.max(cz - hd, Math.min(ball.z, cz + hd));
  let dx = ball.x - px, dz = ball.z - pz;
  let d = Math.hypot(dx, dz);
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
  if (!course.noCup && toCup < CUP_R && v < CUP_CAPTURE_SPEED) {
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
