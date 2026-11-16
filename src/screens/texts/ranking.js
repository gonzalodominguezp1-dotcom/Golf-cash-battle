import { register } from './index.js';

register('ranking', {
  title: 'Ranking',
  sub: 'Victorias en mesas online',
  offline: 'El ranking de victorias necesita conexión con el servidor.',
  periodLabel: 'Periodo del ranking',
  weekly: 'Semanal',
  monthly: 'Mensual',
  historic: 'Histórico',
  fromStart: 'Desde el principio',
  place: 'Puesto {n}',
  level: 'Nv. {n}',
  win: 'victoria',
  wins: 'victorias',
  empty: 'Aún no hay victorias en este periodo. ¡Sé el primero!',
  loadError: 'No se ha podido cargar el ranking. Prueba otra vez.',
  minePos: 'Tu posición:',
  mineNone: 'Aún no tienes victorias en este periodo. Gana una mesa online para entrar.',
  legal: 'Cuentan las mesas con jugadores reales ya liquidadas. Semana de lunes a domingo y mes natural (hora UTC). En empate gana quien llegó antes a esas victorias. Terminar un periodo entre los mejores desbloquea bolas exclusivas en Skins.',
});
