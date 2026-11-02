import { authErrorCode, normalizeEmail } from './authRules.js';

const LAST_EMAIL_KEY = 'gcb.lastEmail';

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

  /** Sin hash ni query: tiene que coincidir con una URL permitida en Supabase → Authentication → URL Configuration. */
  get redirectTo() {
    return location.origin + location.pathname;
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
    const { error } = await this.db.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: this.redirectTo });
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
