// Avatar del jugador: un icono de la lista o una imagen propia (máx. 2,5 MB).
// Es cosmético. Se guarda en la cuenta (profiles.avatar) y se deja una copia en este
// dispositivo, por cuenta, para pintarlo sin esperar a la red.

export const MAX_AVATAR_BYTES = 2.5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SIZE = 256;

export const AVATAR_ICONS = [
  { id: 'golf', glyph: '⛳', name: 'Bandera' },
  { id: 'ball', glyph: '🏌️', name: 'Palos de golf' },
  { id: 'crown', glyph: '👑', name: 'Corona' },
  { id: 'fire', glyph: '🔥', name: 'Fuego' },
  { id: 'bolt', glyph: '⚡', name: 'Rayo' },
  { id: 'skull', glyph: '💀', name: 'Calavera' },
  { id: 'dragon', glyph: '🐉', name: 'Dragón' },
  { id: 'wolf', glyph: '🐺', name: 'Lobo' },
  { id: 'eagle', glyph: '🦅', name: 'Águila' },
  { id: 'robot', glyph: '🤖', name: 'Robot' },
  { id: 'gem', glyph: '💎', name: 'Gema' },
  { id: 'star', glyph: '⭐', name: 'Estrella' },
];

export const iconById = (id) => AVATAR_ICONS.find((i) => i.id === id) ?? null;

/** null si el archivo vale; 'type' o 'size' si no. */
export function checkAvatarFile(file) {
  if (!file || !AVATAR_TYPES.includes(file.type)) return 'type';
  if (file.size > MAX_AVATAR_BYTES) return 'size';
  return null;
}

const isImageUrl = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 600_000;

/** Formato en el servidor: 'icon:<id>', la imagen como data URL, o null si no hay nada. */
export const toWire = (v) => (v.image ? v.image : v.icon ? `icon:${v.icon}` : null);

export function fromWire(s) {
  if (typeof s !== 'string') return { icon: null, image: null };
  if (s.startsWith('icon:')) return { icon: iconById(s.slice(5))?.id ?? null, image: null };
  return { icon: null, image: isImageUrl(s) ? s : null };
}

const defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

/**
 * Avatar elegido, guardado por cuenta. Sin nada elegido: { icon: null, image: null }.
 * onChange(avatar) lo pone quien quiera subir cada cambio al servidor (puede devolver una promesa).
 */
export class AvatarStore {
  constructor(owner, storage = defaultStorage()) {
    this.key = `gcb.avatar.v1.${owner ?? 'guest'}`;
    this.syncedKey = `${this.key}.synced`;
    this.pendingKey = `${this.key}.pending`; // '1' = cambio local que la cuenta aún no tiene
    this.storage = storage;
    this.memory = { icon: null, image: null };
    this.onChange = null;
  }

  /**
   * Junta lo que hay en el servidor con lo local al entrar. Manda el servidor. Si el servidor no
   * tiene nada y es la primera vez en esta cuenta, sube el avatar que ya había en el dispositivo
   * (los de antes de que se guardaran en la cuenta).
   */
  hydrate(remote) {
    const markSynced = () => {
      try {
        this.storage?.setItem(this.syncedKey, '1');
      } catch {}
    };
    // un cambio que no llegó a subirse (sin red, error) se reintenta en vez de pisarlo con el del servidor
    if (this.#pending()) {
      this.#upload(this.get());
      return markSynced();
    }
    const server = fromWire(remote);
    if (server.icon || server.image) {
      this.#store(server);
      markSynced();
      return;
    }
    let synced = null;
    try {
      synced = this.storage?.getItem(this.syncedKey);
    } catch {}
    const local = this.get();
    if (synced || !(local.icon || local.image)) return markSynced();
    Promise.resolve(this.onChange?.(local)).then(markSynced, () => {});
  }

  get() {
    try {
      const raw = JSON.parse(this.storage?.getItem(this.key) ?? 'null');
      if (raw) return { icon: iconById(raw.icon)?.id ?? null, image: isImageUrl(raw.image) ? raw.image : null };
    } catch {}
    return { ...this.memory };
  }

  #store(v) {
    this.memory = v;
    try {
      this.storage?.setItem(this.key, JSON.stringify(v));
    } catch {}
    return v;
  }

  #pending() {
    try {
      return this.storage?.getItem(this.pendingKey) === '1';
    } catch {
      return false;
    }
  }

  #setPending(on) {
    try {
      this.storage?.setItem(this.pendingKey, on ? '1' : '0');
    } catch {}
  }

  /** Sube a la cuenta; mientras no confirme, queda pendiente para el próximo hydrate. */
  #upload(v) {
    if (!this.onChange) return;
    this.#setPending(true);
    try {
      Promise.resolve(this.onChange(v)).then(
        () => {
          if (JSON.stringify(this.get()) === JSON.stringify(v)) this.#setPending(false);
        },
        () => {},
      );
    } catch {}
  }

  #put(v) {
    this.#store(v);
    this.#upload(v);
    return v;
  }

  setIcon(id) {
    return iconById(id) ? this.#put({ icon: id, image: null }) : this.get();
  }

  setImage(dataUrl) {
    return isImageUrl(dataUrl) ? this.#put({ icon: null, image: dataUrl }) : this.get();
  }

  clear() {
    return this.#put({ icon: null, image: null });
  }
}

/** Recorta la foto al centro y la reduce a 256 px para que ocupe poco. Solo navegador. */
export async function imageToAvatar(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close?.();
  return canvas.toDataURL('image/webp', 0.88);
}
