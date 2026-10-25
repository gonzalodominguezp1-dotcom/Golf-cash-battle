import { CHALLENGES, SKINS, skinById } from './skins.js';

const KEY = 'gcb.progress.v1';
const EMPTY = { xp: 0, matches: 0, wins: 0, streak: 0, bestStreak: 0, birdies: 0, aces: 0, tiebreakWins: 0, bigWins: 0, equipped: 'classic' };

/** XP para pasar del nivel n al n+1. */
export const xpForLevel = (n) => 100 + (n - 1) * 60;

export function levelOf(xp) {
  let level = 1;
  while (xp >= xpForLevel(level)) xp -= xpForLevel(level++);
  return { level, into: xp, need: xpForLevel(level) };
}

/**
 * Nivel, estadísticas y skins del jugador. Solo cosmético: no toca el saldo
 * ni la partida. Vive en el navegador y, con cuenta, se copia al servidor para
 * no perderlo al cambiar de móvil.
 */
export class Progress {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.state = { ...EMPTY };
    try {
      Object.assign(this.state, JSON.parse(storage?.getItem(KEY) ?? '{}'));
    } catch {}
  }

  /**
   * Une el progreso con el guardado en la cuenta. Gana el que lleva más XP;
   * si el móvil era de otra cuenta, manda el del servidor. save(state) guarda
   * en el servidor cada cambio a partir de ahora.
   */
  attach(owner, remote, save) {
    const r = remote ?? {};
    const other = this.state.owner && this.state.owner !== owner;
    if (other || (r.xp ?? 0) > this.state.xp) this.state = { ...EMPTY, ...r };
    this.state.owner = owner;
    this.remote = save;
    this.#save();
  }

  get level() {
    return levelOf(this.state.xp);
  }

  get skin() {
    return skinById(this.isUnlocked(skinById(this.state.equipped)) ? this.state.equipped : 'classic');
  }

  equip(id) {
    if (!this.isUnlocked(skinById(id))) return false;
    this.state.equipped = id;
    this.#save();
    return true;
  }

  challenge(id) {
    const c = CHALLENGES.find((x) => x.id === id);
    const value = Math.min(c.goal, this.state[c.stat] ?? 0);
    return { ...c, value, done: value >= c.goal };
  }

  /** Progreso hacia desbloquear la skin, de 0 a 1, con el texto del requisito. */
  requirement(skin) {
    const u = skin.unlock;
    if (!u) return { text: 'De serie', ratio: 1 };
    if (u.level) return { text: `Nivel ${u.level}`, ratio: Math.min(1, this.level.level / u.level) };
    if (u.wins) return { text: `${u.wins} victoria${u.wins > 1 ? 's' : ''}`, ratio: Math.min(1, this.state.wins / u.wins) };
    const c = this.challenge(u.challenge);
    return { text: c.name, ratio: c.value / c.goal };
  }

  isUnlocked(skin) {
    return this.requirement(skin).ratio >= 1;
  }

  /**
   * Suma una partida terminada. holes: [{ strokes, par }].
   * Devuelve la XP ganada, los niveles y las skins nuevas.
   */
  recordMatch({ position, won, entryFee, holes, tiebreakWon = false }) {
    const before = SKINS.filter((s) => this.isUnlocked(s)).map((s) => s.id);
    const levelBefore = this.level.level;
    const s = this.state;
    const birdies = holes.filter((h) => h.strokes < h.par).length;
    const aces = holes.filter((h) => h.strokes === 1).length;
    let xp = 40 + Math.max(0, 9 - position) * 10 + (won ? 100 : 0) + birdies * 15 + aces * 50;
    if (!entryFee) xp = Math.round(xp / 2);
    s.xp += xp;
    s.matches++;
    s.birdies += birdies;
    s.aces += aces;
    if (won) {
      s.wins++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (entryFee >= 10) s.bigWins++;
    } else s.streak = 0;
    if (tiebreakWon) s.tiebreakWins++;
    this.#save();
    return {
      xp,
      levelBefore,
      level: this.level,
      newSkins: SKINS.filter((sk) => !before.includes(sk.id) && this.isUnlocked(sk)),
    };
  }

  #save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.state));
    } catch {}
    // sin conexión no pasa nada: se vuelve a subir con el siguiente cambio
    this.remote?.(this.state)?.catch?.(() => {});
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
