// Mide el peso de la carga inicial de dist/ (AC34 de ui-pantallas).
// Uso: pnpm run build && node scripts/initial-load-size.mjs [dist]
// Carga inicial = <script type="module"> + <link rel="modulepreload"> de dist/index.html.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, extname } from 'node:path';

const dist = resolve(process.argv[2] || 'dist');
const htmlPath = join(dist, 'index.html');
if (!existsSync(htmlPath)) {
  console.error('No existe ' + htmlPath + '. Ejecuta antes: pnpm run build');
  process.exit(1);
}
const html = readFileSync(htmlPath, 'utf8');

const size = (file) => {
  const buf = readFileSync(file);
  return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
};
const toFile = (href) => join(dist, href.replace(/^[./]+/, '').split(/[?#]/)[0]);

const entryHrefs = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>/gi)]
  .map((m) => /\bsrc=["']([^"']+)["']/i.exec(m[0])?.[1]).filter(Boolean);
const preloadHrefs = [...html.matchAll(/<link\b[^>]*>/gi)]
  .filter((m) => /rel=["']modulepreload["']/i.test(m[0]))
  .map((m) => /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1]).filter(Boolean);

const entryFile = entryHrefs[0] ? toFile(entryHrefs[0]) : null;
const initialFiles = [...new Set([...entryHrefs, ...preloadHrefs].map(toFile))];

const sum = (files) => files.reduce((a, f) => {
  const s = size(f); return { raw: a.raw + s.raw, gzip: a.gzip + s.gzip };
}, { raw: 0, gzip: 0 });

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const rel = (f) => f.slice(dist.length + 1).replaceAll(String.fromCharCode(92), '/');
const initialSet = new Set(initialFiles);
const chunks = walk(dist).filter((f) => extname(f) === '.js')
  .map((f) => ({ file: rel(f), ...size(f), initial: initialSet.has(f) }))
  .sort((a, b) => b.gzip - a.gzip);

const initialHasThree = initialFiles.some((f) => readFileSync(f, 'utf8').includes('WebGLRenderer'));

console.log(JSON.stringify({
  entry: entryFile ? size(entryFile) : null,
  initial: sum(initialFiles),
  initialHasThree,
  chunks,
}, null, 2));
