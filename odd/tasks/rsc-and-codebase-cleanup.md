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
- [ ] `task-3`: Limpieza de código en `src/` y tests (eliminar `ballTexture`, imports no utilizados, deduplicar comprobación de `skinlab` y corregir import estático/dinámico en `matchmaking.js`).
- [ ] `task-4`: Verificación integral de calidad (747 tests pasando, `pnpm build` sin advertencias anómalas y `rsc doctor` limpio).

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada directa / Work-units secuenciales bajo ODD.
- **Engram Mirror**: `odd/rsc-and-codebase-cleanup/tasks` (marcado local/pendiente por disponibilidad de herramienta).
- **Modo TDD**: Functional checks + suite de pruebas automatizadas (`pnpm test`) + verificación de build (`pnpm build`).
