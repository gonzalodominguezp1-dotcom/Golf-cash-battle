---
author: la-chaqueta-bionica
branch: la-chaqueta-bionica
status: done
merged: 2026-11-02
merged_by: Chakets
---

# Login y registro con email y contraseña

## Intent
Pantalla de entrada obligatoria (login, registro, recuperar contraseña) con Supabase Auth y email + contraseña. Google va después. La sesión queda guardada en el dispositivo.

## Scope
- Dentro: `AuthService`, `authRules`, `authScreen`, cambio de contraseña en Cuenta, fin del invitado anónimo automático, cabeceras de seguridad, auditoría SQL, docs.
- Fuera: Google OAuth, CAPTCHA, ajustes del panel de Supabase (los hace una persona con acceso), commit/PR.

## Checklist
- [x] Reglas puras (email, contraseña 8+ con letra y número, límite 72 bytes, mapeo de errores) — `node --test tests/auth-rules.test.js`: 7 pruebas verdes.
- [x] Sin sesión se ve el login; registro valida en cliente — comprobado en el navegador (checklist de contraseña, error de email).
- [x] Credenciales falsas dan "Email o contraseña incorrectos." sin delatar cuentas — probado contra Supabase real.
- [x] CSP aplicada (build servido con las cabeceras de `vercel.json`): login y visor 3D sin violaciones.
- [x] `pnpm test` 133/133 y `pnpm run build` correcto.
- [ ] Registro real, confirmación por email y recuperación: **no probado** (no se crean cuentas desde el agente). Pendiente de que una persona lo recorra.
- [ ] Ajustes de Auth en el panel de Supabase (lista en `02-DOCS/wiki/backend/supabase.md`).
- [ ] Ejecutar `supabase/audit/auth_security_audit.sql` y corregir lo que devuelva.

## Evidence
- Producción ya responde "Anonymous sign-ins are disabled": el arranque anterior caía a modo local para cualquier dispositivo nuevo.
- Con PKCE, supabase-js 2.118 emite `PASSWORD_RECOVERY` al canjear el código (`GoTrueClient.ts`, `_exchangeCodeForSession`).

## Next
Fusionado en main el 2026-11-02 (0af27a4).
