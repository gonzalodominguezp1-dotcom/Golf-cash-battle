# Flujo de trabajo y despliegue

## Ramas y PR

- El equipo trabaja en una rama y abre un PR contra `main`.
- Cada PR tiene su vista previa en Vercel.
- Al fusionar en `main`, Vercel publica la web.
- La constitución (sección 4) define las reglas de ramas y entregas.

## CI

GitHub Actions (`.github/workflows/ci.yml`) ejecuta:

1. `pnpm test`
2. `pnpm run build`
3. `deno check` sobre las Edge Functions

Antes de dar algo por terminado, el flujo SDD también pide `pnpm audit --prod` (ver `sdd/config.yaml`).

## Comandos

```bash
pnpm install             # instalar dependencias
pnpm dev                 # servidor de desarrollo; muestra una URL "Network" para el móvil
pnpm test                # pruebas de juego, economía, progreso, antibots y skins
pnpm run build           # build de producción
pnpm run sync:functions  # copia la física a las Edge Functions
```

Para jugar sin servidor: `VITE_BACKEND=local pnpm dev`. Sin configurar nada, `pnpm dev` usa el backend de producción.

## Panel de administración

En `/admin.html`.

## Secretos

- Los secretos van en variables de entorno o en los secrets del proveedor (Supabase, Vercel).
- `.env` no se versiona.
- Lista de secrets por función en [Backend en Supabase](../backend/supabase.md).

## Lo que hay que hacer tras cada cambio

- Cambio de base de datos: migración nueva en `supabase/migrations/` y aplicarla en Supabase.
- Cambio en la física o en los hoyos: `pnpm run sync:functions` y redespliegue de `submit-hole`.
- Cambio en una Edge Function: redespliegue de esa función.
