import { InsufficientFundsError } from './WalletService.js';
import { rpcError } from '../backend/supabase.js';

/**
 * Wallet en Supabase. El saldo solo lo cambian las funciones del servidor
 * (entrada, premio, devolución, recarga demo); aquí solo se lee.
 */
export class SupabaseWallet {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.balance = 0;
    this.listeners = new Set();
  }

  async getBalance() {
    const { data, error } = await this.db.from('wallets').select('balance').eq('user_id', this.userId).single();
    if (error) throw error;
    this.#set(Number(data.balance));
    return this.balance;
  }

  async getTransactions() {
    const { data, error } = await this.db
      .from('transactions')
      .select('id,type,amount,note,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data.map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), note: t.note, at: Date.parse(t.created_at) }));
  }

  async deposit(amount) {
    const { data, error } = await this.db.rpc('demo_deposit', { p_amount: amount });
    if (error) throw rpcError(error);
    this.#set(Number(data));
    return this.balance;
  }

  // el cobro de la entrada y el premio van dentro de join_match / finish_match
  async chargeEntry() {
    throw new Error('La entrada la cobra el servidor al unirse');
  }

  async payPrize() {
    throw new Error('El premio lo paga el servidor al cerrar la partida');
  }

  async refund() {
    throw new Error('La devolución la hace el servidor al abandonar');
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #set(balance) {
    if (balance === this.balance) return;
    this.balance = balance;
    this.listeners.forEach((l) => l(balance));
  }
}

export { InsufficientFundsError };
