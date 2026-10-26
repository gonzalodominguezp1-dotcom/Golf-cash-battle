#!/usr/bin/env node
/**
 * Hornea el normal map de hoyuelos de las bolas premium.
 *
 * - Proyección equirectangular compatible con SphereGeometry de three.js
 *   (u = longitud, v = latitud, v=1 en el polo norte; fila 0 de la imagen = v=1).
 * - Hoyuelos distribuidos por Fibonacci sobre la esfera, perfil cuártico suave
 *   h(x) = -D (1 - x^2)^2 con x = angulo / radio (C1 en el borde, sin escalones).
 * - Normales calculadas en 3D (gradiente de superficie proyectado sobre la base
 *   tangente T = dp/du, B = dp/dv), así no hay singularidad de 1/cos(lat) en los polos
 *   ni costura en u = 0/1 (la función solo depende de la posición 3D).
 * - Espacio tangente estilo OpenGL (verde = +v), 8 bits por canal.
 * - Sin dependencias: PNG escrito con zlib nativo (filtros por fila + deflate nivel 9).
 *
 * Uso: node scripts/bake-dimples.mjs
 * Salida: public/skins/dimples-normal.png (1024x512), public/skins/dimples-normal-512.png (512x256)
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public', 'skins');

export const DIMPLE_COUNT = 336;
export const DIMPLE_RADIUS = 0.105; // radio angular (rad) sobre la esfera unitaria
export const DIMPLE_DEPTH = 0.045; // profundidad (rad de esfera); fija la inclinacion maxima (~33 grados)

const TARGETS = [
  { file: 'dimples-normal.png', width: 1024, height: 512 },
  { file: 'dimples-normal-512.png', width: 512, height: 256 },
];

/** Centros de hoyuelos: espiral de Fibonacci sobre la esfera unitaria (eje Y = eje polar). */
export function fibonacciSphere(n) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden;
    pts.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  return pts;
}

/**
 * Normal map en espacio tangente (RGB 8 bits, fila 0 = norte).
 * Devuelve Uint8Array de width*height*3.
 */
export function bakeNormalMap(width, height, centers = fibonacciSphere(DIMPLE_COUNT)) {
  const cosR = Math.cos(DIMPLE_RADIUS);
  const TWO_PI = 2 * Math.PI;
  const rgb = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height; // centro del pixel; fila 0 = v cercano a 1
    const lat = (v - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const ang = TWO_PI * u;
      const cp = Math.cos(ang);
      const sp = Math.sin(ang);

      // Punto de la superficie y base tangente del mapeo UV (ortonormal, dextrógira con N = p).
      const px = -cp * cl;
      const py = sl;
      const pz = sp * cl;
      const tx = sp; // T = dp/du normalizado
      const tz = cp;
      const bx = cp * sl; // B = dp/dv normalizado (hacia el norte)
      const by = cl;
      const bz = -sp * sl;

      let gT = 0; // gradiente de la altura en la direccion T (por radian)
      let gB = 0; // gradiente de la altura en la direccion B
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        const cosA = px * c[0] + py * c[1] + pz * c[2];
        if (cosA <= cosR) continue;
        const a = Math.acos(Math.min(1, cosA));
        if (a < 1e-6) continue; // el centro exacto tiene gradiente nulo
        const xr = a / DIMPLE_RADIUS;
        // dh/da para h = -D (1 - x^2)^2, x = a / R
        const hp = (4 * DIMPLE_DEPTH * xr * (1 - xr * xr)) / DIMPLE_RADIUS;
        // grad_s(a) = -(c - cos(a) p) / sin(a); como p.T = p.B = 0, basta proyectar c
        const k = -hp / Math.sin(a);
        gT += k * (c[0] * tx + c[2] * tz);
        gB += k * (c[0] * bx + c[1] * by + c[2] * bz);
      }

      // n = N - grad_s(h) en la base (T, B, N) -> (-gT, -gB, 1)
      const nx = -gT;
      const ny = -gB;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const idx = (y * width + x) * 3;
      rgb[idx] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      rgb[idx + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      rgb[idx + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    }
  }
  return rgb;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Filtra cada fila eligiendo el filtro PNG de menor suma de valores absolutos. */
function filterScanlines(rgb, width, height) {
  const stride = width * 3;
  const out = Buffer.alloc((stride + 1) * height);
  let prev = new Uint8Array(stride);
  const scratch = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = rgb.subarray(y * stride, (y + 1) * stride);
    let bestType = 0;
    let bestScore = Infinity;
    let best = null;
    for (let t = 0; t < 5; t++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? row[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let pred = 0;
        if (t === 1) pred = a;
        else if (t === 2) pred = b;
        else if (t === 3) pred = (a + b) >> 1;
        else if (t === 4) pred = paeth(a, b, c);
        const d = (row[i] - pred) & 0xff;
        scratch[i] = d;
        score += d < 128 ? d : 256 - d;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = t;
        best = Uint8Array.from(scratch);
      }
    }
    const base = y * (stride + 1);
    out[base] = bestType;
    out.set(best, base + 1);
    prev = row;
  }
  return out;
}

/** Codifica RGB 8 bits como PNG (color type 2) con zlib nativo. */
export function encodePng(rgb, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bit
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; // compresion
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sin entrelazado
  const idat = deflateSync(filterScanlines(rgb, width, height), { level: 9, memLevel: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function main() {
  const centers = fibonacciSphere(DIMPLE_COUNT);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { file, width, height } of TARGETS) {
    const png = encodePng(bakeNormalMap(width, height, centers), width, height);
    const path = resolve(OUT_DIR, file);
    writeFileSync(path, png);
    console.log(`${path} ${width}x${height} ${png.length} bytes`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
