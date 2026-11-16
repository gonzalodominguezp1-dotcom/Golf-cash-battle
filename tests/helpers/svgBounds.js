// Caja envolvente VISIBLE de un icono de icons.js (contorno, extrusión y trazos incluidos), leyendo el svg que genera icon().
// Falla ruidosamente ante lo que no sabe medir (elemento, comando de path o transform desconocidos): nunca devuelve un número falso.
const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gy;

// Arco SVG (endpoint -> centro, spec F.6.5), muestreado.
function arcPoints(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let i = 1; i <= 48; i++) {
    const a = t1 + (dt * i) / 48;
    pts.push([cx + rx * Math.cos(a) * c - ry * Math.sin(a) * s, cy + rx * Math.cos(a) * s + ry * Math.sin(a) * c]);
  }
  return pts;
}

const bez = (p, t) => {
  const u = 1 - t;
  if (p.length === 4) return [0, 1].map((i) => u ** 3 * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t ** 3 * p[3][i]);
  return [0, 1].map((i) => u * u * p[0][i] + 2 * u * t * p[1][i] + t * t * p[2][i]);
};

/** Puntos (curvas muestreadas) de un atributo d. Soporta M L H V C S Q T A Z en absoluto y relativo. */
export function pathPoints(d) {
  const pts = [];
  const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  while (i < d.length) {
    const ch = d[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (/[a-zA-Z]/.test(ch)) {
      if (!(ch.toUpperCase() in arity)) throw new Error(`comando de path desconocido «${ch}» en ${d.slice(0, 60)}`);
      cmd = ch; i++;
      if (ch === 'z' || ch === 'Z') { x = sx; y = sy; lc = lq = null; continue; }
    } else if (!cmd) throw new Error(`path sin comando: ${d.slice(0, 60)}`);
    const up = cmd.toUpperCase(), rel = cmd !== up, n = arity[up];
    NUM.lastIndex = i;
    const a = [];
    for (let k = 0; k < n; k++) {
      while (/[\s,]/.test(d[NUM.lastIndex] ?? '')) NUM.lastIndex++;
      const m = NUM.exec(d);
      if (!m) throw new Error(`faltan números para «${cmd}» en ${d.slice(0, 60)}`);
      a.push(parseFloat(m[0]));
    }
    i = NUM.lastIndex;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (up === 'M') { x = a[0] + ox; y = a[1] + oy; sx = x; sy = y; pts.push([x, y]); cmd = rel ? 'l' : 'L'; lc = lq = null; }
    else if (up === 'L') { x = a[0] + ox; y = a[1] + oy; pts.push([x, y]); lc = lq = null; }
    else if (up === 'H') { x = a[0] + ox; pts.push([x, y]); lc = lq = null; }
    else if (up === 'V') { y = a[0] + oy; pts.push([x, y]); lc = lq = null; }
    else if (up === 'C' || up === 'S' || up === 'Q' || up === 'T') {
      let p;
      if (up === 'C') p = [[x, y], [a[0] + ox, a[1] + oy], [a[2] + ox, a[3] + oy], [a[4] + ox, a[5] + oy]];
      else if (up === 'S') p = [[x, y], lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y], [a[0] + ox, a[1] + oy], [a[2] + ox, a[3] + oy]];
      else if (up === 'Q') p = [[x, y], [a[0] + ox, a[1] + oy], [a[2] + ox, a[3] + oy]];
      else p = [[x, y], lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y], [a[0] + ox, a[1] + oy]];
      for (let s = 1; s <= 24; s++) pts.push(bez(p, s / 24));
      const last = p[p.length - 1], ctl = p[p.length - 2];
      x = last[0]; y = last[1];
      lc = up === 'C' || up === 'S' ? ctl : null;
      lq = up === 'Q' || up === 'T' ? ctl : null;
    } else if (up === 'A') {
      const ex = a[5] + ox, ey = a[6] + oy;
      pts.push(...arcPoints(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey));
      x = ex; y = ey; lc = lq = null;
    }
  }
  return pts;
}

function applyTransform(pts, tr) {
  if (!tr) return pts;
  const m = /^(translate|rotate)\(([^)]*)\)$/.exec(tr.trim());
  if (!m) throw new Error(`transform desconocido: ${tr}`);
  const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
  if (m[1] === 'translate') return pts.map(([x, y]) => [x + v[0], y + (v[1] ?? 0)]);
  const [deg, cx = 0, cy = 0] = v, r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** { minX, minY, maxX, maxY, cx, cy } de un <svg> de icono. */
export function iconBounds(svg) {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  const stack = []; // <g> abiertos: transform y si es el brillo recortado a la forma (no amplía nada)
  let skip = 0;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [, close, name, attrs, selfClose] of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    if (name === 'svg') continue;
    if (close) {
      if (name === 'g') { if (stack.pop().clip) skip--; }
      continue;
    }
    const attr = (k) => new RegExp(`\\s${k}="([^"]*)"`).exec(attrs)?.[1];
    if (name === 'g') {
      const clip = attrs.includes('clip-path=');
      if (selfClose) continue;
      stack.push({ tr: attr('transform'), clip });
      if (clip) skip++;
      continue;
    }
    if (name !== 'path') throw new Error(`elemento svg que no sé medir: <${name}>`);
    if (skip) continue;
    let pts = applyTransform(pathPoints(attr('d')), attr('transform'));
    for (const g of [...stack].reverse()) pts = applyTransform(pts, g.tr);
    const stroke = attr('stroke');
    const half = stroke && stroke !== 'none' ? Number(attr('stroke-width') ?? 1) / 2 : 0;
    for (const [x, y] of pts) {
      box.minX = Math.min(box.minX, x - half); box.maxX = Math.max(box.maxX, x + half);
      box.minY = Math.min(box.minY, y - half); box.maxY = Math.max(box.maxY, y + half);
    }
  }
  if (!Number.isFinite(box.minX)) throw new Error('icono sin geometría medible');
  return { ...box, cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2 };
}
