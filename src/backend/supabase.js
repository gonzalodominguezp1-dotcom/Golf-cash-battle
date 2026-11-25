import { createClient } from '@supabase/supabase-js';
import { SupabaseWallet } from '../wallet/SupabaseWallet.js';
import { SupabaseMatchService } from '../match/SupabaseMatchService.js';
import { TournamentService } from '../match/TournamentService.js';
import { PartyService } from '../match/PartyService.js';
import { AccountService } from '../account/AccountService.js';
import { AuthService } from '../account/AuthService.js';
import { authErrorCode, cleanReturnUrl, parseReturnUrl } from '../account/authRules.js';
import { announceVerified } from '../account/verifiedChannel.js';

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
/** Tiempo máximo del arranque antes de enseñar «Sin conexión» con reintentar (nunca «Conectando…» eterno). */
export const CONNECT_TIMEOUT_MS = 8000;
const TIMED_OUT = Symbol('timeout');
const withTimeout = (promise, ms) => {
  let t;
  const limit = new Promise((resolve) => {
    t = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(t));
};

/** Quita todo lo que Supabase guarda en este origen (sesión, verifier de PKCE). */
function clearSupabaseStorage() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('sb-')) localStorage.removeItem(key);
  } catch { }
}

/**
 * Entra con la sesión guardada en el dispositivo y monta los servicios. Sin sesión
 * (o con una de invitado de la versión anterior, o llegando desde el enlace de
 * "olvidé mi contraseña") devuelve { mode: 'auth' } y la app enseña las pantallas
 * de entrada. Si cambia el usuario (cerrar sesión, otra cuenta) se recarga la app
 * para empezar limpia.
 *
 * Vuelta del correo: la URL trae `?auth=confirm|recovery&code=…` (ver authRules.buildReturnUrl).
 * El canje se hace aquí, una vez, y la URL se limpia. Si falla, la app no se queda colgada:
 * devuelve { mode: 'auth', linkError } para que la pantalla de entrada explique qué pasó.
 */
export async function connectSupabase() {
  // PKCE: el enlace del correo trae un código de un solo uso que solo canjea este navegador.
  // detectSessionInUrl va apagado: el canje lo hacemos nosotros para poder mostrar el resultado.
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
  const auth = new AuthService(db);
  // antes de getSession(): el aviso del enlace de recuperación sale mientras arranca el cliente
  let recovery = false;
  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
  });

  let linkError = null;
  let justVerified = false;
  const ret = parseReturnUrl(location.href);
  if (ret) {
    if (ret.error) linkError = ret.error;
    if (ret.code) {
      const res = await auth.exchangeCode(ret.code);
      if (res.ok) {
        if (ret.flow === 'recovery') recovery = true;
        else {
          justVerified = true;
          // JWT nuevo con el email confirmado y aviso a las demás pestañas (la del registro entra sola)
          await db.auth.refreshSession().catch(() => {});
          announceVerified();
        }
      } else linkError = res.code;
    }
    history.replaceState(null, '', cleanReturnUrl(location.href));
  }

  const got = await withTimeout(db.auth.getSession(), CONNECT_TIMEOUT_MS);
  if (got === TIMED_OUT) return { mode: 'auth', db, auth, recovery, guest: false, linkError: 'network' };
  const session = got.data.session;
  if (!session || session.user.is_anonymous || recovery) {
    return { mode: 'auth', db, auth, recovery, guest: Boolean(session?.user.is_anonymous) && !recovery, linkError };
  }
  const uid = session.user.id;
  db.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_OUT' || (s && s.user.id !== uid)) setTimeout(() => location.reload(), 0);
  });
  const wallet = new SupabaseWallet(db, uid);
  const account = new AccountService(db);
  const loadAccount = () => withTimeout(Promise.all([wallet.getBalance(), account.load()]), CONNECT_TIMEOUT_MS);
  // un fallo justo al entrar suele ser transitorio: un reintento antes de rendirse. Cada error queda en consola.
  let failure = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      failure = null;
      const loaded = await loadAccount();
      if (loaded === TIMED_OUT) throw new Error('timeout al cargar la cuenta');
      break;
    } catch (err) {
      failure = err;
      console.error(`[gcb] cargar la cuenta, intento ${attempt}:`, err);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1200));
    }
  }
  if (failure) {
    // ¿la sesión sigue valiendo? Si solo falla la red o el tiempo de espera, se conserva y se avisa.
    // Solo se cierra la sesión local si el servidor dice que ya no es válida.
    const who = await withTimeout(db.auth.getUser(), CONNECT_TIMEOUT_MS);
    if (who === TIMED_OUT || authErrorCode(who.error) === 'network' || who.data?.user) {
      return { mode: 'auth', db, auth, recovery: false, guest: false, linkError: 'network' };
    }
    console.error('[gcb] sesión no válida en el servidor, se cierra aquí:', who.error);
    await db.auth.signOut({ scope: 'local' }).catch(() => {});
    clearSupabaseStorage();
    return { mode: 'auth', db, auth, recovery: false, guest: false, linkError: null };
  }
  // justo tras confirmar, el perfil del servidor a veces aún dice «sin confirmar»: un reintento corto
  if (justVerified && account.profile?.email_confirmed === false) {
    await new Promise((r) => setTimeout(r, 800));
    await db.auth.refreshSession().catch(() => {});
    await account.load().catch((err) => console.error('[gcb] recarga tras confirmar:', err));
  }
  return {
    justVerified,
    mode: 'supabase',
    db,
    user: session.user,
    wallet,
    account,
    matches: new SupabaseMatchService(db, wallet),
    tournaments: new TournamentService(db, wallet),
    parties: new PartyService(db),
    // latencia para el HUD: ida y vuelta de la petición más pequeña del servidor
    async ping() {
      const t0 = performance.now();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_KEY }, cache: 'no-store' });
      if (res.status >= 500) throw new Error('ping');
      return performance.now() - t0;
    },
  };
}

export { rpcError } from './rpcError.js';
