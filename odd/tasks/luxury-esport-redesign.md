# Feature: Rediseño Visual Luxury Esport y Optimización UI/UX para Golf Cash Battle

## Objetivo
Transformar integralmente el diseño, interfaz y experiencia visual de Golf Cash Battle a un estándar "Luxury Esport":
- Estética nocturna de club de minigolf de alta gama: dark glassmorphism satinado, luz interior, acentos neón controlados y micro-interacciones pulidas.
- Tipografía moderna y jerárquica con `Outfit` y `Plus Jakarta Sans`, reemplazando el uso indiscriminado de `Lilita One` en datos y botones.
- Corrección de antipatrones de diseño (eliminación de rebotes artificiales, bordes de tarjeta gruesos y textos con degradado ilegibles).
- Reparación y elevación del visor 3D interactivo en la tienda de skins con iluminación IBL y pedestal reflectante.
- Reestructuración espacial panorámica de Wallet (dashboard financiero con tarjeta holográfica) y Cuenta (perfil de jugador con estadísticas de carrera).
- Armonización visual del Matchmaking (adiós al verde neón chillón) y eliminación de colisiones en el HUD de juego.
- Estricta preservación de controles, mapas, simulación física a 120Hz, determinismo y telemetría antibot.

## Racional y Decisiones de Diseño
- **Dirección de Marca**: Opción A elegida por el usuario: estilo "Esport Moderno", elegante, sofisticado y confiable para un juego con stakes y torneos.
- **Invariantes del Juego**: Controles de ratón y Pointer Lock, atajos de teclado [Espacio] y [Esc], física y telemetría de tiros intactos para mantener el paso del 100% de la suite de tests (42/42 pass).
- **A11y & Motion**: Integración de `@media (prefers-reduced-motion)` y anillos `:focus-visible` de alto contraste accesibles.

## Checklist de Tareas
- [ ] `task-1`: Sistema de diseño, tokens de dark glassmorphism y tipografía (`Outfit`, `Plus Jakarta Sans`) en `index.html` y `style.css`
- [ ] `task-2`: Rediseño de componentes del Lobby y tarjetas de torneo con cristales satinados y badges refinados en `style.css` y `main.js`
- [ ] `task-3`: Reparación y optimización del visor 3D de skins con iluminación de estudio e integración DOM en `main.js` y `style.css`
- [ ] `task-4`: Dashboard panorámico para Wallet (tarjeta holográfica 3D, analítica e historial) y Cuenta (perfil y stats de carrera) en `main.js` y `style.css`
- [ ] `task-5`: Armonización visual del Matchmaking, despeje de HUD in-game (resolución de solapamientos) y accesibilidad WCAG (`:focus-visible`, `prefers-reduced-motion`) en `main.js`, `style.css` y `GolfGame.js`
- [ ] `task-6`: Verificación total de suite de tests (`pnpm test`), escaneo con detector Impeccable y validación visual en vivo en navegador

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada directa con orquestador y tareas desacopladas.
- **Engram Mirror**: `odd/luxury-esport-redesign/tasks` (marcado local).
- **Modo TDD**: Functional checks + suite de tests unitarios automáticos (`pnpm test`).
