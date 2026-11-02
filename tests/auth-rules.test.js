import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorCode, authMessage, normalizeEmail, passwordChecks, retryDelayMs, validateEmail, validatePassword } from '../src/account/authRules.js';

test('email: normaliza y valida', () => {
  assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
  assert.equal(validateEmail('ana@example.com'), null);
  for (const bad of ['', 'ana', 'ana@', '@x.com', 'a b@x.com', 'a@x', `${'a'.repeat(250)}@x.com`]) {
    assert.equal(validateEmail(bad), 'invalid_email', bad);
  }
});

test('contraseña: mínimo, letra y número', () => {
  assert.equal(validatePassword('abc12'), 'password_short');
  assert.equal(validatePassword('abcdefgh'), 'password_weak');
  assert.equal(validatePassword('12345678'), 'password_weak');
  assert.equal(validatePassword('golf2026ok'), null);
  assert.equal(validatePassword('contraseña1'), null);
});

test('contraseña: el límite de 72 se cuenta en bytes, no en caracteres', () => {
  assert.equal(validatePassword('a1'.repeat(36)), null); // 72 bytes
  assert.equal(validatePassword('a1'.repeat(36) + 'a'), 'password_long');
  assert.equal(validatePassword('ñ1'.repeat(30)), 'password_long'); // 30 caracteres de 3 bytes
});

test('passwordChecks marca cada requisito', () => {
  assert.deepEqual(passwordChecks('abc'), { length: false, letter: true, digit: false });
  assert.deepEqual(passwordChecks('abcdefg1'), { length: true, letter: true, digit: true });
});

test('errores de Supabase → códigos de la app', () => {
  const cases = [
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'invalid_credentials'],
    [{ message: 'Invalid login credentials', status: 400 }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'email_not_confirmed'],
    [{ code: 'weak_password', message: 'Password should be at least 8 characters' }, 'weak_password'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ message: 'For security purposes, you can only request this after 20 seconds' }, 'rate_limited'],
    [{ code: 'same_password' }, 'same_password'],
    [{ code: 'otp_expired', message: 'Email link is invalid or has expired' }, 'link_expired'],
    [{ message: 'Failed to fetch' }, 'network'],
    [{ message: 'algo raro' }, 'unknown'],
  ];
  for (const [err, code] of cases) assert.equal(authErrorCode(err), code, JSON.stringify(err));
  assert.equal(authErrorCode(null), null);
});

test('todos los códigos tienen mensaje y el de credenciales no delata si el email existe', () => {
  for (const code of ['invalid_credentials', 'email_not_confirmed', 'rate_limited', 'weak_password', 'network', 'unknown', 'nuevo']) {
    assert.ok(authMessage(code).length > 0);
  }
  assert.doesNotMatch(authMessage('invalid_credentials'), /no existe|no registrad|not found/i);
});

test('freno tras fallos seguidos', () => {
  assert.equal(retryDelayMs(0), 0);
  assert.equal(retryDelayMs(2), 0);
  assert.equal(retryDelayMs(3), 1000);
  assert.equal(retryDelayMs(5), 4000);
  assert.equal(retryDelayMs(99), 30_000);
});
