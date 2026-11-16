// Reglas puras del hub (AC10, AC11): anillo de nivel, puntos de novedades y última mesa.
import { FRAMES } from '../progress/prestige.js';
import { t } from './texts/index.js';
import './texts/hub.js';

const LAST_TIER_KEY = 'gcb.lastTier.v1';

export function levelRing({ level, into, need }) {
  const raw = need > 0 ? (into / need) * 100 : 0;
  const pct = Math.max(0, Math.min(100, Math.round(raw)));
  return { level, pct, label: t('hub.level', { level, pct }) };
}

export function badgeFor(count) {
  const n = Math.max(0, count | 0);
  if (n === 0) return { count: 0, label: '' };
  return { count: n, label: n === 1 ? t('hub.badgeOne') : t('hub.badge', { n }) };
}

export function friendsBadge(friendsData, partyData) {
  const incoming = friendsData?.incoming?.length || 0;
  const invites = partyData?.invites?.length || 0;
  return badgeFor(incoming + invites);
}

export function achievementsBadge(states, seen) {
  const unseen = (states || []).filter((s) => s.done && !seen?.has(s.id)).length;
  return badgeFor(unseen);
}

export function lastTier(storage, tiers) {
  try {
    const id = storage.getItem(LAST_TIER_KEY);
    return id && tiers.some((x) => x.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function rememberTier(storage, tierId) {
  try {
    storage.setItem(LAST_TIER_KEY, tierId);
  } catch {
    /* sin almacenamiento: la mesa no se recuerda */
  }
}

/**
 * Bloqueos de los accesos del hub (mecanismo genérico). Devuelve { [clave]: { reasonKey, actionKey?, go? } } solo para los
 * accesos bloqueados; `reasonKey` (popup), `shortKey` (nombre accesible) y `actionKey` son claves de texto (t()), `go` la ruta a la que lleva la acción.
 * Hoy solo hay requisitos que ya existían: cuenta y nombre de usuario para Amigos y grupo, y servidor para Ranking (y Amigos) sin backend.
 * Para añadir un bloqueo nuevo: un caso aquí, sus textos en texts/hub.js y un parámetro de entrada si hace falta.
 */
export function computeLocks({ guest = false, hasBackend = true, hasName = true } = {}) {
  const locks = {};
  if (!hasBackend) {
    locks.friends = { reasonKey: 'hub.lock.friendsOffline', shortKey: 'hub.lock.offlineShort' };
    locks.ranking = { reasonKey: 'hub.lock.rankingOffline', shortKey: 'hub.lock.offlineShort' };
  } else if (guest) {
    locks.friends = { reasonKey: 'hub.lock.friendsNeedsAccount', shortKey: 'hub.lock.needsAccountShort', actionKey: 'hub.goAccount', go: 'account' };
  } else if (!hasName) { // cuenta real sin nombre de usuario: el panel de amigos de main.js lo exige
    locks.friends = { reasonKey: 'hub.lock.friendsNeedsName', shortKey: 'hub.lock.needsNameShort', actionKey: 'hub.goAccount', go: 'account' };
  }
  return locks;
}

// Centrado óptico de los iconos del hub: el recuadro centra el lienzo del svg (viewBox -1 -1 51 51, centro 24,5) pero cada
// dibujo (contorno y extrusión incluidos) tiene su propio centro. [dx, dy] en unidades del viewBox que hay que mover el dibujo
// para que su CAJA VISIBLE (píxeles con alfa > 40 del render real) quede en el centro exacto. Valores de
// `node scripts/measure-hub-icons.mjs --json`; los vigila tests/hub-icon-centering.test.js.
export const ICON_NUDGE = {
  trophy: [-0.2, -1.7],
  medal: [-0.3, 0.7],
  skins: [0.2, 0.5],
  users: [-0.2, -3.6],
  map: [0.1, -1.2],
  robot: [-0.3, 2.6],
  gear: [-0.1, -0.9],
  fullscreen: [-0.2, -0.8],
  user: [-0.2, -3.4],
  coins: [-0.9, -1],
  lock: [-0.1, 0.1],
  chains: [-0.7, -1.3], // las cadenas llegan al borde del lienzo (recortadas): se centra el cruce de la X, no la caja
};

/** Variables CSS `--nx/--ny` (unidades del viewBox) para poner como style en el contenedor del icono. */
export function nudgeVars(name) {
  const [dx, dy] = ICON_NUDGE[name] ?? [0, 0];
  return `--nx:${dx};--ny:${dy}`;
}

/**
 * Siguiente marco de prestigio por alcanzar: { frame, missing } (niveles que faltan) o null si ya están todos.
 * Cuenta › Progreso lo usa para decir cuánto falta (C2); no inventa nada: los marcos son los de FRAMES.
 */
export function nextFrame(level) {
  const n = Number.isFinite(level) ? level : 0;
  const frame = FRAMES.find((f) => f.level > n);
  return frame ? { frame, missing: frame.level - n } : null;
}
