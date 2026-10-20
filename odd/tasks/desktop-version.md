# Feature: Versión de Escritorio (Desktop) para Golf Cash Battle

## Objetivo
Adaptar el juego y sus interfaces para una experiencia de escritorio (PC) nativa y de máxima calidad:
- Controles de ratón fluidos y precisos (apuntado libre, disparo por carga o arrastre, cámara orbital y zoom).
- Adaptación de cámaras y escenarios para formato panorámico (16:9 y ultrawide).
- HUD in-game de escritorio y atajos de teclado completos.
- App shell y navegación de escritorio responsiva (Lobby en grid, visor 3D de skins, modales y layouts en split-view).
- Telemetría de ratón compatible con el sistema antibot determinista del servidor.

## Racional y Decisiones de Diseño
- **Preservación Híbrida**: Detectar `pointer: fine` vs `touch` para mantener intacto el soporte móvil táctil mientras se activa la experiencia completa de ratón/teclado en PC.
- **Antibot Safe**: La telemetría `{ d, t }` registra la duración natural de apuntado y variaciones angulares del ratón para cumplir estrictamente las reglas de `risk.js`.
- **Rendimiento**: Bucle de física determinista a 120Hz intacto; cálculo de FOV dinámico para evitar deformaciones en pantallas anchas.

## Checklist de Tareas
- [x] `task-1`: Controles de ratón y motor de disparo en `GolfGame.js` (apuntado libre, click-hold, cámara orbital, zoom, atajos de teclado y telemetría de ratón) — Commit: `4c84e48`.
- [x] `task-2`: Cámaras panorámicas, FOV adaptativo y HUD de juego para escritorio (`GolfGame.js`, `main.js`, `style.css`) — Commit: `0b0d3aa`.
- [x] `task-3`: Shell de navegación de escritorio y rediseño responsivo de pantallas (`main.js`, `style.css`) — Commit: `0231fe9`.
- [x] `task-4`: Tests de telemetría, controles y validación completa de la suite — Commit: `841b9a9`.
- [x] `task-5`: Ajuste manual táctil de fuerza de tiro (arrastre hacia abajo/arriba para más fuerte/flojo, rueda y teclas W/S) — Commit: `e0f3e8d`.
- [x] `task-6`: Visor 3D interactivo en la tienda de skins, sombras 4K y navegación por teclado en modales — Commit: `1bcad32`.
- [x] `task-7`: Bloqueo de puntero (Pointer Lock API) para minijuego en ventana y multimonitor (`GolfGame.js`, `main.js`, `desktop-controls.test.js`).

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada directa con orquestador y tareas desacopladas.
- **Engram Mirror**: `odd/desktop-version/tasks` (marcado como local/pendiente por disponibilidad de herramienta).
- **Modo TDD**: Functional checks + suite de tests unitarios automáticos (`pnpm test`).
- **task-1 completada**: Ratón con apuntado libre, carga continua de tiro, cámara orbital (clic derecho), zoom con rueda, hotkeys (WASD/flechas, espacio, Tab, R, Esc) y telemetría de ticks de ratón probada con 32 tests unitarios pasando.
- **task-2 completada**: FOV dinámico panorámico 16:9/21:9, HUD widescreen con rivales en posición superior despejada, barra inferior de ayuda con hotkeys contextuales (`desktop-controls-bar`), botón de pantalla completa con soporte F11 y atajo visual `Tab` en mapa.
- **task-3 completada**: Desktop Topbar con branding, pestañas de navegación integradas con hotkeys numéricos [1-4], botón de muteo en cabecera [M], layout responsivo de 1140px, Lobby en grid de 3 columnas para tiers, skins en grid de 4 columnas y layouts split-view en Wallet y Cuenta.
- **task-4 completada**: Nueva suite `tests/desktop-controls.test.js` añadida y validada. 36/36 tests pasando (100% pass) y build de producción con Vite verificado con éxito en 1.08s.
- **task-5 completada**: Corregido el bucle de `#frame` que sobreescribía la fuerza por tiempo. Habilitado ajuste manual completo: arrastrar el ratón hacia abajo aumenta la fuerza (tiro fuerte) y empujar hacia arriba la reduce (tiro más flojo), ajuste directo por pasos de ±5% con rueda del ratón y teclas W/S o flechas, disparo inmediato con [Espacio] o al soltar el clic, y cancelación con clic derecho o [Esc]. 38/38 tests pasando.
- **task-6 completada**: Visor 3D interactivo en vivo (`SkinPreviewRenderer`) para la tienda de skins con rotación continua, auto-rotación orbital y zoom con rueda. Sombras nítidas de 4096x4096px en escritorio (`PCFSoftShadowMap`). Soporte completo de teclado en modales ([Enter] aceptar, [Esc] cerrar).
- **task-7 completada**: Bloqueo del cursor mediante Pointer Lock API al interactuar con el minijuego para evitar fugas en multimonitor o ventana. Control dual por deltas relativos (`movementX`, `movementY`) con acumulación precisa de fuerza y giro orbital sin límites físicos de pantalla. Liberación automática en `[Esc]`, al embocar hoyo, al abrir el mapa del campo y al salir de la partida. 39/39 tests pasando.