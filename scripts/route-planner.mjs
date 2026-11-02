// Busca el mínimo de golpes de un hoyo con la física real (búsqueda en haz):
// prueba muchas direcciones y potencias desde cada punto y se queda con los
// puntos más cercanos al hoyo por el camino (no en línea recta). Sirve para
// equilibrar los caminos de un hoyo: con --avoid se prohíben zonas.
// Uso: node scripts/route-planner.mjs "<nombre del hoyo>" [--avoid x0,z0,x1,z1 ...] [--no-ramp i ...]
import { COURSES } from '../src/game/courses.js';
import { BALL_R, DT, WALL_HALF, inLava, insidePoly, isMoving, segmentsOf, shotVelocity, step } from '../src/game/physics.js';

const args = process.argv.slice(2);
const course = COURSES.find((c) => c.name === args[0]);
if (!course) throw new Error(`no existe el hoyo ${args[0]}`);
const avoid = [], noRamp = new Set();
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--avoid') avoid.push(args[++i].split(',').map(Number));
  if (args[i] === '--no-ramp') noRamp.add(Number(args[++i]));
}
const BEAM = Number(process.env.BEAM ?? 40), YAWS = Number(process.env.YAWS ?? 64), POWERS = Number(process.env.POWERS ?? 18);
const segs = segmentsOf(course);
// sin elementos que dependen del momento del golpe: el mejor caso
const still = { ...course, spinners: [], movers: [], windmills: [] };
const inAvoid = (x, z) => avoid.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

// distancia por el campo hasta el hoyo (rejilla de 0,25 m, sin cruzar paredes ni agua)
const G = 0.25, xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
const X0 = Math.min(...xs), Z0 = Math.min(...zs), NX = Math.ceil((Math.max(...xs) - X0) / G) + 1, NZ = Math.ceil((Math.max(...zs) - Z0) / G) + 1;
const cross = (ax, az, bx, bz, [[cx, cz], [dx, dz]]) => {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  return o(ax, az, bx, bz, cx, cz) * o(ax, az, bx, bz, dx, dz) < 0 && o(cx, cz, dx, dz, ax, az) * o(cx, cz, dx, dz, bx, bz) < 0;
};
const ok = (x, z) => insidePoly(course.outline, x, z) && !inLava(course, x, z) && !inAvoid(x, z);
const dist = new Float64Array(NX * NZ).fill(Infinity);
{
  const ci = Math.round((course.cup[0] - X0) / G), cj = Math.round((course.cup[1] - Z0) / G);
  const q = [[ci, cj]];
  dist[cj * NX + ci] = 0;
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h], d = dist[j * NX + i];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NX || b >= NZ || dist[b * NX + a] !== Infinity) continue;
      const x = X0 + a * G, z = Z0 + b * G, px = X0 + i * G, pz = Z0 + j * G;
      // las rampas se cruzan (saltan): su labio no corta el paso
      if (!ok(x, z) || segs.some((s) => cross(px, pz, x, z, s))) continue;
      dist[b * NX + a] = d + G;
      q.push([a, b]);
    }
  }
}
const geo = (x, z) => {
  const i = Math.round((x - X0) / G), j = Math.round((z - Z0) / G);
  return i >= 0 && j >= 0 && i < NX && j < NZ ? dist[j * NX + i] : Infinity;
};

function shoot(from, yaw, power) {
  const ball = { x: from.x, z: from.z, vx: 0, vz: 0, ...shotVelocity(yaw, power) };
  const ramps = [];
  for (let t = 1; isMoving(ball) && t < 120 * 25; t++) {
    const r = step(still, segs, ball, 0, DT);
    if (r.sunk) return { sunk: true, ramps };
    if (r.lava) return null;
    if (r.launch) {
      if (noRamp.has(r.ramp)) return null;
      ramps.push(r.ramp);
    }
    if (inAvoid(ball.x, ball.z)) return null;
  }
  return { x: ball.x, z: ball.z, ramps };
}

let frontier = [{ x: course.tee[0], z: course.tee[1], path: [] }];
const seen = new Set();
for (let depth = 1; depth <= 12; depth++) {
  const next = new Map();
  for (const s of frontier) {
    for (let yi = 0; yi < YAWS; yi++) {
      const yaw = (yi / YAWS) * Math.PI * 2;
      for (let pi = 1; pi <= POWERS; pi++) {
        const power = pi / POWERS;
        const r = shoot(s, yaw, power);
        if (!r) continue;
        const path = [...s.path, { x: +s.x.toFixed(1), z: +s.z.toFixed(1), yaw: +yaw.toFixed(2), power: +power.toFixed(2), ramps: r.ramps }];
        if (r.sunk) {
          console.log(`mínimo: ${depth} golpes`);
          for (const p of path) console.log('  desde', p.x, p.z, 'yaw', p.yaw, 'potencia', p.power, p.ramps.length ? `rampas ${p.ramps}` : '');
          process.exit(0);
        }
        const key = `${Math.round(r.x / 0.4)},${Math.round(r.z / 0.4)}`;
        if (seen.has(key)) continue;
        const g = geo(r.x, r.z);
        if (g === Infinity) continue;
        if (!next.has(key) || next.get(key).g > g) next.set(key, { x: r.x, z: r.z, g, path });
      }
    }
  }
  frontier = [...next.values()].sort((a, b) => a.g - b.g).slice(0, BEAM);
  for (const f of frontier) seen.add(`${Math.round(f.x / 0.4)},${Math.round(f.z / 0.4)}`);
  console.log(`golpe ${depth}: lo más cerca ${frontier[0]?.g.toFixed(1)} m por el campo`);
}
