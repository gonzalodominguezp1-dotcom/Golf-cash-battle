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
- [ ] `task-1`: Controles de ratón y motor de disparo en `GolfGame.js` (apuntado libre, click-hold, cámara orbital, zoom, atajos de teclado y telemetría de ratón).
- [ ] `task-2`: Cámaras panorámicas, FOV adaptativo y HUD de juego para escritorio (`GolfGame.js`, `main.js`, `style.css`).
- [ ] `task-3`: Shell de navegación de escritorio y rediseño responsivo de pantallas (`main.js`, `style.css`).
- [ ] `task-4`: Tests de telemetría, controles y validación completa de la suite.

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada directa con orquestador y tareas desacopladas.
- **Engram Mirror**: `odd/desktop-version/tasks` (marcado como local/pendiente por disponibilidad de herramienta).
- **Modo TDD**: Functional checks + suite de tests unitarios automáticos (`pnpm test`).
