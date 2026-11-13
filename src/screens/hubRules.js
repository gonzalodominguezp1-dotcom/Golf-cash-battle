// Reglas puras del hub (AC10, AC11): anillo de nivel, puntos de novedades y última mesa.
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
