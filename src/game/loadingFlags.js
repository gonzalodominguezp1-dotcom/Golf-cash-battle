// Interruptores de la carga de partida (plan carga-partida). Cambiar un valor aquí desactiva la mejora sin revertir código.

/** F2: preparar el hoyo 1 en un contenedor oculto mientras corre la sala (práctica y mesas locales). `?warm=0` lo apaga. */
export const WARM_IN_ROOM = true;
/** F2 en vivo: apagado hasta tener un entorno de pruebas (no hay Supabase de staging). Con false el código existe pero no corre. */
export const WARM_LIVE = false;
/** Espera máxima en la sala a que acabe la preparación antes del «¡YA!» (ms). */
export const HOLD_PRACTICE_MS = 2000;
export const HOLD_LIVE_MS = 1000;
/**
 * F3: un renderer (un contexto WebGL) por partida en práctica, mesas locales y Modo Libre: entre hoyos la canvas
 * pasa a la pantalla nueva y solo cambia la escena. Al volver al hub se libera todo. `?persist=0` lo apaga (camino de F2).
 */
export const PERSISTENT_RENDERER = true;
/** F3: el hoyo siguiente se construye mientras se ve el resultado del actual. Con false (o `?next=0`) solo se reutiliza el renderer. */
export const NEXT_HOLE_PREBUILD = true;
/** F3 en vivo: apagado (no hay entorno de pruebas). Con false el vivo sigue igual: un contexto por hoyo y sin preparar el siguiente. */
export const PERSISTENT_LIVE = false;

/** F5: la sala de práctica y de mesas locales dura como mínimo estos ms desde el clic. 0 (o `?room=old`) = tiempos de antes. */
export const ROOM_MIN_MS = 2500;
/** F5: fuera del vivo, un toque salta la intro de cámara. false = sin salto. En vivo nunca se salta. */
export const INTRO_SKIP = true;

/** `?name=0` en la URL apaga esa mejora (comparación A/B). */
export function urlOff(name, search = typeof location !== 'undefined' ? location.search : '') {
  try {
    return new URLSearchParams(search).get(name) === '0';
  } catch {
    return false;
  }
}
