import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEST_COOLDOWN, CHEST_KEY, chestReadyAt, markChestOpened } from '../src/chest.js';
import { withCap } from '../src/game/warmupRules.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('cofre: sin abrir está listo; al abrirlo espera 15 min', () => {
  const st = mem();
  assert.equal(chestReadyAt(st), CHEST_COOLDOWN); // 0 + cooldown: ya pasó hace mucho
  markChestOpened(st, 1_000);
  assert.equal(st.getItem(CHEST_KEY), '1000');
  assert.equal(chestReadyAt(st), 1_000 + CHEST_COOLDOWN);
});

test('cofre: un almacenamiento que falla no rompe nada', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(chestReadyAt(broken), 0);
  assert.doesNotThrow(() => markChestOpened(broken));
});

test('withCap con los temporizadores por defecto no lanza (setTimeout no se llama como método)', async () => {
  const r = await withCap(Promise.resolve(7), 1000);
  assert.deepEqual(r, { ok: true, value: 7 });
});
