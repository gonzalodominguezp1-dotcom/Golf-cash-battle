---
title: Verificación UI por pantallas — fase 3 (hub)
description: Resultado por línea de comandos de la fase 3 (T023-T026) y lista de comprobaciones en navegador que hace el usuario.
---

# Verificación ui-pantallas — fase 3 (2026-11-14)

Rama `la-chaqueta-bionica-ui`, 42 commits sobre `3d12edf`, sin push. Las comprobaciones en navegador las hace siempre el usuario; aquí solo consta lo ejecutado por línea de comandos.

## Ejecutado por línea de comandos

| Comprobación | Resultado |
| --- | --- |
| `pnpm test` | 447 de 447 en verde |
| `pnpm run build` | en verde; `hub` sale como chunk propio |
| Carga inicial (`node scripts/initial-load-size.mjs`) | **93 517 B gzip** (entry 90 877), `initialHasThree: false` |
| Delta frente a la línea base T001 (85 424 B) | +8 093 B. Tope AC34 ≈ 100 800 B, margen ≈ 7 283 B |
| `git diff 3d12edf -- vercel.json` | vacío |
| Commits de la fase | T023 `cce0e14`, T024 `1b458b9`, T025 `2d71d6d`, T026 `c8890b7` |

## Decisiones de la fase

- T024: boceto del hub y de la pantalla tipo aprobado con ajustes (iconos existentes de `icons.js`, etiqueta visible siempre, Mapas y Práctica con icono, logo adaptable a la altura). Constan en `decisions.md`.
- T026: al volver al hub tras una partida la escena 3D ya no existe (se libera al empezar la partida para no tener dos contextos WebGL a la vez) y el hub usa la imagen fija `hub-fallback.webp`. El 3D se ve hasta la primera partida de cada recarga. Recrearla de forma perezosa es una tarea aparte, no hecha.
- El badge de Logros se verá casi siempre encendido hasta que exista la pantalla de Logros (T029), porque nada marca los logros como vistos.
- Los destinos Amigos y Logros muestran un marcador «en construcción» (con cabecera y Volver) hasta T029-T030.

## No ejecutado: lo hace el usuario en navegador (`pnpm dev`, 375×812, 360×640 y 1280×800)

### Hub
1. Composición C10: usuario con anillo de nivel · logo · Ajustes y pantalla completa arriba; Ranking y Logros a la izquierda, Skins y Amigos a la derecha; Mapas · JUGAR · Práctica abajo. **Sin saldo ni botón de silencio.** Etiqueta visible bajo cada icono, iconos de la app, 44 px táctiles, sin scroll horizontal. Capturas `T025-hub-*.png`.
2. Logo sin tapar la bandera ni chocar con los botones laterales, también a 360×640.
3. Fondo: escena 3D con bandera roja y cámara cerca del green (órbita 8,5). Con `?nowebgl=1` o three bloqueado: imagen fija sin error ni aviso. Con `prefers-reduced-motion`: una sola imagen sin órbita.
4. **FPS del hub con la escena** (panel del navegador VISIBLE, 375×812): medium ≥ 55, low ≥ 45. Medirlo con `__gcbHub.stats` o el snippet del plan §5.
5. Con Ranking (u otra pantalla) encima: `__gcbHub.stats.renderCalls` queda quieto 1 s. Igual con la pestaña oculta. Al volver al hub se reanuda y el foco queda en el icono de la pantalla de la que vienes.
6. Ida y vuelta hub ↔ Ranking, Skins, Cuenta, Ajustes y Mapas: el hub vuelve intacto, sin parpadeo de remontaje; badges y nivel actualizados al volver.

### Navegación
7. JUGAR abre Mesas (lobby con saldo y panel de grupo); Práctica arranca partida con un toque; Mapas abre juego libre; el usuario abre Cuenta; Ajustes abre Ajustes y su «Volver» lleva al hub (no a Mesas).
8. Atrás en el hub no hace nada (no sale de la app). Esc y Atrás en Mesas, Ranking y Skins vuelven al hub. Recargar en `#/mesas`, `#/ranking`, etc. funciona.
9. Teclas 1-6 y M funcionan; la 1 abre Mesas. `#hoyo3`, `#hoyo3-empate` y `?skinlab=1` siguen igual.
10. Fin de partida (Práctica o mesa) → «Salir» vuelve al hub **sin audio residual del final y sin canvas del juego vivo**; Atrás o Esc en el hub tras eso no hace nada. Cancelar o salir de una mesa en vivo cierra la sala. La revelación de skins sale sola.
11. Tras una partida el hub muestra la imagen fija, sin pantalla en blanco.

### Avisos y badges
12. Popup de amistad lleva a Cuenta; el de invitación a Mesas. Badge de Amigos con petición o invitación pendiente: «N novedades» en el árbol de accesibilidad. Badge de Logros: ver nota sobre T029.
13. Invitado (sin cuenta o anónimo): Cuenta y Amigos con borde discontinuo y «Requiere cuenta».

### Accesibilidad
14. Tab recorre todo con foco visible; safe-area (`T025-hub-safearea-375x812.png`); `read_page` sin iconos sin nombre (`T025-hub-a11y.txt`). Consola sin errores.

## Pendiente fuera de esta fase

- T012 (fase 1) y T022 (fase 2) siguen a cargo del usuario.
- Siguiente: F4 (T028-T032) migra Mesas, Logros, Amigos y grupo, Ranking y Skins a `src/screens/`. Mueve casi 700 líneas de `main.js` y no tiene paradas humanas hasta T034/T035 (tier 2: contraseña, KYC, monedero, que exigen tu revisión antes de fusionar a main).
