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
- [x] Nueva UI implementada (Opus 5.5, medium). Prueba: `pnpm test` 229/229 verde (observado), sin 15 fijo en `matchmakingView.js`/`matchmakingRules.js`.
- [ ] Migración aplicada en producción. Requiere permiso explícito del usuario.
- [ ] Revisión visual por el usuario (móvil y escritorio).

## Evidence
- Commit `aff636e` en rama `continuar_rediseno_claude`.
- Tests automatizados: 768/768 pasando (`node --test tests/*.test.js`).
- Build verificado: `pnpm build` correcto sin errores._

## Next
Esperar al subagente de UI, revisar el diff y pasar tests.

## Iteración 2 (2026-11-18)
- [x] Gradientes de Mesas (`.tier--*`) y Skins (`.rarity-*`) reutilizados vía variables; práctica usa `.rarity-uncommon`.
- [x] Animación solo con transform/opacity (test sobre `@keyframes`), anillo de cuenta atrás con una animación CSS, pausa con pestaña oculta.
- [x] Botones «Cancelar emparejamiento» y «Volver al lobby» bajo los jugadores; texto legal en botón «i».
- [x] Búsqueda en segundo plano: `src/match/matchmakingController.js` + aviso superior `src/ui/matchmakingBanner.js`.
- [x] Rediseño de tarjeta de bote (`.mm-pot`): tamaño reducido a una sola línea horizontal (layout horizontal en flex: label + cifra + nota) con padding compacto para garantizar vista sin scroll en móvil.
- [x] Ajuste responsive móvil: radar reducido de `clamp(210px, 64vw, 270px)` a `clamp(160px, 44vw, 230px)` y márgenes compactos para eliminar scroll vertical en dispositivos móviles.
- [x] Tips de ánimo (`.mm-hype`): tiempo de permanencia (`HYPE_MS`) subido de 2800 ms a 6000 ms (6 s) para lectura cómoda.
- [x] Título de sala en vivo actualizado a «BUSCANDO RIVALES» en lugar de «SALA EN VIVO».
- [x] Resolución de fallo en arranque (`tournaments.start`):
  - En `matchmakingController.js`: si `launch()` falla, la búsqueda pasa a fase `error` (limpiando `launchP` para permitir reintentos), y `cancel()` permite cancelar cuando `['search', 'error'].includes(s.phase)`.
  - En `main.js`: `retryMsg` ofrece botón secundario de «Cancelar y salir» que ejecuta `search.cancel()` devolviendo la entrada y cerrando limpiamente la búsqueda huérfana.
  - En `matchmakingBanner.js` y `matchmakingRules.js`: el banner detecta la fase `error` (`is-error`), muestra el estado de error y mantiene habilitada la `X` para cancelar y devolver la entrada.
- [x] Tests añadidos en `tests/matchmaking-controller.test.js` y `tests/matchmaking-banner.test.js` verificando cancelación tras fallo en `launch()`, reintento de arranque y cancelación desde el banner.
- Evidencia: tests de matchmaking 27/27 y suite general 768/768 verde, `pnpm build` ok en 1.44s.
