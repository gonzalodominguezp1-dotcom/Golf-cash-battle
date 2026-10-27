import { BALL_R, GRAVITY, LOOP_RATIO, insidePoly, loopTable, rampHeight, sampleAt, tubeTable } from '../physics.js';

// Relieve que se ve: la física es plana (x, z) y aquí se saca la altura del
// césped a partir de las pendientes y montículos del hoyo, para levantar la
// plataforma, las paredes y la bola. La altura sale de la misma aceleración
// que usa la física (accel = g · inclinación), así lo que se ve cuesta lo que
// la bola nota. Los loopings y tubos son carriles con su propia altura.

/** ¿El hoyo tiene cuestas que se tienen que ver en el suelo? */
export function hasRelief(course) {
  return (course.slopes ?? []).length > 0 || (course.mounds ?? []).length > 0;
}

// integral de easeFactor de 0 a b en una cuesta de largo len (la subida acumulada)
function easedRise(b, len) {
  const e = Math.min(0.6, len / 4);
  const part = (t) => e * (t * t * t - (t * t * t * t) / 2); // ∫ smoothstep
  if (b <= 0) return 0;
  if (b <= e) return part(b / e);
  if (b <= len - e) return e / 2 + (b - e);
  if (b >= len) return len - e;
  return len - e - part((len - b) / e);
}

// distancia de (x, z) al borde del polígono
function distToPoly(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/**
 * Altura de las zonas elevadas (tiers) en (x, z). Con margen cuenta también lo
 * que está justo en el borde (las paredes y los postes de su contorno).
 */
export function tierHeight(course, x, z, margin = 0.05) {
  let h = 0;
  for (const t of course.tiers ?? []) if (t.h > h && (insidePoly(t.poly, x, z) || distToPoly(t.poly, x, z) < margin)) h = t.h;
  return h;
}

/**
 * Altura del césped. Cada pendiente sube su lado de arriba (todo lo que queda
 * cuesta arriba dentro de su anchura) y los montículos son conos con la cima llana.
 */
export function groundHeight(course, x, z) {
  let h = course.tiers ? tierHeight(course, x, z) : 0;
  for (const s of course.slopes ?? []) {
    const alongX = s.dir[0] !== 0;
    const len = alongX ? s.w : s.d;
    // un poco de margen para que el escalón lateral quede bajo la pared
    const across = alongX ? Math.abs(z - s.z) <= s.d / 2 + 0.14 : Math.abs(x - s.x) <= s.w / 2 + 0.14;
    if (!across) continue;
    // b: distancia desde el borde de abajo subiendo por la cuesta
    const b = len / 2 - ((x - s.x) * s.dir[0] + (z - s.z) * s.dir[1]);
    h += (s.accel / GRAVITY) * easedRise(b, len);
  }
  for (const m of course.mounds ?? []) {
    const d = Math.hypot(x - m.x, z - m.z);
    h += (m.accel / GRAVITY) * easedRise(m.base - d, m.base - m.top);
  }
  return h;
}

const TWO_PI = Math.PI * 2;
// Desplazamiento lateral helicoidal suave para que el carril no se cruce consigo mismo
const LOOP_HELIX_OFFSET = 0.24;

/** Desplazamiento lateral suave en función del avance s a lo largo del looping. */
export function loopLateralOffset(l, s, th) {
  const table = loopTable(l);
  const R = l.radius, r = R / LOOP_RATIO;
  const pad = (l.len - TWO_PI * r) / 2;
  const sStart = pad;
  const sEnd = Math.max(sStart, table.length - pad);
  const D = LOOP_HELIX_OFFSET;

  if (s < sStart) {
    const t = sStart > 0 ? Math.max(0, Math.min(1, s / sStart)) : 1;
    const ease = t * t * (3 - 2 * t);
    return -D * ease;
  }
  if (s > sEnd) {
    const exitLen = table.length - sEnd;
    const t = exitLen > 0 ? Math.max(0, Math.min(1, (s - sEnd) / exitLen)) : 1;
    const ease = t * t * (3 - 2 * t);
    return D * (1 - ease);
  }
  return -D * Math.cos(th / 2);
}

/**
 * Punto del carril del looping a s metros de la entrada (sin el radio de la
 * bola), con la normal hacia dentro de la vuelta.
 */
export function loopPoint(l, s, lateral = 0) {
  const table = loopTable(l);
  const q = sampleAt(table, s);
  const a = table.pts[q.k], b = table.pts[q.k + 1];
  const ta = b.along - a.along, ty = b.y - a.y, tl = Math.hypot(ta, ty) || 1;
  const side = lateral + loopLateralOffset(l, s, q.th);
  const [dx, dz] = l.dir, sx = -dz, sz = dx;
  const along = q.along - l.len / 2;
  return {
    x: l.x + dx * along + sx * side,
    y: q.y,
    z: l.z + dz * along + sz * side,
    // normal hacia el centro de la vuelta, en el plano (along, y)
    nAlong: -ty / tl,
    nY: ta / tl,
    dx,
    dz,
    s,
    th: q.th,
    side,
  };
}

/**
 * Punto de la bola que cae dentro de la vuelta. El giro lateral y la normal se
 * toman del carril de la mitad por la que entró a esa misma altura, así al
 * despegarse y al volver a tocar el carril no hay saltos.
 */
function loopFlightPoint(l, tr) {
  const { a, y } = tr.fly;
  const R = l.radius, r = R / LOOP_RATIO;
  const c = Math.min(1, Math.max(-1, 1 - y / R));
  const sn = Math.sqrt(1 - c * c) * (tr.from > 0 ? 1 : -1);
  const da = r + R * c, dy = R * sn, v = Math.hypot(da, dy) || 1;
  const th = sn >= 0 ? Math.acos(c) : TWO_PI - Math.acos(c);
  const side = tr.lat - LOOP_HELIX_OFFSET * Math.cos(th / 2);
  const [dx, dz] = l.dir, sx = -dz, sz = dx;
  const along = a - l.len / 2;
  return { x: l.x + dx * along + sx * side, y, z: l.z + dz * along + sz * side, nAlong: -dy / v, nY: da / v, dx, dz };
}

/** Dónde se dibuja el centro de la bola (también dentro de un looping o un tubo). */
export function ballPose(course, ball) {
  const tr = ball.track;
  if (tr?.kind === 'loop' && tr.fly) {
    const q = loopFlightPoint(course.loops[tr.i], tr);
    return { x: q.x + q.dx * q.nAlong * BALL_R, y: q.y + q.nY * BALL_R, z: q.z + q.dz * q.nAlong * BALL_R, ground: 0, onTrack: true };
  }
  if (tr?.kind === 'loop') {
    const q = loopPoint(course.loops[tr.i], tr.s, tr.lat);
    return { x: q.x + q.dx * q.nAlong * BALL_R, y: q.y + q.nY * BALL_R, z: q.z + q.dz * q.nAlong * BALL_R, ground: 0, onTrack: true };
  }
  if (tr?.kind === 'tube') {
    const q = sampleAt(tubeTable(course.portals[tr.i]), tr.s);
    return { x: q.x, y: q.y, z: q.z, ground: groundHeight(course, q.x, q.z), onTrack: true };
  }
  // las rampas son una cuña encima del césped; en el aire la bola va por encima
  const g = groundHeight(course, ball.x, ball.z) + (course.ramps ? rampHeight(course, ball.x, ball.z) : 0);
  return { x: ball.x, y: g + BALL_R + (ball.air?.y ?? 0), z: ball.z, ground: g, onTrack: false };
}
