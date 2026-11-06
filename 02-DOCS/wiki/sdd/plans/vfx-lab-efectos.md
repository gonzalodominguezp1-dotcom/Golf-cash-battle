---
type: plan
title: Plan — Banco de VFX y efectos de portales, choques y skins
description: HOW del banco de VFX y de la primera tanda de efectos: arquitectura, contratos, pruebas, secuencia y riesgos.
tags: [sdd, plan, vfx, skins, portales]
timestamp: 2026-11-06T19:00:00Z
topic: sdd
slug: vfx-lab-efectos
status: draft
---

# Plan — Banco de VFX y efectos de portales, choques y skins

> Slug: `vfx-lab-efectos` · Spec: [vfx-lab-efectos](../specs/vfx-lab-efectos.md) · Rama: `la-chaqueta-bionica` (worktree `.worktrees/la-chaqueta-bionica`, aislamiento ya cumplido)
> Inherits: [constitution](../constitution.md)

## 0. Global constraints
Valores que toda tarea respeta, tal cual:
- Presupuesto de partículas por calidad: `low` 40, `medium` 120, `high` 300 (los de `LEVELS` en `skinFx.js`). Un efecto declara `maxParticles` y nunca lo supera ni sube el del nivel.
- Reducción de movimiento: con ella activa, el efecto sale quieto o atenuado como una skin actual (`STILL_TIME` = 1,2 s, `reducedMotion()` de `fxRules.js`).
- Ningún destello de pantalla completa más de 3 veces por segundo (U6.6).
- Lo visual nunca toca `physics.js`, `replay.js` ni `courses.js`, ni cambia el resultado de un tiro (Q2.4). `physics.js` no importa Three.js (C1.4).
- Los módulos nuevos van en `src/game/render/` (K3.4). Sin carpetas nuevas de nivel superior.
- El banco no entra al repo ni a su build. Nada de `golfito-vfx-lab` en `git status`.
- Commits: gitmoji + Conventional Commits, autoría Chakets o La Yuinta, sin trailers de IA (K3.5). Rama `la-chaqueta-bionica`, sin push a `main` ni a la rama del otro.
- Gestor: pnpm. Nunca npm/npx para instalar. Dependencia nueva solo si se justifica y sin CVE (S5.2). Este plan no añade ninguna al juego.
- `pnpm test` y `pnpm run build` en verde antes de fusionar (Q2.1). Medición de FPS anotada en el PR (P7.5).

## 1. Context & constraints
- El juego ya tiene un sistema de efectos de skin declarativo: emisores `P(cell, n, speed, spread, size, life, col, extra)`, firmas por skin (`SIG` en `skinFx.js`), niveles `low/medium/high`, gobernador de rendimiento y reducción de movimiento (`fxRules.js`, probado en `tests/skin-fx-rules.test.js`). Cita: spec §What it must respect.
- Los choques de mundo usan `Particles` y `Shockwaves` de `effects.js`; `Particles` usa `Math.random()` y `Shockwaves` solo dibuja anillos planos en el suelo. Cita: spec §Clarifications, punto de la semilla.
- Los portales (`portal.js`) son espirales de plasma en el suelo con un solo estado estable; el juego los dispara con `cyberFx.onPortal` y `sfx.portal()` en `GolfGame.js` (~1362).
- Los eventos que sí existen como disparadores: golpe, pared, bumper, borde del hoyo y hoyo (`skinFx.onHit/onWall/onBumper/onLip/onSink`). No existe colisión bola contra bola. Cita: spec §Points to clarify, decisión diferida.
- El banco vive fuera del repo en `C:\Users\DEV\Desktop\golfito-vfx-lab`, con Vite y three 0.169 propios. Hoy usa un motor propio (`engine.js`) con seis efectos de prueba.

## 2. Architecture

```text
 banco (fuera del repo)                              juego (repo, rama la-chaqueta-bionica)
 ┌──────────────────────────┐   importa por ruta   ┌─────────────────────────────────────┐
 │ Editor: lista, CRUD,     │ ───────────────────▶ │ vfx/schema.js   (puro, sin three)    │
 │ parámetros, medidor      │                      │ vfx/runtime.js  (three)              │
 │ Escena a escala de campo │ ───────────────────▶ │ effects.js, textures.js (existentes) │
 │ Biblioteca JSON local    │                      │ vfx/packs/*.js  (efectos aprobados)  │
 └───────────┬──────────────┘                      └───────────────┬─────────────────────┘
             │ exporta .js (revisable)                             │ usa
             └─────────────────────────────────────▶ PR ──▶ GolfGame.js / skinFx.js / portal.js
```

Componentes, una responsabilidad cada uno:
- **`vfx/schema.js` (interno, puro, sin Three.js).** Define qué es un efecto, lo valida, calcula su presupuesto por calidad, aplica reducción de movimiento, comprueba la tasa de destellos y produce la lista de emisiones en el tiempo con un generador con semilla. Es la pieza que se prueba con `node --test`.
- **`vfx/runtime.js` (interno, usa Three.js).** Reproduce un efecto: traduce la lista de emisiones a las clases reales `AdditiveParticles`, `GroundDecals`, anillos y destellos de luz. Añade lo que falta: anillo orientado sobre una pared. No modifica `effects.js`.
- **`vfx/packs/` (datos).** La primera tanda y cualquier efecto aprobado, como archivos que exportan definiciones de efecto. Es lo único que viaja del banco al juego.
- **Portal con estados.** Una envoltura sobre `buildPortal` que añade entrada, estable y salida, sin cambiar la llamada actual.
- **Banco (externo).** Importa `schema.js`, `runtime.js` y las clases del juego desde la ruta del repo. Aporta la interfaz de edición, la biblioteca JSON y la exportación. No contiene lógica de efecto propia.

**La decisión que más pesa:** el efecto es **datos puros interpretados por un runtime compartido**, y el banco importa ese mismo runtime. Así «lo aprobado se ve igual en el juego» es verdad por construcción, no por comparación visual, y se evita el segundo motor (la objeción registrada en la spec). Defensa contra §1: `skinFx.js` ya funciona con emisores declarativos y `fxRules.js` ya separa la lógica pura de Three.js para poder probarla.

Alternativa descartada: mantener el motor propio del banco y reescribir cada efecto para el juego. Da más libertad al principio, pero cada efecto se rehace y puede verse distinto. Recomendación: la de arriba. La libertad creativa se conserva porque el formato de efecto puede ampliarse, y lo que el runtime no sepa dibujar se añade al runtime (no al banco) para que juego y banco lo ganen a la vez.

Skins: los efectos de skin siguen el formato de emisor ya existente (`P(...)`), de modo que `SkinFX` los lee sin cambio de comportamiento. Se exponen como presets seleccionables, no asignados.

## 3. Interfaces & contracts

```text
Effect = {
  id, name, family: 'portal' | 'impact' | 'skin',
  duration, loop,                       // loop: sin salto entre último y primer fotograma
  maxParticles: { low, medium, high },  // nunca por encima del nivel
  emitters: Emitter[],                  // misma forma que P(...) de skinFx
  rings?: Ring[], lights?: Light[],     // anillo con orientación (suelo | normal de pared)
  flash?: { count, perSecond },         // para la regla de 3 destellos por segundo
  calm?: ...                            // qué se atenúa con reducción de movimiento
}

validate(effect) -> { ok: true } | { ok: false, errors: string[] }
budget(effect, quality) -> number                // <= nivel
emissions(effect, seed, quality, reduced) -> Emission[]   // determinista: mismo input, misma lista
flashRate(effect) -> number                      // máx. destellos en cualquier ventana de 1 s

VfxPlayer(scene, { quality }).play(effect, { pos, normal?, seed, color? }) -> handle
VfxPlayer.update(dt) / .setLevel(q) / .dispose()    // update no asigna memoria
handle.stop()

Portal: buildPortal(...) sin cambios; portalState(portal) -> { enter(), stable(), exit() }
Banco: export(effect) -> archivo .js con la definición, listo para el PR
```

Garantías:
- `emissions` es idempotente: misma semilla, misma lista. Es la base del criterio de paridad.
- `update` de `VfxPlayer` reutiliza objetos y typed arrays, como `SkinFX` (sin asignaciones por fotograma).
- Un efecto inválido no se reproduce ni se exporta; el motivo se devuelve, no se lanza.
- Un efecto en bucle devuelve el mismo estado en `t = 0` y `t = duration`.
- Un efecto de una sola vez no deja partículas ni mallas visibles pasado `duration`.

## 4. Data model & flow
- **Datos del efecto:** objeto plano, serializable a JSON, sin funciones. Vive en el banco como archivo JSON de la biblioteca local y en el juego como módulo en `vfx/packs/`.
- **Flujo de autoría:** crear/duplicar/editar en el banco → el banco valida y mide con `schema.js` → se reproduce con `runtime.js` → si pasa presupuesto y destellos, se exporta → se copia al repo en un PR → revisión humana.
- **Flujo en partida:** el evento del juego (pared, bumper, hoyo, portal) llama a `VfxPlayer.play` con posición, normal y semilla → `emissions` produce la lista → `runtime` la dibuja con el presupuesto del nivel actual. La física no participa.
- **Borrado:** el banco comprueba qué skins usan el efecto y avisa antes de borrarlo. Los efectos del juego no se borran desde el banco, solo se retiran de la biblioteca local.
- **Ciclo de vida:** el `VfxPlayer` se crea con la escena, se baja de nivel con el gobernador (`setLevel`) y se destruye con ella (`dispose`).

## 5. Testing strategy
Por criterio de aceptación de la spec, con el nivel que lo prueba y lo que simula:

| Criterio | Nivel | Qué afirma | Qué simula |
|---|---|---|---|
| Efecto de la lista se reproduce sin errores | Integración (navegador) | Cada efecto del banco arranca y la consola no da errores | Nada; es el banco real |
| Bucle sin salto | Unidad (`schema`) | El estado en `t=0` y `t=duration` coincide | Nada |
| Una vez: sin partículas al acabar | Unidad (`schema`) | Ninguna emisión viva pasado `duration` | Nada |
| Paridad por semilla | Unidad (`schema`) | `emissions` con misma semilla da lista idéntica; golden por efecto | Nada |
| Presupuesto por calidad | Unidad (`schema`) | `budget` ≤ nivel en `low/medium/high`; efecto que lo supera es inválido | Nada |
| Reducción de movimiento | Unidad (`schema`) | Con `reduced` el efecto sale quieto o atenuado como una skin actual | `setReducedMotionForTests` |
| Máx. 3 destellos/s | Unidad (`schema`) | `flashRate` ≤ 3 en cualquier ventana de 1 s | Nada |
| CRUD en el banco | Integración (navegador) | Crear, duplicar, editar y borrar; aviso si una skin lo usa | Biblioteca en memoria |
| Exportar bloqueado si excede | Unidad + integración | `validate` falla y el botón de exportar queda deshabilitado | Nada |
| Primera tanda completa | Unidad (`schema`) | Existe 1 portal con 3 estados, 3 choques y 3 efectos de skin, todos válidos | Nada |
| El juego lo dispara y se ve igual | Integración (navegador) | En el juego, el evento reproduce el efecto con la misma lista de emisiones | `GolfGame` real en Vite |
| `pnpm test` y `pnpm run build` | CI local | Ambos en verde | Nada |
| El banco no está en el repo | Comprobación | `git ls-files` y el árbol no contienen `golfito-vfx-lab` | Nada |

Las pruebas unitarias van en `tests/vfx-schema.test.js` con `node --test`, como `tests/skin-fx-rules.test.js`. La medición de FPS en móvil de gama media no la puede ejecutar el agente: queda como revisión humana (`review-after`, cola de decisiones, entrada 8).

## 6. Sequencing & dependencies
1. **Cimientos del banco:** el banco importa las clases reales del juego por ruta (alias de `three` y permisos de lectura fuera de su carpeta). Retirar `engine.js` propio de la ruta crítica. Depende de nada.
2. **`schema.js` + pruebas:** formato, `validate`, `budget`, `emissions` con semilla, `flashRate`, calma. Depende de 1 solo para el entorno; es puro.
3. **`runtime.js`:** `VfxPlayer`, anillo orientado a pared, luces, reutilización de memoria. Depende de 2.
4. **Editor del banco:** lista, CRUD, parámetros en vivo, medidor de partículas/ms y semáforo de presupuesto, exportación. Depende de 2 y 3.
5. **Portal con estados:** envoltura sobre `buildPortal`. Depende de 3 (comparte runtime).
6. **Primera tanda de efectos:** portal, pared, bumper, hoyo, 3 efectos de skin. Depende de 3, 4 y 5.
7. **Integración en el juego:** conectar `VfxPlayer` a los eventos de `GolfGame.js`, registrar presets en `skinFx.js`, conectar el portal. Depende de 6. Es lo que toca render, así que exige medición.
8. **Cierre:** `pnpm test`, `pnpm run build`, `pnpm audit --prod`, comprobación del árbol y medida de FPS. Depende de 7.
Paralelizables: 4 y 5 una vez hecho 3 (archivos disjuntos).

## 7. Risks & open decisions
Ordenados por daño:
1. **Rendimiento en móvil de gama media (P7.1).** Disparador: varios efectos grandes a la vez en una partida de 8 jugadores (área no formulable en la spec). Impacto: caída de FPS. Mitigación: presupuesto por efecto y por nivel, el `VfxPlayer` comparte un único grupo de partículas con límite duro, y se engancha al gobernador existente. Retira el riesgo: medición en dispositivo real (revisión humana).
2. **Importar archivos del juego desde fuera del repo.** Disparador: `effects.js` importa `three` y el banco tiene su propio `three`; dos copias rompen `instanceof`. Impacto: el banco no arranca o dibuja mal. Mitigación: alias de `three` al del banco y comprobación de una única copia; spike corto al inicio (tarea 1).
3. **Disparador del portal.** El portal de `courses.js` solo tiene hoy un estado. Impacto: entrada/salida mal sincronizadas con `cyberFx.onPortal`. Mitigación: la envoltura recibe los eventos que ya existen y no inventa otros.
4. **Deriva de formato.** El formato de efecto se amplía desde el banco y el runtime del juego no lo entiende. Mitigación: `validate` rechaza campos desconocidos y el banco usa el mismo `schema.js`.
5. **Parpadeo / fotosensibilidad.** Mitigación: `flashRate` es una puerta de exportación, no solo un aviso.
6. **Modificar skins existentes por accidente.** Mitigación: los presets no se asignan; hay prueba de que `SKINS` y `SIG` actuales no cambian.

Decisiones abiertas: a) si los efectos de skin nuevos se asignan a skins concretas (hoy no; revisión posterior). b) formato de la lista de emisiones para golden tests (se fija al escribir la tarea 2). c) valor exacto de `maxParticles` por efecto de la primera tanda (se ajusta con la medición).

Rollback: es un cambio solo de render, sin base de datos ni física. Revertir el PR devuelve el juego al estado anterior; el banco no se ve afectado.

## Revisions
- 2026-11-06 — Primera versión, derivada de la spec aclarada. El choque bola contra bola queda fuera (sin disparador en la física); en su lugar entra el golpe en bumper.

## Tasks
<!-- generated by tasks on 2026-11-06; IDs are stable, do not renumber -->

Criterios de la spec, numerados en el orden en que aparecen en *Acceptance criteria*: AC1 se reproduce sin errores · AC2 bucle sin salto · AC3 una vez sin partículas · AC4 paridad por semilla · AC5 presupuesto por calidad · AC6 reducción de movimiento · AC7 máx. 3 destellos/s · AC8 crear/duplicar/editar/borrar · AC9 exportar bloqueado si excede · AC10 primera tanda · AC11 el juego lo dispara y `pnpm test`/`pnpm run build` · AC12 el banco no está en el repo.

Riesgo: `rsc risk` sobre las rutas previstas da **tier 1** (un revisor) a todos los grupos del repo. Las tareas del banco (T001, T007) están fuera del repo y no tienen tier.

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Hacer que el banco importe `AdditiveParticles` y `Shockwaves` del juego por ruta, con una sola copia de `three` | La página del banco carga sin errores de consola, `window.__lab.singleThree === true` y `grep -c "engine.js" src/main.js` del banco da 0 | — | AC1, AC12 | — |
| T002 |  | Escribir las pruebas del esquema de efecto (validar, presupuesto, emisiones con semilla, tasa de destellos, bucle, una vez, reducción de movimiento) | `node --test tests/vfx-schema.test.js` falla: no existe `vfx/schema.js` | — | AC2, AC3, AC4, AC5, AC6, AC7 | 1 |
| T003 |  | Implementar `src/game/render/vfx/schema.js` (puro, sin Three.js) | `node --test tests/vfx-schema.test.js` en verde; `grep -c "from 'three'" src/game/render/vfx/schema.js` da 0 | T002 | AC2, AC3, AC4, AC5, AC6, AC7 | 1 |
| T004 |  | Implementar `VfxPlayer` en `vfx/runtime.js` con pool de partículas compartido y `update` sin asignaciones; prueba antes | `node --test tests/vfx-runtime.test.js` en verde (límite duro, `dispose`, sin asignaciones en `update`) | T003 | AC3, AC5, AC11 | 1 |
| T005 |  | Añadir anillo orientado a pared (normal) al runtime | `node --test tests/vfx-runtime.test.js` incluye la orientación y pasa | T004 | AC10 | 1 |
| T006 | [P] | Añadir estados entrada/estable/salida al portal con una envoltura sobre `buildPortal` | `node --test tests/portal-states.test.js` en verde; `buildPortal` mantiene su firma | T004 | AC10 | 1 |
| T007 | [P] | Construir el editor del banco: lista, CRUD, parámetros en vivo, medidor, semáforo de presupuesto y exportación | `window.__lab.selfcheck()` crea, duplica, edita y borra un efecto, avisa si lo usa una skin, y la exportación queda bloqueada con un efecto que excede; `pnpm build` del banco pasa | T003, T004 | AC1, AC8, AC9 | — |
| T008 |  | Escribir la prueba de la primera tanda (todas válidas; 1 portal con 3 estados, 3 choques pared/bumper/hoyo, 3 efectos de skin épico/legendario/mítico) | `node --test tests/vfx-packs.test.js` falla: no existen los packs | T003 | AC10 | 1 |
| T009 |  | Crear los packs de la primera tanda en `src/game/render/vfx/packs/` y sus golden de emisiones | `node --test tests/vfx-packs.test.js` en verde, con golden por efecto | T005, T006, T008 | AC4, AC10 | 1 |
| T010 |  | Exponer los efectos de skin como presets en `skinFx.js` sin asignarlos | `node --test tests/skin-fx-rules.test.js tests/skins-schema.test.js` en verde, más una prueba que fija `SKINS` y `SIG` actuales sin cambios | T009 | AC10, AC11 | 1 |
| T011 |  | Conectar `VfxPlayer` a los eventos pared, bumper, hoyo y portal de `GolfGame.js`, respetando calidad, gobernador y reducción de movimiento | `pnpm test` y `pnpm run build` en verde; en el navegador cada evento reproduce el efecto y su lista de emisiones coincide con el golden | T009, T010 | AC11, AC6 | 1 |
| T012 |  | Medir FPS de los efectos en móvil de gama media o emulador y anotarlo (P7.5). **Parte humana** | La descripción del PR recoge dispositivo, FPS y tiempo de carga; cola de decisiones, entrada 8 | T011 | AC5, AC11 | — |
| T013 |  | Comprobar que el banco no está en el repo ni en su build | `git ls-files \| grep -c golfito-vfx-lab` da 0 y `git status --short` no lista el banco | T011 | AC12 | — |
| T014 |  | Cierre automático: todos los done-checks y la verificación del proyecto | Cada fila marcada; `pnpm test`, `pnpm run build`, `pnpm audit --prod` y `bash scripts/verify.sh` terminan con código 0 | T001–T011, T013, T015–T017 | todos | — |
| T015 |  | Añadir al esquema la entidad Skin (apariencia y efectos asignados) con su validación y pruebas antes | `node --test tests/vfx-schema.test.js` incluye `validateSkin` y pasa; una skin con efecto inexistente falla | T003 | AC16 | 1 |
| T016 | [P] | Añadir al editor del banco el CRUD de skins con vista previa y aviso al borrar un efecto en uso | `window.__lab.selfcheck()` crea, duplica, edita y borra una skin y avisa si se borra un efecto que usa; `pnpm build` del banco pasa | T007, T015 | AC16, AC8 | — |
| T017 |  | Cubrir los casos límite: `low` conserva anillo, destello y 30 % de `high`; pool lleno descarta emisiones nuevas; errores de parámetro y pieza ausente se listan | `node --test tests/vfx-schema.test.js tests/vfx-runtime.test.js` incluye los tres casos y pasa; `selfcheck()` cubre el error del banco | T004, T007, T016 | AC13, AC14, AC15 | 1 |

**T004 — Interfaces**
- Consumes: `emissions(effect, seed, quality, reduced) -> Emission[]`, `budget(effect, quality) -> number` (de T003); `AdditiveParticles(scene, atlas, max)` de `effects.js`.
- Produces: `VfxPlayer(scene, { quality }).play(effect, { pos, normal?, seed, color? }) -> handle`; `update(dt)`, `setLevel(q)`, `dispose()`.

**T009 — Interfaces**
- Consumes: `validate(effect) -> { ok: true } | { ok: false, errors: string[] }` (T003); orientación de anillo (T005); estados de portal `enter() / stable() / exit()` (T006).
- Produces: módulos que exportan `Effect` con `family: 'portal' | 'impact' | 'skin'`, `duration`, `loop`, `maxParticles: { low, medium, high }` y `emitters` con la forma `P(cell, n, speed, spread, size, life, col, extra)` de `skinFx.js`.

**T011 — Interfaces**
- Consumes: `VfxPlayer.play(effect, { pos, normal?, seed })` (T004); eventos existentes `skinFx.onWall(strength, pos, normal)`, `skinFx.onBumper(pos)`, `skinFx.onSink(cup)` y `cyberFx.onPortal(i)`.
- Produces: el efecto reproducido en el instante del evento. No lee ni escribe estado de física.

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | ~1.200 en el repo (el banco, fuera del repo, no cuenta) | schema ~250, pruebas ~400, runtime ~300, packs ~250, portal y juego ~150 |
| Files / areas | ~14 entre `src/game/render/vfx/`, `tests/`, `portal.js`, `skinFx.js`, `GolfGame.js` | render y pruebas, sin base de datos ni física |
| Risk | máximo tier 1; 0 tareas de tier 2 | un revisor por tarea; no hace falta aprobación humana por `rsc risk` |
| Suggested delivery | autochain: 3 PR encadenados | supera `line_budget` 400; PR1 schema + pruebas, PR2 runtime + packs, PR3 portal e integración |

## Ajustes tras `analyze` (ronda 1)
<!-- IDs estables: T015–T017 son nuevas; T012 sigue siendo humana y bloquea `ship`, no el cierre automático T014 -->

- **F1 — Skin como entidad.** `Skin = { id, name, palette: { base, accent, secondary, glow }, finish, pattern, effects: { trail, aura, hit, roll, wall, sink } }`, donde cada campo de `effects` es el id de un `Effect` o vacío. Se valida con `validateSkin(skin, library)`. Se exporta como datos en `vfx/packs/`, sin dar de alta la skin en `skins.js` (sin tier, desbloqueo ni precio).
- **F2 — Topes.** `VfxPlayer` tiene tope propio por calidad (`low` 24, `medium` 60, `high` 120), aparte del de `SkinFX`. El efecto de mundo sustituye al soplo genérico de `Particles` en pared, bumper y hoyo, y se suma al efecto de la skin.
- **F5 — Cierre.** T014 ya no espera a T012. T012 queda en la cola de decisiones (entrada 8) y bloquea `ship` hasta que alguien mida en móvil.
- **F7 — Fuerza del golpe.** `VfxPlayer.play(effect, { pos, normal?, seed, strength? })`, con `strength` de 0 a 1 que escala cantidad y tamaño sin superar el presupuesto.

**T005 — Interfaces**
- Consumes: `VfxPlayer.play(effect, { pos, normal?, seed, strength? })` (T004).
- Produces: anillo con orientación `'floor' | 'wall'`, que usa `normal` para colocarse sobre la pared.

**T006 — Interfaces**
- Consumes: `buildPortal(scene, [x, z], r, color, y, time, seed = 0)` de `portal.js`; el runtime de T004.
- Produces: `portalState(portal) -> { enter(), stable(), exit() }`. `buildPortal` no cambia su firma.

**T007 — Interfaces**
- Consumes: `validate(effect)`, `budget(effect, quality)`, `flashRate(effect)` (T003) y `VfxPlayer` (T004).
- Produces: `window.__lab.selfcheck() -> { ok: boolean, steps: string[] }` y la exportación de un efecto como módulo `.js` con la forma `Effect`.

**T010 — Interfaces**
- Consumes: la forma de emisor `P(cell, n, speed, spread, size, life, col, extra)` de `skinFx.js`.
- Produces: presets seleccionables por nombre, sin tocar `SIG` ni `SKINS` existentes.

**T015 — Interfaces**
- Consumes: `validate(effect)` (T003).
- Produces: `validateSkin(skin, library) -> { ok: true } | { ok: false, errors: string[] }`.
