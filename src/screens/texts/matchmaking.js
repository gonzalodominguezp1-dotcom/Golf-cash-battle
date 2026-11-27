import { register } from './index.js';

register('matchmaking', {
  title: 'Buscando rivales',
  practice: 'Práctica contra rivales simulados',
  practiceKicker: 'Práctica',
  portalKicker: 'Contra la IA',
  portalTitle: 'Preparando rivales',
  practiceNote: 'Rivales simulados · juega sin riesgo',
  table: 'Mesa',
  prize: 'Premio al ganador',
  pot: 'bote',
  cancel: 'Cancelar emparejamiento',
  lobby: 'Volver al lobby',
  lobbyHint: 'La búsqueda sigue en segundo plano',
  none: 'No hay ninguna partida que buscar.',
  seatFree: '…',
  seatsLabel: 'Jugadores en la mesa',
  info: 'Cómo funciona la sala',
  already: 'Ya estás buscando partida',
  alreadyText: 'Te llevamos a tu sala de emparejamiento.',
});

// sala en vivo (torneos contra jugadores reales)
register('matchmaking', {
  liveKicker: 'En vivo',
  liveTitle: 'Buscando rivales',
  rematchTitle: 'Revancha',
  livePotNote: 'Solo cuentan los jugadores reales',
  liveLegal: 'Empezáis todos a la vez y verás las bolas de los demás en directo. Los huecos libres los ocupan bots: juegan contigo, pero nunca cuentan para el premio (el bote es solo de los jugadores reales). Si no entra nadie más, juegas contra bots y se te devuelve la entrada.',
  rematchLegal: 'Revancha: quienes pidan revancha como tú entrarán juntos en esta sala.',
  fillingBots: 'Rellenando los huecos con bots…',
});

// aviso flotante de búsqueda en segundo plano (src/ui/matchmakingBanner.js)
register('matchmaking', {
  bannerTitle: 'Buscando partida',
  bannerLaunching: '¡Partida encontrada!',
  bannerError: 'Error al iniciar partida',
  bannerErrorHint: 'Toca para reintentar o cancelar',
  bannerSecs: 'Empieza en {n} s',
  bannerPlayers: '{n}/{m} jugadores',
  bannerOpen: 'Volver a la sala de emparejamiento',
  bannerCancel: 'Cancelar emparejamiento y recuperar la entrada',
  bannerRegion: 'Emparejamiento en curso',
});
