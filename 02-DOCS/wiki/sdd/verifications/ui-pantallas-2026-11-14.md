---
title: Verificación UI por pantallas — fase 2 (splash y escena del hub)
description: Resultado por línea de comandos de la fase 2 (T013-T021) y lista de comprobaciones en navegador que hace el usuario.
---

# Verificación ui-pantallas — fase 2 (2026-11-14)

Rama `la-chaqueta-bionica-ui`, 36 commits sobre `3d12edf`, sin push. Las comprobaciones en navegador las hace siempre el usuario; aquí solo consta lo ejecutado por línea de comandos.

## Ejecutado por línea de comandos

| Comprobación | Resultado |
| --- | --- |
| `pnpm test` | 427 de 427 en verde |
| `pnpm run build` | en verde |
| Carga inicial (`node scripts/initial-load-size.mjs`) | **92 821 B gzip** (entry 90 181), `initialHasThree: false` |
| Delta frente a la línea base T001 (85 424 B) | +7 397 B. Tope AC34 ≈ 100 800 B, margen ≈ 7 979 B |
| Peso del splash (AC29) | imágenes 41 908 + `<style>` 6 396 + `splash.js` 16 687 = **64 991 B** (con el logo 89 915 B); límite 153 600 B |
| `public/splash/` | solo `.webp` (sky, forest, green, hub-fallback) |
| `index.html` sin `<script>` inline | 0 coincidencias (el grep se probó con un caso positivo) |
| `git diff 3d12edf -- vercel.json` | vacío |
| `splash.js` en ES5 | sin flechas, `let`/`const`, `?.`, `??`, plantillas, clases ni spread en código ejecutable |

## Cola de decisiones afectada

- Q5 (splash sin tope duro con `session` marcada y sin `hub`): **parcialmente cerrada.** Si el lobby no se pinta en `maxMs`, ahora se llama a `fail` y sale «Reintentar». Sigue sin tope si la red cae durante la carga del saldo: el saldo ya no bloquea el arranque y marca `progress` a los 3 s como máximo.
- Q6 (TIP provisionales): sigue abierta. Solo el primero sale del boceto aprobado.
- Pregunta abierta AC25: el CSS de Vite (~123 KB, bloquea el render) se descarga antes del primer pintado. Medir con «Slow 3G».

## No ejecutado: lo hace el usuario en navegador

### Escena del hub (laboratorio `/scripts/hub-scene-lab.html`)
1. Pradera de día con green, copa con **bandera roja intensa**, cámara cerca (órbita 8,5, altura 3,2) sin atravesar arbustos ni rocas, vuelta de 360° en ~90 s sin saltos. Mirar a 375×812 y 1280×800.
2. El bosque fusionado se ve igual que antes del merge (colores por vértice, rocas con musgo, copas con degradado, sombras sin cortes).
3. `?q=low|medium|high`: cambia árboles (14, 26, 40) y sombras (low sin sombras). `?seed=7` repite la misma escena.
4. `?layer=sky|forest|green`: una sola capa, sin colgarse; forest y green con fondo transparente; `?layer=xxx` avisa «capa desconocida».
5. `?nowebgl=1`: «rechazada: Sin WebGL…» y sin canvas.
6. `?reduced=1`: cámara quieta y sin apariciones.
7. `lab.scene.pause()`: `renderCalls` no cambia en 1 s y `fps()` da 0; `resume()` continúa sin salto. Cambiar de pestaña y volver.
8. `setQuality('low'|'high'|'medium')` en caliente sin errores. `lab.scene.dispose()` repetido sin avisos de «too many active WebGL contexts».
9. Apariciones con `?seed=1&q=medium`: en ≤90 s salen chispas, mariposa y la bola que entra en la copa. `?ambient=0` ninguna.
10. **FPS** (botón «Medir FPS 10 s», panel del navegador VISIBLE, 375×812): medium ≥ 55, low ≥ 45, high solo anotado. Con una aparición en curso no bajar más de 3 fps. Si no llega, parar y decidir (plan §7, riesgo 1).

### Splash (arranque real, `pnpm dev`)
11. Hitos en consola `gcbSplash hito …`: bundle, session, progress, three, scene, hub. La barra llega a 100 con el lobby pintado y el splash dura al menos 600 ms.
12. **Slow 3G:** el splash aparece con cielo, bosque, green, logo y barra antes de que cargue `main-*.js`, sin parpadeo en blanco. Anotar cuánto tarda el primer pintado (AC25).
13. 375×812, 360×640 y 1280×800: capas a 60vh ancladas abajo en vertical, cielo continuo bajo el logo, pelota con estela, barra y TIP legibles. Hacer las capturas `T020-splash-*.png`.
14. Parallax con ratón y con dedo (sin scroll de página), deriva sola tras ~3 s, pausa con la pestaña oculta.
15. `prefers-reduced-motion`: estático, fundido instantáneo, también al activarlo en caliente.
16. Calidad low (`gcb.settings.v1`, `quality.mobile` o `desktop` = low): 2 capas, sin bosque.
17. Error: `data-state="error"` a mano muestra «No hemos podido conectar» y «Reintentar» (recarga una sola vez). Red caída o backend sin responder: «Reintentar» tras `maxMs`. Lobby que no se pinta: también.
18. Chunk de three y de `hubScene`: la pestaña de red los muestra pedidos durante el splash y no antes de `session`.
19. Three bloqueado o red muy lenta: a los 8 s sale «escena omitida» y el splash termina sin quedarse al 99 %. Igual con la pestaña en segundo plano al arrancar y sin WebGL.
20. La escena precargada queda **pausada** con el lobby abierto (sin GPU). Al entrar en partida no queda ningún canvas WebGL oculto en el `body`; con `#hoyoN` tampoco.
21. Sin sesión: se ve el login y el splash se va; abrir `#/ranking`, entrar y ver Ranking. `?skinlab=1` sin splash y sin errores. `VITE_BACKEND=local` y `#hoyoN` arrancan como antes.
22. Accesibilidad: la barra anuncia «Cargando»/«Error de carga»; «Reintentar» alcanzable con teclado y ≥ 44 px; tras el fundido nada del splash queda enfocable.
23. Consola sin errores de CSP; `/splash.js` responde 200.
24. Juego jugable de punta a punta: lobby → práctica → fin de partida.

## Pendiente fuera de esta fase

- T012 (verificación de la fase 1) sigue a cargo del usuario; su lista está en `progress/ui-pantallas-pausa.md`.
- Los PNG `splash-boceto-*.png` de `02-DOCS/attachments/ui-pantallas/` son anteriores al cambio de cámara y bandera; el HTML usa las capas nuevas.
- T026 (F3) debe montar la escena precargada con `resume()` (llega pausada) y usar `hub-fallback.webp` cuando la escena sea null; `keepAlive` del host sigue sin implementar.
