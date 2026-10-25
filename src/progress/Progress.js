import { CHALLENGES, SKINS, skinById } from './skins.js';
import { bumpCounter, ensureInstances, sanitizeInventory } from './inventory.js';

const KEY = 'gcb.progress.v1';
const EMPTY = { xp: 0, matches: 0, wins: 0, streak: 0, bestStreak: 0, birdies: 0, aces: 0, tiebreakWins: 0, bigWins: 0, equipped: 'classic' };
const fresh = () => ({ ...EMPTY, inventory: {} });

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
    this.state = fresh();
    try {
      Object.assign(this.state, JSON.parse(storage?.getItem(KEY) ?? '{}'));
    } catch {}
    this.state.inventory = sanitizeInventory(this.state.inventory);
    // estado antiguo sin inventario: se crean las instancias de lo ya desbloqueado
    if (!this.state.deviceId) this.state.deviceId = newDeviceId();
    if (this.#sync()) this.#persistLocal();
  }

  /** Clave de la que salen seed y float: la cuenta, o el dispositivo si aún no hay. */
  get #ownerKey() {
    return this.state.owner || this.state.deviceId;
  }

  /** Crea las instancias que falten. Devuelve true si cambió algo. */
  #sync() {
    return ensureInstances(this.state.inventory, this.#ownerKey, SKINS.filter((s) => this.isUnlocked(s)));
  }

  /** Instancia (seed, float, contador...) de una skin desbloqueada, o null. */
  instance(id) {
    return this.state.inventory[id] ?? null;
  }

  /**
   * Une el progreso con el guardado en la cuenta. Gana el que lleva más XP;
   * si el móvil era de otra cuenta, manda el del servidor. save(state) guarda
   * en el servidor cada cambio a partir de ahora.
   */
  attach(owner, remote, save) {
    const r = remote ?? {};
    const other = this.state.owner && this.state.owner !== owner;
    const deviceId = this.state.deviceId;
    const mine = this.state.inventory;
    if (other || (r.xp ?? 0) > this.state.xp) {
      this.state = { ...fresh(), ...r };
      this.state.inventory = sanitizeInventory(r.inventory);
      if (!other) {
        // lo que ya tenía este móvil y el servidor no conoce se conserva
        for (const [id, e] of Object.entries(mine)) this.state.inventory[id] ??= e;
      }
    } else {
      // gana el local, pero las instancias del servidor mandan (seed/float inmutables)
      const theirs = sanitizeInventory(r.inventory);
      for (const [id, e] of Object.entries(theirs)) {
        const m = this.state.inventory[id];
        if (!m) this.state.inventory[id] = e;
        else {
          m.seed = e.seed;
          m.float = e.float;
          for (const k of ['aces', 'sinks', 'birdies']) m.counter[k] = Math.max(m.counter[k], e.counter[k]);
        }
      }
    }
    this.state.deviceId = deviceId;
    this.state.owner = owner;
    this.remote = save;
    this.#sync();
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
    // contadores de la skin equipada (solo si tiene marcador activo)
    bumpCounter(s.inventory[this.skin.id], { aces, sinks: holes.filter((h) => h.strokes > 0).length, birdies });
    s.birdies += birdies;
    s.aces += aces;
    if (won) {
      s.wins++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (entryFee >= 10) s.bigWins++;
    } else s.streak = 0;
    if (tiebreakWon) s.tiebreakWins++;
    this.#sync();
    this.#save();
    return {
      xp,
      levelBefore,
      level: this.level,
      newSkins: SKINS.filter((sk) => !before.includes(sk.id) && this.isUnlocked(sk)),
    };
  }

  #persistLocal() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.state));
    } catch {}
  }

  #save() {
    this.#persistLocal();
    // sin conexión no pasa nada: se vuelve a subir con el siguiente cambio
    this.remote?.(this.state)?.catch?.(() => {});
  }
}

function newDeviceId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 24);
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
