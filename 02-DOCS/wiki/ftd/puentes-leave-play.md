---
author: Chakets
branch: main
status: done
---

# Puentes de navegación → `ctx.leavePlay`

## Intent
Quitar `ctx.legacy` (los tres puentes `enterTables`, `enterSettings`, `enterMaps` de `main.js`) y el adaptador de legado de `routes.js`. Las pantallas no necesitan saber de `main.js`: reciben una sola función.

## Scope
- `src/main.js`: `ctx.legacy` → `ctx.leavePlay` (misma secuencia: `leaveFinale()`, `stopLive()`, `releasePlay()`).
- `src/screens/context.js`: valor por defecto `leavePlay: noop`.
- `src/screens/tables.js`, `settings.js`, `maps.js`: `ctx.leavePlay?.()` al entrar.
- `src/screens/routes.js`: `fallbackModule` solo pinta el marcador «en construcción».
- Tests que usaban `ctx.legacy`: `screen-tables`, `screen-maps`, `screen-settings`, `screen-lobby-back`; `screen-host` sirve sus montajes de prueba como módulos de pantalla (`stubs`).
- Fuera: `hub.js` no cerraba la partida antes y no la cierra ahora. `createGoHome` (`playLifecycle.js`) ya hace la misma secuencia y no se toca.

## Checklist
- [x] No queda ninguna referencia a `ctx.legacy` en `src/` ni en `tests/`. Prueba: `git grep "legacy"` sobre `src` y `tests` (solo quedan `legacy` de `ballSkins`/`skinMaterial` y de `settings`, que son otra cosa).
- [x] Suite completa en verde. Prueba: `pnpm test` → 1221 pass, 0 fail.
- [x] Build correcto. Prueba: `pnpm run build`.
- [ ] Comprobación en navegador: entrar en Mesas, Ajustes y Mapas durante un final de partida y con una sala en vivo abierta; el final debe cerrarse y la partida liberarse. **Pendiente**: la herramienta de preview arranca desde la carpeta principal, no desde este worktree.

## Evidence
- Antes del cambio, con `ctx.legacy` retirado sin adaptar los tests: 7 fallos (tests que probaban el puente). Tras adaptarlos: 1221/1221.
- Los ficheros tocados quedan en CRLF, como el resto del repo.

## Next
- Comprobar en pantalla los tres caminos de la checklist.
- Valorar si `createGoHome` debe usar también `ctx.leavePlay` (unificar la secuencia en un único sitio). No es urgente.
