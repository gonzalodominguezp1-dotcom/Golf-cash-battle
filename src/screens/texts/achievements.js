import { register } from './index.js';

register('achievements', {
  title: 'Logros',
  pending: 'Pendientes',
  done: 'Completados',
  progress: '{value} de {goal}',
  progressLabel: '{name}: {value} de {goal}',
  completed: 'Completado',
  reward: 'Recompensa: {skin}',
  empty: 'Todavía no hay logros disponibles.',
  error: 'No se pudieron cargar los logros. Inténtalo de nuevo.',
});
