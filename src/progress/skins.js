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
  { id: 'champ', name: 'Campeona', rarity: 'silver', pattern: 'stripe', base: '#e9eef5', accent: '#4b6bff', trail: '#a9b8ff', unlock: { wins: 1 } },
  { id: 'galaxy', name: 'Galaxia', rarity: 'gold', pattern: 'galaxy', base: '#1a1040', accent: '#b26bff', trail: '#c99bff', unlock: { level: 5 } },
  { id: 'star', name: 'Estrella', rarity: 'gold', pattern: 'stars', base: '#ffd23f', accent: '#ff8a00', trail: '#ffe066', unlock: { challenge: 'ace' } },
  { id: 'streak', name: 'Racha', rarity: 'gold', pattern: 'flame', base: '#ffdd55', accent: '#ff3d00', trail: '#ff7a1a', unlock: { challenge: 'streak3' } },
  { id: 'gold', name: 'Oro puro', rarity: 'gold', pattern: 'solid', base: '#ffcc33', accent: '#fff3b0', trail: '#ffd84d', unlock: { wins: 5 } },
  { id: 'lava', name: 'Lava', rarity: 'diamond', pattern: 'flame', base: '#2b0a0a', accent: '#ff5a1f', trail: '#ff4a1a', unlock: { level: 8 } },
  { id: 'ice', name: 'Sangre fría', rarity: 'diamond', pattern: 'gem', base: '#bff4ff', accent: '#4fb8ff', trail: '#bff4ff', unlock: { challenge: 'tiebreak' } },
  { id: 'highroller', name: 'High Roller', rarity: 'diamond', pattern: 'gem', base: '#d8f6ff', accent: '#8a7dff', trail: '#cbbcff', unlock: { challenge: 'bigwin' } },
  { id: 'diamond', name: 'Diamante', rarity: 'diamond', pattern: 'gem', base: '#ffffff', accent: '#6fd3f2', trail: '#e0fbff', unlock: { wins: 15 } },
  { id: 'holo', name: 'Holo Arcoíris', rarity: 'emerald', pattern: 'rainbow', base: '#ffffff', accent: '#ffffff', trail: 'rainbow', unlock: { level: 12 } },
  { id: 'emerald', name: 'Esmeralda real', rarity: 'emerald', pattern: 'gem', base: '#0b6b45', accent: '#3dffa8', trail: '#3dffa8', unlock: { wins: 30 } },
];

export const CHALLENGES = [
  { id: 'matches10', name: 'Juega 10 partidas', goal: 10, stat: 'matches' },
  { id: 'birdies5', name: 'Consigue 5 birdies', goal: 5, stat: 'birdies' },
  { id: 'ace', name: 'Haz un hoyo en uno', goal: 1, stat: 'aces' },
  { id: 'streak3', name: 'Gana 3 partidas seguidas', goal: 3, stat: 'bestStreak' },
  { id: 'tiebreak', name: 'Gana un desempate', goal: 1, stat: 'tiebreakWins' },
  { id: 'bigwin', name: 'Gana una mesa de Oro o superior', goal: 1, stat: 'bigWins' },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) ?? SKINS[0];
