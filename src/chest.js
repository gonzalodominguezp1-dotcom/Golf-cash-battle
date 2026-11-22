// Cofre de la build de portal: un anuncio recompensado cada 15 min a cambio de una tirada de bola exclusiva.
export { DROP_CHANCE } from './progress/Progress.js';

export const CHEST_KEY = 'gb.chest.at';
export const CHEST_COOLDOWN = 15 * 60 * 1000;

export function chestReadyAt(storage = globalThis.localStorage) {
  try { return Number(storage?.getItem(CHEST_KEY)) + CHEST_COOLDOWN || 0; } catch { return 0; }
}

export function markChestOpened(storage = globalThis.localStorage, now = Date.now()) {
  try { storage?.setItem(CHEST_KEY, String(now)); } catch { /* sin almacenamiento: el cofre no espera */ }
}
