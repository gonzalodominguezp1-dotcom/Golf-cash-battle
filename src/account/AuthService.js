import { authErrorCode, buildReturnUrl, mapLinkError, normalizeEmail, RETURN_FLOWS } from './authRules.js';

const LAST_EMAIL_KEY = 'gcb.lastEmail';
// PKCE deja el verifier en localStorage como `sb-<ref>-auth-token-code-verifier`
const PKCE_VERIFIER_SUFFIX = '-code-verifier';

/**
 * Entrar, registrarse y recuperar la contraseña. Va antes de tener sesión, así que no
 * depende de AccountService (que necesita el perfil del servidor).
 *
 * Todos los métodos lanzan Error con `code` (ver authRules.authErrorCode). Los que pueden
 * revelar si un email tiene cuenta (registro, recuperar contraseña) responden igual exista o no.
 */
export class AuthService {
  constructor(db) {
    this.db = db;
  }

  /** Vuelta del enlace de confirmación. Tiene que estar en Supabase → Authentication → URL Configuration. */
  get redirectTo() {
    return buildReturnUrl(location.origin, RETURN_FLOWS.confirm);
  }

  /**
   * Entrar o registrarse con Google. Sin paso de verificación: Google ya trae el email confirmado,
   * y Supabase lo marca así al crear la cuenta.
   * Un invitado (sesión anónima) vincula Google a su misma cuenta: conserva saldo, nivel y skins.
   * Redirige a la web de Google; al volver, connectSupabase canjea el código (flow 'oauth').
   */
  async signInWithGoogle() {
    const redirectTo = buildReturnUrl(location.origin, RETURN_FLOWS.oauth);
    const {
      data: { session },
    } = await this.db.auth.getSession();
    const options = { redirectTo };
    const result = session?.user?.is_anonymous
      ? await this.db.auth.linkIdentity({ provider: 'google', options })
      : await this.db.auth.signInWithOAuth({ provider: 'google', options });
    if (result.error) throw fail(result.error);
    // supabase-js ya redirige a Google en el navegador; la URL se devuelve por si el llamador quiere hacerlo a mano
    return result.data?.url ?? null;
  }

  /** Vuelta del enlace de recuperar contraseña (distinta para que la app sepa qué pantalla mostrar). */
  get recoveryRedirectTo() {
    return buildReturnUrl(location.origin, RETURN_FLOWS.recovery);
  }

  /**
   * Canjea el `code` del enlace por una sesión. Solo funciona en el navegador que pidió el correo
   * (PKCE). Si falla, borra el verifier sobrante para no arrastrarlo al siguiente intento.
   * Devuelve { ok: true } o { ok: false, code } con un código de authRules.
   */
  async exchangeCode(code) {
    const { error } = await this.db.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true };
    this.clearPkceLeftovers();
    const msg = String(error.message ?? '').toLowerCase();
    if (error.code === 'flow_state_not_found' || /code verifier|flow state|pkce/.test(msg)) return { ok: false, code: 'confirm_elsewhere' };
    const mapped = authErrorCode(error);
    return { ok: false, code: mapped === 'link_expired' ? 'link_used' : (mapped ?? 'unknown') };
  }

  /** Quita los verifier de PKCE de localStorage (los de esta app; el resto de claves no se tocan). */
  clearPkceLeftovers() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith(PKCE_VERIFIER_SUFFIX)) localStorage.removeItem(key);
      }
    } catch { }
  }

  /** Error del enlace en la URL (hash de Supabase) → código de la app. */
  linkErrorCode(errorCode) {
    return mapLinkError(errorCode);
  }

  async signIn(email, password) {
    const e = normalizeEmail(email);
    const { error } = await this.db.auth.signInWithPassword({ email: e, password });
    if (error) throw fail(error);
    remember(e);
  }

  /**
   * Cuenta nueva. Devuelve 'signed_in' si Supabase no pide confirmar el email y 'confirm' si hay
   * que abrir el enlace del correo. Si ya existía el email, Supabase también responde 'confirm'
   * (sin enviar nada nuevo), para no delatarlo.
   *
   * Un invitado de la versión anterior (sesión anónima) conserva saldo, nivel y skins: se le
   * pone email y contraseña a la misma cuenta en vez de crear otra.
   */
  async signUp(email, password) {
    const e = normalizeEmail(email);
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (session?.user?.is_anonymous) {
      const { error } = await this.db.auth.updateUser({ email: e, password }, { emailRedirectTo: this.redirectTo });
      // email ya usado por otra cuenta: misma respuesta que si todo fuera bien
      if (error && authErrorCode(error) !== 'email_taken') throw fail(error);
      remember(e);
      return 'confirm';
    }
    const { data, error } = await this.db.auth.signUp({ email: e, password, options: { emailRedirectTo: this.redirectTo } });
    if (error && authErrorCode(error) !== 'email_taken') throw fail(error);
    remember(e);
    return data?.session ? 'signed_in' : 'confirm';
  }

  async resendConfirmation(email) {
    const { error } = await this.db.auth.resend({ type: 'signup', email: normalizeEmail(email), options: { emailRedirectTo: this.redirectTo } });
    if (error) throw fail(error);
  }

  /** Siempre parece que funcionó, salvo límite de envíos o falta de red. */
  async requestPasswordReset(email) {
    const { error } = await this.db.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: this.recoveryRedirectTo });
    if (!error) return;
    const code = authErrorCode(error);
    if (code === 'rate_limited' || code === 'network') throw fail(error);
  }

  /** Con la sesión de recuperación (enlace del correo) o la normal. */
  async updatePassword(password) {
    const { error } = await this.db.auth.updateUser({ password });
    if (error) throw fail(error);
  }

  /** Cambio desde la cuenta: pide la contraseña actual, por si alguien tiene el móvil desbloqueado. */
  async changePassword(current, next) {
    const {
      data: { user },
    } = await this.db.auth.getUser();
    if (!user?.email) throw fail({ code: 'invalid_credentials' });
    const { error } = await this.db.auth.signInWithPassword({ email: user.email, password: current });
    if (error) throw fail(error);
    await this.updatePassword(next);
  }

  async signOut() {
    // solo este dispositivo: las demás sesiones de la cuenta siguen abiertas
    await this.db.auth.signOut({ scope: 'local' });
  }
}

/** Último email usado, para no tener que escribirlo otra vez. La contraseña nunca se guarda aquí. */
export function lastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function remember(email) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch { }
}

function fail(error) {
  const e = new Error(authErrorCode(error) ?? 'unknown');
  e.code = e.message;
  return e;
}
