import { register } from './index.js';

register('tables', {
  title: 'Mesas de Torneo',
  live: 'EN VIVO',
  balance: 'Saldo',
  players: '{n} Jugadores',
  holes: '{n} Hoyos',
  deterministic: 'Determinista',
  offline: 'Modo sin conexión: el saldo se guarda solo en este {device}',
  deviceMobile: 'móvil',
  deviceComputer: 'equipo',
  training: 'Entrenamiento',
  esports: 'Torneo Esports',
  free: 'Gratis',
  entry: 'Entrada',
  guaranteed: 'Premio Garantizado',
  pot: 'Bote',
  practiceNote: 'Entrena sin arriesgar créditos',
  noFunds: 'Saldo insuficiente',
  practice: 'Practicar',
  play: 'Jugar Torneo',
  last: 'Última mesa',
  loadError: 'No se pudieron cargar las mesas. Inténtalo de nuevo.',
});

register('tables', {
  paid_block_account_required: 'Crea tu cuenta con email para jugar mesas con entrada',
  paid_block_kyc_required: 'Verifica tu edad e identidad para jugar mesas con entrada',
  paid_block_account_review: 'Tu cuenta está en revisión: de momento solo Práctica',
  paid_block_underage: 'Mesas con entrada solo para mayores de 18',
});

register('tables', {
  legalBase: 'Créditos de demostración sin valor real. ',
  legalLive: 'Las mesas de pago son partidas en vivo contra jugadores reales: todos jugáis los mismos hoyos a la vez y el servidor repite cada golpe para validarlo. Los huecos libres los ocupan bots, que nunca cuentan para el premio. La práctica es contra rivales simulados. ',
  legalRules: 'El resultado depende solo de la habilidad: mismo campo para todos y sin elementos aleatorios. En empate, tiro de desempate: gana quien deje la bola más cerca. Comisión de la plataforma: {pct}% del bote.',
});
