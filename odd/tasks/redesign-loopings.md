# Feature: Rediseño Realista y Visual de los Loopings en Todos los Mapas

## Objetivo
Rediseñar y corregir por completo los loopings de minigolf en todos los mapas del juego (`Looping Neón`, `Doble Looping` y `Looping Nocturno`), transformando el actual cilindro/cinta plana y sus postes improvisados en atracciones de minigolf realistas, espectaculares y fieles a la realidad:
- **Trayectoria matemática suave y continua**: Eliminar el retorcimiento artificial en "S" y los quiebros angulares causados por `TWIST * sin(th)`. Reemplazarlo por una transición helicoidal monótona y continua $C^1$ que conecta perfectamente tangente al centro de la calle en la entrada y en la salida, con despeje holgado en el cruce vertical.
- **Canal de pista con volumen y profundidad física**: Sustituir la cinta plana bidimensional de grosor cero por un carril extruido con base sólida, perfiles biselados, bordes/bordillos de contención elevados y placas de transición metálicas que conectan el césped con la pista.
- **Estructura portante e ingeniería realista**: Reemplazar los dos cilindros verticales sueltos por costillas estructurales curvas exteriores, celosías/patas en "A" con placas de anclaje empernadas al suelo y vigas transversales de soporte.
- **Arco de entrada y señalización temática**: Añadir pórticos de entrada con cheurones iluminados y flechas direccionales que guían el tiro hacia el interior de la vuelta.
- **Estética premium adaptada al tema**:
  - *Neón / Neón Rosa*: Chasis de titanio oscuro/fibra con tiras LED emisivas, cheurones cyberpunk animados y raíles de neón pulsantes.
  - *Nocturno*: Madera noble barnizada y metal oscuro con guirnaldas de bombillas de feria cálidas (estilo clásico de parque minigolf americano/europeo).
  - *Día*: Estilo de competición clásica con perfil lacado brillante y raíles cromados.
- **Comportamiento dinámico e interactivo**: Animación de luces de avance en la pista, iluminación puntual nocturna/neón en el interior del looping y soporte de transparencia al 90% cuando obstaculiza la cámara respecto a la pelota.
- **Determinismo y compatibilidad física**: Mantener intacta la física determinista y la sincronización con el servidor, superando el 100% de la suite de pruebas (`npm test`).

## Checklist de Tareas
- [x] `task-1`: Corregir la trayectoria matemática en `src/game/render/terrain.js` (`loopPoint` y `loopFlightPoint`) para lograr continuidad $C^1$ suave, sin quiebros ni bamboleos en "S", con transición helicoidal limpia.
- [x] `task-2`: Rediseñar la geometría del canal de pista en `src/game/render/attractions.js` (`buildLoop`): carril extruido con profundidad real, bordillos laterales de seguridad, raíles sobre pilaretes y placas de transición de entrada/salida.
- [x] `task-3`: Construir la estructura portante realista y arcos temáticos: costillas de refuerzo curvas, celosías de soporte en "A" con zapatas empernadas al suelo y arcos de entrada temáticos para Neón, Neón Rosa y Nocturno.
- [x] `task-4`: Implementar efectos dinámicos en `buildLoop.update`: cheurones de avance animados en el suelo de la pista, iluminación interior y desvanecimiento al 90% ante obstrucción de cámara.
- [x] `task-5`: Ejecutar suite de pruebas unitarias (`npm test`), capturar y verificar visualmente en el navegador los loopings en los 3 mapas (`Looping Neón`, `Doble Looping` y `Looping Nocturno`) y documentar la evidencia.

## Registro de Estado y Evidencia
- **Ruta implementada**: Delegada orgánica por componentes.
- **Engram Mirror**: `odd/redesign-loopings/tasks` (marcado local).
- **Modo TDD**: Functional checks + suite automatizada de tests (`node --test`).
- **task-1 completada**: Reemplazada la fórmula oscilante `TWIST * sin(th)` por la función helicoidal $C^1$ continua `loopLateralOffset(l, s, th)` con smoothstep cúbico en entrada/salida y separación cosenoidal monótona en la vuelta. La bola conecta perfectamente centrada en la calle sin quiebros ni saltos.
- **task-2 completada**: Extruido un canal en "U" tridimensional completo con pista de rodaje texturizada, bordillos de seguridad verticales y superiores de contención, casco inferior beveled y placas antideslizantes de transición en entrada y salida. Raíles tubulares continuos soportados por pilaretes metálicos a lo largo del recorrido.
- **task-3 completada**: Diseñada estructura portante de ingeniería realista: columnas de soporte en "A" con zapatas de acero empernadas al suelo, costillas de refuerzo transversales que abrazan el carril, pórtico de entrada con dintel y panel señalizador, y balizas superiores.
- **task-4 completada**: Animación de cheurones de avance (`chevronTex.offset.y = -t * 1.6`), luz puntual en el interior de la vuelta que resalta la bola boca abajo, y desvanecimiento suave al 90% de invisibilidad ante obstrucción de la cámara (`update(t, ball, cameraPos)`).
- **task-5 completada**:
  - Commit de unidad de trabajo: `fcb15e2` (`feat(render): redesign minigolf loopings with realistic 3D structure, smooth helical trajectory, and animated lighting`).
  - Suite completa de 68 tests superada con éxito (`68/68 pass`, 0 fallos).
  - Verificación visual directa en navegador en `Looping Neón`, `Doble Looping` y `Looping Nocturno`.
  - Capturadas imágenes de alta fidelidad desde la perspectiva del jugador y vista aérea en modo libre.
  - Comprobado tiro de prueba con desplazamiento fluido de la pelota a través de todo el looping sin anomalías visuales ni saltos de física.
  - Actualizadas las vistas previas estáticas WebP (`public/courses/course-11.webp`, `course-12.webp`, `course-18.webp`).
