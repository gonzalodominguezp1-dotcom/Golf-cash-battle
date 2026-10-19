// Copia la física, los hoyos y el antibots del juego a la función submit-hole,
// para que el servidor repita los golpes con exactamente el mismo código.
import { copyFileSync, mkdirSync } from 'node:fs';

// [origen en src/, destino en la función]
export const SHARED = [
  ['game/physics.js', 'game/physics.js'],
  ['game/replay.js', 'game/replay.js'],
  ['game/courses.js', 'game/courses.js'],
  ['antibot/risk.js', 'antibot/risk.js'],
];
const dest = new URL('../supabase/functions/submit-hole/', import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [from, to] of SHARED) {
    mkdirSync(new URL(to.replace(/[^/]+$/, ''), dest), { recursive: true });
    copyFileSync(new URL(`../src/${from}`, import.meta.url), new URL(to, dest));
  }
  console.log('Física y antibots copiados a supabase/functions/submit-hole');
}
