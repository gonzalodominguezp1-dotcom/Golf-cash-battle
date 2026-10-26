# Feature: Juego Libre en Solitario (Solo Free Play)

## Objetivo
Añadir una opción de juego libre en solitario con selector de mapa, sin límite de tiempo, sin misiones ni desafíos, y sin rivales u oponentes:
- Selector interactivo de mapas para elegir libremente entre los 18 hoyos del juego (+ hoyo extra de desempate).
- Modo de juego en solitario sin rivales, sin bots ni pantalla de emparejamiento.
- Sin temporizador ni descalificación por tiempo o golpes máximos; entrenamiento a ritmo propio.
- Sin alteración de saldo, misiones o desafíos (modo de práctica pura sin riesgo ni progreso obligatorio).
- Pantalla de finalización de hoyo libre con opciones de reintentar, avanzar al siguiente hoyo o volver al selector de mapas.
- Botones de reinicio rápido y cambio de mapa disponibles durante la partida y en el menú de pausa/ajustes.

## Decisiones de Diseño y Arquitectura
- **Aislamiento de Progreso**: El modo libre no llama a `progress.recordMatch()`, `wallet` ni servicios de torneos, evitando registrar desafíos o deducciones de saldo.
- **Libertad de Práctica**: `timeLimit: null` en `GolfGame.load()` desactiva completamente el temporizador y descalificaciones. Los golpes máximos no fuerzan salida obligatoria.
- **HUD Limpio y Enfocado**: En solitario, se ocultan los chips de rivales y el temporizador, mostrando una insignia de "Modo Libre", contador de golpes, distancia y botones para reiniciar tiro/hoyo [R] y cambiar mapa.
- **Acceso Directo**: Botón destacado en el Lobby principal, botón en la barra de navegación (`desktop-nav` y `tabbar`), soporte de navegación `go('freeplay')` y atajo de teclado numérico [5].

## Checklist de Tareas
- [x] `task-1`: Soporte de modo libre en motor de juego y HUD (`GolfGame.js`, `main.js`) — temporizador deshabilitado, sin rivales, método `restart()` de hoyo y modal de resultado libre.
- [x] `task-2`: Pantalla de selección de mapa (`showFreePlayCourseSelect`) con catálogo de los 18 hoyos + desempate y acceso desde el Lobby (`main.js`).
- [x] `task-3`: Estilos visuales del selector de mapas, tarjeta del Lobby y HUD de modo libre (`style.css`).
- [x] `task-4`: Tests unitarios automatizados para modo libre (`tests/freeplay.test.js`) y verificación completa de la suite (60/60 pasando).

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa con tareas desacopladas en rama `feature/solo-free-play` (Commit: `055d087`).
- **Engram Mirror**: `odd/solo-free-play/tasks` (marcado como local/pendiente por disponibilidad de herramienta).
- **Modo TDD**: Functional checks + suite de tests unitarios automáticos (`node --test`).
- **task-1 completada**: `GolfGame.js` actualizado para aceptar `timeLimit: null` desactivando `deadlineTick` y descalificaciones. Implementado `game.restart()` para reiniciar al tee sin recargar toda la escena. En `main.js`, `playScreen` soporta `freePlay: true`, oculta rivales, deshabilita temporizador y cuenta máxima de golpes, añade atajo [R] y modal de fin de hoyo `showFreePlayHoleResult`.
- **task-2 completada**: Creada `showFreePlayCourseSelect()` en `main.js` con fichas detalladas de los 18 hoyos (nombre, par, temática, obstáculos/features como looping, molino, tubos, etc.) más el hoyo extra de desempate. Integrada tarjeta destacada en el Lobby principal y enlaces en `desktop-nav`, `tabbar` y atajo `Digit5`.
- **task-3 completada**: Diseñados e implementados en `style.css` la tarjeta del Lobby con estética luxury esport, el grid de tarjetas de mapa responsivo (1-3 columnas), tags temáticos e insignias de obstáculos, HUD in-game sin distracciones y modal de resultado para juego libre.
- **task-4 completada**: Añadidos 5 tests en `tests/freeplay.test.js` validando catálogo completo de 18 hoyos, anulación del temporizador en modo libre, inmutabilidad de saldo y XP de desafíos, reseteo de posición/velocidad/golpes con `restart()` y determinismo físico. Suite completa pasando al 100% (60/60 tests). Build de Vite verificado con éxito.
