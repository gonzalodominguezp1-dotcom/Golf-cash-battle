import { test } from 'node:test';
import assert from 'node:assert/strict';

// canvas doble que graba cada orden de dibujo
const rec = () => {
  const log = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...a) => log.push([k, ...a, ctx.fillStyle])),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { ctx, log };
};
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => rec().ctx, addEventListener() {} }) };

const { drawSkyscraperFacade } = await import('../src/game/render/cyberpunkEnvironment.js');

test('fachada de rascacielos: determinista (misma textura en cada carga, sin Math.random)', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random prohibido'); };
  try {
    const a = rec(), b = rec(), c = rec();
    drawSkyscraperFacade(a.ctx, '#00f0ff', '#ff007f');
    drawSkyscraperFacade(b.ctx, '#00f0ff', '#ff007f');
    drawSkyscraperFacade(c.ctx, '#ff007f', '#00ffa3');
    assert.ok(a.log.length > 100);
    assert.deepEqual(a.log, b.log);
    assert.notDeepEqual(a.log, c.log, 'otros colores, otra semilla');
  } finally {
    Math.random = real;
  }
});
