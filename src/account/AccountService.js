import { rpcError } from '../backend/supabase.js';
import { AuthService } from './AuthService.js';

/**
 * Cuenta del jugador en Supabase: perfil, nombre público, progreso y verificación
 * de identidad. Entrar y registrarse está en AuthService, que funciona sin sesión.
 */
export class AccountService {
  constructor(db) {
    this.db = db;
    this.profile = null;
    this.auth = new AuthService(db);
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

  /** Hitos de ranking que dan bolas y marco elegido. */
  myRanking() {
    return this.#rpc('my_ranking');
  }

  /** period: 'weekly' | 'monthly' | 'historic'. Devuelve { top: [...], me: { pos, wins } | null }. */
  ranking(period) {
    return this.#rpc('get_ranking', { p_period: period });
  }

  setFrame(id) {
    return this.#rpc('set_frame', { p_frame: id });
  }

  changePassword(current, next) {
    return this.auth.changePassword(current, next);
  }

  signOut() {
    return this.auth.signOut();
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
