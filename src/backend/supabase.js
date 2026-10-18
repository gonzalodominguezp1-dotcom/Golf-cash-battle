import { createClient } from '@supabase/supabase-js';
import { SupabaseWallet } from '../wallet/SupabaseWallet.js';
import { SupabaseMatchService } from '../match/SupabaseMatchService.js';

const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://oyawgvqbmvtmlnyqwgdf.supabase.co';
// clave pública: solo deja llamar a lo que permiten RLS y las funciones
const KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_-fSLfcF-N9H9V7XgcDCwsg_YtaqRsbe';

/** Entra con una cuenta anónima (se guarda en el navegador) y monta los servicios. */
export async function connectSupabase() {
  const db = createClient(URL, KEY);
  let {
    data: { session },
  } = await db.auth.getSession();
  if (!session) {
    const { data, error } = await db.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const wallet = new SupabaseWallet(db, session.user.id);
  await wallet.getBalance();
  return { mode: 'supabase', db, user: session.user, wallet, matches: new SupabaseMatchService(db, wallet) };
}

/** Pasa los errores de las funciones SQL (raise exception 'x') a algo legible. */
export function rpcError(error) {
  const code = /^[a-z_]+$/.test(error?.message ?? '') ? error.message : 'unknown';
  const e = new Error(code);
  e.code = code;
  return e;
}
