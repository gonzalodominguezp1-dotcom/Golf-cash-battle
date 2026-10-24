// Skins de bola: solo cambian la apariencia, nunca la física ni el resultado.
// unlock: { level } por nivel, { wins } por victorias o { challenge } por desafío.

export const RARITIES = {
  bronze: { name: 'Bronce', order: 0 },
  silver: { name: 'Plata', order: 1 },
  gold: { name: 'Oro', order: 2 },
  diamond: { name: 'Diamante', order: 3 },
  emerald: { name: 'Esmeralda', order: 4 },
};

export const SKINS = [
  { id: 'classic', name: 'Clásica', rarity: 'bronze', pattern: 'stripe', base: '#ffffff', accent: '#ff4d4d', trail: '#ffffff', unlock: null },
  { id: 'mint', name: 'Menta', rarity: 'bronze', pattern: 'dual', base: '#ffffff', accent: '#3ee8b5', trail: '#7dffd8', unlock: { level: 2 } },
  { id: 'veteran', name: 'Veterana', rarity: 'bronze', pattern: 'dots', base: '#ffe8c2', accent: '#c46a2b', trail: '#ffb36b', unlock: { challenge: 'matches10' } },
  { id: 'sunset', name: 'Atardecer', rarity: 'silver', pattern: 'gradient', base: '#ffb347', accent: '#ff2e88', trail: '#ff7ab8', unlock: { level: 3 } },
  { id: 'birdie', name: 'Pajarito', rarity: 'silver', pattern: 'stars', base: '#5ec8ff', accent: '#ffffff', trail: '#9fe0ff', unlock: { challenge: 'birdies5' } },
  { id: 'zephyr_nacre', name: 'Céfiro Nácar', rarity: 'silver', pattern: 'feather_aero', base: '#ebf4fa', accent: '#0de0f8', secondary: '#ffffff', shimmer: '#0de0f8', trail: '#0de0f8', material: { roughness: 0.08, metalness: 0.05, clearcoat: 1.0, iridescence: 0.98 }, unlock: { challenge: 'birdies10' } },
  { id: 'champ', name: 'Campeona', rarity: 'silver', pattern: 'stripe', base: '#e9eef5', accent: '#4b6bff', trail: '#a9b8ff', unlock: { wins: 1 } },
  { id: 'galaxy', name: 'Galaxia', rarity: 'gold', pattern: 'galaxy', base: '#1a1040', accent: '#b26bff', trail: '#c99bff', unlock: { level: 5 } },
  { id: 'star', name: 'Estrella', rarity: 'gold', pattern: 'stars', base: '#ffd23f', accent: '#ff8a00', trail: '#ffe066', unlock: { challenge: 'ace' } },
  { id: 'streak', name: 'Racha', rarity: 'gold', pattern: 'flame', base: '#ffdd55', accent: '#ff3d00', trail: '#ff7a1a', unlock: { challenge: 'streak3' } },
  { id: 'supernova_solar', name: 'Supernova Solar', rarity: 'gold', pattern: 'solar_supernova', base: '#ed450c', accent: '#ffb703', secondary: '#fffbeb', shimmer: '#ffffff', trail: '#ffb703', material: { roughness: 0.12, metalness: 0.35, clearcoat: 0.95, emissive: '#ed450c', emissiveIntensity: 0.55 }, unlock: { challenge: 'streak5' } },
  { id: 'gold', name: 'Oro puro', rarity: 'gold', pattern: 'solid', base: '#ffcc33', accent: '#fff3b0', trail: '#ffd84d', unlock: { wins: 5 } },
  { id: 'lava', name: 'Lava', rarity: 'diamond', pattern: 'flame', base: '#2b0a0a', accent: '#ff5a1f', trail: '#ff4a1a', unlock: { level: 8 } },
  { id: 'ice', name: 'Sangre fría', rarity: 'diamond', pattern: 'gem', base: '#bff4ff', accent: '#4fb8ff', trail: '#bff4ff', unlock: { challenge: 'tiebreak' } },
  { id: 'highroller', name: 'High Roller', rarity: 'diamond', pattern: 'gem', base: '#d8f6ff', accent: '#8a7dff', trail: '#cbbcff', unlock: { challenge: 'bigwin' } },
  { id: 'crimson_dragon', name: 'Dragón Carmesí', rarity: 'diamond', pattern: 'dragon_scales', base: '#190408', accent: '#e11d48', secondary: '#fafafa', shimmer: '#000000', trail: '#e11d48', material: { roughness: 0.18, metalness: 0.5, clearcoat: 0.9, iridescence: 0.65, emissive: '#e11d48', emissiveIntensity: 0.35 }, unlock: { challenge: 'bigwins3' } },
  { id: 'kintsugi_neon', name: 'Kintsugi Neón', rarity: 'diamond', pattern: 'kintsugi', base: '#000000', accent: '#e205ff', secondary: '#e205ff', shimmer: '#e205ff', trail: '#e205ff', material: { roughness: 0.16, metalness: 0.72, clearcoat: 1.0, iridescence: 0.75, emissive: '#e205ff', emissiveIntensity: 0.4 }, unlock: { challenge: 'aces3' } },
  { id: 'diamond', name: 'Diamante', rarity: 'diamond', pattern: 'gem', base: '#ffffff', accent: '#6fd3f2', trail: '#e0fbff', unlock: { wins: 15 } },
  { id: 'holo', name: 'Holo Arcoíris', rarity: 'emerald', pattern: 'rainbow', base: '#ffffff', accent: '#ffffff', trail: 'rainbow', unlock: { level: 12 } },
  { id: 'damascus_imperial', name: 'Damasco Imperial', rarity: 'emerald', pattern: 'damascus', base: '#022c22', accent: '#10b981', secondary: '#38ef7d', shimmer: '#53eaa3', trail: '#38ef7d', material: { roughness: 0.14, metalness: 0.92, clearcoat: 1.0, iridescence: 0.45, emissive: '#10b981', emissiveIntensity: 0.2 }, unlock: { challenge: 'birdies15' } },
  { id: 'emerald', name: 'Esmeralda real', rarity: 'emerald', pattern: 'gem', base: '#0b6b45', accent: '#3dffa8', trail: '#3dffa8', unlock: { wins: 30 } },
];

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
];

export const skinById = (id) => SKINS.find((s) => s.id === id) ?? SKINS[0];
