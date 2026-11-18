---
author: Chakets
branch: matchmaking-redesign
status: in-progress
---

# Rediseño de la pantalla de matchmaking

## Intent
Pantalla de matchmaking mucho más dinámica y llamativa que motive a entrar a la partida. Espera de sala de 15 s a 10 s.

## Scope
- `src/main.js` (`startMatch`, `showLiveRoom`) y `src/style.css` (bloque `.matchmaking`): nueva UI compartida por práctica y en vivo.
- `supabase/migrations/20261118120000_live_fill_10s.sql`: `live_fill_seconds` 15 → 10.
- Fuera de alcance: lógica de torneos, el 15 de reserva dentro de `join_tournament`.

## Checklist
- [x] Migración 15 → 10 escrita. Prueba: archivo en `supabase/migrations/`.
- [ ] Nueva UI implementada (Opus 5.5, medium). Prueba: diff + `pnpm test` verde.
- [ ] Migración aplicada en producción. Requiere permiso explícito del usuario.
- [ ] Revisión visual por el usuario (móvil y escritorio).

## Evidence
_(pendiente)_

## Next
Esperar al subagente de UI, revisar el diff y pasar tests.
