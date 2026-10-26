# Feature: Entorno Cyberpunk Futurista para Mapas de Neón

## Objetivo
Dotar a los mapas de temática neón (`neon` y `neonPink`) de un entorno 3D inmersivo, impactante, liviano y de estética cyberpunk futurista:
- Megaciudad cyberpunk perimetral estilizada y no recargada: 12 monolitos y torres lejanas a distancia segura (> 60 unidades del centro, > 28 del contorno de juego), con fachadas sobrias y líneas de neón sutiles.
- Montañas y elevaciones del terreno de estética cyberpunk con final picudo (aristas y picos afilados mediante ruido ridged multifractal elevado a potencia con sombreado plano facetado `flatShading`).
- Carteles holográficos flotantes en el horizonte (2 displays vectoriales de alta altitud).
- Tráfico aéreo lejano de 3 speeders futuristas en corredor superior con estelas suaves.
- 2 searchlights sutiles barriendo el cielo nocturno y sol synthwave segmentado.
- Corrección geométrica y visual completa de los loopings: anchura ajustada al fairway, carril 100% opaco para erradicar fallos de ordenación z-buffer, offset perpendicular a la normal, raíles elevados en la normal interior y línea guía de neón.
- Limitación estricta del bloom de todas las luces y mapas a un máximo del 15% (fuerza de `UnrealBloomPass` fijada a 0.14 en nocturnos/neón y 0.08 en mapas diurnos, con intensidades emisivas reguladas en todos los materiales).
- Cero invasión o clipping sobre el campo de juego y preservación absoluta del determinismo físico (60/60 tests passing).

## Checklist de Tareas
- [x] `task-1`: Diseñar y crear módulo cyberpunk liviano (`src/game/render/cyberpunkEnvironment.js`) con 12 monolitos lejanos y control estricto de emisivos para bloom <= 15% — Commit: `9c08dcc`.
- [x] `task-2`: Implementar 2 carteles holográficos flotantes de alta altitud, 2 haces láser suaves y 3 speeders en corredor superior — Commit: `9c08dcc`.
- [x] `task-3`: Terreno cyberpunk con relieve de montañas de final picudo (`sharpPeak` con ruido ridged multifractal y flatShading) y props perimetrales seguros — Commit: `9c08dcc`.
- [x] `task-4`: Corregir el modelado visual del looping en `src/game/render/attractions.js` (carril opaco, anchura calibrada, raíles normales y línea guía) y acotar el bloom en `GolfGame.js` y `course.js` al 15% — Commit: `9c08dcc`.
- [x] `task-5`: Verificación integral en código, bundle de producción (`pnpm build`) y validación de la suite completa (`pnpm test` 60/60 tests ok) — Commit: `9c08dcc`.

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa modular por componentes.
- **Engram Mirror**: `odd/cyberpunk-neon-environment/tasks` (marcado local).
- **Modo TDD**: Functional checks + suite completa automatizada (`pnpm test`).
- **task-1 completada**: Módulo `cyberpunkEnvironment.js` optimizado con 12 monolitos a distancia segura (distancia > 60 unidades), fachadas de datos sutiles y emisión controlada.
- **task-2 completada**: 2 displays holográficos de gran altitud ("NEON CITY" y "CYBER GOLF"), 2 searchlights lentos de opacidad 0.14 y 3 speeders distantes.
- **task-3 completada**: Terreno con función de elevación de picos puntiagudos (`Math.pow(ridge, 2.6) * 16.0`), sombreado plano facetado (`flatShading: true`) y suelo de matriz digital con cuadrícula reflectante.
- **task-4 completada**: Modelado de looping reconstruido con precisión: carril opaco (`side: THREE.DoubleSide`, sin transparencia defectuosa), anchura `half = loop.w / 2 - 0.03`, cálculo de raíles con elevación en la normal interior y línea guía central. Capping de bloom a 14-15% en `GolfGame.js` (`this.bloom.strength = glowy ? 0.14 : 0.08`), `course.js` y `attractions.js`.
- **task-5 completada**: Bundle de producción generado con éxito (`pnpm build` en 1.36s) y paso impecable de los 60 tests en `pnpm test`.
