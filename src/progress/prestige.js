// Marcos de perfil: ilustraciones (public/assets/frames, generadas por scripts/process-frames.mjs). Solo cosmético.
// Cada marco se consigue por NIVEL (`level`) o por RETO (`challenge`, un id de CHALLENGES en skins.js).
// Los ids, niveles y retos los valida también el servidor (set_frame, get_ranking:
// supabase/migrations/*_frames_catalog.sql): si cambian, hay que migrar.
// Invariante: primero los marcos por nivel, de menor a mayor y sin repetir nivel; después los de reto.
// `hole` = diámetro del hueco de la cara / lado de la imagen (public/assets/frames/manifest.json).

const FRAME_DIR = `${import.meta.env?.BASE_URL ?? '/'}assets/frames`;

const art = (id, hole) => ({ hd: `${FRAME_DIR}/${id}.webp`, thumb: `${FRAME_DIR}/${id}.thumb.webp`, hole });

// build de portal: fuera el marco de ruleta de casino (nada de imaginería de apuestas en un portal familiar)
const PORTAL = Boolean(import.meta.env?.VITE_PORTAL || globalThis.__GB_PORTAL_TEST__);

export const FRAMES = [
  // por nivel
  { id: 'f_rustic', level: 5, name: 'Roble rústico', color: '#a4552f', glow: '#8fd14f', art: art('f_rustic', 0.6101) },
  { id: 'f_scifi', level: 15, name: 'Acero galáctico', color: '#aeb9c6', glow: '#4be3d1', art: art('f_scifi', 0.6168) },
  { id: 'f_cyber', level: 25, name: 'Neón cíber', color: '#ff3fd0', glow: '#35f0ff', art: art('f_cyber', 0.5684) },
  { id: 'f_sakura', level: 40, name: 'Sakura', color: '#ff8fb8', glow: '#ffd6e6', art: art('f_sakura', 0.5372) },
  { id: 'f_toxic', level: 55, name: 'Reactor tóxico', color: '#7bff1c', glow: '#d4ff7a', art: art('f_toxic', 0.5146) },
  { id: 'f_frost', level: 70, name: 'Escarcha rúnica', color: '#6fc8ff', glow: '#d9f3ff', art: art('f_frost', 0.4756) },
  { id: 'f_magma', level: 90, name: 'Magma volcánico', color: '#ff6a1a', glow: '#ffc06a', art: art('f_magma', 0.4971) },
  { id: 'f_vortex', level: 110, name: 'Vórtice cósmico', color: '#4a4fd6', glow: '#ffd37a', art: art('f_vortex', 0.5) },
  { id: 'f_arcane', level: 130, name: 'Arcano cristalino', color: '#a99bff', glow: '#7ff0ff', art: art('f_arcane', 0.4856) },
  { id: 'f_emperor', level: 150, name: 'Emperador dorado', color: '#ffc83d', glow: '#ff6a6a', art: art('f_emperor', 0.3999) },
  // por reto
  { id: 'f_roulette', challenge: 'bigwin', name: 'Ruleta de casino', color: '#c8232c', glow: '#ffd36a', art: art('f_roulette', 0.5211) },
  { id: 'f_kraken', challenge: 'matches50', name: 'Timón del kraken', color: '#5fa89a', glow: '#46c8ff', art: art('f_kraken', 0.4916) },
  { id: 'f_pharaoh', challenge: 'wins50', name: 'Faraón dorado', color: '#f0b429', glow: '#6fa8ff', art: art('f_pharaoh', 0.4978) },
  { id: 'f_oni', challenge: 'streak5', name: 'Oni carmesí', color: '#d6322b', glow: '#ff9a6a', art: art('f_oni', 0.5244) },
  { id: 'f_thunder', challenge: 'birdies50', name: 'Tormenta eléctrica', color: '#3fc9ff', glow: '#e0faff', art: art('f_thunder', 0.4475) },
  { id: 'f_astral', challenge: 'aces3', name: 'Halo astral', color: '#f3e3a8', glow: '#ffffff', art: art('f_astral', 0.4257) },
  { id: 'f_phoenix', challenge: 'rankWeekTop10', name: 'Fénix ardiente', color: '#ffa31a', glow: '#ffe08a', art: art('f_phoenix', 0.4414) },
  { id: 'f_void', challenge: 'rankHistTop100', name: 'Vacío violeta', color: '#9b4dff', glow: '#e0b3ff', art: art('f_void', 0.4517) },
].filter((f) => !(PORTAL && f.id === 'f_roulette'));

export const frameById = (id) => FRAMES.find((f) => f.id === id) ?? null;

/** Marcos que se consiguen por nivel, de menor a mayor. */
export const LEVEL_FRAMES = FRAMES.filter((f) => f.level != null);

/**
 * Marcos conseguidos: los de nivel con ese nivel y, si se da `challengeDone(id)`, los de reto cuyo reto esté hecho.
 * Primero los de nivel (de menor a mayor) y luego los de reto, como en FRAMES.
 */
export const framesUnlocked = (level, challengeDone = () => false) =>
  FRAMES.filter((f) => (f.level != null ? level >= f.level : Boolean(challengeDone(f.challenge))));

/** Marco que se luce: el elegido si está conseguido; si no, el de nivel más alto alcanzado (o null). */
export function frameFor(level, pick = null, challengeDone = () => false) {
  const chosen = framesUnlocked(level, challengeDone).find((f) => f.id === pick);
  return chosen ?? LEVEL_FRAMES.filter((f) => level >= f.level).at(-1) ?? null;
}

/** Variables CSS del marco de un avatar (color, brillo y hueco). Sin marco, cadena vacía. */
export const frameStyle = (frame) =>
  frame ? `--frame:${frame.color};--frame-glow:${frame.glow};--hole:${frame.art.hole}` : '';

/** Ruta de la ilustración del marco (HD para tamaños grandes y vista previa; Thumb para listas), o null. */
export const frameArtSrc = (frame, hd = false) => (frame?.art ? (hd ? frame.art.hd : frame.art.thumb) : null);
