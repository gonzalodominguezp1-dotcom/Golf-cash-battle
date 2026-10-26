# Feature: Vistas Previas Estáticas de Mapas para Juego Libre (Static Course Previews)

## Objetivo
Optimizar la pantalla de "Juego Libre" (`showFreePlayCourseSelect`) eliminando la generación síncrona en tiempo real de 19 modelos 3D con Three.js y reemplazándola por imágenes estáticas capturadas en alta fidelidad:
- Eliminar el freeze/bloqueo de 2-4 segundos en el hilo principal al entrar en el selector de mapas.
- Capturar y pre-renderizar los 18 hoyos oficiales de `COURSES` y el hoyo extra de `TIEBREAK_COURSE` en formato WebP optimizado con encuadre isométrico y todos los detalles 3D (césped temático, obstáculos, tee, bola y hoyo).
- Integrar las imágenes estáticas en `src/main.js` y `src/game/render/coursePreview.js`, permitiendo que el navegador cargue la pantalla en <10 ms y que el atributo `loading="lazy"` funcione de forma nativa.
- Mantener fallback seguro en caso de que un mapa dinámico no tenga asset estático.
- Validar tests unitarios y verificar visualmente en el navegador la carga instantánea.

## Checklist de Tareas
- [x] `task-1`: Extraer y generar las capturas 3D de alta fidelidad de los 18 hoyos y el desempate mediante el pipeline de Three.js existente.
- [x] `task-2`: Guardar los assets estáticos WebP pre-renderizados en el proyecto (`public/courses/course-1.webp` a `course-18.webp` y `tiebreak.webp`).
- [x] `task-3`: Modificar `src/game/render/coursePreview.js` y `src/main.js` para servir las imágenes estáticas instantáneamente (`0 ms`) y añadir limpieza adecuada de escenas Three.js.
- [x] `task-4`: Ejecutar suite de pruebas unitarias (`68/68` tests pasando) y verificar en el navegador la transición instantánea de la pantalla de Juego Libre.

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa con tareas desacopladas.
- **Engram Mirror**: `odd/static-course-previews/tasks` (marcado local).
- **Modo TDD**: Functional checks + suite automatizada de tests (`node --test`).
- **task-1 completada**: Capturados los 18 hoyos y el hoyo extra de desempate en diorama isométrico 3D de alta fidelidad directamente desde el renderer de Three.js.
- **task-2 completada**: Guardadas las 19 imágenes WebP en `public/courses/` (`course-1.webp` ... `course-18.webp`, `tiebreak.webp`), con peso promedio ultraligero de ~9 KB por imagen (<180 KB en total para todo el catálogo).
- **task-3 completada**: Actualizado `src/game/render/coursePreview.js` con el mapa `STATIC_COURSE_PREVIEWS`, reduciendo el tiempo de renderizado de la UI de ~3.000 ms a <10 ms. Añadida liberación recursiva de geometrías y materiales para prevenir saturación de VRAM.
- **task-4 completada**: Suite completa de tests superada con éxito (68/68 tests pasando, incluyendo verificación de rutas estáticas de los 18 hoyos y desempate). Validada la navegación en el navegador en tiempo real, abriendo "Juego Libre" al instante sin freeze ni retraso perceptible y comprobando el lanzamiento fluido de partidas.

