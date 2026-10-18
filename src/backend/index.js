import { COURSES } from '../game/courses.js';
import { LocalWallet } from '../wallet/LocalWallet.js';
import { MatchService } from '../match/MatchService.js';

/**
 * Elige el backend. VITE_BACKEND=local fuerza la demo en el navegador (la
 * usa la vista previa, que no puede salir a internet). Si Supabase no
 * responde o no deja entrar, también se cae a local para que se pueda jugar.
 */
export async function createBackend() {
  if (import.meta.env.VITE_BACKEND !== 'local') {
    try {
      const { connectSupabase } = await import('./supabase.js');
      return await connectSupabase();
    } catch (e) {
      console.warn('Supabase no disponible, modo local:', e);
      return local(e.message);
    }
  }
  return local();
}

function local(reason = null) {
  const wallet = new LocalWallet();
  return { mode: 'local', reason, wallet, matches: new MatchService(wallet, Math.random, COURSES.length) };
}
