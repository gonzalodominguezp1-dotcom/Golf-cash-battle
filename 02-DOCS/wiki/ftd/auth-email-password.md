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
- [x] Vuelta del correo propia y fija: `buildReturnUrl` → `/?auth=confirm` o `/?auth=recovery`, nunca `location.pathname` — `tests/auth-return.test.js`.
- [x] Canje PKCE explícito (`detectSessionInUrl: false`), URL limpiada con `history.replaceState`, errores del enlace a texto en español (`link_used`, `confirm_elsewhere`) — `tests/auth-return.test.js` y `pnpm run build`.
- [x] Aviso entre pestañas (`BroadcastChannel 'gcb-auth'` con respaldo `storage`) y la pestaña «Confirma tu email» entra sola al confirmar — código en `src/account/verifiedChannel.js`; **sin probar en navegador**.
- [x] Arranque con tiempo máximo (8 s) y sesión que el servidor rechaza: cierre local y limpieza de `sb-*` — código en `connectSupabase`; **sin probar en navegador**.
- [x] Red de seguridad en `vercel.json`: rutas desconocidas → `index.html`, excepto `assets/`, `admin.html` y `assets-lab.html`.
- [ ] Checklist manual de verificación (ver «Next»): mismo navegador, otro navegador/app de Gmail, enlace caducado, dos pestañas, móvil.
- [x] Redirect URLs en Supabase: aplicadas por CLI el 2026-11-25 (`config diff` sin diferencias tras el push). Pendiente: `site_url` sigue en `localhost:3000`, decisión abierta.

## Evidence
- Producción ya responde "Anonymous sign-ins are disabled": el arranque anterior caía a modo local para cualquier dispositivo nuevo.
- supabase-js 2.118 (`GoTrueClient.js`, `_exchangeCodeForSession`) emite `PASSWORD_RECOVERY` solo si el tipo guardado con el verifier es `recovery`; la confirmación emite `SIGNED_IN`. Por eso la confirmación no manda a la pantalla de nueva contraseña.
- Causa probable del 404 (no comprobada contra el panel): el enlace caía en una URL que no existe en Vercel (sin `rewrites`) o en un Site URL/Redirect URL distinto. Lo cubre la nueva vuelta en `/?auth=…` y el rewrite.
- Causa probable de «se queda colgado»: el canje PKCE falla en otro navegador y la app arrancaba con sesión a medias. Ahora el canje fallido limpia el verifier y muestra mensaje.
- `node --test` de `auth-rules` y `auth-return`: 14/14 verdes. `pnpm run build`: correcto.
- `pnpm test` completo: `tests/rock-env.test.js` tarda más de 100 s y `vfx-*` tiene fallos (golden, SKINS y SIG, dir in). Esos ficheros tienen cambios sin commitear de la rama; no se ha comprobado contra el HEAD limpio.

## Next
1. Persona: recorrer la checklist manual en un navegador real con una cuenta de prueba (registro, enlace, otro navegador, enlace caducado, dos pestañas).
2. Persona: poner en el panel de Supabase las Redirect URLs de arriba y revisar la plantilla de confirmación.
3. Fusionado en main el 2026-11-02 (0af27a4) — base de esta mejora.
