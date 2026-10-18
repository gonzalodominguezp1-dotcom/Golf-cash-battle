/**
 * Contrato del wallet. La app solo habla con esta interfaz, así que cambiar
 * de LocalWallet (créditos demo en el navegador) a un wallet en Supabase es
 * implementar estos mismos métodos contra la base de datos.
 *
 * @typedef {{ id: string, type: 'deposit'|'entry'|'prize'|'refund', amount: number, note: string, at: number }} Transaction
 *
 * @typedef {object} WalletService
 * @property {() => Promise<number>} getBalance
 * @property {() => Promise<Transaction[]>} getTransactions  más recientes primero
 * @property {(amount: number, note: string) => Promise<number>} deposit
 * @property {(amount: number, note: string) => Promise<number>} chargeEntry  falla si no hay saldo
 * @property {(amount: number, note: string) => Promise<number>} payPrize
 * @property {(amount: number, note: string) => Promise<number>} refund
 * @property {(listener: (balance: number) => void) => () => void} subscribe
 */
export class InsufficientFundsError extends Error {
  constructor() {
    super('Saldo insuficiente');
    this.name = 'InsufficientFundsError';
  }
}
