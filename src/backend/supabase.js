import { createClient } from '@supabase/supabase-js';
import { SupabaseWallet } from '../wallet/SupabaseWallet.js';
import { SupabaseMatchService } from '../match/SupabaseMatchService.js';
import { TournamentService } from '../match/TournamentService.js';
import { AccountService } from '../account/AccountService.js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://oyawgvqbmvtmlnyqwgdf.supabase.co';
// clave pública: solo deja llamar a lo que permiten RLS y las funciones
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_-fSLfcF-N9H9V7XgcDCwsg_YtaqRsbe';

/**
 * Entra con la sesión guardada (o una cuenta de invitado nueva) y monta los
 * servicios. Si cambia el usuario (enlace de email, cerrar sesión) se recarga
 * la app para empezar limpia con la cuenta nueva.
 */
export async function connectSupabase() {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  let {
    data: { session },
  } = await db.auth.getSession();
  if (!session) {
    const { data, error } = await db.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const uid = session.user.id;
  db.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_OUT' || (s && s.user.id !== uid)) setTimeout(() => location.reload(), 0);
  });
  const wallet = new SupabaseWallet(db, uid);
  const account = new AccountService(db);
  await Promise.all([wallet.getBalance(), account.load()]);
  return {
    mode: 'supabase',
    db,
    user: session.user,
    wallet,
    account,
    matches: new SupabaseMatchService(db, wallet),
    tournaments: new TournamentService(db, wallet),
  };
}

/** Pasa los errores de las funciones SQL (raise exception 'x') a algo legible. */
export function rpcError(error) {
  const code = /^[a-z_]+$/.test(error?.message ?? '') ? error.message : 'unknown';
  const e = new Error(code);
  e.code = code;
  return e;
}
