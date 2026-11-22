import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCREENS = fileURLToPath(new URL('../src/screens/', import.meta.url));

function stripComments(src) {
  // Conserva los saltos de línea para que los índices de línea coincidan con el original.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
    .replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

const UI_WORDS = new Set([
  'Guardar', 'Cerrar', 'Volver', 'Aceptar', 'Cancelar', 'Enviar', 'Salir', 'Reintentar',
  'Siguiente', 'Anterior', 'Editar', 'Borrar', 'Eliminar', 'Jugar', 'Continuar', 'Confirmar',
  'Cargando', 'Error', 'Inicio', 'Ajustes', 'Cuenta', 'Logros', 'Ranking', 'Amigos', 'Mesas',
]);
// Contextos donde el literal es técnico (clases, selectores, ids), no texto visible.
const TECH_PREFIX = /(?:className\s*[+]?=|classList\.\w+\((?:[^)]*,)?|querySelector(?:All)?\(|\bq\(|getElementById\(|closest\(|matches\(|\bid\s*=|dataset\.\w+\s*=)\s*$/;
// Contextos donde una sola palabra capitalizada sí es texto visible.
const TEXT_PREFIX = /(?:textContent|innerText|placeholder|title|alt|label|text)\s*[:=]\s*$|setAttribute\(\s*['"](?:aria-label|title|placeholder|alt)['"]\s*,\s*$/;

// Devuelve los literales que parecen texto visible. `// i18n-ok` en la línea donde empieza lo permite.
export function findVisibleLiterals(src) {
  const found = [];
  const clean = stripComments(src);
  const lines = clean.split('\n');
  const original = src.split('\n');
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\[\s\S])*)`/g;
  let m;
  while ((m = re.exec(clean))) {
    const before = clean.slice(0, m.index);
    const lineNo = before.split('\n').length - 1;
    const line = lines[lineNo];
    if (/^\s*import\b|^\s*export\s.*\bfrom\b/.test(line)) continue;
    if ((original[lineNo] ?? '').includes('i18n-ok')) continue;
    const prefix = before.slice(before.lastIndexOf('\n') + 1);
    if (TECH_PREFIX.test(prefix)) continue;
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    const text = s.replace(/\$\{[^}]*\}/g, ' ');
    const accented = /[áéíóúüñÁÉÍÓÚÑ¿¡]/.test(text);
    const capWords = /(^|\s)[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+\s+\S/.test(text);
    const twoWords = /(^|\s)[a-záéíóúüñ]{3,}\s+[a-záéíóúüñ]{3,}(\s|$)/i.test(text);
    const oneWord = /^[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]{2,}$/.test(text) && (UI_WORDS.has(text) || TEXT_PREFIX.test(prefix));
    if (accented || capWords || twoWords || oneWord) found.push(s);
  }
  return found;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('el detector marca texto visible', () => {
  assert.deepEqual(findVisibleLiterals("const a = 'Hola mundo';"), ['Hola mundo']);
  assert.equal(findVisibleLiterals('const a = "Atrás";').length, 1);
  assert.equal(findVisibleLiterals('x(`Tienes ${n} avisos`)').length, 1);
});

test('el detector ignora clases, rutas, comentarios e i18n-ok', () => {
  assert.deepEqual(findVisibleLiterals("el.className = 'scr-btn scr-btn--primary';"), []);
  assert.deepEqual(findVisibleLiterals("import x from './texts/index.js';"), []);
  assert.deepEqual(findVisibleLiterals("// Hola mundo en comentario\nconst a = 1;"), []);
  assert.deepEqual(findVisibleLiterals("const a = 'Hola mundo'; // i18n-ok"), []);
  assert.deepEqual(findVisibleLiterals("el.setAttribute('aria-hidden', 'true');"), []);
});

test('comentarios de bloque multilínea no desalinean i18n-ok', () => {
  const src = "/* a\nb */\nconst a = 'Hola mundo'; // i18n-ok\nconst b = 'Hola mundo';";
  assert.deepEqual(findVisibleLiterals(src), ['Hola mundo']);
  assert.equal(findVisibleLiterals(src).length, 1);
});

test('plantillas de varias líneas se detectan', () => {
  assert.equal(findVisibleLiterals('const a = `Hola\nmundo cruel`;').length, 1);
});

test('palabra única capitalizada: UI conocida o en textContent/placeholder', () => {
  assert.equal(findVisibleLiterals("b.textContent = 'Guardar';").length, 1);
  assert.equal(findVisibleLiterals("x({ label: 'Cerrar' });").length, 1);
  assert.equal(findVisibleLiterals("el.setAttribute('aria-label', 'Volver');").length, 1);
  assert.equal(findVisibleLiterals("const k = 'Aceptar';").length, 1);
  assert.equal(findVisibleLiterals("el.placeholder = 'Buscar';").length, 1);
});

test('sin falsos positivos en clases, ids, selectores', () => {
  assert.deepEqual(findVisibleLiterals("el.className = 'card active';"), []);
  assert.deepEqual(findVisibleLiterals("el.classList.add('card', 'div span');"), []);
  assert.deepEqual(findVisibleLiterals("q('div span');"), []);
  assert.deepEqual(findVisibleLiterals("root.querySelector('div span');"), []);
  assert.deepEqual(findVisibleLiterals("const id = 'Hub';"), []);
  assert.deepEqual(findVisibleLiterals("el.id = 'Guardar';"), []);
  assert.deepEqual(findVisibleLiterals("const t = 'Button';"), []);
});

test('ningún literal en español fuera de src/screens/texts/', () => {
  const offenders = [];
  for (const file of walk(SCREENS)) {
    const rel = relative(SCREENS, file);
    if (rel.split(sep)[0] === 'texts') continue;
    for (const lit of findVisibleLiterals(readFileSync(file, 'utf8'))) offenders.push(`${rel}: ${lit}`);
  }
  assert.deepEqual(offenders, []);
});
