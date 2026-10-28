# Juego y economía

Minigolf 3D para navegador y móvil. Hasta 8 jugadores por mesa. Cada jugador paga una entrada. El que menos golpes hace se lleva el bote menos la comisión.

Estado actual: prototipo jugable con créditos demo. No hay dinero real (ver [pendiente antes de dinero real](../operacion/dinero-real-pendiente.md)).

## Partida

- 8 jugadores por mesa (`PLAYERS_PER_MATCH` en `src/config.js`).
- 3 hoyos por partida (`HOLES_PER_MATCH`), iguales para todos.
- Máximo 8 golpes por hoyo (`MAX_STROKES_PER_HOLE`).
- Contador de 20 s (`HOLE_TIME_LIMIT`): cuando el primero emboca, los demás tienen 20 s. Quien no emboca queda descalificado en ese hoyo y se le apunta el máximo de golpes.
- Los rivales juegan el mismo hoyo a la vez, con la misma física, y ven la clasificación en vivo.
- Las puntuaciones de los rivales se ocultan hasta terminar la ronda. Al final, todos hacen un tiro de desempate, que solo cuenta si hay empate en cabeza.

## Hoyos

- 15 hoyos en `src/game/courses.js`, en ambientes distintos: pradera, playa, atardecer, nieve, cañón, otoño, noche, volcán y el neón cyberpunk (Cyberpunk2078). Ambientaciones en `src/game/themes.js`.
- Para añadir hoyos: añadirlos al final de `courses.js` y subir `course_count` en `app_config` (migración nueva en `supabase/migrations/`).

## Niveles de mesa

| Nivel | Entrada | Bote (entrada × 8) | Premio (bote − 10 %) |
|---|---|---|---|
| Práctica | 0 | 0 | 0 |
| Bronce | 1 | 8 | 7,20 |
| Plata | 5 | 40 | 36 |
| Oro | 10 | 80 | 72 |
| Diamante | 25 | 200 | 180 |
| Esmeralda | 50 | 400 | 360 |

- Comisión de la plataforma: 10 % del bote (`PLATFORM_COMMISSION`).
- Los empates reparten el premio.
- Los valores están en `src/config.js` (`TIERS`, `potFor`, `prizeFor`).

## Torneos

- Torneos asíncronos de 8 plazas. Cada jugador juega los mismos hoyos a su ritmo, con 20 min para terminar.
- El bote se reparte cuando han terminado todos y la mesa está llena, o cuando se cierra la inscripción (15 min).
- Si al cerrar solo hay un jugador, se le devuelve la entrada.
- En torneos, el contador se cuenta desde el jugador más rápido del hoyo, y lo comprueba el servidor.

## Créditos y progreso

- Cada jugador empieza con 100 créditos demo (`STARTING_DEMO_CREDITS`).
- Wallet demo con recargas demo e historial de movimientos.
- Skins con inventario y progreso (`src/progress/`). Las skins premium tienen sus propias reglas de render, no de economía.

## Sensación de juego (solo visual)

Tono de carga, temblor de cámara, onda en el impacto, bola que se aplasta al chocar y cámara lenta en golpes largos. La física sigue a paso fijo; estos efectos no la modifican.
