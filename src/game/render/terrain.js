import { BALL_R } from '../physics.js';

// Relieve que se ve: la física es plana (x, z) y aquí se saca la altura del
// césped a partir de las pendientes y montículos del hoyo, para levantar la
// plataforma, las paredes y la bola. No cambia nada del juego.

// metros de subida por cada metro de pendiente y m/s² de aceleración
const RISE = 0.075;

const loopSlope = (s) => s.loop;

/** ¿El hoyo tiene cuestas que se tienen que ver en el suelo? */
export function hasRelief(course) {
  return (course.slopes ?? []).some((s) => !loopSlope(s)) || (course.mounds ?? []).length > 0;
}

/**
 * Altura del césped. Cada pendiente sube su lado de arriba (todo lo que queda
 * cuesta arriba dentro de su anchura) y los montículos son conos con la cima llana.
 */
export function groundHeight(course, x, z) {
  let h = 0;
  for (const s of course.slopes ?? []) {
    if (loopSlope(s)) continue;
    const alongX = s.dir[0] !== 0;
    const len = alongX ? s.w : s.d;
    const across = alongX ? Math.abs(z - s.z) <= s.d / 2 : Math.abs(x - s.x) <= s.w / 2;
    if (!across) continue;
    // a: distancia desde el borde de arriba bajando por la cuesta
    const a = (x - s.x) * s.dir[0] + (z - s.z) * s.dir[1] + len / 2;
    h += RISE * s.accel * Math.min(len, Math.max(0, len - a));
  }
  for (const m of course.mounds ?? []) {
    const d = Math.hypot(x - m.x, z - m.z);
    // height: altura de la cima si el dibujo la quiere más alta que la cuesta
    const top = m.height ?? RISE * m.accel * (m.base - m.top);
    h += (top * Math.min(m.base - m.top, Math.max(0, m.base - d))) / (m.base - m.top);
  }
  return h;
}

/** Looping en el que está la bola y cuánto lleva recorrido (0..1). */
export function loopAt(course, x, z) {
  for (const l of course.loops ?? []) {
    // eje lateral: dir girado 90°
    const lateral = -(x - l.x) * l.dir[1] + (z - l.z) * l.dir[0];
    if (Math.abs(lateral) > l.w / 2) continue;
    const s = (x - l.x) * l.dir[0] + (z - l.z) * l.dir[1] + l.len / 2;
    if (s >= 0 && s <= l.len) return { loop: l, p: s / l.len, lateral };
  }
  return null;
}

// desplazamiento lateral a lo largo del looping para que la salida no choque con la entrada
export const LOOP_TWIST = 0.3;

/**
 * Punto del carril del looping (sin el radio de la bola). La curva es una
 * trocoide: avanza len y da una vuelta de radio radius. Devuelve la posición
 * y la normal hacia dentro de la vuelta.
 */
export function loopPoint(l, p, lateral = 0) {
  const th = p * Math.PI * 2;
  const r = l.len / (Math.PI * 2), R = l.radius;
  const along = r * th + R * Math.sin(th) - l.len / 2;
  const y = R * (1 - Math.cos(th));
  const tx = r + R * Math.cos(th), ty = R * Math.sin(th);
  const tl = Math.hypot(tx, ty) || 1;
  const side = lateral + (p - 0.5) * LOOP_TWIST;
  // eje lateral: dir girado 90°
  const [dx, dz] = l.dir, sx = -dz, sz = dx;
  return {
    x: l.x + dx * along + sx * side,
    y,
    z: l.z + dz * along + sz * side,
    // normal hacia el centro de la vuelta, en el plano (along, y)
    nAlong: -ty / tl,
    nY: tx / tl,
    dx,
    dz,
  };
}

/** Dónde se dibuja el centro de la bola que en la física está en (x, z). */
export function ballPose(course, x, z) {
  const hit = course.loops ? loopAt(course, x, z) : null;
  if (hit) {
    const q = loopPoint(hit.loop, hit.p, hit.lateral);
    return { x: q.x + q.dx * q.nAlong * BALL_R, y: q.y + q.nY * BALL_R, z: q.z + q.dz * q.nAlong * BALL_R, ground: 0, inLoop: true };
  }
  const g = groundHeight(course, x, z);
  return { x, y: g + BALL_R, z, ground: g, inLoop: false };
}
