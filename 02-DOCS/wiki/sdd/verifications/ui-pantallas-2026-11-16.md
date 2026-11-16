---
type: verification
title: Verificación de la fase 4 (ui-pantallas) — 2026-11-16
topic: sdd
slug: ui-pantallas
timestamp: 2026-11-16T12:00:00Z
---

# Verificación F4 — 2026-11-16

Rama `la-chaqueta-bionica-ui`, sin push, sin fusionar a `main`. Lo medido aquí es lectura de código, tests y build. **Lo visual lo revisa el humano en navegador** (lista al final).

## Estado de las tareas

| Tarea | Estado | Commit |
|---|---|---|
| T028 Mesas | hecha | `8f3d1e9` (+ ajustes posteriores) |
| T029 Logros | hecha | `a5c2a5c` |
| T030 Amigos y grupo | hecha | `6747df3` |
| T031 Ranking | hecha | `680fc72` |
| T032 Skins | hecha | `b5aff65` |
| T033 Inspector de skin | hecha | `099733f` |
| T034 Cuenta / Perfil (tier 2) | hecha, revisión humana pendiente | `refactor(cuenta)` |
| T035 Monedero (tier 2) | hecha, revisión humana pendiente | `f612060` |
| T036 Progreso | hecha | `923b2c7` |
| T037 Ajustes | hecha | `64864ba` |
| T038 Mapas (desafíos → logros) | hecha | `f5aa0d7` |
| T039 Retirar legado de navegación | **parcial** | `1074f36` (CSS de logros, comentarios); el resto espera decisión |
| Transición entre pantallas | hecha (fuera de la lista original) | `8c6da42` |
| Visor de skins (flechas, efectos 2×2, pantalla completa) | hecha | `d702577`, `ccdbf0b` |
| Recompensas (reveal) y popup de avisos | traídos de `origin/main` | `a66144b`…`c9fdaeb`, `698800d` |
| HUD de partida (FPS, latencia, sin marcador de rivales) | traído de `origin/main` | `50a4367` |
| Botón «Lobby» en las pantallas principales | hecha | `75a5b71` |
| T040 Verificación F4 | este documento | — |
| T041 `version.json` (opcional) | no hecha | — |
| T042 Novedades (opcional) | no hecha | — |
| T043 Manifest y maskable (opcional) | no hecha | — |
| T044 Cierre | tests hechos; móvil real pendiente de publicar | — |

## Medido (automático)

- `pnpm test`: **700/700** en verde.
- `pnpm run build`: correcto (aviso habitual de chunks > 500 kB).
- Carga inicial (`scripts/initial-load-size.mjs`): **83619 B gzip** (línea base T001: 85424; tope AC34 ≈ 100800). `initialHasThree: false`.
- `main.js`: 1734 líneas (antes 2784). Sin `showSettings`, `walletPane` ni `showFreePlayCourseSelect`.
- `vercel.json`: sin cambios respecto a `3d12edf`.
- Grep `desaf.{1,2}o` en `src` e `index.html`: **0 líneas**.
- `:hover` fuera de `@media (hover: hover)` en `src/screens/*.css`: **0**.
- `:hover` en `src/ui/skinInspector.css`: **1 regla heredada** de `origin/main` (el visor 3D no es de F4). Pendiente de limpiar.
- `pnpm audit --prod`: sin vulnerabilidades conocidas (ejecutado antes del último cambio de CSS; repetir en T044).

## Pendiente de medir (no ejecutado aquí)

- Capturas de cada pantalla en 3 medidas: **no ejecutado** (requiere navegador; lo hace el humano).
- FPS de la escena del hub y de la partida: **no ejecutado** (requiere panel visible).
- Recorrido completo con teclado: **no ejecutado**.
- Scripts de 44×44 en consola: **no ejecutado**.

## Bloqueos y decisiones abiertas

1. **T039 parcial.** La cabecera `shell` de matchmaking, sala en vivo y resultados sigue en `main.js`. No es el HUD de partida (ese ya está en `50a4367`). Retirarla cambia cómo se ve la partida; se decide con el humano.
2. **Revisión humana de T034 y T035** antes de fusionar a `main` (contraseña, avatar, KYC, sesión y monedero). Entrada `[blocking]` de T035 pendiente de escribir en `progress/ui-pantallas.md`.
3. **Migración `hole_timer_30.sql`** está en el repo, **no aplicada** en Supabase (necesita permiso explícito).
4. **Prueba en móvil real (T044)**: se hace cuando los cambios estén publicados en `origin/main`.

## Deuda conocida (no bloquea)

- Falta test de la carrera de dos navegaciones seguidas y del fallo de la ruta de legado (`host.js`).
- Tras pulsar una flecha del visor con Enter, el foco vuelve a «Volver».
- Mapas perdió la inclinación holográfica de las tarjetas (`bindHolo`).
- El depósito de Monedero no tiene tope de 8 s (igual que el legado).
- Redirección cripto: acepta cualquier host `https`, no una lista cerrada.
- `settingsPanel.js` mantiene textos fijos en español (lo comparte el modal de pausa).

## Lista para el humano (navegador)

**Escritorio (1280×800):**
- Hub → Mesas, Logros, Amigos, Ranking, Skins, Cuenta, Ajustes, Mapas: entran sin fondo vacío y con transición.
- Botón «Lobby» abajo a la izquierda en cada pantalla principal; vuelve al hub.
- Visor de skin a pantalla completa; flechas ‹ › dan la vuelta; «Probar efectos» en 2×2.
- Partida: FPS y ms arriba, sin chips de rivales.

**Móvil (375×812 y 360×640):**
- «Lobby» abajo a la izquierda sin tapar contenido.
- Visor de skin: «Equipar», flechas y la sección de info sin solapes.
- «Probar efectos»: 4 celdas dentro del visor, etiquetas sin salirse.
- Atrás del navegador desde cualquier pantalla vuelve al hub sin parpadeo.

**Aprobaciones (por escrito en chat, anotar en `decisions.md`):**
- T034 y T035 (Q1).
- Prueba en móvil real tras publicar en `origin/main` (Q2 / T044).
