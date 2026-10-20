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
- [x] `task-1`: Sistema de diseño, tokens de dark glassmorphism y tipografía (`Outfit`, `Plus Jakarta Sans`) en `index.html` y `style.css` — Commit: `45b9118`.
- [x] `task-2`: Rediseño de componentes del Lobby y tarjetas de torneo con cristales satinados y badges refinados en `style.css` y `main.js` — Commit: `09e3285`.
- [x] `task-3`: Reparación y optimización del visor 3D de skins con iluminación de estudio e integración DOM en `main.js` y `style.css` — Commit: `bd75398`.
- [x] `task-4`: Dashboard panorámico para Wallet (tarjeta holográfica 3D, analítica e historial) y Cuenta (perfil y stats de carrera) en `main.js` y `style.css` — Commit: `a8c20f7`.
- [ ] `task-5`: Armonización visual del Matchmaking, despeje de HUD in-game (resolución de solapamientos) y accesibilidad WCAG (`:focus-visible`, `prefers-reduced-motion`) en `main.js`, `style.css` y `GolfGame.js`
- [ ] `task-6`: Verificación total de suite de tests (`pnpm test`), escaneo con detector Impeccable y validación visual en vivo en navegador

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa con orquestador y tareas desacopladas.
- **Engram Mirror**: `odd/luxury-esport-redesign/tasks` (marcado local).
- **Modo TDD**: Functional checks + suite de tests unitarios automáticos (`pnpm test`).
- **task-1 completada**: Sistema de diseño dark glassmorphism satinado con paleta esport profunda (`--bg: #070410`), tokens de superficie satinada, jerarquía tipográfica con `Outfit` en titulares y `Plus Jakarta Sans` en cuerpo y métricas. Eliminación de todos los antipatrones detectados (rebotes artificiales sustituidos por curvas exponenciales `cubic-bezier(0.16, 1, 0.3, 1)`, bordes de tarjeta gruesos y textos con degradado ilegibles). Botones y `:focus-visible` de alto contraste accesibles WCAG. 42/42 tests pasando. Commit `45b9118`.
- **task-2 completada**: Hero card rediseñado como showcase VIP con aura luminosa por rareza, pills de rareza satinadas y acceso rápido a personalización. Cabecera de mesas con indicador en vivo pulsante y chips de especificaciones técnicas (4 jugadores, 3 hoyos, determinista). Tarjetas de torneo `.tier` convertidas a dark glassmorphism con halos ambientales específicos por tier, gemas talladas facetadas con brillo, cajón de premio garantizado de alto contraste y botones de acción dinámicos. 42/42 tests pasando. Commit `09e3285`.
- **task-3 completada**: Visor 3D interactivo (`createSkinInspector`) optimizado con iluminación de estudio multi-punto (key, fill, top-rim), pedestal reflectante de obsidiana metálica, anillo de halo exterior sincronizado con la rareza de la skin y luz puntual de rebote inferior dinámica. Zoom interactivo suave con rueda de ratón acotado entre 1.0x y 2.1x, eliminación del recorte circular del canvas, limpieza completa de geometrías/materiales/listeners en `destroy()` y elevación estética de tarjetas de skin y desafíos en `style.css`. 42/42 tests pasando. Commit `bd75398`.
- **task-4 completada**: Dashboard financiero panorámico para Wallet con tarjeta de débito esport holográfica 3D/CSS (borde satinado de oro metálico, microchip dorado multicapa, indicador contactless y liga Diamond VIP), métricas clave (total de premios y torneos jugados), sección de recarga rápida y listado de transacciones con iconos temáticos y timestamps formateados. Rediseño de Cuenta con tarjeta de Pasaporte VIP (avatar con halo dorado e insignia de nivel superpuesta, status pill, estadísticas de carrera: victorias, skins y desafíos completados) y paneles de cristal para Email y KYC. 42/42 tests pasando.

