---
type: progress
title: Pausa — vfx-lab-efectos (cómo retomar)
description: Estado exacto del trabajo del banco de VFX al pausarlo el 2026-11-06, agentes parados, trabajo a medias en disco y pasos para continuar.
tags: [sdd, progress, pausa, vfx]
timestamp: 2026-11-06T23:00:00Z
topic: sdd
slug: vfx-lab-efectos
---

# Pausa — vfx-lab-efectos

Pausado a petición de la persona para no gastar más caché. **No hay nada roto sin explicación**: lo que está en rojo es trabajo a medias de tres agentes parados (ver abajo). Contexto completo en [spec](../specs/vfx-lab-efectos.md), [plan y tareas](../plans/vfx-lab-efectos.md), [análisis](../analysis/vfx-lab-efectos.md) y el [progreso](vfx-lab-efectos.md).

## Dónde estamos

Rama `la-chaqueta-bionica` (worktree `.worktrees/la-chaqueta-bionica`), persona: el compañero. **Sin push a ningún sitio.** Autopilot activo; política de modelos pedida por la persona: Haiku y Sonnet para tareas, **Opus solo para UI, funcionalidad y complejidad**.

| Tarea | Estado |
|---|---|
| T001 banco importa clases reales | hecha |
| T002/T003 esquema puro | hecha (T003 aparcada y aceptada por una persona sin 4.ª revisión) |
| T004 `VfxPlayer` | hecha (su ronda 2 formal se cubre en el cierre de rama) |
| T005 anillos y luces | hecha |
| T006 estados del portal | hecha |
| T007 editor del banco (efectos) | hecha, verificada en el navegador (`selfcheck` 21/21) |
| T008/T009 primera tanda de efectos | commiteada (`640a394`); **arreglo a medias** (ver agente 3) |
| T013 el banco no está en el repo | hecha (Haiku, y verificada a mano) |
| T015 `validateSkin` | hecha (`eb08e1f` + fix `bf92ed7`) |
| T010 presets de skin en `skinFx.js` | **a medias** (agente 2) |
| T011 integración en `GolfGame.js` | **sin empezar** |
| T016 editor de skins del banco, T017 casos límite | **a medias** (agente 1) |
| T012 medir FPS en móvil de gama media | pendiente, **humana** (bloquea `ship`, no el cierre) |
| T014 cierre (tests, build, audit, `verify.sh`) + etapa 5 | pendiente |

Commits de esta feature, del más reciente al más antiguo: `bf92ed7` fix validateSkin · `640a394` primera tanda · `eb08e1f` validateSkin · `b5110f2`/`480c613` docs · `2ece887`/`ecdec25`/`b3be292` portal · `8ee7750`/`0901fac`/`1cbb64e` anillos y luces · `72abc22`/`43e515e`/`06a09b5`/`29ef9cd` esquema y runtime. Suite en el último commit: verde (en el último commit limpio, 279+ pruebas).

## Trabajo a medias en disco (NO commiteado, a propósito)

No se commitea código de agentes sin revisarlo. **No reapear ni limpiar el worktree**: contiene este trabajo.

Worktree `.worktrees/la-chaqueta-bionica`:
- `src/game/render/vfx/schema.js` (+8/−2): campo `rad` admitido y emitido (agente 3).
- `tests/vfx-schema.test.js` (+14) y `tests/vfx-runtime.test.js` (+70): pruebas de `rad` y de `dir: 'in'` escritas **antes** de implementar (rojo esperado).
- `src/game/render/skins/skinFx.js` (+25): hook inerte `vfx` a medias (agente 2).
- `src/game/render/skins/vfxPresets.js` y `tests/vfx-presets.test.js` (nuevos, sin seguimiento): presets de skin (agente 2).
- Estado de la suite al parar: 292 pruebas, 287 verdes, **5 rojas esperadas**: cuatro `dir in con rad…` (falta implementar la semántica en `runtime.js`) y el `golden` de los packs (obsoleto porque el esquema ahora emite `rad`).

Banco `C:\Users\DEV\Desktop\golfito-vfx-lab` (fuera del repo, sin git):
- Nuevos: `src/skinLibrary.js`, `src/skinExport.js`, `test/skinLibrary.test.js`, `test/skinExport.test.js`, `test/skinPreview.test.js`. Cambiados: `src/starter.js` (efectos y skins de ejemplo), `src/library.js`, `test/library.test.js`.
- `src/main.js` **todavía sin la interfaz de skins** (el agente no llegó). Pruebas del banco: 29, 28 verdes, `test/skinPreview.test.js` en rojo (falta implementar).
- Servidor del banco cerrado al pausar; arrancar con `pnpm exec vite --port 5199` dentro del banco.

## Agentes parados (no se pueden reanudar tras reiniciar; relanzar con estos resúmenes)

Aviso aprendido: el orden de los `agentId` devueltos es el orden de las llamadas; verificar siempre de qué agente viene cada informe antes de actuar.

1. **Opus, T016 + T017 del banco.** Debe: biblioteca de skins pura (`skinLibrary.js`, almacenamiento propio, `usingEffect(id)` para avisar al borrar un efecto en uso), exportación de skin bloqueada si `validateSkin` falla, editor de skins (id/nombre, 4 selectores de color, `finish`/`pattern`, seis slots filtrados: aura/trail/roll solo efectos en bucle y hit/wall/sink solo de una vez), vista previa con la paleta de la skin y botones Golpe/Pared/Hoyo, `window.__lab.skinPreview(id)` que devuelva los efectos que suenan, pulido de interfaz (tarjetas plegables, atajos `[` `]`, estrecho y 1280×720), y ampliar `selfcheck()` (AC8, AC13–AC16). Verificar en el navegador con capturas, **en su propia pestaña** (`tabs_create`, `tabId` siempre). Nada dentro del worktree del juego, sin git.
2. **Opus, T010 + T011 en el juego.** T010: presets de skin sin asignar a ninguna skin existente (módulo `vfxPresets.js`, hook inerte `fx.vfxPreset` en `SkinFX`, prueba que fija `SKINS` y `SIG` sin cambios con un fingerprint congelado). T011: un `VfxPlayer` por escena (nivel de `quality().skinFx` y del gobernador, reducción de movimiento de `fxRules`), mapeo evento→efecto en un módulo puro y testeable (`vfx/events.js`: pared→`choque-pared` con la normal y la fuerza, bumper→`choque-bumper`, hoyo→`choque-hoyo`, portal→`portal-entrada` en origen y `portal-salida` en destino, `portal-estable` opcional ≤2 y solo medium/high), el efecto de mundo **sustituye** al soplo genérico y se **suma** al de la skin, semillas deterministas por evento, decidir y justificar qué hacer con las bolas de los rivales, **cero cambios** en `physics.js`, `replay.js`, `courses.js`, **sin destellos de pantalla** (`flashes` solo se valida), verificar en el navegador con `VITE_BACKEND=local pnpm dev` en su propia pestaña y medir el coste por fotograma.
3. **Sonnet, arreglo de la primera tanda (revisión de T009).** Añadir `rad` (distancia de aparición, ≥0, por defecto 0) al emisor; `dir: 'in'` pasa a ser: dirección en cono alrededor de +normal, nace en `origen + d·rad` y se mueve con velocidad `−d·speed` (converge); con `rad` 0 y `spread` 0 se comporta como antes; `rad` en otras direcciones solo desplaza el nacimiento. El empaquetado del runtime lleva el desplazamiento por emisión y `update` sigue sin asignar. Packs: `rad` y `speed` con sentido en todos los emisores `in` (comprobar con un script que las partículas llegan al centro); `portal-estable` sin luz y con dos anillos de suelo escalonados (t=0 y t=duración/2); comentar que el pulso por vuelta de las skins es intencionado. Pruebas: golden sobre el **efecto entero** (sha1 de su JSON) además de las emisiones, distinción solo con propiedades estructurales y en todas las parejas, solo tokens de paleta (sin `#hex`), determinismo que cubra `schema.js`/`runtime.js`/`portalState.js`, y mutantes que muerdan.

## Revisión (ledger) y decisiones

- Ledger de revisión: L1–L37 cerrados (35 `fixed`, 1 `intentional`). **L38–L45 abiertos**: hallazgos de la revisión de T009, se cierran con `npx @ericrisco/rsc review ledger outcome L<n> fixed` cuando el arreglo del agente 3 esté verificado. T009 lleva 1 ronda de 3; T015 ronda 1 (corregida); T010/T011/T016 sin revisar todavía.
- Cola de decisiones (`vfx-lab-efectos.md`): la 9 está cerrada por una persona; siguen como `review-after`: capturas aprobadas de cada efecto (1), cambios de sync de rsc sin commitear (3), asunciones 4–8 de clarify, y **medir FPS en móvil real (T012, humana)**.
- Pendiente fuera del código: reconciliar `02-DOCS/wiki/index.md` con la versión de Chakets antes de fusionar (el hook de knowledge-sync avisó de un choque); en el checkout principal quedan 3 archivos de rsc con cambios solo de saltos de línea.

## Cómo retomar (en este orden)

1. `cd` al worktree, `git status` (debe coincidir con la lista de arriba) y `pnpm test` (esperar exactamente las 5 rojas descritas).
2. Relanzar el agente 3 (Sonnet) con su resumen; al terminar **verificar tú mismo** (pruebas, mutantes, que las partículas convergen) y commitear con rutas explícitas, cerrar L38–L45 y abrir ronda 2 de T009 con un revisor.
3. Relanzar el agente 2 (Opus) para terminar T010 y hacer T011; revisar el diff completo, tier por `rsc risk --base`, un revisor, controles (`pnpm test`, `pnpm run build`, `pnpm audit --prod`), comprobar `git diff --stat` sin tocar física.
4. Relanzar el agente 1 (Opus) para T016/T017; verificar `await window.__lab.selfcheck()` y las capturas.
5. T012 (persona), T014 y etapa 5: `verify` sobre toda la rama, revisión de cierre (incluye releer `flashRate` de T003 y `runtime.js` de T004), `ship`. Antes de fusionar, resolver el `index.md`.
6. Guardar progreso en este mismo archivo y en `vfx-lab-efectos.md`.
