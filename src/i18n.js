// Idioma de la build de portal (GolfitoBattle). El juego está escrito en español;
// en la build de portal, a quien no tenga el navegador en español se le traduce
// la interfaz al inglés al vuelo (cada texto que aparece en pantalla se cambia por
// su traducción). Fuera de la build de portal no hace nada.
// ?lang=en / ?lang=es fuerza el idioma (útil para probar).

import { IS_PORTAL } from './portal.js';

export const BRAND = 'GolfitoBattle';

function pickLang() {
  try {
    const forced = new URLSearchParams(location.search).get('lang');
    if (forced === 'es' || forced === 'en') return forced;
  } catch { }
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language || 'en']).map((l) => String(l).toLowerCase());
  return langs[0]?.startsWith('es') ? 'es' : 'en';
}

export const LANG = IS_PORTAL ? pickLang() : 'es';

// textos exactos (tal cual se ven en pantalla, sin espacios a los lados)
const EN = {
  // marca
  'Golf Cash Battle': BRAND,
  // barra y navegación
  'Nivel': 'Level', 'Jugar': 'Play', 'Juego Libre': 'Free Play', 'Libre': 'Free', 'Skins': 'Skins',
  'Sonido': 'Sound', 'Mudo': 'Muted', 'Silenciar / Activar sonido (M)': 'Mute / unmute (M)',
  'Conectando…': 'Loading…', 'Cargando…': 'Loading…',
  // lobby
  'Personalizar skin': 'Customize ball', 'Partida rápida': 'Quick match', 'Contra 7 rivales': 'Against 7 rivals',
  'Determinista': 'Skill only', '8 jugadores · 3 hoyos': '8 players · 3 holes',
  'Juega contra 7 rivales en 3 hoyos. Mismos hoyos para todos: gana quien menos golpes da.': 'Play 3 holes against 7 rivals. Same holes for everyone: fewest strokes wins.',
  'Práctica': 'Practice', 'Entrenamiento': 'Training',
  // rarezas y colecciones
  'Común': 'Common', 'Poco común': 'Uncommon', 'Rara': 'Rare', 'Épica': 'Epic', 'Legendaria': 'Legendary', 'Mítica': 'Mythic',
  '✦ Mítica': '✦ Mythic',
  'Todas': 'All', 'Solo desbloqueadas': 'Unlocked only', 'Todas las colecciones': 'All collections',
  'Clasica': 'Classic', 'Cosmos': 'Cosmos', 'Oro': 'Gold', 'Elementos': 'Elements', 'Prestigio': 'Prestige', 'Ranking': 'Ranking',
  'cosmos': 'cosmos', 'Equipada': 'Equipped', 'Equipar': 'Equip', 'Bloqueada': 'Locked', 'De serie': 'Default',
  'Ninguna skin cumple estos filtros.': 'No balls match these filters.',
  'Desafíos': 'Challenges', 'Filtros de skins': 'Ball filters', 'Colección': 'Collection',
  'Marcador': 'Counter', '✦ Patrón raro': '✦ Rare pattern', 'Patrón': 'Pattern',
  '‹ Skins': '‹ Balls', 'Lado bueno': 'Best side', 'Barrido de luz': 'Light sweep', 'Probar efectos': 'Try effects',
  'Arrastra para girar · pellizca o usa la rueda para acercar · doble toque para voltear': 'Drag to rotate · pinch or scroll to zoom · double tap to flip',
  'Cerrar inspección': 'Close', 'Mostrar u ocultar datos': 'Show or hide details',
  // nombres de skins
  'Clásica': 'Classic', 'Ánima Errante': 'Wandering Soul', 'Aro de Platino': 'Platinum Ring', 'Horizonte de Sucesos': 'Event Horizon',
  'Marea Abisal': 'Abyssal Tide', 'Toque de Midas': 'Midas Touch', 'Antimateria del Vacío': 'Void Antimatter', 'Aro de Oro': 'Gold Ring',
  'Damasco Imperial': 'Imperial Damascus', 'Diamante': 'Diamond', 'Dragón Carmesí': 'Crimson Dragon', 'Esmeralda real': 'Royal Emerald',
  'Kintsugi Neón': 'Neon Kintsugi', 'Rey del Mes': 'King of the Month', 'Salón de la Fama': 'Hall of Fame', 'Supernova Solar': 'Solar Supernova',
  'Aro de Plata': 'Silver Ring', 'Cima Mensual': 'Monthly Peak', 'Criónova': 'Cryonova', 'Cronómetro de Latón': 'Brass Chronometer',
  'Estrella': 'Star', 'Lava': 'Lava', 'Oro puro': 'Pure Gold', 'Prisma Holo': 'Holo Prism', 'Racha': 'Streak', 'Rey de la Semana': 'King of the Week',
  'Tormenta Voltaica': 'Voltaic Storm', 'Aro de Bronce': 'Bronze Ring', 'Campeona': 'Champion', 'Céfiro Nácar': 'Pearl Zephyr',
  'Cima Semanal': 'Weekly Peak', 'Galaxia': 'Galaxy', 'Atardecer': 'Sunset', 'Pajarito': 'Birdie', 'Veterana': 'Veteran', 'Menta': 'Mint',
  // frases de skins
  'Ni la luz escapa de ella.': 'Not even light escapes it.',
  'Por sus grietas se asoma algo que no debería existir.': 'Something that should not exist peeks through its cracks.',
  'Ha recorrido tantos campos que ya no recuerda el suyo.': 'It has rolled so many courses it no longer remembers its own.',
  'Nunca llega tarde al hoyo.': 'Never late to the hole.',
  'Trae consigo la luz del fondo del mar.': 'It brings the light of the deep sea.',
  'Veinticinco niveles de oficio.': 'Twenty-five levels of craft.',
  'Cincuenta niveles y aún afina el golpe.': 'Fifty levels and still refining the stroke.',
  'Setenta y cinco niveles de campo.': 'Seventy-five levels on the course.',
  'Cien niveles. El campo ya la conoce de memoria.': 'One hundred levels. The course knows it by heart.',
  'Entre los diez mejores de una semana.': 'Top ten of a week.',
  'Nadie ganó más mesas que ella en siete días.': 'Nobody won more in seven days.',
  'Entre los diez mejores de un mes.': 'Top ten of a month.',
  'Un mes entero mandando en la clasificación.': 'A whole month ruling the leaderboard.',
  // desafíos
  'Juega 10 partidas': 'Play 10 matches', 'Consigue 5 birdies': 'Get 5 birdies', 'Consigue 10 birdies': 'Get 10 birdies',
  'Haz un hoyo en uno': 'Make a hole in one', 'Gana 3 partidas seguidas': 'Win 3 matches in a row', 'Gana 5 partidas seguidas': 'Win 5 matches in a row',
  'Gana un desempate': 'Win a tiebreak', 'Gana una mesa de Oro o superior': 'Win a Gold table or higher', 'Gana 3 mesas de Oro o superior': 'Win 3 Gold tables or higher',
  'Consigue 15 birdies': 'Get 15 birdies', 'Haz 3 hoyos en uno': 'Make 3 holes in one', 'Gana 50 partidas': 'Win 50 matches',
  'Haz 5 hoyos en uno': 'Make 5 holes in one', 'Gana 5 mesas de Oro o superior': 'Win 5 Gold tables or higher',
  'Juega 50 partidas': 'Play 50 matches', 'Juega 150 partidas': 'Play 150 matches', 'Consigue 50 birdies': 'Get 50 birdies',
  'Alcanza el nivel 25': 'Reach level 25', 'Alcanza el nivel 50': 'Reach level 50', 'Alcanza el nivel 75': 'Reach level 75', 'Alcanza el nivel 100': 'Reach level 100',
  'Termina una semana en el top 10': 'Finish a week in the top 10', 'Sé el nº 1 de una semana': 'Be #1 of a week',
  'Termina un mes en el top 10': 'Finish a month in the top 10', 'Sé el nº 1 de un mes': 'Be #1 of a month', 'Entra en el top 100 histórico': 'Enter the all-time top 100',
  // recompensas
  'Recompensa': 'Reward', 'Pulsa para abrir': 'Tap to open', 'Mantén pulsado para abrir': 'Hold to open',
  '¡Skin rara!': 'Rare ball!', '¡Skin desbloqueada!': 'Ball unlocked!', 'Continuar': 'Continue', 'Siguiente': 'Next',
  // juego libre
  'Modo Práctica Libre': 'Free Practice Mode', 'Selector de Mapas': 'Map Select', 'EN SOLITARIO': 'SOLO',
  'Elige cualquier hoyo para entrenar a tu propio ritmo. Sin límite de tiempo, sin desafíos ni misiones y sin oponentes.': 'Pick any hole and practice at your own pace. No time limit, no challenges, no opponents.',
  'Sin límite de tiempo': 'No time limit', 'Sin rivales': 'No rivals', 'Tiros ilimitados': 'Unlimited shots', 'Reinicio rápido [R]': 'Quick restart [R]',
  'Extra': 'Extra', 'Diana': 'Target', 'Entrenar Desempate': 'Practice Tiebreak', 'Jugar Desempate': 'Play Tiebreak', 'Desempate: Diana': 'Tiebreak: Target',
  'Un solo tiro al objetivo: afina la precisión al centro de la diana sin agujero.': 'One shot at the target: get as close as you can to the bullseye.',
  'Diana de precisión': 'Precision target', 'Muerte súbita': 'Sudden death', '← Volver al Menú Principal': '← Back to Main Menu',
  'Modo Libre': 'Free Mode', 'Reiniciar': 'Restart', 'Mapas': 'Maps',
  'HOYO COMPLETADO · MODO LIBRE': 'HOLE COMPLETE · FREE MODE', 'Par del Hoyo': 'Hole par', 'Balance': 'Score',
  'Par (E)': 'Par (E)', 'Repetir este hoyo': 'Replay this hole', 'Elegir otro mapa': 'Pick another map', 'Lobby principal': 'Main lobby',
  'Práctica de Precisión': 'Precision Practice',
  // rasgos y temas de los hoyos
  'Aspas': 'Blades', 'Setas': 'Bumpers', 'Arena': 'Sand', 'Nieve': 'Snow', 'Acelerador': 'Booster', 'Cañón': 'Canyon', 'Bloques': 'Blocks',
  'Noche': 'Night', 'Portales': 'Portals', 'Jardín Nocturno': 'Night Garden', 'Playa Nocturna': 'Night Beach', 'Pendiente': 'Slope',
  'Neón Cyberpunk': 'Cyberpunk Neon', 'Looping': 'Loop', 'Neón Magenta': 'Magenta Neon', 'Tubos': 'Pipes', 'Molino': 'Windmill',
  'Playa': 'Beach', 'Pasadizo': 'Tunnel', 'caldera': 'caldera', 'Pradera de Día': 'Daytime Meadow', 'Volcán': 'Volcano',
  'cyber2078': 'cyber2078', 'jungle': 'jungle', 'Glaciar': 'Glacier', 'Hielo': 'Ice', 'Otoño': 'Autumn',
  // nombres y consejos de los hoyos
  'Zigzag': 'Zigzag', 'Turbo': 'Turbo', 'El Portal': 'The Portal', 'Molinos': 'Windmills', 'La Herradura': 'The Horseshoe',
  'Looping Neón': 'Neon Loop', 'Doble Looping': 'Double Loop', 'Tubos Neón': 'Neon Pipes', 'Molinos de Noche': 'Night Windmills',
  'Las Tuberías': 'The Pipes', 'Dentro del Volcán': 'Inside the Volcano', 'El Molino del Prado': 'The Meadow Mill', 'El Abismo': 'The Abyss',
  'Cyberpunk2078': 'Cyberpunk2078', 'El Templo de la Selva': 'The Jungle Temple', 'El Glaciar': 'The Glacier', 'Desempate': 'Tiebreak',
  'Entra en el portal morado para salir al otro lado': 'Enter the purple portal to come out the other side',
  'Espera el hueco entre las aspas': 'Wait for the gap between the blades',
  'Usa el acelerador y sube la cuesta del final': 'Use the booster and climb the final slope',
  'Dale fuerte para completar el looping': 'Hit it hard to complete the loop',
  'Pasa el primer looping: el acelerador te lanza al segundo': 'Clear the first loop: the booster launches you into the second',
  'Mete la bola en un tubo para cruzar el muro': 'Send the ball into a pipe to cross the wall',
  'Dos molinos: busca el ritmo de cada uno': 'Two windmills: find the rhythm of each',
  'Por el pasadizo o por la tubería: tú eliges': 'Through the tunnel or the pipe: your call',
  'Entra por la cueva y, dentro, salta la lava: recto por el camino largo o a la derecha por el atajo': 'Go into the cave and jump the lava: straight on the long path or right for the shortcut',
  'Cruza la puerta del molino o arriésgate por el carril del looping': 'Go through the mill door or risk the loop lane',
  'Salta los agujeros con las rampas: si caes, vuelves a tirar desde donde estabas': 'Jump the gaps with the ramps: if you fall, you shoot again from where you were',
  'Ruta A: el portal te deja en el acelerador y el looping te lanza a la cup. Ruta B: rodea por la derecha entre el bloque y el molino': 'Route A: the portal drops you on the booster and the loop launches you to the cup. Route B: go around the right between the block and the windmill',
  'Tres caminos: la U entera, el sendero del puente o saltar la escuadra de la calzada. Llega suave: si vas fuerte la bola rebota en el borde del hoyo': 'Three paths: the whole U, the bridge trail or jumping the corner. Arrive soft: too fast and the ball bounces off the rim',
  'El hielo resbala: la bola apenas frena. Salta la grieta con la rampa o arriésgate por el puente de hielo': 'Ice is slippery: the ball barely slows down. Jump the crack with the ramp or risk the ice bridge',
  'Deja la bola lo más cerca de la diana': 'Leave the ball as close to the target as you can',
  // búsqueda y partida
  'Buscando rivales…': 'Finding rivals…', 'Partida rápida · 8 jugadores': 'Quick match · 8 players', 'Cancelar': 'Cancel',
  'Golpes': 'Strokes', 'Pantalla': 'Screen', 'Ajustes': 'Settings', 'Esc': 'Esc', 'Espacio': 'Space', 'para volver': 'to go back',
  'Vista General del Mapa · Mueve el ratón para orbitar · Pulsa': 'Map overview · Move the mouse to orbit · Press',
  'Vista del mapa · Desliza para girarla': 'Map view · Swipe to rotate', 'Tiempo para embocar': 'Time to hole out',
  'Desliza: cámara · Arrastra la bola hacia atrás: tiro': 'Swipe: camera · Drag the ball back: shoot',
  'Ratón para apuntar · Clic Izquierdo para calcular y disparar ·': 'Mouse to aim · Left click to set power and shoot ·',
  'Ver mapa ·': 'View map ·', 'Ratón': 'Mouse', 'Apuntar y Disparar': 'Aim and Shoot', 'Clic Der': 'Right Click', 'Cámara': 'Camera',
  'Rueda': 'Wheel', 'Zoom / Fuerza': 'Zoom / Power', 'Vista mapa completo': 'Full map view', 'Ver mapa': 'View map', 'Volver a la bola': 'Back to ball',
  'Pantalla completa (F11)': 'Fullscreen (F11)', 'Pantalla completa': 'Fullscreen', 'Ajustes (Esc)': 'Settings (Esc)', 'Ver el hoyo completo': 'See the whole hole',
  'Reiniciar hoyo': 'Restart hole', 'Ajustes de Partida': 'Match Settings', 'Cerrar': 'Close', 'Efectos ambientales y de golpe': 'Ambient and shot effects',
  'Silenciado': 'Muted', 'Activado': 'On', 'Modo inmersivo de pantalla completa': 'Immersive fullscreen mode', 'Ventana': 'Window', 'Pantalla Completa': 'Fullscreen',
  'Calidad gráfica': 'Graphics quality', 'Baja si el móvil va lento o se calienta': 'Lower it if your phone is slow or gets hot',
  'Bajo': 'Low', 'Medio': 'Medium', 'Alto': 'High',
  'Vista de Campo': 'Course View', 'Ver todo el terreno en 3D': 'See the whole course in 3D', 'Ver todo el terreno': 'See the whole course',
  'Controles Activos': 'Controls', 'Apuntar y calcular fuerza (pulsar/arrastrar y soltar)': 'Aim and set power (press/drag and release)',
  'Rotar cámara alrededor de la bola': 'Rotate camera around the ball', 'Zoom de cámara / Ajuste fino de fuerza': 'Camera zoom / fine power control',
  'Visión general y completa del mapa': 'Full map overview', 'Abrir / Cerrar este menú de ajustes': 'Open / close this settings menu',
  'Reanudar partida': 'Resume', 'Reiniciar Hoyo': 'Restart Hole', 'Cambiar de Mapa': 'Change Map', 'Salir al Lobby': 'Exit to Lobby',
  '¿Seguro que quieres salir al menú principal?': 'Exit to the main menu?',
  'Hoyo reiniciado al tee': 'Hole restarted from the tee', '¡Tiempo! Descalificado': 'Time! Disqualified',
  '¡Uy! Demasiado fuerte para entrar': 'Oops! Too fast to drop', '¡uy!': 'oops!',
  '🔥 ¡A la lava! Vuelves al sitio del golpe': '🔥 Into the lava! Back to your last spot',
  '💦 ¡Al agua! Vuelves al sitio del golpe': '💦 In the water! Back to your last spot',
  '🌴 ¡Fuera del campo! Vuelves al sitio del golpe': '🌴 Out of bounds! Back to your last spot',
  '🕳️ ¡Al agujero! Vuelves al sitio del golpe': '🕳️ Down the hole! Back to your last spot',
  'Sonido silenciado · actívalo en Ajustes': 'Sound muted · turn it on in Settings',
  '¡Hoyo en uno!': 'Hole in one!', '¡Albatros!': 'Albatross!', '¡Eagle!': 'Eagle!', '¡Birdie!': 'Birdie!', 'Par': 'Par', 'Bogey': 'Bogey',
  'Doble bogey': 'Double bogey', 'Triple bogey': 'Triple bogey',
  'Descalificado': 'Disqualified', 'Siguiente hoyo': 'Next hole', 'Ver resultado': 'See results',
  'Jugar desempate': 'Play tiebreak', 'Ver desempate': 'Watch tiebreak',
  // final
  'Victoria': 'Victory', '¡Has ganado!': 'You won!', 'Revancha': 'Rematch', 'Salir': 'Exit', 'Reclamar y salir': 'Claim and exit',
  'Mejor hoyo': 'Best hole', 'Vs par': 'Vs par', 'Birdies': 'Birdies', 'Terminado': 'Finished',
  'Hoyo en uno': 'Hole in one', 'Albatros': 'Albatross', 'Eagle': 'Eagle', 'Birdie': 'Birdie', 'Tú': 'You', 'Jugador': 'Player', 'Total': 'Total',
  'Ups': 'Oops', 'Volver al lobby': 'Back to lobby', 'Volver': 'Back', 'Lobby': 'Lobby', 'Reintentar': 'Retry',
  'No se ha podido crear la partida. Prueba otra vez.': 'Could not create the match. Try again.',
  'No se ha podido cerrar la partida. Prueba otra vez.': 'Could not finish the match. Try again.',
  'Se ha perdido la conexión con el servidor. Tu partida sigue guardada.': 'Something went wrong. Your match is saved.',
  // tutorial
  'Arrastra hacia atrás desde la bola y suelta para tirar': 'Drag back from the ball and release to shoot',
  'Cuanto más lejos arrastres, más fuerte': 'The further you drag, the harder the shot',
  'Desliza en otro sitio para girar la cámara': 'Swipe elsewhere to turn the camera',
  '¡Bien! Mete la bola en el hoyo con los menos golpes posibles': 'Nice! Sink the ball in as few strokes as you can',
  'Usa «Ver mapa» para ver el hoyo entero': 'Use “View map” to see the whole hole',
  'Entendido': 'Got it', 'Cómo se juega': 'How to play',
};

// textos con números u otras partes variables
const EN_PATTERNS = [
  [/^Nivel (\d+)$/, 'Level $1'], [/^Nivel (\d+) · (\d+)%$/, 'Level $1 · $2%'], [/^¡Nivel (\d+)!$/, 'Level $1!'],
  [/^(\d+) Jugadores$/, '$1 Players'], [/^(\d+) Hoyos$/, '$1 Holes'],
  [/^Hoyo (\d+)$/, 'Hole $1'], [/^Hoyo (\d+)\/(\d+)$/, 'Hole $1/$2'], [/^Par (\d+)$/, 'Par $1'],
  [/^Entrenar Hoyo (\d+)$/, 'Practice Hole $1'], [/^Jugar Hoyo (\d+)$/, 'Play Hole $1'],
  [/^Haga clic para jugar el Hoyo (\d+)$/, 'Click to play Hole $1'], [/^Haga clic para jugar el Desempate$/, 'Click to play the Tiebreak'],
  [/^Vista previa de (.+)$/, (_, n) => `Preview of ${EN[n] ?? n}`], [/^Inspeccionar (.+)$/, (_, n) => `Inspect ${EN[n] ?? n}`],
  [/^✦ (.+)$/, (_, n) => (EN[n] ? `✦ ${EN[n]}` : null)],
  [/^(\d+)\/(\d+) desbloqueadas · solo cambian el aspecto, nunca el juego$/, '$1/$2 unlocked · looks only, never gameplay'],
  [/^Puesto #(\d+)$/, 'Place #$1'], [/^Posición (\d+) de (\d+)$/, 'Place $1 of $2'],
  [/^(\d+) golpes? · par (\d+)$/, (_, s, p) => `${s} stroke${s === '1' ? '' : 's'} · par ${p}`],
  [/^(.+) · (\d+) golpes? · Par (\d+)$/, (_, c, s, p) => `${EN[c] ?? c} · ${s} stroke${s === '1' ? '' : 's'} · Par ${p}`],
  [/^No embocaste a tiempo · se apuntan (\d+) golpes$/, 'You did not hole out in time · scored $1 strokes'],
  [/^(.+) ha embocado en (\d+)$/, (_, n, s) => `${n} holed out in ${s}`],
  [/^¡(\d+) s para embocar o quedas descalificado!$/, '$1 s to hole out or you are disqualified!'],
  [/^¡Empate a (\d+)!$/, 'Tied at $1!'],
  [/^(.+) van al desempate\. Hoyo sin agujero: un solo tiro y gana quien deje la bola más cerca de la diana\.$/, '$1 go to the tiebreak. No cup: one shot, closest to the target wins.'],
  [/^(.+) vais al desempate\. Hoyo sin agujero: un solo tiro y gana quien deje la bola más cerca de la diana\.$/, '$1 go to the tiebreak. No cup: one shot, closest to the target wins.'],
  [/^Tienes (\d+) recompensas? por reclamar$/, (_, n) => `You have ${n} reward${n === '1' ? '' : 's'} to claim`],
  [/^Siguiente hoyo \((\d+)\)$/, 'Next hole ($1)'],
  [/^Patrón #(\d+)$/, 'Pattern #$1'],
  [/^¡Marco de prestigio (.+) desbloqueado!$/, 'Prestige frame $1 unlocked!'],
  [/^Nv\. ?(\d+)$/, 'Lv. $1'],
  [/^Jugando · (\d+) hoyos?$/, (_, n) => `Playing · ${n} hole${n === '1' ? '' : 's'}`],
];

function translate(text) {
  if (LANG !== 'en') return text === 'Golf Cash Battle' ? BRAND : null;
  if (Object.hasOwn(EN, text)) return EN[text];
  for (const [re, to] of EN_PATTERNS) {
    if (!re.test(text)) continue;
    const out = typeof to === 'function' ? text.replace(re, to) : text.replace(re, to);
    if (out && out !== 'null') return out;
  }
  return null;
}

/** Traduce un texto suelto (para alert/confirm o código que no pinta en el DOM). */
export function t(text) {
  return translate(text) ?? text;
}

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

function fixText(node) {
  const raw = node.nodeValue;
  const core = raw.trim();
  if (!core || core.length > 400) return;
  const to = translate(core);
  if (to != null && to !== core) node.nodeValue = raw.replace(core, to);
}

function fixEl(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v) continue;
    const to = translate(v.trim());
    if (to != null && to !== v) el.setAttribute(a, to);
  }
}

function fixTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest?.('script,style')) return;
  fixEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (w.nextNode()) {
    const n = w.currentNode;
    if (n.nodeType === Node.TEXT_NODE) fixText(n);
    else if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue;
    else fixEl(n);
  }
}

/** Arranca la traducción automática de la interfaz (solo build de portal). */
export function installI18n() {
  if (!IS_PORTAL) return;
  document.documentElement.lang = LANG;
  document.title = BRAND;
  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  window.confirm = (m) => nativeConfirm(t(String(m ?? '')));
  window.alert = (m) => nativeAlert(t(String(m ?? '')));
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixEl(m.target);
      else m.addedNodes.forEach(fixTree);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  fixTree(document.body);
}
