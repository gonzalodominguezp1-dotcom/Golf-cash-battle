// Inventario de skins: cada skin desbloqueada tiene una instancia con patrón
// (seed), desgaste (float) y contadores. seed y float salen de un hash de
// (dueño, skin): recargar no permite re-tirar. Ver docs/skins-premium-plan.md (c).

export const WEAR_BANDS = [
  { max: 0.07, name: 'Recién forjada' },
  { max: 0.15, name: 'Casi nueva' },
  { max: 0.38, name: 'Probada en campo' },
  { max: 0.45, name: 'Desgastada' },
  { max: 1.0001, name: 'Curtida en batalla' },
];

export const MAX_INVENTORY = 64;
export const COUNTER_KEYS = ['aces', 'sinks', 'birdies'];

/** Nombre del desgaste para un float 0..1. */
export function wearName(float) {
  const f = Number.isFinite(float) ? Math.min(1, Math.max(0, float)) : 0;
  return WEAR_BANDS.find((b) => f < b.max).name;
}

/** Hash FNV-1a de 32 bits con mezcla final; estable entre plataformas. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Patrón 0..999, determinista por (dueño, skin). */
export const seedFor = (owner, skinId) => hash32(`seed|${owner}|${skinId}`) % 1000;

/** Desgaste 0..1 (3 decimales) dentro de skin.wearRange, determinista por (dueño, skin). */
export function floatFor(owner, skinId, wearRange = [0, 1]) {
  const [lo, hi] = wearRange;
  const u = (hash32(`float|${owner}|${skinId}`) % 1000000) / 1000000;
  return Math.round((lo + u * (hi - lo)) * 1000) / 1000;
}

/** Patrón raro de la skin que corresponde a un seed, o null. */
export function rarePatternOf(skin, seed) {
  return (skin.rarePatterns ?? []).find((p) => p.seeds?.includes(seed)) ?? null;
}

/** Instancia nueva de una skin recién desbloqueada. */
export function createInstance(owner, skin, now = new Date()) {
  return {
    seed: seedFor(owner, skin.id),
    float: floatFor(owner, skin.id, skin.wearRange),
    variant: 'base',
    counter: { enabled: !!skin.counter, aces: 0, sinks: 0, birdies: 0 },
    unlockedAt: now.toISOString(),
  };
}

const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

/** Limpia un inventario leído de disco o del servidor (nunca lanza). */
export function sanitizeInventory(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, e] of Object.entries(raw).slice(0, MAX_INVENTORY)) {
    if (!id || id.length > 32 || !e || typeof e !== 'object') continue;
    const c = e.counter ?? {};
    out[id] = {
      seed: Math.floor(num(e.seed, 0, 999, 0)),
      float: num(e.float, 0, 1, 0),
      variant: typeof e.variant === 'string' && e.variant.length <= 16 ? e.variant : 'base',
      counter: {
        enabled: !!c.enabled,
        aces: Math.floor(num(c.aces, 0, 1e9, 0)),
        sinks: Math.floor(num(c.sinks, 0, 1e9, 0)),
        birdies: Math.floor(num(c.birdies, 0, 1e9, 0)),
      },
      unlockedAt: typeof e.unlockedAt === 'string' ? e.unlockedAt.slice(0, 40) : new Date(0).toISOString(),
    };
  }
  return out;
}

/**
 * Crea las instancias que falten para las skins desbloqueadas. Las existentes
 * no se tocan (seed/float inmutables). Devuelve true si añadió alguna.
 */
export function ensureInstances(inventory, owner, unlockedSkins, now = new Date()) {
  let changed = false;
  for (const skin of unlockedSkins) {
    if (inventory[skin.id] || Object.keys(inventory).length >= MAX_INVENTORY) continue;
    inventory[skin.id] = createInstance(owner, skin, now);
    changed = true;
  }
  return changed;
}

/** Suma al contador de la instancia (solo si está activo). Devuelve true si cambió. */
export function bumpCounter(instance, { aces = 0, sinks = 0, birdies = 0 }) {
  if (!instance?.counter?.enabled) return false;
  const c = instance.counter;
  c.aces += Math.max(0, aces);
  c.sinks += Math.max(0, sinks);
  c.birdies += Math.max(0, birdies);
  return aces > 0 || sinks > 0 || birdies > 0;
}
