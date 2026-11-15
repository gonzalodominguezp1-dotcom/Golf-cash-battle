
## 2026-11-06 — vfx-lab-efectos

- Alcance elegido: portales, choques y efectos de skin; VFX de ambiente del mapa queda para otro ciclo.
- Banco de pruebas fuera del repo (`golfito-vfx-lab`), por decisión del equipo. Se permite motor propio donde dé mejor resultado, pero con paridad con el juego.
- Objeción levantada y anulada: riesgo de dos motores divergentes. Se cubre con criterio de paridad en la spec.
- Integración al juego dentro del mismo ciclo. Autopilot activado.

## 2026-11-06 — vfx-lab-efectos (plan)

- Arquitectura: el efecto es dato puro interpretado por un runtime compartido; el banco importa ese mismo runtime para que juego y banco no diverjan.
- Los efectos de skin siguen el formato de emisor ya existente (`P(...)`), como presets no asignados.
- Choque bola contra bola: fuera de ciclo. No hay colisión entre bolas en la física; se sustituye por el golpe en bumper.

## 2026-11-06 — flashRate en forma cerrada (feature: vfx-lab-efectos, task: T003)
Context   — tres rondas de revisión encontraron trabajo no acotado en el validador: expandir las repeticiones de un bucle costaba 1/duración, y el conteo de ventana era O(n²).
Options   — (a) guardas puntuales por entrada; (b) topes de repeticiones; (c) calcular en forma cerrada.
Decision  — (c): una ventana de 1 s abarca q periodos enteros más un resto cíclico, contado con dos punteros.
Why       — las guardas (a) y (b) dejaban siempre otra entrada que se cuelga; (c) hace que el coste dependa solo del número de destellos.

## 2026-11-06 — maxParticles entero y VfxPlayer con topes propios (feature: vfx-lab-efectos, task: T003/T004)
Context   — con un tope fraccionario `emissions` superaba `budget()`, y el plan original fijaba 40/120/300 para los efectos.
Decision  — `maxParticles` debe ser entero y `budget` lo trunca; el tope por efecto es el del `VfxPlayer` (24/60/120), el más estricto.
Why       — mantiene «nunca más emisiones que el presupuesto» y acota el peor caso junto a `SkinFX`.

## 2026-11-12 — Alcance de la UI por pantallas (feature: ui-pantallas, task: spec)
Context   — se pide un hub tipo MatDrive con pantallas completas y splash; varios datos (liga, desafíos temporales, cofres, historial) no existen.
Decision  — solo interfaz y navegación; los datos inexistentes se listan como huecos y el modelo de desafíos se propone sin construirlo; sin service worker.
Why       — el saldo es real y lo decide el servidor (S5.7); mostrar datos falsos o cacheados induciría a error.

## 2026-11-12 — Clarify de la UI por pantallas (feature: ui-pantallas, task: clarify)
Context   — 13 preguntas al humano sobre datos reales, composición del hub, escena y navegación.
Decision  — sin retos con fecha ni pantallas Desafíos/Recompensas («desafíos» pasa a «logros»); hub con escena 3D propia (hoyo en bosque de día) cargada durante el splash; composición fija de C10; sin saldo ni botón de silencio en el hub; atrás en el hub no hace nada; bocetos aprobados antes de splash y hub.
Why       — decisión del humano; mantiene solo datos reales en un juego con saldo real.
Exception — U6.6 (botón de silencio visible) queda exceptuada en el hub por decisión del humano; el silencio sigue en Ajustes y con M. Pendiente de anotar en la tabla de enmiendas de la constitución.

## 2026-11-12 — Plan de la UI por pantallas (feature: ui-pantallas, task: plan)
Context   — `main.js` concentra navegación, pantallas y fugas de listeners/timers; hay que meter router, hub 3D y splash sin pasar de +15 KB gzip en la carga inicial.
Options   — (a) pantallas vivas apiladas en el DOM; (b) destruir al tapar y remontar al volver, con el hub como única pantalla viva; splash como módulo de Vite o como script clásico en `public/`.
Decision  — (b) con pantallas `mount(ctx) → { destroy }` cargadas por `import()` y todo efecto secundario en un `scope` inyectado; splash como script clásico en `public/splash.js` que habla con el bundle por `window.gcbSplash`. Three/escena no bloquean el splash: tras 8 s el hub usa la imagen fija.
Why       — el `scope` hace cumplir AC5 por construcción; los chunks por pantalla adelgazan la entrada (AC34); Vite agrupa los scripts módulo del HTML y el splash no podría pintarse antes del bundle (AC25).
Open      — saldo en la cabecera de Ranking (AC1 frente a C11; el plan sigue C11); amigos salen de Cuenta › Perfil hacia «Amigos y grupo» con un acceso en Perfil; `#hoyoN` se mantiene «como hoy» (prepara la práctica, se juega al pulsar Práctica).

## T018 — Aprobación del boceto del splash (2026-11-14)
Decision  — El humano (Chakets) aprueba el boceto `02-DOCS/attachments/ui-pantallas/splash-boceto.html`. Incluye: capas en vertical a 60vh ancladas abajo con el cielo prolongado en #5594c5, bosque sobre el green, estela de la pelota en CSS, barra con %, TIP y estado «Reintentar». Con la aprobación se cambió también la escena del hub: bandera roja intensa y cámara más cerca (órbita 8,5 y altura 3,2); las capas de `public/splash/` se regeneraron con ese encuadre.
Why       — Gate humano C13: sin aprobación no empieza T019.
Open      — Los PNG del boceto (`splash-boceto-*.png`) son anteriores al cambio de cámara y bandera; el HTML usa las capas nuevas. TIP de ejemplo («Un golpe suave en el green vale más que uno fuerte») pendiente de textos definitivos.

## T024 — Aprobación del boceto del hub y de la pantalla tipo (2026-11-14)
Decision  — El humano (Chakets) aprueba `hub-boceto.html` y `pantalla-tipo-boceto.html` con estos ajustes, que mandan sobre el boceto: (1) iconos: los que ya existen en `src/ui/icons.js`, sin SVG nuevos: Ranking `trophy`, Logros `medal` (tono gold), Skins `skins`, Amigos `users`, Mapas `map`, Práctica `tee`, Ajustes `gear`, pantalla completa `fullscreen`, usuario `user`; (2) etiqueta de texto siempre visible bajo cada icono en todos los accesos del hub (decisión del orquestador, a petición «lo que más convenga»: claridad y accesibilidad); (3) Mapas y Práctica llevan icono también: en 375 px cada lado de la fila inferior dispone de ~105 px y las píldoras ocupan 62-70 px, el «sin espacio» del boceto no se sostenía; (4) logo con tamaño adaptable a la altura de pantalla (p. ej. `clamp` sobre vh con ancho máximo) para que quepa sin tapar la bandera ni chocar con los botones laterales, también a 360x640; (5) el resto del boceto se mantiene: composición C10, velo oscuro para contraste AA, pantalla tipo con fondo oscuro.
Why       — Gate humano C13: sin aprobación no empieza T025.
Open      — Los PNG de los bocetos son anteriores a estos ajustes; manda el texto de esta decisión. Los badges del boceto son datos de ejemplo.

## Ajustes del hub pedidos por el humano tras T026 (2026-11-14)
Decision  — (1) Iconos y botones del hub mucho más grandes: el recuadro `.hub-ico` contiene solo el icono y la etiqueta va debajo, fuera del recuadro, con sombra de texto. (2) Estilo nuevo del fondo de los iconos: degradado propio por destino (Ranking dorado, Logros naranja, Skins violeta, Amigos azul, herramientas grafito) con brillo superior. (3) Barra inferior Mapas · JUGAR · Práctica: misma altura, color de fondo propio (azul, verde, ámbar), texto DENTRO de la caja, JUGAR 18 px más arriba que los otros dos y animado (pulso 2,4 s y destello 3,2 s, apagado con reduced-motion); fuente Outfit 800 en mayúsculas, la misma que las etiquetas de los accesos laterales (se probaron Plus Jakarta, Lilita One y Montserrat y se descartaron; no se añade ninguna fuente externa). (4) **Cambia C10**: el hub muestra el saldo, una píldora con el icono de monedas y la cantidad a la derecha del perfil, que se ensancha con las cifras (compacto «12,3 M» desde 10 millones) y abre Cuenta › Monedero; el saldo sigue también en Mesas y Cuenta (Q4). Sin icono de wallet. (5) Se quita el logo de la barra (queda un h1 solo para lectores de pantalla) y la barra superior es una sola fila; el logo vuelve como banderín en la escena 3D (tarea aparte, prompt en `02-DOCS/attachments/ui-pantallas/prompt-banderin-hub.md`). (6) Ajustes, pantalla completa y Cuenta no llevan texto visible, solo nombre accesible.
Why       — Peticiones directas del humano al ver el hub; manda sobre el boceto T024 y sobre C10.
Open      — Verificación visual pendiente (la hace el usuario). Con 7 dígitos a 360 px la caja de monedas queda justa (se redujo su padding y su fuente bajo 380 px). JUGAR no da feedback de pulsación mientras su animación está activa.

## Accesos bloqueados del hub: cadenas, popup y centrado óptico (2026-11-14)
Decision  — (1) Todos los accesos del hub tienen el mismo aspecto: se eliminan el borde discontinuo y la opacidad por estado (decisión previa sobre Amigos de invitado). Se mantiene el degradado propio por destino (interpretación; unificarlo es una línea). (2) Un acceso bloqueado se dibuja «encadenado»: icono normal algo apagado (saturate .55, brillo .78), dos cadenas en X de esquina a esquina (icono nuevo `chains`, 6 eslabones por cadena, mismas primitivas que `robot` y `lock`) y el icono `lock` en un disco central. `aria-disabled="true"`, nunca `disabled`, con nombre accesible que incluye el requisito. (3) Al pulsarlo NO navega: abre un diálogo modal (`reasonDialog` en `components.js`, reutilizable) con el requisito y, si hay acción útil, «Ir a Cuenta». Foco inicial en «Entendido»; Esc, «Entendido» o el fondo lo cierran y devuelven el foco; al tapar o destruir el hub se cierra sin robar el foco. (4) Bloqueos aplicados, solo con requisitos que YA existen en el código: Amigos y grupo para invitado/anónimo (requiere cuenta), Amigos con cuenta real sin nombre de usuario («Ponte primero un nombre de usuario para añadir amigos.», el mensaje de `friendsPanel`), y Ranking y Amigos sin conexión al servidor (mensaje de `showRanking`). Mecanismo genérico `computeLocks({ guest, hasBackend, hasName })` en `hubRules.js`. Sin bloquear: Ranking para anónimos (la pantalla solo exige que exista cuenta), Skins, Logros, Mapas, Práctica, JUGAR y monedero. Los accesos de la barra inferior no admiten cadenas hoy. (5) Centrado óptico: cada icono se desplaza con una tabla `ICON_NUDGE` (unidades del viewBox 51×51) para que su dibujo quede en el centro exacto del recuadro; desvíos medidos antes: Amigos -3,6, avatar -3,4, Práctica +2,6, Logros 0,4 y Skins 0,6. Un test mide la caja real de cada icono con `tests/helpers/svgBounds.js` y falla si algo se descentra más de 0,12 unidades.
Why       — Peticiones directas del humano; el centrado se mide en vez de ajustarse a ojo para que no se estropee al cambiar iconos.
Open      — Verificación visual pendiente (la hace el usuario): aspecto de las cadenas y que no queden huecos entre eslabones. Los bloqueos se recalculan al montar y en onUncover; no hay suscripción a cambios de sesión del backend.

## Centrado de los iconos del hub: causa real y método (2026-11-14)
Decision  — Los iconos de los accesos con recuadro (Ranking, Logros, Skins, Amigos, Mapas, Práctica) quedaban ~5 px por encima del centro por un fallo de CSS, no por la medida del dibujo: `.hub-ico` es una cuadrícula y el `<span data-badge>` vacío creaba una 2.ª fila implícita. Solución: `.hub-ico > svg, .hub-ico > [data-badge] { grid-area: 1 / 1; }`. Además la tabla `ICON_NUDGE` se recalcula midiendo PÍXELES sobre el render real (`node scripts/measure-hub-icons.mjs`, Chrome headless por CDP) con el criterio «centro de la caja visible (alfa > 40) del icono completo»; el test `hub-icon-centering` guarda esa caja visible por icono (`VISIBLE_BOX`) y falla si la caja geométrica se desvía más de 0,3 unidades o si caja + nudge queda a más de 0,12 unidades del centro.
Why       — La medida geométrica anterior daba ~0 de desvío aunque en pantalla se vieran descentrados; solo el render real lo detectó. Márgenes medidos (recuadro de 78 px) antes → después: Logros 10,0/20,75 → 15,5/15,5 y Skins 13,0/23,0 → 17,75/18,0 (superior/inferior).
Open      — Verificación visual pendiente (la hace el usuario). La parte «Skins a la derecha» del reporte no se reprodujo en el render (desvío horizontal 0 px). Chains se centra por geometría porque su dibujo se recorta por el lienzo.
