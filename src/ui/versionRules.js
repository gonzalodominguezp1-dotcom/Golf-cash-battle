// Reglas puras de la comprobación de versión: qué se lee del version.json y cuándo hay build nueva.

/** Cada cuánto se consulta version.json (ms). */
export const VERSION_POLL_MS = 5 * 60 * 1000;
/** Tope de la petición a version.json (ms); pasado el tope se ignora en silencio. */
export const VERSION_FETCH_TIMEOUT_MS = 8000;

/** Valida el contenido de version.json. Devuelve { version, build } o null si no encaja. */
export function parseVersionInfo(data) {
  if (!data || typeof data !== 'object') return null;
  const { version, build } = data;
  if (typeof version !== 'string' || !version) return null;
  if (typeof build !== 'string' || !build) return null;
  return { version, build };
}

/**
 * Hay build nueva si el id servido es distinto del que corre esta pestaña.
 * Sin id conocido (p. ej. en desarrollo) no se puede comparar: devuelve false.
 */
export function isNewBuild(knownBuild, info) {
  if (typeof knownBuild !== 'string' || !knownBuild) return false;
  if (!info || typeof info.build !== 'string') return false;
  return info.build !== knownBuild;
}

/**
 * Qué hacer con el temporizador al cambiar la visibilidad de la pestaña:
 * 'stop' (oculta, estaba corriendo), 'start' (visible, estaba parado) o 'none'.
 */
export function visibilityAction(hidden, running) {
  if (hidden) return running ? 'stop' : 'none';
  return running ? 'none' : 'start';
}
