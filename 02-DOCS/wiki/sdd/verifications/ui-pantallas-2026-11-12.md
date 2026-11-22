---
title: Verificación UI por pantallas
description: Línea base (T001) de carga inicial y FPS del lobby antes de tocar código de la spec ui-pantallas.
---

# Verificación ui-pantallas — 2026-11-12

## Línea base (T001)

Commit base: `3d12edf`. `git diff --stat 3d12edf -- src` vacío (sin cambios de producto).

### Carga inicial (AC34)
Método: `pnpm run build` y luego `node scripts/initial-load-size.mjs`. Carga inicial = `<script type="module">` + `<link rel="modulepreload">` de `dist/index.html`; gzip con `zlib.gzipSync` nivel 9. Límite final: base + 15 KB gzip.

| Concepto | Bruto (B) | Gzip (B) |
|---|---|---|
| Entrada (`main-OwEMXhws.js`) | 237039 | 82784 |
| **Carga inicial** (entrada + `rpcError`) | **243226** | **85424** |

`initialHasThree: false` (three se carga por import dinámico).

Chunks (bruto / gzip, B):

| Chunk | Bruto | Gzip | Inicial |
|---|---|---|---|
| three.module | 537288 | 135941 | no |
| main | 237039 | 82784 | sí |
| supabase | 236548 | 61833 | no |
| course | 119705 | 43199 | no |
| ballSkins | 59823 | 20908 | no |
| GolfGame | 68737 | 20519 | no |
| skinFx | 34630 | 11738 | no |
| skinInspector | 14981 | 6720 | no |
| admin | 13637 | 4955 | no |
| textures | 12712 | 4851 | no |
| rpcError | 6187 | 2640 | sí |
| coursePreview | 4889 | 2391 | no |
| skinThumbRender | 1769 | 998 | no |

Los hashes cambian entre builds; comparar por nombre de chunk y por las cifras de entrada/inicial.

### FPS del lobby (línea base)
pendiente: orquestador.

Método (plan §5): pane del navegador a 375×812, lobby actual, `pnpm dev`; pegar en consola, 10 s, anotar la media; repetir con CPU ×4 si el pane lo permite (si no, «no ejecutado»):

```js
await new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; t - t0 < 10000 ? requestAnimationFrame(f) : ok(n / ((t - t0) / 1000)); }; requestAnimationFrame(f); })
```

| Condición | FPS medio |
|---|---|
| 375×812, sin throttling | pendiente |
| 375×812, CPU ×4 | pendiente |
