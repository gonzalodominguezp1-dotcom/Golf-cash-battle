// Empaqueta dist-<portal>/ en <portal>.portal.zip para subirlo al portal (index.html en la raíz del zip).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const portal = process.argv[2];
const dir = `dist-${portal}`;
const out = `${portal}.portal.zip`;
if (!existsSync(join(dir, 'index.html'))) throw new Error(`Falta ${dir}/index.html: compila primero`);

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(dir);
const mb = files.reduce((a, f) => a + statSync(f).size, 0) / 1e6;
console.log(`${dir}: ${files.length} archivos, ${mb.toFixed(1)} MB`);

rmSync(out, { force: true });
try {
  execFileSync('zip', ['-qr9', join('..', out), '.'], { cwd: dir, stdio: 'inherit' });
  console.log(`Listo: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
} catch {
  console.log(`No hay "zip" en este equipo: comprime a mano el contenido de ${dir}/ (sin la carpeta).`);
}
