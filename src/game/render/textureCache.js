// Caché de texturas procedurales (F4 de la carga de partida). Guarda el
// "maestro" de cada textura generada y entrega siempre CLONES: un clon comparte
// `source` con el maestro, así que la imagen se dibuja en CPU una sola vez y la
// GPU la sube una sola vez. Lo que se entrega se puede liberar con dispose()
// sin afectar al maestro ni a los demás clones. Los maestros no van a ninguna
// escena. No cachear texto dinámico (labelTexture) ni texturas animadas.
import { getQuality, quality } from './quality.js';

/** Interruptor de rollback: con false cada llamada hace make() directamente. */
export const TEXTURE_CACHE = true;

const MB = 1024 * 1024;
/** Tope de memoria (CPU) del caché por calidad. */
export const CACHE_BYTES = { low: 8 * MB, medium: 24 * MB, high: 64 * MB };

const textureBytes = (t) => {
  const im = t?.image;
  const w = im?.width ?? 0, h = im?.height ?? 0;
  return Math.round(w * h * 4 * 1.33);
};

const textures = (v) => (v?.isTexture ? [v] : Object.values(v ?? {}).filter((x) => x?.isTexture));
const bytesOf = (v) => textures(v).reduce((s, t) => s + textureBytes(t), 0);

/** Clon desechable de una textura o de un paquete { map, normalMap?, roughnessMap? }. */
function cloneEntry(master) {
  if (master.isTexture) return master.clone();
  const out = { ...master };
  for (const k of Object.keys(master)) if (master[k]?.isTexture) out[k] = master[k].clone();
  const m = master.map;
  if (m?.isTexture) {
    for (const k of ['normalMap', 'roughnessMap']) {
      if (!master[k]?.isTexture) continue;
      // repeat/offset compartidos en el maestro: lo siguen siendo en el clon
      if (master[k].repeat === m.repeat) out[k].repeat = out.map.repeat;
      if (master[k].offset === m.offset) out[k].offset = out.map.offset;
    }
  }
  return out;
}

const disposeEntry = (master) => textures(master).forEach((t) => t.dispose());

export function createTextureCache({ maxBytes = 0, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
  const entries = new Map(); // clave -> { master, bytes }
  let limit = maxBytes;
  let bytes = 0, hits = 0, misses = 0, msGenerated = 0;

  function evict() {
    while (bytes > limit && entries.size) {
      const [k, e] = entries.entries().next().value; // la más antigua
      entries.delete(k);
      bytes -= e.bytes;
      disposeEntry(e.master);
    }
  }

  return {
    get(key, make) {
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit); // más reciente
        hits++;
        return cloneEntry(hit.master);
      }
      misses++;
      const t0 = now();
      const master = make();
      msGenerated += now() - t0;
      const size = bytesOf(master);
      if (limit <= 0 || size > limit) return master; // sin caché: textura propia, desechable
      entries.set(key, { master, bytes: size });
      bytes += size;
      evict();
      return cloneEntry(master);
    },
    setMaxBytes(n) {
      limit = n;
      evict();
    },
    stats: () => ({ hits, misses, bytes, entries: entries.size, msGenerated }),
    clear() {
      for (const e of entries.values()) disposeEntry(e.master);
      entries.clear();
      bytes = 0;
    },
  };
}

export const textureCache = createTextureCache({ maxBytes: CACHE_BYTES.medium });

export function cacheKey(name, args, anisotropy, texScale = quality().texScale) {
  return `${name}|${JSON.stringify(args)}|${texScale}|a${anisotropy}`;
}

/**
 * Envuelve un generador determinista: `cached('grass', [a, b], 4, () => ...)`.
 * `anisotropy` es el que fija el generador (forma parte de la clave).
 */
export function cached(name, args, anisotropy, make) {
  if (!TEXTURE_CACHE) return make();
  textureCache.setMaxBytes(CACHE_BYTES[getQuality()] ?? CACHE_BYTES.medium);
  return textureCache.get(cacheKey(name, args, anisotropy), make);
}
