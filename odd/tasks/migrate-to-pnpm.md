# Migración de gestor de paquetes a pnpm

## Objetivo
Migrar el proyecto `golf-cash-battle` de `npm` a `pnpm` de forma limpia, configurando compatibilidad en scripts, dependencias, workflows de GitHub Actions (CI y Pages), documentación y referencias en el código.

## Contexto y Alcance
- **Ruta del proyecto:** `c:\Users\DEV\Desktop\golfito`
- **Gestor objetivo:** `pnpm` (versión instalada en sistema: 11.24.0)
- **Archivos afectados:**
  - `package.json`: Definir campo `packageManager` y configuración de pnpm si aplica.
  - `pnpm-lock.yaml`: Generar mediante `pnpm install` y eliminar `package-lock.json`.
  - `.gitignore`: Asegurar exclusión de logs de pnpm y mantener versionado el lockfile.
  - `.github/workflows/ci.yml`: Integrar `pnpm/action-setup`, cache de pnpm y comandos pnpm.
  - `.github/workflows/pages.yml`: Integrar pnpm en el flujo de despliegue a GitHub Pages.
  - `README.md`: Actualizar guías de instalación y ejecución (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`).
  - `tests/replay.test.js` & comentarios: Actualizar sugerencia de comando de sincronización a `pnpm run sync:functions`.
  - Instrucciones de Git para el usuario (configuración de usuario y push al repositorio remoto).

## Tareas

- [x] **TASK-01**: Configurar `package.json` con `packageManager`, `engines` y actualizar `.gitignore`.
- [x] **TASK-02**: Eliminar `package-lock.json`, configurar `pnpm-workspace.yaml` (aprobación de build script para `esbuild`), generar `pnpm-lock.yaml` con `pnpm install` y verificar compatibilidad.
- [x] **TASK-03**: Adaptar workflows de GitHub Actions (`ci.yml` y `pages.yml`) para usar `pnpm/action-setup@v4`, caché de pnpm y `pnpm install --frozen-lockfile`.
- [x] **TASK-04**: Actualizar documentación en `README.md`, corrección multiplataforma en `scripts/sync-functions.mjs` y mensajes/comentarios en pruebas y funciones de Supabase.
- [x] **TASK-05**: Ejecución satisfactoria de suite completa de pruebas (32/32 tests pasados) y build de producción con Vite (`dist/`). Generar instrucciones de Git para el usuario.

## Modo TDD y Verificación
- TDD: Off (migración de tooling e infraestructura).
- Verificaciones realizadas con éxito:
  - `pnpm install`: OK (0 warnings, resolución rápida con virtual store).
  - `pnpm test`: 32 passed, 0 failed.
  - `pnpm run build`: Generación correcta de bundles en `dist/`.
  - `pnpm run sync:functions`: Sincronización correcta de física y antibot hacia `supabase/functions/submit-hole`.
- Mirror Engram: Pendiente (servidor Engram no disponible en entorno).
