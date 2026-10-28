// Skins de bola: solo cambian la apariencia, nunca la física ni el resultado.
// unlock: { level } por nivel, { wins } por victorias o { challenge } por desafío.

// Tiers de rareza. `color` es el marco del tier.
export const TIERS = {
  common: { name: 'Común', order: 0, color: '#9AA4B2', icon: '●' },
  uncommon: { name: 'Poco común', order: 1, color: '#4ADE80', icon: '◆' },
  rare: { name: 'Rara', order: 2, color: '#3B82F6', icon: '▲' },
  epic: { name: 'Épica', order: 3, color: '#A855F7', icon: '⬟' },
  legendary: { name: 'Legendaria', order: 4, color: '#F59E0B', icon: '★' },
  mythic: { name: 'Mítica', order: 5, color: '#EF4444', icon: '✦' },
};

/** Alias retrocompatible: antes eran Bronce…Esmeralda, ahora son los tiers. */
export const RARITIES = TIERS;

export const TIER_IDS = Object.keys(TIERS);

// Acabado, efectos y sonido por defecto de cada tier (el «upgrade base»).
const TIER_FINISH = {
  common: { preset: 'satin', roughness: 0.42, metalness: 0, clearcoat: 0 },
  uncommon: { preset: 'pearl', roughness: 0.28, metalness: 0, clearcoat: 0.6 },
  rare: { preset: 'pbr', roughness: 0.2, metalness: 0.3, clearcoat: 1 },
  epic: { preset: 'layered', roughness: 0.15, metalness: 0.45, clearcoat: 1 },
  legendary: { preset: 'hdr', roughness: 0.12, metalness: 0.7, clearcoat: 1 },
  mythic: { preset: 'reactive', roughness: 0.08, metalness: 0.9, clearcoat: 1 },
};
const TIER_FX = {
  common: { trail: { style: 'default', width: 0.5, taper: 0 }, aura: null, hit: 'generic', roll: null, wall: 'generic', lip: null, sink: 'generic' },
  uncommon: { trail: { style: 'ribbon', width: 0.6, taper: 0.3 }, aura: null, hit: 'puff', roll: null, wall: 'generic', lip: null, sink: 'generic' },
  rare: { trail: { style: 'ribbon', width: 0.7, taper: 0.5 }, aura: null, hit: 'tinted', roll: 'glints', wall: 'tinted', lip: null, sink: 'tinted' },
  epic: { trail: { style: 'ribbon_particles', width: 0.8, taper: 0.6 }, aura: null, hit: 'burst', roll: 'glints', wall: 'burst', lip: null, sink: 'burst' },
  legendary: { trail: { style: 'shaped', width: 1, taper: 0.7 }, aura: 'soft', hit: 'burst', roll: 'sparks', wall: 'burst', lip: 'flash', sink: 'cinematic' },
  mythic: { trail: { style: 'shaped', width: 1.1, taper: 0.8 }, aura: 'pulse', hit: 'signature', roll: 'signature', wall: 'signature', lip: 'flash', sink: 'transform' },
};
// Sets reales de src/game/audio.js: neon, steel, solar, dragon, ice, void, holo, gold. Los tiers bajos usan 'generic' (sin voz extra).
const TIER_SFX = { common: 'generic', uncommon: 'generic', rare: 'steel', epic: 'holo', legendary: 'steel', mythic: 'void' };

function defineSkin(d) {
  const tier = d.tier;
  const trailColor = d.trail;
  const fx = TIER_FX[tier];
  return {
    ...d,
    rarity: tier, // alias legado de `tier`
    collection: d.collection ?? 'clasica',
    lore: d.lore ?? '',
    palette: { base: d.base, accent: d.accent, secondary: d.secondary ?? d.accent, glow: d.shimmer ?? d.accent },
    finish: { ...TIER_FINISH[tier], ...(d.finish ?? {}) },
    shader: d.shader ?? null,
    fx: { ...fx, ...(d.fx ?? {}), trail: { color: trailColor, ...fx.trail, ...(d.fx?.trail ?? {}) } },
    sfx: { set: d.sfx ?? TIER_SFX[tier] ?? 'generic' },
    counter: d.counter ?? (tier === 'legendary' || tier === 'mythic'),
    variants: d.variants ?? ['base'],
    rarePatterns: d.rarePatterns ?? [],
  };
}

const RAW_SKINS = [
  { id: 'classic', name: 'Clásica', tier: 'common', pattern: 'stripe', base: '#ffffff', accent: '#ff4d4d', trail: '#ffffff', unlock: null },
  { id: 'mint', name: 'Menta', tier: 'common', pattern: 'dual', base: '#ffffff', accent: '#3ee8b5', trail: '#7dffd8', unlock: { level: 2 } },
  { id: 'veteran', name: 'Veterana', tier: 'uncommon', pattern: 'dots', base: '#ffe8c2', accent: '#c46a2b', trail: '#ffb36b', unlock: { challenge: 'matches10' } },
  { id: 'sunset', name: 'Atardecer', tier: 'uncommon', pattern: 'gradient', base: '#ffb347', accent: '#ff2e88', trail: '#ff7ab8', unlock: { level: 3 } },
  { id: 'birdie', name: 'Pajarito', tier: 'uncommon', pattern: 'stars', base: '#5ec8ff', accent: '#ffffff', trail: '#9fe0ff', unlock: { challenge: 'birdies5' } },
  { id: 'zephyr_nacre', name: 'Céfiro Nácar', tier: 'rare', sfx: 'holo', pattern: 'feather_aero', base: '#ebf4fa', accent: '#0de0f8', secondary: '#ffffff', shimmer: '#0de0f8', trail: '#0de0f8', finish: { roughness: 0.08, metalness: 0.05, clearcoat: 0.8, iridescence: 0.55, envMapIntensity: 0.9, dimples: 0.5 }, unlock: { challenge: 'birdies10' } },
  { id: 'champ', name: 'Campeona', tier: 'rare', sfx: 'steel', pattern: 'stripe', base: '#e9eef5', accent: '#4b6bff', trail: '#a9b8ff', unlock: { wins: 1 } },
  { id: 'galaxy', name: 'Galaxia', tier: 'rare', sfx: 'void', pattern: 'galaxy', base: '#1a1040', accent: '#b26bff', trail: '#c99bff', unlock: { level: 5 } },
  { id: 'star', name: 'Estrella', tier: 'epic', sfx: 'gold', pattern: 'stars', base: '#ffd23f', accent: '#ff8a00', trail: '#ffe066', unlock: { challenge: 'ace' } },
  { id: 'streak', name: 'Racha', tier: 'epic', sfx: 'solar', pattern: 'flame', base: '#ffdd55', accent: '#ff3d00', trail: '#ff7a1a', unlock: { challenge: 'streak3' } },
  { id: 'supernova_solar', name: 'Supernova Solar', tier: 'legendary', sfx: 'solar', pattern: 'solar_supernova', base: '#ed450c', accent: '#ffb703', secondary: '#fffbeb', shimmer: '#ffffff', trail: '#ffb703', finish: { roughness: 0.55, metalness: 0.1, clearcoat: 0, iridescence: 0, envMapIntensity: 0.3, dimples: 0.3 }, unlock: { challenge: 'streak5' } },
  { id: 'gold', name: 'Oro puro', tier: 'epic', sfx: 'gold', pattern: 'solid', base: '#ffcc33', accent: '#fff3b0', trail: '#ffd84d', unlock: { wins: 5 } },
  { id: 'lava', name: 'Lava', tier: 'epic', sfx: 'dragon', pattern: 'flame', base: '#2b0a0a', accent: '#ff5a1f', trail: '#ff4a1a', unlock: { level: 8 } },
  { id: 'ice', name: 'Criónova', tier: 'epic', sfx: 'ice', pattern: 'gem', base: '#bff4ff', accent: '#4fb8ff', trail: '#bff4ff', finish: { clearcoat: 0.8, iridescence: 0, envMapIntensity: 0.9, dimples: 0.3 }, unlock: { challenge: 'tiebreak' } },
  { id: 'highroller', name: 'High Roller', tier: 'epic', sfx: 'ice', pattern: 'gem', base: '#d8f6ff', accent: '#8a7dff', trail: '#cbbcff', unlock: { challenge: 'bigwin' } },
  { id: 'crimson_dragon', name: 'Dragón Carmesí', tier: 'legendary', sfx: 'dragon', pattern: 'dragon_scales', base: '#190408', accent: '#e11d48', secondary: '#fafafa', shimmer: '#000000', trail: '#e11d48', finish: { roughness: 0.3, metalness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.2, iridescence: 0, envMapIntensity: 1.0, dimples: 0.3 }, unlock: { challenge: 'bigwins3' } },
  { id: 'kintsugi_neon', name: 'Kintsugi Neón', tier: 'legendary', sfx: 'neon', pattern: 'kintsugi', base: '#000000', accent: '#e205ff', secondary: '#000000', shimmer: '#e205ff', trail: '#e205ff', finish: { roughness: 0.16, metalness: 0.72, clearcoat: 0.8, clearcoatRoughness: 0.05, iridescence: 0, envMapIntensity: 0.9, dimples: 0.25 }, unlock: { challenge: 'aces3' } },
  { id: 'diamond', name: 'Diamante', tier: 'legendary', sfx: 'ice', pattern: 'gem', base: '#ffffff', accent: '#6fd3f2', trail: '#e0fbff', unlock: { wins: 15 } },
  { id: 'holo', name: 'Prisma Holo', tier: 'epic', sfx: 'holo', pattern: 'rainbow', base: '#ffffff', accent: '#ffffff', trail: 'rainbow', finish: { clearcoat: 0, iridescence: 0, envMapIntensity: 1.5, dimples: 0.3 }, unlock: { level: 12 } },
  { id: 'damascus_imperial', name: 'Damasco Imperial', tier: 'legendary', sfx: 'steel', pattern: 'damascus', base: '#022c22', accent: '#10b981', secondary: '#38ef7d', shimmer: '#53eaa3', trail: '#38ef7d', finish: { roughness: 0.14, metalness: 0.92, clearcoat: 0, iridescence: 0, envMapIntensity: 1.2, dimples: 0.1 }, unlock: { challenge: 'birdies15' } },
  { id: 'emerald', name: 'Esmeralda real', tier: 'legendary', sfx: 'steel', pattern: 'gem', base: '#0b6b45', accent: '#3dffa8', trail: '#3dffa8', unlock: { wins: 30 } },
  { id: 'event_horizon', name: 'Horizonte de Sucesos', tier: 'mythic', sfx: 'void', collection: 'cosmos', lore: 'Ni la luz escapa de ella.', pattern: 'solid', base: '#000000', accent: '#ffb25c', secondary: '#ff4d8d', shimmer: '#7a5cff', trail: '#ffb25c', finish: { roughness: 1, metalness: 0, clearcoat: 0, iridescence: 0, envMapIntensity: 0, dimples: 0.5 }, unlock: { challenge: 'wins50' } },
  { id: 'midas_touch', name: 'Toque de Midas', tier: 'mythic', sfx: 'gold', collection: 'oro', lore: 'Todo lo que rueda se vuelve oro.', pattern: 'solid', base: '#ffcf4a', accent: '#b8860b', secondary: '#5a3a00', shimmer: '#ffffff', trail: '#ffcf4a', finish: { roughness: 0.08, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.08, iridescence: 0, envMapIntensity: 1.2, dimples: 0.1 }, unlock: { challenge: 'aces5' } },
  { id: 'antimatter_void', name: 'Antimateria del Vacío', tier: 'legendary', sfx: 'void', collection: 'cosmos', lore: 'Por sus grietas se asoma algo que no debería existir.', pattern: 'void_cracks', shader: 'antimatter_void', base: '#1a1040', accent: '#b26bff', secondary: '#38bdf8', shimmer: '#c99bff', trail: '#b26bff', finish: { roughness: 0.35, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1, iridescence: 0, envMapIntensity: 0.6, dimples: 0.6 }, fx: { roll: null, maxParticles: 18, trailRate: 6 }, unlock: { challenge: 'bigwins5' } },
  { id: 'tormenta_voltaica', name: 'Tormenta Voltaica', tier: 'epic', sfx: 'neon', collection: 'elementos', lore: 'Lleva una tormenta encerrada en cristal.', pattern: 'plasma', shader: 'tormenta_voltaica', base: '#1a1040', accent: '#a855f7', secondary: '#f1f5f9', shimmer: '#38bdf8', trail: '#a855f7', finish: { roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.25, envMapIntensity: 1.1, dimples: 0.6 }, fx: { trail: { style: 'shaped' }, maxParticles: 16, trailRate: 8 }, unlock: { level: 15 } },
  { id: 'anima_errante', name: 'Ánima Errante', tier: 'mythic', sfx: 'holo', collection: 'cosmos', lore: 'Ha recorrido tantos campos que ya no recuerda el suyo.', pattern: 'spirit', shader: 'anima_errante', base: '#e9e6ff', accent: '#8a7dff', secondary: '#0de0f8', shimmer: '#cbbcff', trail: '#8a7dff', finish: { roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2, iridescence: 0.15, envMapIntensity: 0.7, dimples: 0.35 }, fx: { roll: null, maxParticles: 20, trailRate: 5 }, unlock: { challenge: 'matches150' } },
  { id: 'cronometro_laton', name: 'Cronómetro de Latón', tier: 'epic', sfx: 'steel', collection: 'oro', lore: 'Nunca llega tarde al hoyo.', pattern: 'clockwork', shader: 'cronometro_laton', base: '#d4af37', accent: '#c46a2b', secondary: '#3d1f0f', shimmer: '#fff3b0', trail: '#d4af37', finish: { roughness: 0.28, metalness: 0.9, clearcoat: 0.2, clearcoatRoughness: 0.2, iridescence: 0, envMapIntensity: 1.2, dimples: 0.7 }, fx: { maxParticles: 16, trailRate: 5 }, unlock: { challenge: 'matches50' } },
  { id: 'abyssal_tide', name: 'Marea Abisal', tier: 'mythic', sfx: 'ice', collection: 'elementos', lore: 'Trae consigo la luz del fondo del mar.', pattern: 'abyss_veins', shader: 'abyssal_tide', base: '#0b1e36', accent: '#19e3d0', secondary: '#4b6bff', shimmer: '#7dffd8', trail: '#19e3d0', finish: { roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.35, envMapIntensity: 1.3, dimples: 0.8 }, fx: { roll: null, maxParticles: 20, trailRate: 6 }, unlock: { challenge: 'birdies50' } },
];

export const SKINS = RAW_SKINS.map(defineSkin);

export const CHALLENGES = [
  { id: 'matches10', name: 'Juega 10 partidas', goal: 10, stat: 'matches' },
  { id: 'birdies5', name: 'Consigue 5 birdies', goal: 5, stat: 'birdies' },
  { id: 'birdies10', name: 'Consigue 10 birdies', goal: 10, stat: 'birdies' },
  { id: 'ace', name: 'Haz un hoyo en uno', goal: 1, stat: 'aces' },
  { id: 'streak3', name: 'Gana 3 partidas seguidas', goal: 3, stat: 'bestStreak' },
  { id: 'streak5', name: 'Gana 5 partidas seguidas', goal: 5, stat: 'bestStreak' },
  { id: 'tiebreak', name: 'Gana un desempate', goal: 1, stat: 'tiebreakWins' },
  { id: 'bigwin', name: 'Gana una mesa de Oro o superior', goal: 1, stat: 'bigWins' },
  { id: 'bigwins3', name: 'Gana 3 mesas de Oro o superior', goal: 3, stat: 'bigWins' },
  { id: 'birdies15', name: 'Consigue 15 birdies', goal: 15, stat: 'birdies' },
  { id: 'aces3', name: 'Haz 3 hoyos en uno', goal: 3, stat: 'aces' },
  { id: 'wins50', name: 'Gana 50 partidas', goal: 50, stat: 'wins' },
  { id: 'aces5', name: 'Haz 5 hoyos en uno', goal: 5, stat: 'aces' },
  { id: 'bigwins5', name: 'Gana 5 mesas de Oro o superior', goal: 5, stat: 'bigWins' },
  { id: 'matches50', name: 'Juega 50 partidas', goal: 50, stat: 'matches' },
  { id: 'matches150', name: 'Juega 150 partidas', goal: 150, stat: 'matches' },
  { id: 'birdies50', name: 'Consigue 50 birdies', goal: 50, stat: 'birdies' },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) ?? SKINS[0];
