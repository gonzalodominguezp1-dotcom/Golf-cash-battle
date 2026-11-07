import { createClient } from '@supabase/supabase-js';
import { SupabaseWallet } from '../wallet/SupabaseWallet.js';
import { SupabaseMatchService } from '../match/SupabaseMatchService.js';
import { TournamentService } from '../match/TournamentService.js';
import { PartyService } from '../match/PartyService.js';
import { AccountService } from '../account/AccountService.js';
import { AuthService } from '../account/AuthService.js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://oyawgvqbmvtmlnyqwgdf.supabase.co';
// clave pública: solo deja llamar a lo que permiten RLS y las funciones
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_-fSLfcF-N9H9V7XgcDCwsg_YtaqRsbe';

/**
 * Entra con la sesión guardada en el dispositivo y monta los servicios. Sin sesión
 * (o con una de invitado de la versión anterior, o llegando desde el enlace de
 * "olvidé mi contraseña") devuelve { mode: 'auth' } y la app enseña las pantallas
 * de entrada. Si cambia el usuario (cerrar sesión, otra cuenta) se recarga la app
 * para empezar limpia.
 */
export async function connectSupabase() {
  // PKCE: el enlace del correo trae un código de un solo uso que solo canjea este navegador
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' } });
  // antes de getSession(): el aviso del enlace de recuperación sale mientras arranca el cliente
  let recovery = false;
  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
  });
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session || session.user.is_anonymous || recovery) {
    return { mode: 'auth', db, auth: new AuthService(db), recovery, guest: Boolean(session?.user.is_anonymous) && !recovery };
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
    parties: new PartyService(db),
  };
}

/** Pasa los errores de las funciones SQL (raise exception 'x') a algo legible. */
export function rpcError(error) {
  const code = /^[a-z_]+$/.test(error?.message ?? '') ? error.message : 'unknown';
  const e = new Error(code);
  e.code = code;
  // lo que dijo el servidor de verdad (para el diagnóstico: el código queda en 'unknown' si no es uno nuestro)
  e.detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
  return e;
}
