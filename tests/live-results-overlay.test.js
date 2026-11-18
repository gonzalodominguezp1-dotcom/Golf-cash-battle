import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// main.js no se puede importar en tests (toca el DOM): se comprueba el orden en el código fuente.
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

/** Cuerpo de una función de nivel superior: desde su cabecera hasta la siguiente al margen izquierdo. */
function body(name) {
  const start = src.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `no se encuentra ${name}`);
  const rest = src.slice(start + 1);
  const end = rest.search(/^\}/m);
  return rest.slice(0, end);
}

test('stopLive quita el .overlay abierto: es el que borraría el resultado si se llamara después', () => {
  assert.match(body('stopLive'), /querySelector\('\.overlay'\)\?\.remove\(\)/);
});

test('resultado en vivo: stopLive va ANTES de pintar el overlay final (si no, desaparece y el hoyo queda girando)', () => {
  const live = body('showLiveResults');
  const stop = live.indexOf('stopLive()');
  const overlay = live.indexOf('showEndOverlay(');
  assert.ok(overlay >= 0 && stop >= 0, 'showLiveResults debe llamar a ambos');
  assert.ok(stop < overlay, 'stopLive() debe llamarse antes que showEndOverlay()');
  // y no hay otra llamada a stopLive() tras pintar el overlay en la rama del resultado
  const afterOverlay = live.slice(overlay, live.indexOf('return;', overlay));
  assert.ok(!afterOverlay.includes('stopLive()'), 'stopLive() tras showEndOverlay() borraría el resultado');
});
