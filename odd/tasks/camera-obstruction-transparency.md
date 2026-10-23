# Feature: Transparencia al 90% para Elementos que Obstaculizan la Cámara

## Objetivo
Resolver la desaparición abrupta de elementos (paredes, postes de esquina y obstáculos) cuando se mueve o cambia la vista de la cámara:
- En lugar de desaparecer por completo (`visible = false` o `opacity = 0`), los elementos que obstaculicen la visión se vuelven **90% invisibles** (10% de opacidad, `opacity = 0.1`), manteniendo una silueta translúcida elegante que erradica la sensación de corte brusco o fallo de diseño.
- Se aplica tanto a la **cámara normal de juego** como a la **vista general del terreno de juego** (modo overview activado con la tecla Espacio).
- Detección precisa de obstrucción en 3D: comprobación de la altura efectiva del rayo cámara->objetivo frente a la altura del elemento, evitando falsas obstrucciones cuando la cámara sobrevuela el campo a gran altura en vista general.
- Transición suave de opacidad (lerp) en paredes, postes, setas rebotadoras y atracciones, soportando materiales independientes y atenuación coordinada de emisivos/resplandores neón.
- Cero regresiones en la física, controles o tests automatizados del juego.

## Checklist de Tareas
- [x] `task-1`: Implementar cálculo de obstrucción 3D (cámara -> bola y cámara -> centro/objetivo) y soporte de materiales translúcidos individuales para postes y paredes en `src/game/render/course.js`.
- [x] `task-2`: Actualizar lógica de opacidad de paredes y postes a objetivo 90% invisible (`targetOpacity = 0.1` al obstruir, `1.0` al estar libre) sin alterar visibilidad (`m.visible = true`), con atenuación de emisivo neón coordinada.
- [x] `task-3`: Coordinar `GolfGame.js` para suministrar la posición actualizada de cámara, bola, objetivo de vista (`camLook`) y estado de vista general (`this.overview`) al ciclo de renderizado.
- [x] `task-4`: Verificación integral en modo normal y vista general (Espacio), validación de build (`pnpm build`) y tests automatizados (61/61 tests passing).

## Registro de Estado y Evidencia
- **Ruta implementada**: Direct inline / coordinada.
- **Engram Mirror**: `odd/camera-obstruction-transparency/tasks` (marcado local pendiente de Engram).
- **Modo TDD**: Functional checks + suite automatizada completa (`pnpm test` con 61 tests pasando).
- **task-1 completada**: Se implementaron los chequeos de corte de rayo tridimensional (`wallBlocksRay`, `wallNearCamera`, `postNearCamera`, `postBlocksRay`), evaluando la cota de altura `rayY` frente a la cota superior del elemento en el mundo `wallTop` / `p.h`. Los postes y setas cuentan ahora con materiales propios individuales con `transparent: true`.
- **task-2 completada**: Eliminada por completo la ocultación de malla (`visible = false` o umbrales de desaparición). Ante obstrucción, el objetivo de interpolación es `targetOpacity = 0.1` (90% invisible). La visibilidad permanece activa (`m.visible = true`), `depthWrite` se desactiva mientras está translúcido (`m.depthWrite = opacity > 0.95`), y la intensidad emisiva de neón escala proporcionalmente para no deslumbrar.
- **task-3 completada**: En `GolfGame.js`, `#placeCamera(realDt)` se reordenó para ejecutarse antes de `courseView.update`, asegurando que la posición y rotación de la cámara correspondan al frame actual. Se propagaron `camLook` y `isOverview` para proteger tanto la visión de la bola como del recorrido completo del hoyo.
- **task-4 completada**: Verificación visual interactiva en navegador en modo normal y vista general por órbita (capturas de evidencia generadas), bundle de producción generado con éxito (`pnpm build` en 1.29s) y test unitario específico añadido a `tests/desktop-controls.test.js` con 61/61 tests en verde.
