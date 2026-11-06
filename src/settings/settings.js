// Ajustes del jugador: sonido, calidad gráfica y controles. Un solo sitio para todos.
//
// Se guardan en este dispositivo (para aplicarlos al instante, sin red) y en la cuenta
// (profiles.settings), así lo que se cambia en el móvil también vale en el ordenador.
// Gana el último cambio: cada guardado lleva su hora (updatedAt).
//
// La calidad se guarda aparte para el móvil y para el ordenador: un móvil no debe heredar
// el «Alto» que se eligió en el PC. null = la automática del dispositivo.

export const SETTINGS_KEY = 'gcb.settings.v1';
const LEGACY_MUTE_KEY = 'gcb.muted.v2';
const LEGACY_QUALITY_KEY = 'gcb.quality';

export const QUALITY_VALUES = ['low', 'medium', 'high'];
export const WHEEL_MODES = ['power', 'zoom'];
export const DEVICES = ['mobile', 'desktop'];

export const DEFAULT_SETTINGS = Object.freeze({
  sound: Object.freeze({ muted: false, master: 100, ambient: 60 }),
  quality: Object.freeze({ mobile: null, desktop: null }),
  controls: Object.freeze({
    invertCameraX: false, // arrastrar a la derecha gira la cámara al otro lado
    invertCameraY: false, // arriba/abajo: acercar o alejar (táctil) e inclinar la vista del mapa
    invertAim: false, // mover a la derecha apunta a la izquierda
    invertPower: false, // cargar el tiro empujando hacia delante en vez de tirar hacia atrás
    cameraSensitivity: 1,
    aimSensitivity: 1,
    wheel: 'power', // la rueda del ratón ajusta la fuerza ('power') o solo hace zoom ('zoom')
    vibration: true,
  }),
});

const SENS_MIN = 0.4, SENS_MAX = 2.5;

const clampInt = (v, lo, hi, d) => (Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
const clampSens = (v, d) => (Number.isFinite(v) ? Math.round(Math.min(SENS_MAX, Math.max(SENS_MIN, v)) * 100) / 100 : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

/** Devuelve unos ajustes completos y válidos a partir de cualquier cosa (lo raro vuelve al valor por defecto). */
export function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = r.sound && typeof r.sound === 'object' ? r.sound : {};
  const q = r.quality && typeof r.quality === 'object' ? r.quality : {};
  const c = r.controls && typeof r.controls === 'object' ? r.controls : {};
  const D = DEFAULT_SETTINGS;
  return {
    sound: {
      muted: bool(s.muted, D.sound.muted),
      master: clampInt(s.master, 0, 100, D.sound.master),
      ambient: clampInt(s.ambient, 0, 100, D.sound.ambient),
    },
    quality: {
      mobile: oneOf(q.mobile, QUALITY_VALUES, null),
      desktop: oneOf(q.desktop, QUALITY_VALUES, null),
    },
    controls: {
      invertCameraX: bool(c.invertCameraX, D.controls.invertCameraX),
      invertCameraY: bool(c.invertCameraY, D.controls.invertCameraY),
      invertAim: bool(c.invertAim, D.controls.invertAim),
      invertPower: bool(c.invertPower, D.controls.invertPower),
      cameraSensitivity: clampSens(c.cameraSensitivity, D.controls.cameraSensitivity),
      aimSensitivity: clampSens(c.aimSensitivity, D.controls.aimSensitivity),
      wheel: oneOf(c.wheel, WHEEL_MODES, D.controls.wheel),
      vibration: bool(c.vibration, D.controls.vibration),
    },
    updatedAt: Number.isFinite(r.updatedAt) && r.updatedAt > 0 ? r.updatedAt : 0,
  };
}

/**
 * Multiplicadores que aplica el juego a cada gesto, según los controles.
 * camX / aim llevan signo (invertir) y sensibilidad; camY y power solo el signo.
 */
export function inputFactors(controls) {
  const c = sanitizeSettings({ controls }).controls;
  return {
    camX: (c.invertCameraX ? -1 : 1) * c.cameraSensitivity,
    camY: c.invertCameraY ? -1 : 1,
    aim: (c.invertAim ? -1 : 1) * c.aimSensitivity,
    power: c.invertPower ? -1 : 1,
    wheelPower: c.wheel === 'power',
    vibration: c.vibration,
  };
}

/** 'mobile' en pantallas táctiles, 'desktop' con ratón. No depende del ancho de la ventana. */
let kind = null;
export function deviceKind() {
  if (kind) return kind; // se pregunta en cada fotograma: se calcula una vez
  try {
    kind = globalThis.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  } catch {
    kind = 'desktop';
  }
  return kind;
}

const defaultStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Almacén de ajustes.
 * - subscribe(fn): fn(ajustes) cada vez que cambian (aquí o al llegar los de la cuenta).
 * - onChange(ajustes): lo pone quien quiera subir cada cambio a la cuenta (puede devolver una promesa).
 */
export class SettingsStore {
  constructor(storage = defaultStorage(), { now = () => Date.now(), device = deviceKind() } = {}) {
    this.storage = storage;
    this.now = now;
    this.device = device;
    this.onChange = null;
    this.listeners = new Set();
    this.owner = null;
    this.current = this.#load();
  }

  #load() {
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.owner = typeof parsed?.owner === 'string' ? parsed.owner : null;
        return sanitizeSettings(parsed);
      }
    } catch {}
    return this.#fromLegacy();
  }

  /**
   * Lo que se guardaba antes por separado (silencio y calidad de este dispositivo).
   * Con algo migrado, updatedAt = 1: más viejo que cualquier cambio real (así la cuenta manda
   * si ya tiene ajustes), pero se sube a una cuenta que aún no tiene ninguno.
   */
  #fromLegacy() {
    const base = sanitizeSettings(null);
    try {
      if (this.storage?.getItem(LEGACY_MUTE_KEY) === '1') base.sound.muted = true;
      const q = this.storage?.getItem(LEGACY_QUALITY_KEY);
      if (QUALITY_VALUES.includes(q)) base.quality[this.device] = q;
    } catch {}
    if (base.sound.muted || base.quality[this.device]) base.updatedAt = 1;
    return base;
  }

  /** Copia de los ajustes, para tocarla sin miedo. */
  get() {
    return structuredClone(this.current);
  }

  /** Los ajustes sin copiar, solo para leer (se llama en cada fotograma o cada gesto). */
  peek() {
    return this.current;
  }

  #write() {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify({ ...this.current, owner: this.owner }));
    } catch {}
  }

  #emit() {
    const snap = this.get();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {}
    }
  }

  #upload() {
    try {
      Promise.resolve(this.onChange?.(this.get())).catch(() => {});
    } catch {}
  }

  /** Cambia parte de los ajustes: patch({ sound: { master: 50 } }). Guarda, avisa y sube. */
  patch(changes) {
    const next = sanitizeSettings({
      sound: { ...this.current.sound, ...changes?.sound },
      quality: { ...this.current.quality, ...changes?.quality },
      controls: { ...this.current.controls, ...changes?.controls },
    });
    next.updatedAt = Math.max(this.now(), this.current.updatedAt + 1);
    this.current = next;
    this.#write();
    this.#emit();
    this.#upload();
    return this.get();
  }

  /**
   * Vuelve a los valores por defecto una sección ('sound' | 'quality' | 'controls').
   * La calidad solo se restablece para este tipo de dispositivo: la del otro no se toca.
   */
  reset(section) {
    if (section === 'quality') return this.patch({ quality: { [this.device]: null } });
    if (section !== 'sound' && section !== 'controls') return this.get();
    return this.patch({ [section]: structuredClone(DEFAULT_SETTINGS[section]) });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Junta lo de la cuenta con lo de este dispositivo al entrar. Gana el más reciente.
   * Si lo guardado aquí es de otra cuenta, manda la cuenta; si esa cuenta aún no tiene nada,
   * se siguen usando los de aquí, pero no se suben a ella (son de otra persona). Si no, y la
   * cuenta no tiene nada o tiene algo más viejo, se sube lo de aquí: así un guardado que
   * falló por red se reintenta en la siguiente entrada.
   */
  hydrate(remote, owner = null) {
    const server = remote && typeof remote === 'object' ? sanitizeSettings(remote) : null;
    const otherOwner = this.owner != null && owner != null && this.owner !== owner;
    this.owner = owner;
    if (server && (otherOwner || server.updatedAt > this.current.updatedAt)) {
      this.current = server;
      this.#write();
      this.#emit();
      return;
    }
    this.#write();
    if (!otherOwner && this.current.updatedAt > (server?.updatedAt ?? 0)) this.#upload();
  }
}

export const settings = new SettingsStore();
