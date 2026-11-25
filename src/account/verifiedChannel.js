// Aviso entre pestañas de "email confirmado". La pestaña que canjea el enlace lo anuncia;
// las demás (la del registro, en «Confirma tu email») recargan su estado y entran solas.
// BroadcastChannel es el medio principal; `storage` es el respaldo (navegadores sin BroadcastChannel).

export const CHANNEL_NAME = 'gcb-auth';
export const VERIFIED_KEY = 'gcb.verifiedAt';
/** Lo lee el tutorial (prompt 2) para saber que la cuenta acaba de confirmarse en este navegador. */
export const JUST_VERIFIED_KEY = 'gcb.justVerified';

/** Anuncia la verificación a las demás pestañas del mismo origen. */
export function announceVerified() {
  const stamp = String(Date.now());
  try {
    sessionStorage.setItem(JUST_VERIFIED_KEY, '1');
  } catch { }
  try {
    localStorage.setItem(VERIFIED_KEY, stamp);
  } catch { }
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'verified', at: stamp });
    ch.close();
  } catch { }
}

/** Llama a `onVerified` cuando otra pestaña confirma. Devuelve la función para dejar de escuchar. */
export function onVerified(onVerifiedCb) {
  const cleanups = [];
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (e) => {
      if (e.data?.type === 'verified') onVerifiedCb();
    };
    cleanups.push(() => ch.close());
  }
  const onStorage = (e) => {
    if (e.key === VERIFIED_KEY && e.newValue) onVerifiedCb();
  };
  window.addEventListener('storage', onStorage);
  cleanups.push(() => window.removeEventListener('storage', onStorage));
  return () => cleanups.forEach((fn) => fn());
}

/** true una vez si esta pestaña acaba de confirmar el email (y lo borra). */
export function takeJustVerified() {
  try {
    const v = sessionStorage.getItem(JUST_VERIFIED_KEY) === '1';
    if (v) sessionStorage.removeItem(JUST_VERIFIED_KEY);
    return v;
  } catch {
    return false;
  }
}
