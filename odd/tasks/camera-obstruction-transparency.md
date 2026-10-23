# Feature: Transparencia al 90% para Elementos que Obstaculizan la Cámara

## Objetivo
Resolver la desaparición abrupta de elementos (paredes, postes de esquina y obstáculos) cuando se mueve o cambia la vista de la cámara:
- En lugar de desaparecer por completo (`visible = false` o `opacity = 0`), los elementos que obstaculicen la visión de la pelota deben volverse **90% invisibles** (10% de opacidad, `opacity = 0.1`), manteniendo una silueta translúcida elegante que evite la sensación de fallo de diseño o corte brusco.
- Filtrado estricto de obstrucción: **única y exclusivamente** se transparentan los elementos situados físicamente entre la cámara y la pelota (`0.02 < t < 0.98`) que cortan la línea de visión 3D. El muro lejano de fondo y los elementos situados detrás o al lado de la pelota permanecen 100% sólidos, opacos y nítidos.
- Aplicar tanto a la **cámara normal de juego** como a la **vista general del terreno de juego** (modo overview activado con la tecla Espacio).
- Detección precisa de obstrucción en 3D: comprobar altura efectiva del rayo cámara->pelota frente a la altura del elemento, evitando falsas obstrucciones cuando la cámara sobrevuela el campo a gran altura en vista general.
- Transición suave de opacidad (lerp) en paredes y postes, soportando materiales independientes y atenuación coordinada de emisivos/resplandores neón.
- Cero regresiones en la física, controles o tests automatizados del juego.

## Checklist de Tareas
- [x] `task-1`: Implementar cálculo de obstrucción 3D estricto (cámara -> pelota, `0.02 < t < 0.98`) y soporte de materiales translúcidos individuales para postes y paredes en `src/game/render/course.js`.
- [x] `task-2`: Actualizar lógica de opacidad de paredes, postes y setas a objetivo 90% invisible (`targetOpacity = 0.1` al obstruir la pelota, `1.0` al estar libre) sin alterar visibilidad (`m.visible = true`), con atenuación de emisivo neón coordinada.
- [x] `task-3`: Coordinar `GolfGame.js` para sincronizar la llamada a `#placeCamera` inmediatamente antes de `courseView.update` garantizando coordenadas exactas en tiempo real.
- [x] `task-4`: Verificación integral en modo normal y vista general (Espacio), validación de build (`pnpm build`) y tests automatizados (65/65 tests ok).
- [x] `task-5`: Hacer posible desenfocar múltiples objetos y capas a la vez. En molinos (`buildWindmill`), asegurar que todas sus capas (torre, tejado, ventanas, marco de puerta, contornos de neón, aspas giratorias, brazos y buje central, así como la luz) se vuelvan translúcidas al 90% (`opacity = 0.1`) al obstruir la bola. Soportar desenfoque simultáneo de cualquier combinación de objetos y capas en la línea de visión cámara-pelota.

## Registro de Estado y Evidencia
- **Ruta implementada**: Direct inline / coordinada en rama `feature/camera-obstruction-transparency` (sin tocar `main`).
- **Engram Mirror**: `odd/camera-obstruction-transparency/tasks` (marcado local pendiente de Engram).
- **Modo TDD**: Functional checks + suite de tests del proyecto (`pnpm test` 67/67 tests ok).
- **Corrección de muro lejano**: El cálculo de corte se restringió estrictamente al segmento entre la cámara y la pelota (`0.02 < t < 0.98`). Los muros de fondo y elementos posteriores a la pelota tienen `t >= 0.98` y permanecen al 100% de opacidad sin desenfocarse.
- **Desbloqueo de múltiples capas en molinos**: Se unificó la transición de opacidad recorriendo la jerarquía del molino con `g.traverse`, asignando `transparent: true` y atenuación de emisivos y luz a todas las capas (aspas, palos, buje, torre, tejado, ventanas, marco y bordes de neón).
- **Desenfocado simultáneo de múltiples objetos**: Muros, postes, setas (con contornos translúcidos), aspas giratorias (spinners), bloques móviles (movers), túneles y molinos se evalúan de forma independiente por fotograma, permitiendo que cualquier conjunto de elementos intermedios se transparente simultáneamente al 90% (0.1) si intercepta la visión de la bola.
