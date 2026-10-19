// Copia la física y los hoyos del juego a la función submit-hole, para que el
// servidor repita los golpes con exactamente el mismo código.
import { copyFileSync } from 'node:fs';

export const SHARED = ['physics.js', 'replay.js', 'courses.js'];
const dest = new URL('../supabase/functions/submit-hole/game/', import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of SHARED) copyFileSync(new URL(`../src/game/${f}`, import.meta.url), new URL(f, dest));
  console.log('Física copiada a supabase/functions/submit-hole/game');
}
