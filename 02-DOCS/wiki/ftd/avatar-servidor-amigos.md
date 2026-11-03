---
author: la-chaqueta-bionica
branch: la-chaqueta-bionica
status: done
merged: 2026-11-03
---

# Avatar guardado en la cuenta y amigos por nombre de usuario

## Intent
La foto de perfil se perdía al volver a entrar: `AvatarStore` solo escribía en `localStorage` (por navegador y origen) y `profiles` no tenía dónde guardarla. Ahora el avatar vive en `profiles.avatar` y se recupera en cualquier dispositivo. Además, se pueden añadir amigos por nombre de usuario.

## Scope
- Dentro: migración `20261103130000_avatar_friends.sql` (columna `avatar`, tabla `friendships`, RPC `set_avatar`, `add_friend`, `respond_friend`, `remove_friend`, `my_friends`, `my_profile` con avatar); `AvatarStore` sincronizado con el servidor (migra el avatar local existente la primera vez); `AccountService`; panel "Amigos" en Cuenta; pruebas.
- Fuera: avatares de otros jugadores en el ranking (`get_ranking` devolvería hasta 50 imágenes), invitar amigos a una mesa, chat, bloqueo de usuarios.
- Decisión: amistad con solicitud (quien añade envía petición, la otra persona acepta o rechaza; si las dos se añaden, queda aceptada). Así nadie aparece en la lista de otro sin permiso.

## Checklist
- [x] Reglas del avatar (formato de red, hidratar desde servidor, subir el local una vez, reintento si falla) — `node --test tests/avatar.test.js`: verde.
- [x] Reglas de amigos del cliente (nombre, mensajes de error) — `node --test tests/friends.test.js`: verde.
- [x] `pnpm test` 167/167 y `pnpm run build` correcto.
- [ ] Panel Amigos y avatar sincronizado — **no visto en el navegador**: la pantalla de Cuenta exige sesión real y el agente no crea cuentas.
- [ ] Migración aplicada en Supabase y recorrido real con dos cuentas: **pendiente de una persona** (el SQL no está probado contra Postgres).

## Evidence
- 167 pruebas pasan (antes 133+; se añadieron 4 de avatar y 3 de amigos).
- El SQL no se ha ejecutado contra Postgres.

## Next
Fusionado en main el 2026-11-03 (cd21bb6).
