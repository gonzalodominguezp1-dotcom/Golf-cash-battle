---
author: compañero (rama la-chaqueta-bionica)
branch: la-chaqueta-bionica
status: planned
---
# Rediseño 1 a 1 de los assets de entorno

## Intent
Los assets que se repiten en los entornos naturales (árboles, arbustos, césped, flores, rocas,
agua) se ven de baja calidad y casi no se mueven con el viento. Queremos rediseñarlos uno a uno,
aprobando cada uno antes de pasar al siguiente, para que el campo se vea vivo y cuidado.

## Decisiones tomadas (con el usuario, 2026-11-15)
- **Estilo:** estilizado liso. Formas suaves, copas con volumen, colores vivos. Una sola familia
  visual: desaparecen los árboles de facetas planas (`flatShading`).
- **Técnica:** todo sigue generado con código (three.js procedural). Sin modelos `.glb` ni imágenes
  descargadas. Las texturas que hagan falta se pintan en un `canvas` (como ya hace `textures.js`).
- **Rendimiento:** móvil primero. Todo debe ir fluido en un móvil medio con calidad Media. La
  calidad Alta añade detalle; la Baja lo quita.
- **Revisión:** cada asset se revisa en una página laboratorio (`assets-lab.html`) antes de entrar en
  los hoyos. El usuario hace las comprobaciones visuales; el agente no abre el navegador.
- **Alcance:** cada asset nuevo sustituye al viejo en **todos los entornos naturales**. Neón y
  cyberpunk no se tocan.
- **Orden:** viento → árbol redondo → pino → palmera → arbustos → césped → flores → rocas → agua →
  especiales (pino nevado, cactus, árbol seco, montón de rocas).

## Ejecución: con subagentes, como siempre
- El agente principal coordina, revisa cada entrega y habla con el usuario. No escribe él solo el
  código grande.
- Cada asset es una tarea para un subagente `developer`.
- **Lo más complejo va con Opus 5.5** (`model: opus`): el viento compartido (paso 0), los shaders y
  el árbol redondo (pasos 1–2, que fijan la técnica de copas), el césped (paso 5) y el agua (paso 8).
- Lo mecánico va con Sonnet (`model: sonnet`): la página laboratorio, arbustos, flores, rocas,
  especiales, sustituir en `environment.js`, tests de presupuesto y recaptura de previews.
- Tras cada tarea, un revisor de contexto limpio lee el diff (`rsc risk` decide cuántos).
- Un asset no pasa al siguiente sin el visto bueno del usuario en el laboratorio.
- Tareas sin ficheros en común pueden ir en paralelo (p. ej. rocas y flores), pero nunca dos
  subagentes tocan el mismo fichero a la vez.

## Estado actual (lo que hay hoy)
- Dos familias de decorado: `makeTree`/`makeRock`/`makeFlower`/`makeTuft` en
  `src/game/render/environment.js` (facetas planas, `MeshLambertMaterial`), usadas por casi todos
  los temas; y `src/game/render/lushEnvironment.js` (formas lisas), solo para la pradera
  (`lushEnv: true` en `themes.js`).
- Viento: `addWind` en `src/game/render/batch.js`. Un solo seno, amplitud `WIND = 0.025` por metro de
  altura: la copa se mueve unos centímetros. El tronco no se dobla. Todo el árbol oscila igual.
- Las flores no llevan `swayRoot`: **no se mueven nunca**.
- `bakeStatic` (batch.js) junta todo el decorado en pocas mallas y **borra los atributos que no sean
  `position`, `normal` o `color`** (salvo `sway`). Cualquier atributo nuevo de viento hay que
  conservarlo ahí.
- Césped: briznas instanciadas en `src/game/render/flora.js` (`addGrassField`, 3 briznas por mata,
  sí se mecen) + matas sueltas (`makeTuft`, `makeGrassClump`).
- Agua: lago con `waterShader` (environment.js, facetas planas, olas de seno). El río
  (`riverWaterPlane` en flora.js) es un plano **sin olas ni movimiento**.
- Calidad: `src/game/render/quality.js` (`decor`, `grass`, `lod`, `shadows`…).
- Las previews estáticas de los hoyos (`public/courses`) se capturan con `pnpm previews:capture`.

## Plan, asset por asset
Cada paso entrega: módulo nuevo en `src/game/render/assets/`, vista en el laboratorio (antes/después,
viento, Bajo/Medio/Alto, triángulos y llamadas de dibujo), test de presupuesto, y la sustitución en
los entornos tras la aprobación.

### Paso L — Página laboratorio (Sonnet)
- `assets-lab.html` + `src/lab/assetsLab.js`, solo en desarrollo (no entra en el `build`).
- Escena con suelo, luz y cielo de un tema elegible. Selector de asset, de tema y de calidad.
- Vista antes/después lado a lado; deslizador de fuerza de viento y botón de ráfaga.
- Contador de triángulos y llamadas de dibujo del asset.

### Paso 0 — Viento compartido (Opus 5.5)
- Un módulo `src/game/render/assets/wind.js` con un uniforme global: dirección, fuerza, tiempo y
  ráfagas.
- Tres capas: doblado del tronco (lento, crece con la altura²), balanceo de copa/rama (medio, fase
  por pieza) y aleteo de hojas/puntas (rápido, poco).
- Ráfagas que **viajan por el campo** según la posición en el mundo: se ve la ola pasar por el
  césped y luego por los árboles.
- El mismo viento mueve árboles, arbustos, césped, flores y juncos.
- `bakeStatic` conserva los atributos de viento al juntar mallas.
- Hecho cuando: en el laboratorio, una ráfaga cruza césped y árboles; tests de `bakeStatic` prueban
  que el atributo sobrevive.

### Paso 1 — Árbol redondo (Opus 5.5)
- Tronco con curva y ramas principales; copa de varios grupos de hojas lisos.
- Normales «esferizadas» hacia el centro de cada grupo (luz suave, estilo cartoon), oclusión por
  color de vértice (más oscuro dentro y abajo), y un toque de luz a contraluz en el borde.
- En Alto: tarjetas de hojas recortadas (textura de hoja pintada en canvas) en el borde de la copa
  para romper la silueta.
- 3–4 variantes de forma por semilla. Viento de las tres capas.
- Presupuesto aproximado de triángulos: Bajo ≤ 250, Medio ≤ 600, Alto ≤ 1200.

### Paso 2 — Pino (Opus 5.5)
- Pisos de ramas con borde ondulado suave, tronco visible entre pisos, punta fina.
- Misma técnica de normales y oclusión que el árbol redondo. Viento: la punta se mueve más.

### Paso 3 — Palmera (Sonnet)
- Tronco curvo con anillos (color de vértice), hojas largas arqueadas con foliolos.
- Las hojas aletean con el viento; el tronco se dobla poco.

### Paso 4 — Arbustos (Sonnet)
- Misma familia que la copa del árbol redondo, baja y ancha. 2–3 formas. Viento suave.

### Paso 5 — Césped (Opus 5.5)
- Briznas instanciadas mejores: más briznas por mata en Alto, curva, punta más clara.
- Color con manchas según el mundo (zonas más amarillas o más oscuras), no uniforme.
- Matas altas junto a la pista con el mismo estilo. Viento con ráfagas del paso 0.
- La textura del suelo combina con el color de las briznas.
- Nada tapa la bola ni el tee (se mantienen las zonas libres de hoy).

### Paso 6 — Flores (Sonnet)
- 3 especies (margarita, tulipán, campanilla) con la paleta de cada tema.
- Instanciadas (una malla por especie), no grupos sueltos. Tallo que se dobla con el viento.

### Paso 7 — Rocas (Sonnet)
- Tipos: canto rodado, losa plana y grupo de piedras. Forma lisa con algún plano tallado.
- Color por capas, musgo arriba (según la normal hacia arriba) en temas verdes, base más oscura
  donde toca el suelo. Sustituye también `rockpile` donde tenga sentido.

### Paso 8 — Agua (Opus 5.5)
- Superficie lisa (sin facetas) con mapa de normales procedural que se desplaza.
- Reflejo del color del cielo según el ángulo (fresnel) y brillo del sol.
- Espuma en la orilla con la distancia a la costa (sin textura de profundidad, cara en móvil).
- El río fluye en su dirección (`river.along`). Lago y río comparten material.
- Juncos y nenúfares con el viento del paso 0.

### Paso 9 — Especiales (Sonnet)
- Pino nevado (pino del paso 2 con nieve en los pisos), cactus, árbol seco.

### Paso F — Cierre (Sonnet)
- Retirar el código viejo (`makeTree`, `makeRock`, `makeFlower`, `makeTuft`, familia `lush`
  duplicada) cuando nada lo use.
- `pnpm test` en verde. Recapturar previews (`pnpm previews:capture`).

## Checklist
- [x] Paso L — laboratorio (visto bueno del usuario 2026-11-15; parpadeo en «Después» en arreglo)
- [x] Paso 0 — viento compartido (visto bueno del usuario 2026-11-15)
- [ ] Paso 1 — árbol redondo (entregado en el laboratorio, pendiente de visto bueno del usuario)
- [ ] Paso 2 — pino
- [ ] Paso 3 — palmera
- [ ] Paso 4 — arbustos
- [ ] Paso 5 — césped
- [ ] Paso 6 — flores
- [ ] Paso 7 — rocas
- [ ] Paso 8 — agua
- [ ] Paso 9 — especiales
- [ ] Paso F — cierre, tests y previews

## Reglas que se respetan
- Solo la física decide el juego: el decorado nunca cambia colisiones ni la simulación.
- Todo con `rng` con semilla: el mismo hoyo sale siempre igual.
- pnpm siempre (nunca npm/npx).
- Trabajo en la rama `la-chaqueta-bionica`; no se hace push a `main` ni a la rama del otro.

## Evidence
(2026-11-15) **Paso L + Paso 0 entregados, pendientes del visto bueno visual del usuario.**
- Paso L (Sonnet): `assets-lab.html`, `src/lab/` (registro, escena, antes/después, viento, contadores), `tests/assets-lab.test.js`. `pnpm build` ok y `assets-lab.html` no entra en `dist`.
- Paso 0 (Opus): `src/game/render/assets/wind.js` (tronco/copa/hoja + ráfagas viajeras), `bakeStatic` conserva `WIND_ATTRS`, viento aplicado en `environment.js`, `flora.js`, `lushEnvironment.js`. `tests/wind.test.js` 17/17; mutación (quitar la línea de `bakeStatic`) lo pone en rojo.
- Revisión de contexto limpio (`rsc risk`: 1 revisor): sin bloqueantes. Un should-fix (tercera ráfaga borraba la más avanzada de golpe) corregido con fundido y 2 tests que fallan con el código viejo.
- `pnpm test`: 314 tests, 309 pasan. Los 5 fallos están en `vfx-runtime`/`vfx-packs`, trabajo VFX ajeno sin commitear. `pnpm build` ok.
- Sin verificar: el GLSL no se ha compilado en GPU real ni se ha visto el laboratorio en pantalla (lo comprueba el usuario).

(2026-11-16) **Paso 1 — árbol redondo entregado, pendiente de visto bueno visual.**
- `src/game/render/assets/roundTree.js` (`makeRoundTree`, 4 variantes, 3 materiales compartidos, luz de borde en el Lambert, tarjetas de hojas en Alto) y `tests/round-tree.test.js` (12/12). `bakeStatic` conserva `uv` solo con `userData.keepUv`; quitar esa línea pone el test en rojo.
- Triángulos máximos medidos (30 semillas x 4 variantes): Bajo 249, Medio 599, Alto 1199; presupuesto 250/600/1200. Bosque entero = 3 llamadas de dibujo tras `bakeStatic`.
- Revisión de contexto limpio: sin bloqueantes. Nits anotados: el laboratorio no pasa el tema a `makeNew` (paleta fija); la luz de borde usa `directionalLights[0]` (revisar al sustituir en entornos con varias luces); halo oscuro posible en las tarjetas lejanas; el test del shader solo comprueba texto.
- `pnpm test`: 326 tests, 321 pasan (5 VFX ajenos). `pnpm build` ok. Sin verificar: GLSL de luz de borde y textura de tarjetas en GPU real.
- Aún NO sustituido en `environment.js` (va tras el visto bueno). Al sustituir: decidir escala (nuevo 1,9–3,3 m; viejo x0,8–1,7) y el resto del decorado cambiará por otro consumo del rng.

## Next step
Usuario revisa el laboratorio (`pnpm dev` → `/assets-lab.html`). Usuario revisa el árbol redondo en el laboratorio. Con su visto bueno: sustituir en `environment.js` y seguir con el Paso 2 (pino).
