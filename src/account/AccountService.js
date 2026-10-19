import { rpcError } from '../backend/supabase.js';

/**
 * Cuenta del jugador en Supabase. Se empieza como invitado (cuenta anónima);
 * al añadir el email la misma cuenta pasa a ser permanente y conserva saldo,
 * nivel y skins. Para entrar en otro móvil se pide un enlace o código por email.
 */
export class AccountService {
  constructor(db) {
    this.db = db;
    this.profile = null;
  }

  async #rpc(fn, args) {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw rpcError(error);
    return data;
  }

  async load() {
    this.profile = await this.#rpc('my_profile');
    return this.profile;
  }

  async setUsername(name) {
    this.profile = await this.#rpc('set_username', { p_name: name });
    return this.profile;
  }

  saveProgress(state) {
    return this.#rpc('save_progress', { p_state: state });
  }

  /** Invitado → cuenta con email. Llega un email con enlace (y código si la plantilla lo incluye). */
  async register(email) {
    const { error } = await this.db.auth.updateUser({ email }, { emailRedirectTo: here() });
    if (error) throw authError(error);
  }

  /** Entrar en una cuenta que ya existe (otro móvil o tras cerrar sesión). */
  async signIn(email) {
    const { error } = await this.db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: here() } });
    if (error) throw authError(error);
  }

  /** Código de 6 cifras del email. type: 'email_change' al registrarse, 'email' al entrar. */
  async verifyCode(email, token, type) {
    const { error } = await this.db.auth.verifyOtp({ email, token, type });
    if (error) throw authError(error);
  }

  async signOut() {
    await this.db.auth.signOut();
  }

  /** Abre la verificación de identidad. { mode: 'stub' } o { mode, url } para ir al proveedor. */
  async startKyc() {
    return this.#fn({ action: 'start', returnUrl: here() });
  }

  /** Solo en modo pruebas, sin proveedor configurado. */
  async stubKyc(birthdate, document) {
    return this.#fn({ action: 'stub', birthdate, document });
  }

  async #fn(body) {
    const { data, error } = await this.db.functions.invoke('kyc', { body });
    if (error) {
      const res = await error.context?.json?.().catch(() => null);
      const e = new Error(res?.error ?? 'network');
      e.code = e.message;
      throw e;
    }
    return data;
  }
}

const here = () => location.href.split('#')[0];

function authError(error) {
  const msg = (error?.code ?? error?.message ?? '').toLowerCase();
  const e = new Error(msg);
  if (/already|exists|registered/.test(msg)) e.code = 'email_taken';
  else if (/rate|seconds|too many/.test(msg)) e.code = 'rate_limited';
  else if (/expired|invalid|otp/.test(msg)) e.code = 'bad_code';
  else if (/not found|signups not allowed/.test(msg)) e.code = 'no_account';
  else e.code = 'unknown';
  return e;
}
