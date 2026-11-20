---
author: Chakets
branch: main
status: in-progress
---

# Limpieza de código obsoleto tras la UI por pantallas

## Intent
Quitar del código lo que ya no usa ninguna pantalla: restos de la antigua barra superior, clases CSS sin marcado y exports sin uso. Sin cambiar el comportamiento visible.

## Scope
- `src/style.css` y `src/ui/skinReveal.css`: reglas cuyos selectores solo usan clases sin marcado en JS/HTML (y el comentario que citaba `.tabbar`).
- `src/game/render/flora.js` (`riverWaterPlane`), `src/game/render/assets/rock.js` (`ROCK_STONE_INFO`), `src/game/render/assets/water.js` (`WATER_LEVELS`), `src/game/render/skins/patterns/index.js` (`registerPattern`), `src/progress/inventory.js` (`COUNTER_KEYS`), `src/progress/skins.js` (`TIER_IDS`), `src/settings/settings.js` (`DEVICES`).
- Fuera de alcance: `02-DOCS/attachments/ui-pantallas/hub-boceto.html` (boceto de diseño, documentación), las 12 skins `patterns/*.js` (se cargan con `import.meta.glob`), `src/lab/` (laboratorio de assets), y `showFreePlayHoleResult` (sí se usa, desde un callback).

## Checklist
- [x] Clases CSS sin rastro en JS/HTML: 27 + `icon-btn` + `balance`. Comprobado con búsqueda por subcadena y por prefijos construidos dinámicamente (p. ej. `hub-ico--${key}`, que se mantiene). Prueba: script de escaneo sobre `src/` y `public/`.
- [x] Exports sin uso fuera de su fichero y sin llamadas internas. Prueba: escaneo de exports y búsqueda por nombre.
- [x] Suite completa en verde tras la limpieza. Prueba: `pnpm test` → 1221 pass, 0 fail.
- [x] Build de producción. Prueba: `pnpm run build` → built.
- [ ] Comprobación visual en navegador de hub, mesas, cuenta, monedero, ajustes, partida y ranking. **Pendiente**: la herramienta de preview arranca siempre desde la carpeta principal, no desde este worktree.

## Evidence
- Base `origin/main` e83d161: `pnpm test` 1221 pass / 0 fail; `pnpm run build` correcto (antes y después de la limpieza).
- Escaneo de CSS tras el cambio: los selectores borrados solo contenían las clases de la lista; las reglas parciales (`.icon-btn:active`, `.pulse-dot`, `.hero-ball-aura` dentro de `@media`) se reescribieron sin esas clases.
- `@keyframes pulse-dot` se conserva: lo usa `.reward-note i`.

## Next
- Revisar en pantalla (lista del checklist) antes de dar la feature por cerrada.
- El `main` local tiene 2 commits de sincronización de docs que no están en `origin/main`; no se han tocado.
