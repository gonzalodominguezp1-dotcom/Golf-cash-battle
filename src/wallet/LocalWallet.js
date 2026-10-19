import { InsufficientFundsError } from './WalletService.js';
import { round2, STARTING_DEMO_CREDITS } from '../config.js';

const KEY = 'gcb.wallet.v1';

// Guarda en localStorage si existe; si no (modo privado, tests) en memoria.
function makeStore(storage) {
  let memory = null;
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return memory;
    },
    save(state) {
      memory = state;
      try {
        storage?.setItem(KEY, JSON.stringify(state));
      } catch {}
    },
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Wallet de créditos demo sin valor real. Implementa WalletService. */
export class LocalWallet {
  constructor(storage = defaultStorage()) {
    this.store = makeStore(storage);
    this.listeners = new Set();
    this.state = this.store.load();
    if (!this.state) {
      this.state = { balance: 0, transactions: [] };
      this.#apply('deposit', STARTING_DEMO_CREDITS, 'Créditos de bienvenida');
    }
  }

  async getBalance() {
    return this.state.balance;
  }

  async getTransactions() {
    return [...this.state.transactions];
  }

  async deposit(amount, note = 'Recarga demo') {
    return this.#apply('deposit', amount, note);
  }

  async chargeEntry(amount, note) {
    if (amount > this.state.balance) throw new InsufficientFundsError();
    return this.#apply('entry', -amount, note);
  }

  async payPrize(amount, note) {
    return this.#apply('prize', amount, note);
  }

  async refund(amount, note) {
    return this.#apply('refund', amount, note);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #apply(type, amount, note) {
    if (!Number.isFinite(amount) || (type !== 'entry' && amount < 0)) throw new Error('Importe no válido');
    this.state.balance = round2(this.state.balance + amount);
    this.state.transactions.unshift({ id: crypto.randomUUID(), type, amount: round2(amount), note, at: Date.now() });
    this.state.transactions = this.state.transactions.slice(0, 100);
    this.store.save(this.state);
    this.listeners.forEach((l) => l(this.state.balance));
    return this.state.balance;
  }
}
