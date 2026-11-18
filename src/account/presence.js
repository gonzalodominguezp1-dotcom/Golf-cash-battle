// Latido de presencia: mientras la app está abierta con sesión, avisa al servidor de que el jugador está conectado.
// El servidor lo considera conectado si hubo un latido en los últimos 90 s (ver migración presence_online_friends).
export const PRESENCE_MS = 30000;

/** startPresence(account) -> stop(). Un fallo de red no se muestra: el siguiente latido lo vuelve a intentar. */
export function startPresence(account, every = PRESENCE_MS) {
  const beat = () => { Promise.resolve().then(() => account.touchPresence()).catch(() => {}); };
  beat();
  const id = setInterval(beat, every);
  return () => clearInterval(id);
}
