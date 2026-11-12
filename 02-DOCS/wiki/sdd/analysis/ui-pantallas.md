---
type: analysis
title: Análisis de coherencia — ui-pantallas
description: Cruce de constitución, spec (C1-C13) y plan con tareas T001-T044 de la UI por pantallas antes de implementar.
tags: [sdd, analysis, ui]
timestamp: 2026-11-12T20:00:00Z
topic: sdd
slug: ui-pantallas
---

# Análisis de coherencia — ui-pantallas

Artefactos leídos: [constitución](../constitution.md) v1.1.0, [spec](../specs/ui-pantallas.md) (aprobada, C1-C13), [plan y tareas](../plans/ui-pantallas.md) (T001-T044). No se editó ninguno. Comprobaciones hechas sobre el código: `grep -E` con `\|`, firmas de `main.js`, `public/`, `scripts/`, `vercel.json`.

**Veredicto: GO con arreglos.** `GATE: BLOCKED` en sentido estricto del skill (0 CRITICAL, 6 HIGH), pero los 6 se arreglan editando filas de tareas, sin tocar la spec ni la arquitectura. Arreglar los HIGH y relanzar. No hay contradicción spec ↔ plan que obligue a volver a `clarify` o `plan`.

## Cobertura AC → tareas

| AC | Tareas | Estado |
|---|---|---|
| 1, 2, 3 | T002, T010, T031 | covered |
| 4 | T002, T010, T033 | AMBIGUOUS: la rama «sin sesión → login → pantalla pedida» no tiene done-check (M1) |
| 5 | T005, T006, T011, T025, T028-T030, T031, T032, T034, T037, T038 | AMBIGUOUS: sin prueba de limpieza en inspector (T033), Monedero (T035) ni Progreso (T036) (M4) |
| 6, 7 | T004 (`transitionRules`), T010 (`host.js`) | AMBIGUOUS: ninguna prueba cubre `transitionRules` y ningún done-check mide 150-250 ms / ≤100 ms (M3) |
| 8 | T002, T011 | covered |
| 9, 10, 10b, 10c | T025, T028, T034, T038 | covered |
| 11 | T004, T006, T026, T029 | covered |
| 12 | T025, T028, T033, T035, T039 | AMBIGUOUS (H1, H2) |
| 13 | T014, T021, T026 | covered |
| 14 | T001, T014, T015, T027 | AMBIGUOUS: T014 anota FPS sin umbral (H6) |
| 15, 16 | T028-T038 | covered |
| 17 | T026 | covered |
| 17b | T004, T029, T032, T033 | AMBIGUOUS (H2) |
| 18 | T030 | covered |
| 19 | T009, T040 | covered (solo T040 lo mide) |
| 20 | T009, T025, T027, T040 (declarado) | GAP de done-check: ninguna fila lo comprueba (H4) |
| 21 | T009, T010, T025, T040 | covered |
| 22 | T009, T025, T026, T040 | AMBIGUOUS: solo se lee el badge; los nombres accesibles del hub y de las otras pantallas no tienen check (H4) |
| 23 | T003, T039 | covered |
| 24 | T025, T040 (declarado) | GAP de done-check: nada comprueba la ausencia de hover (H4) |
| 25 | T020 | covered (check poco objetivo, L3) |
| 26, 27, 28 | T019, T021 | covered |
| 29 | T016, T020 | AMBIGUOUS: `hub-fallback.webp` vive en `public/splash/` sin presupuesto (M8) |
| 30, 31, 32 | T019, T020 | covered |
| 33 | T019, T020 | AMBIGUOUS: ningún check mide los ≤3 Hz (M5) |
| 34 | T001, T012, T022, T027, T040, T044 | covered |
| 35 | T012 y fases | covered |
| 36 | T022, T044 | covered |
| 37, 38, 39 | T042, T041, T043 | covered (T043: M9) |

**Tareas sin criterio propio:** T007 (extraer `shared.js`) y T008 (enmienda U6.6). T008 sale de C11/D8.2. T007 es refactor de soporte del plan, no scope nuevo. Sin DRIFT real. T001, T016, T017, T023 y T041-T043 tienen respaldo en la spec (C8, C13, extras).

## Hallazgos

| # | Sev | Tipo | Dónde | Hallazgo | Arreglo (fase) |
|---|---|---|---|---|---|
| H1 | HIGH | Done-check no ejecutable | T004, T007, T030, T035, T039 (plan, columna Done-check) | `grep -E "a\|b"` busca un `|` literal: comprobado, `grep -cE "foo\|zzz"` da 0 sobre `foo`. Los checks `= 0` / «vacío» pasan siempre aunque el código esté. | `tasks`: usar `grep -E "a|b"` (sin barra) o `grep -e a -e b`. Probar cada grep contra un archivo que sí contenga el patrón. |
| H2 | HIGH | Dependencia mal ordenada | T033 vs T034 y T038 (plan) | El check de T033 pide cero «desafío» visible en `src`. Hoy quedan en `main.js:912` (Cuenta, migra en T034) y `main.js:2503` (Mapas, migra en T038). T033 no puede pasar. Además «sin líneas visibles (comentarios aparte)» no es binario. | `tasks`: T033 solo comprueba Skins; el grep global de `Desafíos` va a T039/T040 con la lista cerrada de excepciones (comentarios). Añadir `main.js:2503` a T038. |
| H3 | HIGH | [P] con archivos compartidos / archivo omitido | T029, T035, T036 vs T028, T030, T031 (plan) | T029 es [P] con T028/T030/T031 pero para existir como pantalla necesita registrarse en `routes.js`, que no figura en sus archivos y que editan T028, T030 y T031. T035/T036 «sustituyen marcadores» de `account.js` sin listar `account.js`. | `tasks`: o T029 lleva `routes.js` y deja de ser [P], o `routes.js` carga cada pantalla por convención (`import('./<id>.js')`) y T010 lo fija. Igual en `account.js`: registro de pestañas por `import()` del archivo, para que T035/T036 solo añadan archivos. |
| H4 | HIGH | AC sin done-check | AC20, AC22, AC24 (T009, T025, T027, T040) | Declaradas en las columnas «Criterio(s)» pero ningún done-check las ejecuta: safe-area simulada, nombres accesibles del hub, ausencia de hover. | `tasks`: T025 y T040 añaden (a) captura con `env(safe-area-inset-*)` forzado y comprobación de que cabecera y barra inferior no solapan, (b) volcado del árbol de accesibilidad del hub con nombre en cada icono, (c) `grep -n ":hover" src/screens/*.css` solo dentro de `@media (hover: hover)`. |
| H5 | HIGH | Constitución | T034, T035, T030 (tier 1) vs B4.3, S5.1, DoD 7 | Se mueve la UI de contraseña, KYC, depósito y monedero. B4.3 exige revisión humana en PR que toque seguridad o pagos; el plan los trata como tier 1 porque `rsc risk` no marca la ruta, y no hay revisión OWASP en el done-check. No hay dinero real, pero la regla habla de «pagos» y «seguridad», no de ruta. | `tasks`: T034/T035 a tier 2 (o paso humano explícito en el PR de F4) y añadir al done-check la lista OWASP (entrada de usuario, sin saldo cacheado, sin secretos). |
| H6 | HIGH | Done-check no binario / orden | T014 (Done-check), plan §7 riesgo 1, Q2.5/P7.1 | El riesgo 1 dice «si no llega, se para y se decide con el humano», pero T014 solo exige «FPS anotado» sin umbral. El umbral de AC14 se mira recién en T027, con splash y hub construidos encima. Q2.5 (móvil real) queda como pendiente al final (T044) aunque se fusiona un PR por fase. | `tasks`: T014 con umbral explícito (p. ej. ≥55 FPS en `medium` y ≥45 en `low` con CPU ×4, o «no ejecutado» y gate humano). Añadir un gate humano de móvil real antes de fusionar F2 y F3. |
| M1 | MEDIUM | Cobertura | AC4 (T021) | «Sin sesión: login y luego la pantalla pedida». El código ya conserva el hash (`main.js:2713`, `location.replace(... + location.hash)`), pero ninguna tarea lo comprueba. | `tasks`: añadir a T021: abrir `#/ranking` sin sesión, entrar y ver Ranking. |
| M2 | MEDIUM | Dependencia | T010 (Depende de) | `host.js` usa `t('common.screenError')` y `notify`; T010 depende de T002, T005, T007, no de T003. | `tasks`: añadir T003 (y T009 si `host` usa `components`). |
| M3 | MEDIUM | Cobertura | AC6, AC7 (T004, T010) | `transitionRules.js` no tiene archivo de test en T004. Nada mide la duración real de la transición. | `tasks`: añadir `tests/transition-rules.test.js` a T004 y, en T010, medir con `performance.now()` entre `push` y fin de transición en normal y en reduced. |
| M4 | MEDIUM | Cobertura | AC5 (T033, T035, T036) | Sin `tests/screen-*.test.js` para el inspector, Monedero ni Progreso; la prueba de limpieza «de cada pantalla» no los cubre. | `tasks`: un `tests/screen-skin-inspect.test.js` y tests de pestañas dentro de `screen-account.test.js`. |
| M5 | MEDIUM | Ambigüedad | AC33 (T019, T020) | Ningún check mide el parpadeo del destello y del fuego. | `tasks`: T019 afirma en test el periodo mínimo del destello (≥500 ms) y T020 revisa en CSS que ninguna animación baje de 333 ms por ciclo. |
| M6 | MEDIUM | Tamaño | T014, T020, T030, T032, T034 (plan §0 y forecast) | El plan estima la escena en ~700 líneas y el splash en ~600, en una o dos tareas cada uno. T030 mueve `partyPanel` (~175) y `friendsPanel` (~185); T032 mueve `showSkins` (~250). §7 justifica solo Cuenta y Skins. Superan ~400 líneas sin estimación por tarea. | `tasks`: dividir T014 (base / calidad y pausa) y T020 (HTML+CSS / JS de capas); declarar el diff estimado y el uso de `--color-moved` en T030, T032 y T034. |
| M7 | MEDIUM | Duplicación | T028 vs T030 | Ambas dicen migrar `partyPanel` (T028 «grupo», T030 «desde partyPanel y friendsPanel»). | `tasks`: fijar quién se lleva `partyPanel` y qué comparte (`partyWatch`). |
| M8 | MEDIUM | Ambigüedad | AC29 (T016, T020) | `hub-fallback.webp` está en `public/splash/` sin presupuesto; el test de T020 pesa «imágenes del splash» y T016 solo limita las 3 capas a 110 KB. | `plan`/`tasks`: mover el fallback a otra carpeta o fijar su peso y si cuenta en los 150 KB. |
| M9 | MEDIUM | Viabilidad | T043 | No existe icono `maskable` y no hay herramienta para generarlo sin dependencias nuevas (C1.5). | `tasks`: decir cómo se crea (p. ej. derivado a mano del 512 existente) o quitar el icono del done-check y marcar pendiente. |
| M10 | MEDIUM | Done-check no ejecutable | T011 | `getEventListeners(window)` es una API solo de la consola de DevTools; el pane puede no tenerla. | `tasks`: medir con un contador envolviendo `addEventListener` desde el pane, o marcar «no ejecutado» y apoyarse en el test de `scope`. |
| M11 | MEDIUM | Done-check no binario | T007, T010, T025 | «Idénticos»/«aspecto igual» sin criterio. | `tasks`: comparar captura a captura con diferencia de píxeles o lista fija de elementos presentes. |
| M12 | MEDIUM | Cobertura | Spec §Edge y §Error paths | «Módulo de pantalla falla → aviso y vuelta al hub» (T010) y «invitado: huecos de cuenta marcados» no tienen check. | `tasks`: añadir un caso a `host` (T010) y a T025. |
| L1 | LOW | Estado | Plan §7 decisión (a) | Dice que AC1 pide saldo en Ranking; el AC1 vigente ya sigue C11. Texto desfasado. | Quitar la decisión al próximo toque del plan. |
| L2 | LOW | Estado | Plan frontmatter `status: draft`; `02-DOCS/wiki/index.md:21` dice «borrador» para la spec aprobada | Cosmético. | Actualizar al aprobar el plan. |
| L3 | LOW | Done-check débil | T020 (`grep -c "<script>"`) y AC25 | Solo atrapa `<script>` desnudos, no `<script type="module">` inline; «red lenta» sin velocidad. | Concretar patrón y throttling. |
| L4 | LOW | Medida | AC34 / T001 | `splash.js` clásico no entra en «carga inicial» del script. | Anotar su peso aparte. |
| L5 | LOW | Estado del árbol | T001 | `scripts/initial-load-size.mjs` ya existe sin versionar en el worktree; la tarea lo da por «nuevo». | Aclarar a quién pertenece antes de T001. |

## Constitución

Sin breaches CRITICAL. Revisadas: C1.2/C1.5 (sin deps nuevas, T043 depende de un icono, M9), C1.4 (no se toca física), Q2.1, Q2.5 (H6), K3.1/K3.3/K3.4 (carpeta `src/screens/` justificada en plan §1), S5.7 (saldo solo por `wallet`), U6.1-U6.7 (U6.6 enmendado en T008), P7.1/P7.5 (H6), B4.3 (H5), D8.2 (T008 anota la enmienda). `vercel.json` no cambia (AC36 comprobado en T022/T044; `connect-src` ya incluye `'self'`).

## Carriers para ejecutores aislados

Cumplido: §0 Global constraints está en el plan y hay bloques *Interfaces* para T002, T004, T005, T006, T009, T010, T011, T014, T016, T019/T020, T021, T025/T026, T028 y T034. Falta *Interfaces* en T029, T030, T031-T033, T035-T038 (consumen `ctx` y `routes`, de modo que dependen de H3) y T041-T043.

## Enrutado

- `tasks`: H1, H2, H3, H4, H5, H6, M1-M12 (casi todo son filas).
- `plan`: M8, L1, L2.
- `clarify`: nada. `constitution`: nada.
