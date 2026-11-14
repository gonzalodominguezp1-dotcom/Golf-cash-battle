---
type: progress
title: Pausa — UI por pantallas (cómo retomar)
description: Estado exacto de la feature ui-pantallas y pasos para retomarla en una sesión nueva sin releer la conversación.
tags: [sdd, progress, pausa, ui-pantallas]
timestamp: 2026-11-12T18:00:00Z
topic: sdd
slug: ui-pantallas
---

# Pausa — UI por pantallas

> Pausado el 2026-11-12 por límite de uso del humano. Retomar desde aquí: **no hace falta releer la conversación**.

## Dónde está el trabajo

- **Worktree:** `C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica-ui`
- **Rama:** `la-chaqueta-bionica-ui` (sub-rama de `la-chaqueta-bionica`, del humano Chakets). Base: `3d12edf` (main local, **sin subir**). Sin push. Al terminar se fusiona en `la-chaqueta-bionica`.
- **No tocar** el worktree `.worktrees/la-chaqueta-bionica`: tiene trabajo VFX a medias de otra tarea (27 commits sin subir y cambios sin guardar).
- **Persona:** Chakets → rama `la-chaqueta-bionica`. Perfil técnico. Responde en español.

## Artefactos (leer solo lo necesario)

| Artefacto | Estado |
| --- | --- |
| `02-DOCS/wiki/sdd/specs/ui-pantallas.md` | **approved** (Clarifications C1-C13 mandan sobre el cuerpo) |
| `02-DOCS/wiki/sdd/plans/ui-pantallas.md` | plan + tabla T001-T044 + «Interfaces por tarea»; corregido tras analyze |
| `02-DOCS/wiki/sdd/analysis/ui-pantallas.md` | GO con arreglos (H1-H6 aplicados al plan) |
| `02-DOCS/wiki/sdd/verifications/ui-pantallas-2026-11-12.md` | línea base de build (T001) |
| `02-DOCS/wiki/sdd/decisions.md` | decisiones de spec, clarify y plan |

## Tareas

- **Hecha:** T001 (`2222714`) — línea base: carga inicial **85424 B gzip** (entrada `main` + `rpcError`), sin three. Tope AC34 ≈ 100,8 KB gzip. 223 tests en verde.
- **Hechas F1 (2026-11-13):** T002 `23e4b3f`, T003 `bac2e0f`, T004 `6686eaf`, T005 `43446bd`, T006 `4c15062`, T007 `5636677`, T008 `996ecf0`. `pnpm test` 303/303. T007: sin comparar recuentos de DOM «antes» ni 375×812 (solo sin errores de consola en lobby, Skins y Cuenta a 1024 px).
- **Hechas F1 serie (2026-11-13):** T009 `3191526`, T010 `e9731a9`, T011 `61267ac`. `pnpm test` 323/323. Carga inicial **91051 B gzip** (base 85424; tope ≈100800), sin three.
- **F2 completa en código (2026-11-14):** T013-T021 commiteadas (último `d813d5d`), T018 aprobada. `pnpm test` 427/427. Carga inicial **92821 B gzip** (tope ≈100800), `initialHasThree: false`. T022: `02-DOCS/wiki/sdd/verifications/ui-pantallas-2026-11-14.md` con lo medido y la lista de 24 comprobaciones en navegador para el usuario (incluye FPS de la escena y Slow 3G del splash).
- **T018 aprobada** por el usuario el 2026-11-14 (ver `decisions.md`).
- **F3 completa en código (2026-11-14):** T023 `cce0e14`, T024 aprobada con ajustes (`1b458b9`), T025 `2d71d6d`, T026 `c8890b7`. `pnpm test` 447/447. Carga inicial **93517 B gzip** (tope ≈100800), `initialHasThree: false`. T027: `02-DOCS/wiki/sdd/verifications/ui-pantallas-2026-11-14-fase3.md` con lo medido y 14 comprobaciones en navegador para el usuario (FPS del hub con la escena incluidos). Nota: tras una partida el hub usa la imagen fija (la escena se libera al empezar la partida); recrearla es una tarea aparte.
- **Siguiente:** el usuario verifica F1 (T012), F2 (T022) y F3 (T027). Después F4: T028 (Mesas), T029 (Logros, paralela), T030 (Amigos y grupo), T031 (Ranking), T032 (Skins), y luego T033+ hasta T044. T034/T035 son tier 2 (contraseña, KYC, monedero): revisión humana obligatoria antes de fusionar a main; T044 es prueba en móvil real.
- **Lista T012 para el usuario (navegador, `vite-ui-pantallas` en :5180):** (1) Ranking → `#/ranking`; Atrás y Esc vuelven al lobby; Atrás en el lobby no sale de la app. (2) Recargar en `#/ranking` deja Ranking con el lobby debajo. (3) Transición ~200 ms (≤80 ms con movimiento reducido). (4) Atajos 1-6 y M; saldo → Cuenta › Monedero `#/cuenta/monedero`. (5) `#hoyo3` arranca el hoyo 3 en Práctica, también tras navegar; `#hoyo3-empate`; `?skinlab=1`. (6) Ajustes › Volver → lobby; avisos de amistad e invitación abren Cuenta y Lobby. (7) Pulsar 4 y enseguida 2 (o 4 y Esc) con Ranking lento: queda el último destino sin Ranking encima; dos atajos seguidos no pierden ninguno. (8) Mesa en vivo: Atrás/Esc piden confirmación; aceptar vuelve al lobby y cuenta como abandono; cancelar se queda; en juego libre/práctica no pide nada; en hoyo, Atrás abre la pausa. (9) Grupo: invitar/aceptar sigue funcionando y al entrar en un torneo se abre la sala. (10) 3 hoyos de juego libre: el contador de listeners `keydown` no crece; R y pantalla completa funcionan. (11) Consola sin errores; sin scroll horizontal en 375×812; recuentos de `.card,button,img,h1,h2,h3` del lobby iguales a la base (T001/T007).
- **Nota:** T011 debe usar `createNotifier`/`createPartyWatch` (T006); `onNewMatch` sin suscriptores no marca el torneo como visto.
- **Cambios del plan tras analyze (`101fc1f`):** T014 y T020 se dividieron en T014a/b y T020a/b (sin renumerar). `routes.js` y `account.js` cargan pantallas y pestañas con `import.meta.glob` (un `import()` a un archivo que no existe rompe el build). Umbral de FPS en T014b (≥55 medium, ≥45 low, panel visible). T034/T035 son tier 2.
- **Decision queue:** vive al final de este archivo. Cuando T034 pida `progress/ui-pantallas.md`, créalo copiando esa sección.
- **Paradas humanas acordadas (solo estas 2):** T018 (boceto del splash) y T024 (boceto del hub). Además, antes de fusionar a main: revisión humana de T034/T035 (tier 2: contraseña, KYC, monedero) y prueba en móvil real (T044).
- **Al terminar todo:** avisar al humano para que lo pruebe él visualmente y explore los menús.

## Cómo se ejecuta (reglas del humano)

1. **Cada tarea la ejecuta un subagente `developer` de contexto limpio** con el brief de abajo + «TU TAREA: Txxx». Modelo: `sonnet` para tareas normales; el modelo por defecto (opus) para router (T002, T010), escena 3D (T014, T015), splash (T019-T021) y hub (T025, T026).
2. Tareas tier 1: **un revisor de contexto limpio** (`refuter-correctness` o general con `sonnet`) sobre el diff antes del commit. Tier 0 (docs): sin revisor.
3. **El orquestador hace los commits** (los subagentes no): `git add <archivos de la fila>`; mensaje con gitmoji + Conventional Commits en español (`✨ feat(router): …`, `✅ test…`, `📝 docs…`, `🔧 chore…` — el hook rechaza mensajes sin gitmoji válido). Autor Chakets, sin trailers de IA, sin push.
4. El navegador lo usa solo el orquestador, en las tareas de verificación (T012, T022, T027, T040, T044).
5. Lecturas y trabajo pesado → subagentes haiku/sonnet para no gastar contexto del orquestador.

## Vista previa

- `C:\Users\DEV\Desktop\golfito\.claude\launch.json` tiene la config **`vite-ui-pantallas`**: `pnpm -C .worktrees/la-chaqueta-bionica-ui exec vite --port 5180 --strictPort` con `VITE_BACKEND=local` (modo demo sin login; el modo normal pide credenciales del Supabase real y no se pueden meter).
- Arranque: `preview_start {name: "vite-ui-pantallas"}` → http://localhost:5180.
- **FPS:** con el panel del navegador oculto, rAF baja a 1 fps → la medida no vale. Medir solo con el panel visible (pedírselo al humano). El panel no permite throttling de CPU: anotarlo como «no ejecutado».
- La línea base de FPS del lobby (T001) sigue **pendiente**: medir en T012 con el panel visible, *antes* de que el hub cambie el lobby (o con `git stash`-free: checkout de `3d12edf` en un worktree temporal).

## Brief para cada subagente ejecutor (copiar tal cual)

```text
Eres el ejecutor de UNA tarea del plan ASDD de golf-cash-battle (minigolf 3D, Vite 5 + Three.js 0.169 + Supabase, JS vanilla). Tienes contexto limpio: todo lo que necesitas está en el repo.

- Worktree (trabaja SOLO aquí): C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica-ui . No toques C:\Users\DEV\Desktop\golfito ni otros worktrees.
- Usa siempre pnpm (pnpm test, pnpm run build, pnpm exec). Nunca npm/npx.

Lee, en este orden y solo lo necesario:
1. Plan: 02-DOCS/wiki/sdd/plans/ui-pantallas.md → §0 (restricciones globales), las secciones de §2-§5 que afecten a tu tarea, TU fila en la tabla «Tasks» y TU bloque en «Interfaces por tarea».
2. Spec: 02-DOCS/wiki/sdd/specs/ui-pantallas.md → solo los criterios de aceptación que cite tu fila y las Clarifications C1-C13 (mandan sobre el cuerpo).
3. El código que vayas a tocar (lecturas parciales).

Reglas:
- TDD: si tu tarea tiene test, escríbelo primero, compruébalo en rojo y luego en verde.
- Toca solo los archivos de tu fila. Si necesitas otro, hazlo mínimo y justifícalo en el informe.
- Prohibido: cambiar física, economía, RLS, Supabase/Edge Functions, vercel.json; añadir dependencias; textos en inglés en la UI.
- Puede haber otras tareas trabajando a la vez en el mismo worktree: no reviertas, formatees ni borres archivos ajenos a tu tarea.
- NO hagas git commit, git stash, git checkout, git reset ni push: el orquestador hace el commit.
- No uses el navegador salvo que tu done-check lo exija de forma explícita; la verificación visual la hace el orquestador.
- Ejecuta el done-check LITERAL de tu fila, más `pnpm test` (y `pnpm run build` si tocaste src/, index.html, public/ o vite.config.js).

Devuelve en español, breve (≤25 líneas):
- Archivos creados/modificados (con líneas aprox. de diff).
- Salida resumida del done-check y de pnpm test/build (nº de tests, pasa/falla). Lo que no se ejecutó, dilo como «no ejecutado».
- Desviaciones del plan y por qué.
- Riesgos o cosas que el orquestador debe verificar en navegador.

TU TAREA: Txxx
```

## Prompt para retomar (pegar en una sesión nueva)

```text
Retoma la feature ui-pantallas de golf-cash-battle. Lee SOLO 02-DOCS/wiki/sdd/progress/ui-pantallas-pausa.md en el worktree C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica-ui y sigue sus reglas: orquestas, cada tarea la hace un subagente developer de contexto limpio, tú revisas y commiteas. Empieza por la F1 en paralelo (T002-T008).
```

## Decision queue

- [blocking] Q1 — Revisión humana de T034/T035 (contraseña, KYC, monedero: B4.3) antes de fusionar a main, plan tier 2, T034/T035
- [blocking] Q2 — Prueba del humano en móvil real (Q2.5) antes de fusionar a main, constitución Q2.5, T044
- [review-after] Q3 — Excepción U6.6 (sin botón de silencio en el hub) decidida por el humano en C11; se anota en la constitución en T008, T008
- [review-after] Q4 — El saldo sigue en la cabecera de Mesas y en Cuenta (suposición de C11), spec C11, T028
- [review-after] Q5 — Splash sin tope duro: con `session` marcada y sin `hub` no hay error ni «Reintentar» (el plan §3.10 lo fija; AC28 podría pedir un tope también ahí, p. ej. error a 30 s), T019/T021
- [review-after] Q6 — TIP del splash: solo el primero sale del boceto; los otros tres (pendiente, arrastre, práctica gratis) son provisionales del ejecutor, T019/T020b
