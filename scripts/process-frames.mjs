// Procesa las 18 ilustraciones de marcos de avatar (JPG sobre fondo negro) y las deja listas para la web:
//   1. Transparenta el fondo exterior y el círculo interior (zonas oscuras conectadas al borde / al hueco central)
//      con un alfa suave: el brillo, el humo y las partículas se conservan (el color se des-premultiplica
//      contra negro, así se componen bien sobre cualquier fondo).
//   2. Recorta a 1:1 centrado en el HUECO del marco (la cara queda alineada) con margen para alas y tentáculos.
//   3. Exporta WebP: HD 512x512 y Thumb 128x128, y un manifest.json con la proporción hueco/imagen de cada marco.
// Uso: pnpm frames:make [carpeta-con-"Marco N.jpg"]
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// El orden es el del número del fichero: "Marco 1.jpg" -> f_rustic, ...
export const FRAME_IDS = [
  'f_rustic', 'f_scifi', 'f_emperor', 'f_arcane', 'f_void', 'f_phoenix', 'f_thunder', 'f_vortex', 'f_astral',
  'f_cyber', 'f_magma', 'f_sakura', 'f_frost', 'f_toxic', 'f_oni', 'f_roulette', 'f_pharaoh', 'f_kraken',
];
const OUT = join(root, 'public', 'assets', 'frames');
const HD = 512;
const THUMB = 128;
const MAX_BYTES = 40 * 1024;
const DARK_STEPS = [56, 40, 28, 20, 14, 10]; // umbrales (canal máximo): por debajo, el píxel es fondo candidato
const FLOOR = 6; // por debajo es ruido JPEG: alfa 0
const OPAQUE = 16; // alfa mínimo para contar como parte del marco al medir
const MIN_HOLE = 0.4; // el hueco no puede ser menos del 40 % de la imagen: si lo es (alas muy anchas), se recorta lo que sobra

const sourceDir = () => {
  const cands = [process.argv[2], join(root, '02-DOCS', 'attachments', 'nuevos-marcos'), join(homedir(), 'Downloads')].filter(Boolean);
  const dir = cands.find((d) => existsSync(join(d, 'Marco 1.jpg')));
  if (!dir) throw new Error('No encuentro "Marco 1.jpg" (pasa la carpeta como argumento).');
  return dir;
};

/** Relleno por inundación 4-conexo de los píxeles oscuros; devuelve el nº de píxeles marcados con `label`. */
function flood(mask, seen, w, h, start, label, stack) {
  let n = 0;
  let sp = 0;
  stack[sp++] = start;
  seen[start] = label;
  while (sp) {
    const p = stack[--sp];
    n++;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = label; stack[sp++] = p - 1; }
    if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = label; stack[sp++] = p + 1; }
    if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = label; stack[sp++] = p - w; }
    if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = label; stack[sp++] = p + w; }
  }
  return n;
}

async function processFrame(file) {
  const { data, info } = await sharp(await readFile(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const total = w * h;
  const mx = new Uint8Array(total);
  for (let i = 0; i < total; i++) mx[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  // Si el fondo se cuela por una rendija oscura del marco hasta el hueco, se baja el umbral hasta separarlos.
  const seen = new Int32Array(total); // hay cientos de bolsas oscuras pequeñas: no cabe en 8 bits
  const stack = new Int32Array(total);
  const dark = new Uint8Array(total);
  const edges = [];
  for (let x = 0; x < w; x++) edges.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edges.push(y * w, y * w + w - 1);
  let holeLabel = 0;
  let holeSize = 0;
  let DARK = 0;
  for (const t of DARK_STEPS) {
    DARK = t;
    seen.fill(0);
    for (let i = 0; i < total; i++) dark[i] = mx[i] <= DARK ? 1 : 0;
    // Etiqueta 1 = fondo exterior (toca el borde). Etiqueta >=2 = bolsas oscuras cerradas; la mayor es el hueco.
    for (const p of edges) if (dark[p] && !seen[p]) flood(dark, seen, w, h, p, 1, stack);
    holeLabel = 0;
    holeSize = 0;
    let label = 1;
    for (let p = 0; p < total; p++) {
      if (dark[p] && !seen[p]) {
        label++;
        const n = flood(dark, seen, w, h, p, label, stack);
        if (n > holeSize) { holeSize = n; holeLabel = label; }
      }
    }
    if (holeSize >= total * 0.02) break;
  }
  if (!holeLabel || holeSize < total * 0.02) throw new Error(`${file}: no encuentro el hueco central`);

  // RGBA completo + medidas del hueco y del marco.
  const rgba = new Uint8Array(total * 4);
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hx = 0, hy = 0;
  for (let p = 0; p < total; p++) {
    const k = seen[p];
    let a = 255;
    let r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if (k === 1 || k === holeLabel) {
      const m = mx[p];
      if (m <= FLOOR) a = 0;
      else {
        const f = Math.min(1, m / DARK);
        a = Math.round(255 * Math.min(1, (m - FLOOR) / (DARK - FLOOR)));
        r = Math.min(255, Math.round(r / f)); g = Math.min(255, Math.round(g / f)); b = Math.min(255, Math.round(b / f));
      }
    }
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = a;
    const x = p % w;
    const y = (p - x) / w;
    if (k === holeLabel) { hx += x; hy += y; }
    if (a >= OPAQUE) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cx = hx / holeSize;
  const cy = hy / holeSize;
  const holeD = Math.sqrt((4 * holeSize) / Math.PI);
  const full = Math.ceil(Math.max(cx - minX, maxX - cx, cy - minY, maxY - cy) * 1.03) + 2;
  const half = Math.min(full, Math.ceil(holeD / MIN_HOLE / 2));
  const side = half * 2;

  // Lienzo cuadrado centrado en el hueco (transparente donde el original no llega).
  const sq = Buffer.alloc(side * side * 4);
  const ox = Math.round(cx) - half;
  const oy = Math.round(cy) - half;
  for (let y = 0; y < side; y++) {
    const sy = y + oy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < side; x++) {
      const sx = x + ox;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4;
      const d = (y * side + x) * 4;
      sq[d] = rgba[s]; sq[d + 1] = rgba[s + 1]; sq[d + 2] = rgba[s + 2]; sq[d + 3] = rgba[s + 3];
    }
  }
  return { sq, side, hole: holeD / side };
}

async function encode(sq, side, size, maxBytes) {
  const base = sharp(sq, { raw: { width: side, height: side, channels: 4 } }).resize(size, size, { kernel: 'lanczos3' });
  let out;
  for (let q = 84; q >= 30; q -= 6) {
    out = await base.clone().webp({ quality: q, alphaQuality: Math.min(100, q + 10), effort: 6, smartSubsample: true }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  throw new Error(`no consigo bajar de ${maxBytes} bytes (${out.length})`);
}

async function main() {
  const dir = sourceDir();
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  for (let i = 0; i < FRAME_IDS.length; i++) {
    const id = FRAME_IDS[i];
    const { sq, side, hole } = await processFrame(join(dir, `Marco ${i + 1}.jpg`));
    const hd = await encode(sq, side, HD, MAX_BYTES);
    const thumb = await encode(sq, side, THUMB, MAX_BYTES);
    await writeFile(join(OUT, `${id}.webp`), hd);
    await writeFile(join(OUT, `${id}.thumb.webp`), thumb);
    manifest[id] = { hole: Number(hole.toFixed(4)), hd: hd.length, thumb: thumb.length };
    console.log(`${id.padEnd(11)} hueco ${(hole * 100).toFixed(1)}%  HD ${(hd.length / 1024).toFixed(1)} KB  thumb ${(thumb.length / 1024).toFixed(1)} KB`);
  }
  await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
