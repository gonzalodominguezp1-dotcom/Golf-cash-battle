// Reglas de las pantallas de entrada. Sin DOM ni red para poder probarlas con node --test.
// El servidor (Supabase Auth) repite estas reglas: aquí solo se avisa antes de gastar una petición.

export const PASSWORD_MIN = 8;
// bcrypt, que usa Supabase, ignora lo que pase de 72 bytes
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

export function validateEmail(email) {
  const e = normalizeEmail(email);
  return e.length > 0 && e.length <= EMAIL_MAX && EMAIL_RE.test(e) ? null : 'invalid_email';
}

/** null si vale; si no, el código del primer fallo. */
export function validatePassword(password) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return 'password_short';
  if (new TextEncoder().encode(p).length > PASSWORD_MAX_BYTES) return 'password_long';
  if (!/\p{L}/u.test(p) || !/\p{N}/u.test(p)) return 'password_weak';
  return null;
}

/** Los tres requisitos a la vista mientras se escribe. */
export function passwordChecks(password) {
  const p = String(password ?? '');
  return {
    length: p.length >= PASSWORD_MIN,
    letter: /\p{L}/u.test(p),
    digit: /\p{N}/u.test(p),
  };
}

/**
 * Convierte un error de supabase-js en un código estable de la app.
 * Nunca distingue "el email no existe" de "la contraseña es mala": quien ataca no debe poder
 * averiguar qué emails tienen cuenta.
 */
export function authErrorCode(error) {
  if (!error) return null;
  const code = String(error.code ?? '').toLowerCase();
  const msg = String(error.message ?? '').toLowerCase();
  const status = error.status;
  if (code === 'email_not_confirmed' || /email not confirmed/.test(msg)) return 'email_not_confirmed';
  if (code === 'invalid_credentials' || /invalid login credentials/.test(msg)) return 'invalid_credentials';
  if (code === 'weak_password' || /password.*(weak|short|least|characters)/.test(msg)) return 'weak_password';
  if (code === 'same_password' || /different from the old/.test(msg)) return 'same_password';
  if (/over_.*rate_limit|rate_limit/.test(code) || status === 429 || /rate limit|too many|security purposes|seconds/.test(msg)) return 'rate_limited';
  if (code === 'user_already_exists' || code === 'email_exists' || /already (registered|been registered)/.test(msg)) return 'email_taken';
  if (code === 'otp_expired' || code === 'flow_state_not_found' || /expired|invalid.*(token|link|code)/.test(msg)) return 'link_expired';
  if (code === 'signup_disabled' || /signups? not allowed/.test(msg)) return 'signup_disabled';
  if (code === 'captcha_failed' || /captcha/.test(msg)) return 'captcha_failed';
  if (/fetch|network|failed to/.test(msg) || status === 0) return 'network';
  return 'unknown';
}

export const AUTH_MESSAGES = {
  invalid_email: 'Escribe un email válido.',
  password_short: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`,
  password_long: 'La contraseña es demasiado larga (máximo 72 caracteres).',
  password_weak: 'Usa al menos una letra y un número.',
  weak_password: `Contraseña demasiado débil: mínimo ${PASSWORD_MIN} caracteres con letras y números.`,
  password_mismatch: 'Las contraseñas no coinciden.',
  same_password: 'La contraseña nueva debe ser distinta de la anterior.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Todavía no has confirmado tu email. Revisa tu bandeja de entrada.',
  rate_limited: 'Demasiados intentos. Espera un momento y vuelve a probar.',
  link_expired: 'El enlace ha caducado o ya se usó. Pide uno nuevo.',
  signup_disabled: 'El registro está cerrado ahora mismo.',
  captcha_failed: 'No hemos podido comprobar que eres una persona. Recarga e inténtalo otra vez.',
  network: 'Sin conexión con el servidor. Comprueba tu internet.',
  unknown: 'Algo ha fallado. Inténtalo otra vez.',
};

export const authMessage = (code) => AUTH_MESSAGES[code] ?? AUTH_MESSAGES.unknown;

/** Espera obligada (ms) antes del siguiente intento tras `failures` fallos seguidos. Freno en el cliente; el límite real lo pone Supabase. */
export function retryDelayMs(failures) {
  if (failures < 3) return 0;
  return Math.min(30_000, 1000 * 2 ** (failures - 3));
}
