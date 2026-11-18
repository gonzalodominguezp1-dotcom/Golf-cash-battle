---
type: verification
title: Cierre de ui-pantallas (T044) — 2026-11-16
topic: sdd
slug: ui-pantallas
timestamp: 2026-11-16T18:00:00Z
---

# Cierre ui-pantallas (T044) — 2026-11-16

Rama `la-chaqueta-bionica-ui`, sin push, sin fusionar a `main`. Este documento recoge el estado al cierre de la tanda de tests. Lo visual y la prueba en móvil real son del humano.

## Checks automáticos (medidos hoy)

| Check | Resultado |
|---|---|
| `pnpm test` | **728/729**. Un fallo: «hub nuevo montado antes de destruir el viejo» (`tests/screen-hub-escena-compartida.test.js`, archivo sin trackear de otra línea de trabajo; no está commiteado en esta rama) |
| `pnpm run build` | correcto (sin avisos de sintaxis CSS) |
| `pnpm audit --prod` | sin vulnerabilidades conocidas |
| Carga inicial (`scripts/initial-load-size.mjs`) | **81513 B gzip** (línea base T001: 85424; tope ≈100800). `initialHasThree: false` |
| `vercel.json` vs `3d12edf` | sin cambios |
| `desaf.{1,2}o` en `src` e `index.html` | 0 |
| `\bliga\b` en `src/screens` y `src/ui` | 0 |
| `:hover` en `src/screens/*.css` | 0 (solo una mención en un comentario) |
| `:hover` en `src/style.css` | 34 reglas heredadas, fuera de la fase 4: pendiente de limpiar |
| `shell(`, `let screen`, `function go(` en `src/main.js` | 0 |
| `showMatchmaking` en `src/main.js` | 0 |
| `src/main.js` | 1661 líneas (antes 2784) |

## Tareas

| Tarea | Estado |
|---|---|
| T039 retirar legado de navegación | hecha (`8934c14`) |
| T041 `version.json` y aviso de versión nueva | hecha (`5398e08`), cableada en `main.js` |
| T042 modal de novedades | hecha (`cb10eda`) |
| T043 manifest y maskable | hecha (`2fa978b`) |
| T044 cierre (tests) | hecha con el fallo ajeno indicado arriba |
| Prueba en móvil real | **pendiente**: se hace al publicar en `origin/main` |

## Revisiones humanas pendientes

- **T034 y T035** (contraseña, avatar, KYC, sesión y monedero) antes de fusionar a `main`.
- **Prueba en móvil real** (T044), tras publicar.
- **Test de escena compartida**: decidir si se incorpora o se descarta, porque hoy falla.

## Deuda conocida (no bloquea)

- 34 reglas `:hover` heredadas en `src/style.css`.
- Monedero: el repintado tras depositar pierde el foco del botón atrás (cosmético).
- Depósito y cripto sin tope de 8 s (igual que antes).
- Cripto: acepta cualquier host `https`, no una lista cerrada.
- Sala en vivo, opción «Salir y recuperar entrada» vs. el confirm del Lobby flotante: los textos no coinciden del todo; revisar.
- Falta test para la carrera de navegación y para el fallo de la ruta de legado.
- Tras una flecha del visor con Enter, el foco vuelve a «Volver» (hoy no hay botón de volver en el visor: revisar).

## Lista para el humano (navegador)

**Escritorio (1280×800):** lobby flotante con flecha en todas las pantallas del HUD; matchmaking sin barras del HUD anterior; selector de mapas solo con título y listado; monedero en `#/monedero`; progreso con héroe de nivel; visor de skin a pantalla completa; sala en vivo y resultados con el lobby flotante.

**Móvil (375×812 y 360×640):** lobby flotante sin tapar contenido; mapas en una columna con nombre arriba y «Practicar hoyo» abajo; visor de skin con «Probar efectos» dentro del visor; aviso de versión nueva al publicar un build distinto; modal de novedades una vez por versión.
