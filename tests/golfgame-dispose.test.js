import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// GolfGame necesita WebGL y no se instancia en Node: se comprueba el ciclo de vida del renderer en el código fuente.
// A verificar en navegador: tras jugar y volver al hub solo queda un canvas WebGL.
const src = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('  dispose() {'), src.indexOf('  // ---------- escena ----------'));

test('GolfGame.dispose es idempotente y suelta el contexto WebGL tras renderer.dispose', () => {
  assert.match(body, /if \(this\.disposed\) return;/);
  const iDispose = body.indexOf('this.renderer.dispose()');
  const iLoss = body.indexOf('this.renderer.forceContextLoss?.()');
  assert.ok(iDispose > 0 && iLoss > iDispose, 'forceContextLoss tras renderer.dispose');
  assert.ok(body.indexOf('domElement.remove()') > iLoss);
  assert.match(body, /try \{ this\.renderer\.forceContextLoss/); // un segundo/ya perdido no lanza
});
