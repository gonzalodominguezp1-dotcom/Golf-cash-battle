# Feature: Vistas Previas de Mapas en Tarjetas de Juego Libre (Course Card Previews)

## Objetivo
Añadir una vista previa visual de cada mapa en las tarjetas de selección de "Juego Libre" (`showFreePlayCourseSelect`):
- Cada una de las tarjetas (los 18 hoyos oficiales + hoyo extra de desempate) debe contar con una vista previa fiel y atractiva de su trazado correspondiente.
- Renderizado de alta fidelidad con diorama 3D isométrico que muestra la pista real con su césped temático, paredes, curvas, obstáculos (loopings, molinos, aspas, setas rebotadoras, arena, aceleradores, tubos/portales), bola en el tee de salida y bandera en el hoyo/meta.
- Generador de vistas previas con caché (`coursePreview.js`) para rendimiento óptimo instantáneo, sin sobrecarga de contextos WebGL ni bloqueos de interfaz.
- Fallback automático 2D de alta resolución en caso de que WebGL no esté disponible o en entornos de testeo.
- Superposiciones e indicadores útiles en cada vista previa: distancia aproximada del hoyo (Tee a Hoyo en metros), insignias de obstáculos destacados y efecto hover interactivo con botón de inicio rápido.
- Diseño visual luxury esport integrado con el estilo cyberpunk neón de la aplicación en `src/style.css`.
- Suite de tests unitarios automatizados que valida la generación de vistas previas para todo el catálogo de mapas.

## Decisiones de Diseño y Arquitectura
- **Renderizado por Diorama Isométrico**: Se aprovecha el motor Three.js existente (`buildCourse`, geometrías y materiales procedurales) para renderizar un snapshot 3D nítido desde una perspectiva isométrica optimizada que abarca todo el contorno (`courseBounds`).
- **Instancia Única de Renderizado y Caché en Memoria**: Para evitar el límite del navegador de contextos WebGL (típicamente 16) con 19 tarjetas simultáneas, se utiliza un único `WebGLRenderer` offscreen compartido con `preserveDrawingBuffer: true`, guardando las capturas como data URLs en una caché en memoria (`Map`).
- **Carga Eficiente y Fallback Universal**: Las vistas previas se generan de manera instantánea y reutilizan recursos. Si WebGL o el DOM no están disponibles (como en tests de Node.js), un fallback 2D en Canvas genera el plano del trazado sin lanzar excepciones.
- **Micro-interacciones y Estética Premium**: Marco con bisel iluminado y brillo ambiental tintado con el color del tema (`theme.color`), zoom suave al pasar el cursor (`transform: scale(1.07)`), insignias de datos del hoyo (distancia en metros e insignia de obstáculo clave como Looping o Molino) y acción de clic rápido en la miniatura para iniciar partida.

## Checklist de Tareas
- [x] `task-1`: Crear módulo de renderizado de vistas previas de mapas (`src/game/render/coursePreview.js`) con soporte de captura 3D isométrica, encuadre de bounds, tee/cup markers, caché en memoria y fallback 2D seguro.
- [x] `task-2`: Integrar las vistas previas en las tarjetas de `showFreePlayCourseSelect` en `src/main.js` para los 18 hoyos y el hoyo de desempate, con badges de distancia e interacción de clic.
- [x] `task-3`: Implementar estilos visuales, efectos de hover, badges superpuestos, placeholders de carga y maquetación responsiva en `src/style.css`.
- [x] `task-4`: Desarrollar tests unitarios en `tests/course-preview.test.js`, verificar la suite completa de pruebas (64/64 tests en verde) y validar visualmente en el navegador con `browser_subagent`.

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa con tareas desacopladas.
- **Engram Mirror**: `odd/course-card-previews/tasks` (marcado local/pendiente de herramienta).
- **Modo TDD**: Functional checks + suite automatizada de pruebas unitarias (`node --test`).
- **task-1 completada**: Creado `src/game/render/coursePreview.js` con exportación de `getCoursePreview(course, options)`, `getCourseDistance(course)` y `preloadCoursePreviews(courses)`. Implementa encuadre óptimo de cámara isométrica en ángulo 53.8° / -18.3°, marcadores 3D de salida con bola blanca y hoyo con aro iluminado, diana para el desempate, iluminación adaptada al tema del mapa, instancia única de `WebGLRenderer` y fallback 2D Canvas.
- **task-2 completada**: Actualizada la función `showFreePlayCourseSelect` en `src/main.js` para los 18 hoyos y el hoyo extra de desempate. Cada tarjeta renderiza el contenedor `.course-card-preview-wrap` con la miniatura del mapa correspondiente, badges de distancia (`📍 ~Xm`) y obstáculo característico (`🌀 Looping`, `⚙️ Molino`, `🌋 Volcán`, etc.), overlay interactivo al pasar el cursor y soporte de clic en la miniatura para iniciar el juego.
- **task-3 completada**: Diseñados e implementados los estilos en `src/style.css` para `.course-card-preview-wrap`, `.course-preview-media`, `.course-preview-img`, `.course-preview-glow`, `.course-preview-badges`, `.preview-badge`, `.course-preview-action-overlay` y adaptaciones para dispositivos táctiles (`@media (hover: none)`). Eliminado el espacio muerto vertical en `.course-card` con alineación uniforme del botón al pie mediante `margin-top: auto`.
- **task-4 completada**: Creados tests unitarios en `tests/course-preview.test.js` verificando cálculo de distancia tee-hoyo para los 18 hoyos + desempate, tolerancia a entradas nulas/indefinidas y ejecución sin excepciones en precarga. Suite completa ejecutada al 100% pasando (64/64 tests). Build de Vite verificado con éxito (`pnpm build` en 1.42s). Verificación visual interactiva completada en navegador mediante subagente demostrando renderizado 3D nítido, efectos de hover y lanzamiento de partida con clic.
