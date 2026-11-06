# Harness decisions

- Accepted plan `9d1e62f165192059c1c17c917cd81486179b6eb8f19a653029f8a02f8821c66a`.
- Project kind: software.
- SDD: selected.

## Gestor de paquetes: pnpm, nunca npm

- Decisión del usuario (2026-11-06): en este proyecto se usa **siempre pnpm**. No se ejecuta `npm` ni `npx` para nada.
- Instalar: `pnpm install`. Tests: `pnpm test`. Binarios (Supabase CLI, vite): `pnpm exec <bin>` o `pnpm dlx <paquete>`.
- El único lockfile válido es `pnpm-lock.yaml`. No se crea ni se commitea `package-lock.json`.
- Motivo: `npm install` generó un `package-lock.json` redundante junto al `pnpm-lock.yaml` ya versionado.
