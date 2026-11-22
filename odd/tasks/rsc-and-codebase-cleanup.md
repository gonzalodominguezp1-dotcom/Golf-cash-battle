# Feature: Limpieza y Depuración de Infraestructura RSC y Código

## Objetivo
Realizar una depuración y saneamiento integral de la infraestructura RSC y del código del repositorio:
- Purgar backups obsoletos de `.rsc/backups/`, archivos `.tmp` residuales y worktrees huérfanos/limpios.
- Alinear configuración de skills y eliminar advertencias de `rsc doctor`.
- Purgar assets huérfanos/duplicados en `public/` y trasladar assets de herramientas fuera del bundle cliente.
- Eliminar código muerto (`ballTexture`, imports no usados, lógica redundante de `skinlab`, warnings de chunking).
- Purgar scripts rotos o de plantilla vacía (`01-TOOLS/_TEMPLATE/`, `icons-mockup.mjs`).
- Validar la integridad total del juego mediante la suite completa de tests (747 tests) y build de producción.

## Checklist de Tareas
- [x] `task-1`: Saneamiento de infraestructura RSC (purgar backups antiguos en `.rsc/backups`, archivos `.tmp` en memoria, locks obsoletos, worktree dormido y sync de skills) — Commit: `6b7f714`.
- [x] `task-2`: Saneamiento de assets en `public/` y scripts auxiliares (eliminar `logo-black-gold.png`, `logo-square.png`, reubicar `logo.png`, purgar `01-TOOLS/_TEMPLATE/` y `icons-mockup.mjs`) — Commit: `0e629ab`.
- [x] `task-3`: Limpieza de código en `src/` y tests (eliminar `ballTexture`, imports no utilizados, deduplicar comprobación de `skinlab` preservando estabilidad con ramas de matchmaking activas) — Commit: `791005f`.
- [x] `task-4`: Verificación integral de calidad (747 tests pasando, `pnpm build` sin errores y `rsc doctor` limpio) — Commit: `791005f`.

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada directa / Work-units secuenciales bajo ODD.
- **Engram Mirror**: `odd/rsc-and-codebase-cleanup/tasks` (marcado local/pendiente por disponibilidad de herramienta).
- **Modo TDD**: Functional checks + suite de pruebas automatizadas (`pnpm test`) + verificación de build (`pnpm build`).
- **task-1 completada**: Purgados 13 backups antiguos en `.rsc/backups/`, 9 archivos `.tmp` en presencia/sesiones, locks obsoletos `.team-safe-3*`, removido worktree inactivo `.worktrees/la-chaqueta-bionica-skins` (liberados ~171,8 MB). Ejecutado `rsc sync` para resolver discrepancia de `security-audit`.
- **task-2 completada**: Eliminados `public/logo-black-gold.png` (duplicado) y `public/logo-square.png` (huérfano). Reubicado `public/logo.png` a `scripts/assets/logo.png` y actualizado `make-banderin.mjs` (ahorro ~6,1 MB en assets no servidos al cliente). Eliminada carpeta plantilla vacía `01-TOOLS/_TEMPLATE/` y script roto `scripts/icons-mockup.mjs`.
- **task-3 completada**: Eliminado código muerto `ballTexture` en `textures.js`, eliminados imports estáticos no utilizados en `coursePreview.js`, `freeplay.test.js`, `screen-maps.test.js` y `route-planner.mjs`. Deduplicada la comprobación de `?skinlab=1` en `perfGovernor.js` exportando `isSkinLabRequested`.
- **task-4 completada**: Verificación global completada con éxito. Suite de pruebas ejecutada con 747/747 tests pasando (0 fallos). Build de producción con Vite completado en 1.48s (`dist/` saneado). Diagnóstico `rsc doctor` 100% saludable sin alertas pendientes.
