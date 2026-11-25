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
- **Alcance:** cada asset nuevo sustituye al viejo en **todos los entornos naturales**.
  Desde 2026-11-19 neón/cyberpunk SÍ entran: temas `neon`, `neonPink`, `cyber2078`; solo entorno;
  pista/atracciones fuera (decisión del usuario; antes: «Neón y cyberpunk no se tocan»).
  2026-11-23: el usuario cambia lo de «sin agua»: el neón lleva agua pútrida y radiactiva con partículas
  de suciedad y vapor verde ascendente (ver «Neón / Cyberpunk», N6).
  Ver el apartado «Neón / Cyberpunk (N0–NF)».
- **Orden:** viento → árbol redondo → pino → palmera → arbustos → césped → flores → rocas → agua →
  especiales (pino nevado, cactus, árbol seco, montón de rocas) → neón (N) → muros (M) → lava y caldera (V) →
  temas únicos por mapa (T) → cierre (F). Luces (F2), shaders y optimización van después, en fase aparte.
- 2026-11-24: el usuario pide rehacer los muros de todos los mapas con variaciones según el tipo de mapa (hoy son
  casi todos de madera), incluir la lava en el rediseño y que cada mapa tenga un tema distinto. Las luces se quedan
  como están por ahora. Ver «Muros, lava, temas y luces (2026-11-24)».

## Ejecución: con subagentes, como siempre
- El agente principal coordina, revisa cada entrega y habla con el usuario. No escribe él solo el
  código grande.
- Cada asset es una tarea para un subagente `developer`.
- **Lo más complejo va con Opus 5.5** (`model: opus`): el viento compartido (paso 0), los shaders y
  el árbol redondo (pasos 1–2, que fijan la técnica de copas), el césped (paso 5) y el agua (paso 8).
- Lo mecánico va con Sonnet (`model: sonnet`): la página laboratorio, arbustos, flores, rocas,
  especiales, sustituir en `environment.js`, tests de presupuesto y recaptura de previews.
- Muros, lava y temas (2026-11-24): con Opus (`model: opus`) el hielo translúcido (M5), la roca volcánica con grietas
  de lava (M6), el neón metal (M7) y la lava y caldera (V, Opus). Con Sonnet (`model: sonnet`) la medición (M0),
  madera, piedra, bambú, pradera de día, cierre de M, y las sustituciones en `course.js`/`environment.js`. Mismas
  reglas: un subagente por tarea, revisor de contexto limpio, sin commits de subagentes, visto bueno del usuario por
  familia antes de seguir.
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

## ESTADO PARA RETOMAR (actualizado 2026-11-16)
**Siguiente acción, en este orden:**
1. Sustituir el pino viejo (`makeTree('pine')`) por `makePine` en los entornos naturales de `environment.js` (el Paso 2 está aprobado pero solo vive en el laboratorio). Repetir los chequeos del árbol redondo: escala medida frente al viejo (constante nombrada), rng del hoyo con tiradas fijas, `place`/`clear`/`heightAt` intactos, sol = primera luz direccional, test de entorno (modelo: `tests/round-tree-env.test.js`). Paleta: oscurecer los verdes del tema también cuando lleguen por `opts.leaves`.
2. Paso 3 — palmera (Sonnet), y seguir el orden del plan. Cada asset: laboratorio → visto bueno del usuario → sustituir en entornos.

**Hecho y aprobado por el usuario:** L (laboratorio), 0 (viento), 1 (árbol redondo, ya sustituido en entornos), 2 (pino, solo laboratorio).

**Dónde se trabaja:** worktree `C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`, rama `la-chaqueta-bionica` (la rama NO se puede sacar en la carpeta de main: ya está en ese worktree). Commits y push solo ahí, nunca a `main` ni a la rama del otro. pnpm siempre.

**Cómo se ejecuta (decidido con el usuario):** el principal coordina y habla; cada asset es una tarea para un subagente `developer`. Opus (`model: opus`) para lo complejo: césped (Paso 5) y agua (Paso 8). Sonnet para lo mecánico: palmera, arbustos, flores, rocas, especiales, sustituciones en `environment.js`, tests y previews. Tras cada tarea, revisión de contexto limpio (`refuter-correctness`, solo lectura; `rsc risk` ha dado siempre 1 revisor). El usuario hace las comprobaciones visuales: NO abrir navegador ni dev server. Ningún asset avanza sin su visto bueno. Los subagentes no hacen commit: lo hace el coordinador tras revisar, con rutas explícitas (hay trabajo VFX ajeno sin commitear en `src/game/render/skins/*`, `vfx/*`, tests `vfx-*`, y un `assets 3d.txt` suelto: no tocarlos ni commitearlos). Dos agentes en paralelo solo si no comparten ficheros.

**Técnica fijada (reutilizar en los siguientes):** `src/game/render/assets/` con `wind.js` (viento compartido: `applyWind`, `prepareWind`, `setWindField`, `updateWind` UNA vez por fotograma; capas trunk/canopy/leaf/grass/flower), `roundTree.js` y `pine.js` como modelo (materiales Lambert compartidos con color en vértice, normales suavizadas, oclusión en color de vértice, luz de borde en el Lambert, rng que NO depende de la calidad, ajuste al presupuesto sin tiradas extra, compatible con `bakeStatic`; `userData.keepUv` si hay textura). `treeKit.js` tiene helpers copiados de roundTree. Laboratorio: `assets-lab.html` + `src/lab/` (registro en `src/lab/assets/examples.js`; el tema llega por `preset.theme`).

**Estado de tests:** `pnpm test` 342/347; los 5 fallos son VFX ajenos (`vfx-runtime` x4, `vfx-packs` golden). `pnpm build` ok; `assets-lab.html` no entra en `dist`.

**Pendientes anotados para el cierre (Paso F):** unificar `treeKit.js` y `roundTree.js` (código duplicado `withRim`/`treeLevel`); GLSL (viento, luz de borde) y texturas de tarjetas nunca compilados en GPU real: el usuario lo valida a ojo; posible halo oscuro en tarjetas lejanas; `previews:capture` sin recapturar; el «Antes» del laboratorio usa `makeTree`/`makeRock`/`makeFlower` exportados de `environment.js` (no borrar hasta el cierre); las sombras no se mecen con el viento; pino nevado, cactus y árbol seco son del Paso 9; la luz de borde usa `directionalLights[0]`.

**Aviso de sincronización:** el hook `rsc/knowledge` no pudo subir este documento (choca con un cambio ya existente allí). La versión buena es la de esta rama; hay que juntarlas a mano cuando el usuario lo pida.

## Checklist
- [x] Paso L — laboratorio (visto bueno del usuario 2026-11-15; parpadeo en «Después» en arreglo)
- [x] Paso 0 — viento compartido (visto bueno del usuario 2026-11-15)
- [x] Paso 1 — árbol redondo (visto bueno del usuario 2026-11-16; sustituido en entornos naturales)
- [x] Paso 2 — pino (visto bueno del usuario 2026-11-16; sustituido en `environment.js` 2026-11-18, pendiente de verlo en pantalla)
- [x] Paso 3 — palmera (visto bueno del usuario 2026-11-18; sustituida en `environment.js`)
- [ ] Paso 4 — arbustos (en laboratorio 2026-11-18, pendiente de visto bueno; aún NO sustituidos en `environment.js`)
- [x] Paso 5 — césped (visto bueno del usuario 2026-11-18; sustituido en `environment.js`, sin commit)
- [x] Paso 6 — flores (visto bueno en laboratorio; sustituidas en `environment.js` 2026-11-19 con `FLOWER_GAME_DENSITY` 0,13 ajustable; sin ver en pantalla)
- [x] Paso 7 — rocas (visto bueno en laboratorio; canto, losa, grupo y `rockpile`->`pile` sustituidos en `environment.js` 2026-11-19; sin ver en pantalla)
  - 2026-11-19: añadido el tipo `pile` (rediseño del `rockpile`, 5-8 piedras, ~2 x 2,5 m) con piedra gris, sin musgo y de arenisca (`material`); en laboratorio como `rockpile`, `rockpile-bare`, `rockpile-sandstone`. Sustituir `rockpile` en entornos: propuesta sí, pendiente de visto bueno.
  - 2026-11-19: roca suelta de arenisca (`material: 'sandstone'` en canto rodado y losa); en laboratorio como `rock-sandstone` y `rock-slab-sandstone`; pendiente de verla en pantalla.
- [ ] Paso 8 — agua
- [ ] Paso 9 — especiales
- [ ] Paso M — muros por tipo de mapa (2026-11-24). M0 medido 2026-11-25: 600 triángulos por segmento (muro redondeado de hoy + remate). Decisión del usuario 2026-11-25: los muros nuevos NO llevan losa superior ni esquinas redondeadas (cajas de caras planas): cambian la heatbox visual y dan errores visuales. Altura nueva 0,37 m. M1 madera: 12 triángulos. Piedra (meadowDay, meadow, jungle, sunset, canyon, night, gardenNight): sillares con juntas hundidas, bultos y coronación irregular, 256 triángulos a 6 m. 2026-11-25: corregida la textura estirada (uv en metros en x). Valla en X (playa, otoño), roca volcánica (caldera, volcano), neón ASCII (neon, neonPink, cyber2078: 12 triángulos, golpe y animación) y hielo (snow: opaco, grietas y esquirlas al golpear): en el laboratorio (`wall-new`, botón «Golpe»), sin visto bueno y sin sustituir en `course.js`. Riesgos abiertos: GLSL sin compilar en GPU real; las grietas del hielo pueden verse flotando de cerca; el hielo comparte material entre muros del mismo tema (si el juego lo funde, se funden todos juntos).
- [ ] Paso V — lava y caldera (2026-11-24, sin empezar; incluido en el rediseño 1 a 1). Ver «Paso V» abajo.
- [ ] Paso T — un tema distinto por mapa (2026-11-24, sin empezar). Se resuelve al rediseñar cada familia. Ver su apartado.
- [ ] Fase posterior — luces (F2), shaders y optimización (2026-11-24, aplazada: las luces quedan como están).
- [ ] Paso F — cierre, tests y previews. Cierre parcial (2026-11-24, sin commit): retirados `makeRock` y `makeFlower`
  de `environment.js` y sus «Antes» del laboratorio (solo los usaba el laboratorio). Unificado `roundTree.js` con
  `treeKit.js` (`TAU`, `LEVELS`, `lerp`, `range`, `smooth`, `withRim`, `treeLevel`). Previews recapturadas con todos los
  nombres de hoyo. Sigue en uso y NO retirado: `makeTree`, `makeTuft`, `makeGrassClump`, `waterShader` (lava y caldera) y
  la familia `makeLush*` (hub 3D, `hubScene.js`); `makeReeds`/`makeLilyPad` de `flora.js` (solo el «Antes» del agua).
  Decidido 2026-11-24: se retiran el hub 3D y el «Antes» del agua (con `makeReeds`/`makeLilyPad` de `flora.js`).

### Paso V — Lava y caldera (Opus 5.5, dentro del rediseño 1 a 1; 2026-11-24)
Las luces de la lava (`course.js` ~694, ~773, ~859) no se tocan: van en la fase de luces.
- Estado: `theme.lava` y `theme.caldera` siguen con el decorado viejo: `makeTuft` y `makeGrassClump` (matas),
  `makeTree` (árbol de respaldo cuando `natureTree` no lo resuelve), `waterShader` (plano de lava de la ciudad/lava)
  y el lago de lava del volcán (`lavaMaterial`, src/game/render/lava.js). Todo lo viejo sale de environment.js
  cuando esto esté hecho, y entonces se retiran `makeTree`, `makeTuft`, `makeGrassClump` y `waterShader`.
- Propuesta: exportar lava y caldera al laboratorio como el resto (un asset por vez), con Opus 5.5 y el mismo
  método: módulo nuevo en `src/game/render/assets/`, entrada en `src/lab/assets/examples.js`, tests de presupuesto,
  rng del hoyo y física intactos, y visto bueno del usuario antes de sustituir en `environment.js`.
- Orden: 1) matas de ceniza con `grass.js` (paleta de ceniza), 2) árboles y rocas volcánicas, 3) lago de lava con el
  agua nueva, 4) caldera (volcán y lava del cráter). Retirar el viejo solo cuando nada lo use.

#### V1 — Matas de ceniza (2026-11-25, en laboratorio, sin visto bueno)
- Hecho: `src/game/render/assets/ash.js` (`makeAshField`, `addAsh`): el césped nuevo (`makeGrassField`) con paleta de
  ceniza (`ASH_TINT` = carbón `0x1c1917` a punta ceniza `0xb9b1a8`, sin verde ni ocre), reparto `ASH_MIX` (fina, seca y
  espigas; `ochre: 0`), densidad `ASH_DENSITY` 0,25 del tope del césped. Mallas y grupo `ash-*`/`ash`.
- `grass.js`: campo opcional `ochre` en el reparto (por defecto 1; los repartos existentes no cambian) y quinto argumento
  de `grassColorAt`. Sumas de control de la pradera, playa y nieve iguales a antes.
- Presupuesto medido (`tests/ash.test.js`, 5 semillas): Bajo 375 matas / 3 375 tri / 3 llamadas; Medio 750 / 9 000 / 3;
  Alto 950 / 17 100 / 3. Una tirada del rng del hoyo.
- Laboratorio: entrada `ash-tuft` («antes» = `oldAshPatch`, copia de `makeTuft`; «después» = `newAshPatch`), solo para
  `volcano` y `caldera`. Ojo: ningún hoyo usa `volcano`; la ceniza se verá en la caldera.
- Revisión de contraste (2026-11-25, pedido del usuario: «no se nota»): la primera paleta era gris medio (luminosidad
  ~0,10) y casi no se distinguía del suelo. Ahora la base es carbón y la punta ceniza clara; luminosidad media ~0,20.
  Tests de color ajustados a la nueva paleta (tope de luminosidad = la punta, no un gris fijo).
- Segunda subida de contraste (2026-11-25, pedido del usuario): carbón `0x0c0a09` y punta ceniza `0xe6e0d6`.
- Erupción (2026-11-25, pedido del usuario): `src/game/render/assets/eruption.js` (`makeEruption`): columna de ceniza gris
  que sube y la lleva el viento, y brasas aditivas que saltan del cráter. Dos `Points` (2 llamadas). Partículas por
  calidad `ERUPTION_BUDGET` (ceniza 60/140/240, brasas 24/50/90; índice = `quality().lod`). Una tirada del rng del hoyo.
  Activa con `eruption: true` en `themes.js` (`volcano` y `caldera`); enganchada al final de `buildEnvironment`, se
  libera en `dispose`. Sin luces ni física. Las brasas flotantes de siempre (`floaters`) siguen igual.
- Pendiente: visto bueno del usuario en `assets-lab.html` (aspecto real y contraste sobre el suelo de caldera); el
  calor del atlas en las puntas secas (Medio/Alto) puede dar un tono beis; no se sustituye `makeTuft` en `environment.js`
  hasta el visto bueno. `makeTuft` y `makeGrassClump` siguen en uso.

## Neón / Cyberpunk (N0–NF)
Propuesta (2026-11-19) para rediseñar SOLO el entorno de `neon`, `neonPink` y `cyber2078` (hoyo 15 incluido): ciudad lejana, cielo, suelo/montañas, pilones y cristales. Sin agua. Pista y atracciones no se tocan; la física tampoco.
- [x] N0 — preparación y agua fuera: textura de fachada determinista (`drawSkyscraperFacade`, rng con semilla) y sin plano de agua en neón (`environment.js`); tests `*-env` de neón actualizados.
- [ ] N2 — ciudad lejana rediseñada (Opus). Implementado 2026-11-23 sin commit, pendiente de visto bueno visual:
  `assets/neonCity.js` (torres escalonadas con aguja, antena o helipuerto, franjas de neón, ventanas de la fachada
  de N0 en una DataTexture de 128 px por paleta), llamado desde `buildCyberSkyline`; ASCII creado antes y pasado a
  la ciudad (deja libres los pilares); tráfico aéreo sube a 33 m; focos desde dos torres; carteles flotantes viejos
  fuera. Laboratorio: `neon-city`. Presupuesto: torres 9/14/20, llamadas 2/3/4, triángulos 432/856/1363 (tope
  500/1000/1600). 0 tiradas propias del rng del hoyo (las 36 de la ciudad vieja se conservan: el decorado no se
  mueve). `tests/neon-city.test.js` (11). Sin verificar: aspecto en pantalla y GPU real. Decisión en
  `sdd/decisions.md`.
- [ ] N3 — pilones y cristales (Sonnet). Implementado 2026-11-23 sin commit, pendiente de visto bueno visual:
  `assets/neonProps.js` (poste de metal, 3 niveles de neón, base ancha, cabeza con halo; variantes lamp/post/beacon;
  cristal con facetas de neón, anillo de datos y halo; geometrías y materiales compartidos). Presupuesto medido por
  pilón 96-112/180-200/224-248 y cristal 60/84/112 (tope 120/200/260 y 70/100/130); llamadas por hoyo: 3 fijas + 2 por
  cristal + 1 por pilón encendido (antes 3 por objeto). rng del hoyo intacto (cristal 1 tirada, pilón 0). Laboratorio:
  `neon-pylon`, `neon-crystal`. `tests/neon-pylons.test.js` (10). Sin verificar: aspecto en pantalla y GPU real.
- [ ] N4 — suelo y montañas (Opus). Implementado 2026-11-23 sin commit, pendiente de visto bueno visual:
  `assets/neonTerrain.js`: misma forma de crestas, pero lo que sobresale se baja bajo la línea de vista del ojo
  (1,4 m) al pie de la ciudad; llano en el anillo de la ciudad y sierra detrás (pie a 94-100 m según el rumbo). Suelo:
  la rejilla brilla suave en el neón del tema (`aGlow`: apagada bajo la pista). heightAt igual en la pista y su banda
  de 5 m; rng del hoyo igual (Looping Neón 1419/1434/1447); mismas llamadas; triángulos 10368/19208/33800 (tope
  10500/19500/34000). `tests/neon-terrain.test.js` (7). Sin verificar: aspecto en pantalla y GPU real. Decisión en
  `sdd/decisions.md`.
- [ ] N6 — agua de neón (2026-11-23, pedido del usuario tras la prueba en producción): fondo verdoso pútrido,
  superficie radiactiva, partículas de suciedad dentro del agua y vapor verde que sube desde la superficie.
  Solo visual; la física no cambia. Implementado (`assets/neonWater.js`, `water.js`, `environment.js`,
  `tests/neon-water.test.js`), sin commit. `pnpm test`: solo fallan los VFX ajenos. `pnpm build` ok.
  Revisión de contexto limpio: sin hallazgos reales. Nit abierto: `scatter` puede dar menos motas que el
  presupuesto en agua muy somera (documentado). Sin verificar: aspecto en pantalla, GLSL en GPU, coste de
  fill-rate del vapor en móvil. Visto bueno del usuario 2026-11-23 («es la polla»); sin commit.
- [ ] N7 — elementos con textura ASCII en neón (2026-11-23, pedido del usuario): nubes de caracteres,
  pilares de energía que suben y naves/coches voladores en ASCII. Solo entorno lejano; sin física.
  Módulo `assets/asciiNeon.js` (Opus), registrado en el laboratorio. Pendiente de visto bueno.
  Implementado 2026-11-23 sin commit: `assets/asciiNeon.js` (atlas de glifos pintado en JS, un cuadrilátero por
  elemento con la rejilla de caracteres en el sombreador), llamado desde `environment.js` en la rama neón y liberado
  en `env.dispose()`; laboratorio: `ascii-clouds`, `ascii-pillars`, `ascii-flyers` (`src/lab/assets/examples.js`).
  Presupuesto: nubes 4/7/10, pilares 2/4/6, naves 1/2/2; 3 llamadas; 14/26/36 triángulos (tope 64); 0 tiradas del
  rng del hoyo. `tests/ascii-neon.test.js` (8). `pnpm test`: solo fallan los VFX ajenos; `pnpm build` ok. Sin
  verificar: aspecto en pantalla, GLSL en GPU real, relleno en móvil. Decisión en `sdd/decisions.md`.
- [ ] NF — cierre y previews.
- N5 (pista/atracciones) descartado por el usuario. (No hay N1: su contenido, quitar el agua, ya está en N0.)

## Muros, lava, temas y luces (2026-11-24)
Decisiones del usuario (2026-11-24): rediseño visual, la física no cambia. El orden es rediseño 1 a 1 de muros, lava y
temas, y solo después luces, shaders y optimización. Las luces se quedan como están por ahora. La lava entra en el
rediseño. Cada mapa tendrá un tema distinto: se resuelve al rediseñar cada asset (Paso T).
Encargo del usuario (2026-11-24): rehacer los muros de todos los mapas con variaciones según el tipo de mapa («creo
que ahora es casi el mismo muro siempre») y rediseñar las farolas y luces que se usan. Solo visual: la física no cambia.

### Inventario de muros (pista)
Se construyen en `src/game/render/course.js` (~185-330): cuerpo (`RoundedBoxGeometry`, o `BoxGeometry` troceada si hay
relieve) + remate (`capMat`) por cada segmento de `wallSegmentsOf(course)` (`src/game/physics.js`); postes cilíndricos
con bola en las esquinas; franja de sombra de contacto (`aoStripTexture`). Materiales por flags de `src/game/themes.js`.

Dato que cambia el punto de partida: **10 de los 17 temas usan la madera normal** (meadow, beach, sunset, snow, canyon,
autumn, night, volcano, gardenNight, beachNight). `snow` NO tiene `iceWalls`: solo lo tiene `glacier`. Y `volcano` no lo
usa ningún hoyo (ver decisiones abiertas).

| Tema | Hoyos (`courses.js`) | Muro hoy (flags) | Variación propuesta | Familia |
|---|---|---|---|---|
| meadow | ninguno | madera + remate blanco; postes blancos, bola roja | madera con tablones, clavos y juntas | A madera |
| meadowDay | El Molino del Prado | verde (`glowWalls`) + remate que brilla con `theme.rim` | mantener el brillo; tablones verdes con musgo en la base | M2 pradera |
| jungle | El Templo de la Selva | arenisca teñida (`stoneWalls`) | piedra tallada en sillares con musgo en las juntas | M3 piedra |
| beach | Las Tuberías | madera | bambú o caña atada con cuerdas | M4 bambú |
| sunset | Zigzag, Desempate | madera (+ farolillos) | tablones desgastados con remate ámbar | A madera |
| snow | Turbo | madera (sin `iceWalls`) | madera con escarcha en el remate | A madera |
| glacier | El Glaciar | hielo azul + remate de nieve (`iceWalls`) | bloques de hielo translúcido con escarcha y grietas | M5 hielo |
| canyon | Bloques, El Abismo | madera | estratos de arenisca tallados | M3 piedra |
| autumn | ninguno | madera | empalizada de estacas con cuerdas | A madera |
| night | El Portal, Molinos de Noche | madera (+ farolillos muchos) | madera envejecida con tira de luz al anochecer (`baseEmissive`) | A madera |
| volcano | ninguno | madera | roca volcánica con grietas de lava | M6 volcánica |
| caldera | Dentro del Volcán | roca (`rockFloor`) + remate gris | roca volcánica con grietas incandescentes en el remate | M6 volcánica |
| neon | Looping Neón | cuerpo oscuro metálico + remate emisivo `neonColor(i)` | metal con paneles y tiras de neón | M7 neón |
| neonPink | Doble Looping, Tubos Neón | igual | paneles rosas con tiras de neón | M7 neón |
| cyber2078 | Cyberpunk2078 | igual (clon de `neon`) | paneles con líneas de datos y tiras (`cyberCity`) | M7 neón |
| gardenNight | Molinos | madera (+ farolillos muchos y guirnalda) | celosía de madera del jardín | A madera |
| beachNight | La Herradura | madera (+ farolillos y antorchas) | bambú con remate de antorcha | M4 bambú |

`courses.js` tiene 18 hoyos (incluido «Desempate»), con 14 temas distintos. `meadow`, `autumn` y `volcano` no los usa ningún hoyo:
se diseñan con su familia y se prueban en laboratorio, pero van al final de la cola.

### Inventario de farolas y luces (fase posterior: no se toca ahora)
Farolillos y antorchas: `makeLantern`, `makeTorch`, `festoon`, `haloSprite`, `perimeterSpots` en
`src/game/render/environment.js` (~406-425, ~1055-1130). Salen con `theme.lanterns` (`true` o `'many'`), `theme.torches`
y `theme.festoon`. Con luz real solo los 6 primeros (`i < 6`); el resto es halo. Parpadean con el reloj `animated`.

| Elemento | Dónde | En qué temas | ¿Luz real? | Propuesta de rediseño | En la fase de luces |
|---|---|---|---|---|---|
| Farolillo (`makeLantern`) | environment.js ~1077 | sunset (`true`, 4), night, gardenNight, beachNight (`many`) | sí, `PointLight` 3,2 / 6,5 m, hasta 6 | forma de linterna de papel con costillas; luz real solo en el tope de F2.0 | Sí (F2.1) |
| Antorcha (`makeTorch`) | environment.js ~1105 | beachNight (la mitad de los farolillos) | sí, 3 / 6 m, mismo tope | llama con variación de color barata; comparte el tope con el farolillo | Sí (F2.2) |
| Guirnalda (`festoon`) | environment.js ~1130 | gardenNight | no | cable con bombillas emisivas y halo; sin `PointLight` | Sí (F2.3) |
| Poste de esquina y bola roja de los muros | course.js ~281-325 | todos los temas con muro (bola emisiva de noche con `baseEmissive`) | no | poste con remate propio por familia (M); bola con halo barato | Sí (F2.4) |
| Luz de volcán (`volcanoShell`, `volcanoBackdrop`) | environment.js ~1268, ~1359 | solo si hay volcán (caldera) | sí, 8 y 30 de intensidad | decorado de lava: fuera salvo que lo pidas | No, pregunta |
| Luz de lava de pista (charcos y grietas) | course.js ~694, ~773, ~859 | caldera | sí, una por charco/grieta | pista: fuera salvo que lo pidas | No, pregunta |
| Luces de atracciones | attractions.js ~377, ~596, ~693, ~734 | loop, molino, tubos (neón y otros) | sí, 1,5-3 / 2,5-5 m | N5 las deja fuera | No (pregunta del encargo) |
| Pilones y cristales de neón | `assets/neonProps.js` (N3) | neon, neonPink, cyber2078 | no (emisivo y halo) | ya cubierto por N3 | Ya hecho |
| Remate emisivo de muros de neón | course.js ~208 (`capMat`) | neon, neonPink, cyber2078 | no (emisivo) | lo cubre M7 | En M7 |
| Topes de neón (`topMat`) | course.js ~337-339 | neón | no (emisivo) | botón de neón de los topes; se decide en F2.5 | Decide F2.5 |

### Estado 2026-11-25 (laboratorio)
- Laboratorio limpio: `src/lab/assets/examples.js` solo tiene lo que aún no está en producción (origin/main). Lo
  ya subido (árbol redondo, pino, palmera, arbustos, césped, flores, rocas, agua, pez, especiales, neón) sale del
  laboratorio; su código sigue en main y en el historial de git. Se conservan los módulos de parches de la lab
  (`grassPatch.js`, `waterPatch.js`, `fishPatch.js`) porque los usan tests.
- Entrada nueva `wall-wood` («Muro · madera», M1): «antes» = muro de hoy por tema (mismos materiales que
  `course.js`), «después» = `makePlankWall` en `src/game/render/assets/walls.js` para los temas de la familia A
  (meadow, sunset, snow, autumn, night, gardenNight). Los demás temas muestran «Sin diseño nuevo todavía».
- Pendiente de visto bueno del usuario en `assets-lab.html`. No se toca `course.js` hasta entonces.

### Paso M — Muros por tipo de mapa (Sonnet salvo M5-M7, Opus)
Técnica igual que el resto: procedural en three.js, texturas pintadas en canvas, color de vértice y oclusión, materiales
compartidos, `rng` con semilla (el mismo hoyo sale igual), compatible con la transparencia que deja ver la bola
(`wallBlocksBall`, `mats`, `opacity`), `baseEmissive` para la noche, móvil primero.

- **M0 — Línea base (Sonnet).** Medir los muros de hoy por hoyo en Bajo/Medio/Alto: triángulos, llamadas de dibujo,
  texturas en memoria. Script de medición fuera de la pista (no se toca `course.js`). Hecho cuando: tabla con los 18
  hoyos en la spec. Presupuesto: ningún hoyo sube de lo medido hoy sin visto bueno.
- **M1 — Familia A, madera (Sonnet).** meadow, sunset, snow, autumn, night, gardenNight: tablones con clavos y junta,
  estacas, celosía; variantes por tema con la paleta de cada uno. Remate propio por tema.
- **M2 — Pradera de día (Sonnet).** meadowDay: mantener el brillo `glowWalls` con `theme.rim`; tablones verdes con
  musgo en la base.
- **M3 — Familia piedra (Sonnet).** jungle (sillares con musgo en las juntas) y canyon (estratos de arenisca).
- **M4 — Familia bambú (Sonnet).** beach y beachNight: bambú o caña atada; remate con cuerda.
- **M5 — Hielo (Opus).** glacier: bloques de hielo translúcido con escarcha y grietas, sin transmisión física (cara en
  móvil); remate de nieve. Hecho cuando: en laboratorio, el hielo deja ver la luz del fondo sin `MeshPhysicalMaterial`.
- **M6 — Roca volcánica (Opus).** caldera (y volcano si se pide): grietas incandescentes animadas con el reloj
  compartido; sin luces nuevas.
- **M7 — Neón metal (Opus).** neon, neonPink, cyber2078: cuerpo metálico oscuro con paneles y tiras de neón; mismo
  remate emisivo `neonColor(i)`; `cyberCity` conserva sus líneas de datos.
- **M8 — Cierre (Sonnet).** Tests: presupuesto por hoyo y calidad (`tests/walls-env.test.js`, modelo
  `tests/*-env.test.js`); colisiones intactas (`WALL_H`, `WALL_HALF` y `wallSegmentsOf` iguales a los de antes);
  `wallBlocksBall` y `baseEmissive` siguen funcionando. Laboratorio `assets-lab.html` (`src/lab/assets/examples.js`)
  con antes/después por tema. Recaptura de previews (`pnpm previews:capture`).

### Paso T — Un tema distinto por mapa (2026-11-24, sin empezar)
- Estado medido en `courses.js`: 18 hoyos y 14 temas en uso. Repetidos: sunset (Zigzag, Desempate), canyon (Bloques,
  El Abismo), night (El Portal, Molinos de Noche), neonPink (Doble Looping, Tubos Neón). Sin usar: meadow, autumn, volcano.
- Hace falta: 18 temas distintos y `themes.js` tiene 17. Falta al menos un tema nuevo, o que «Desempate» comparta tema
  con otro (decidirlo al llegar a este paso).
- Cómo: el tema de cada hoyo se decide al rediseñar su familia (muro, lava, cielo, suelo). Cada cambio de `courses.js`
  pasa por el laboratorio y el visto bueno del usuario.
- Hecho cuando: 18 hoyos con tema distinto, un test que lo compruebe, y el usuario aprueba la asignación.

### Fase posterior — Luces (F2), no ahora
Aplazada por decisión del usuario (2026-11-24): las luces quedan igual hasta terminar el rediseño 1 a 1. Después se
miran luces, shaders y optimización. Lo de abajo es el borrador para esa fase, no se ejecuta ahora.
Subpasos: farolillo, antorcha, guirnalda, poste de esquina y la parte de neón que no cubra N3.
Subpasos: farolillo, antorcha, guirnalda, poste de esquina y la parte de neón que no cubra N3. Máximo de `PointLight`
reales por hoyo y por calidad; halo o emisivo barato para el resto; parpadeo con el mismo reloj; variaciones por tema.

- **F2.0 — Política de luces (Opus).** Fijar el tope de `PointLight` reales por hoyo y calidad. Propuesta: 6 en Alto,
  4 en Medio, 2 en Bajo, sumando farolillos, antorchas y volcán; el resto, halo. Hoy: 6 farolillos/antorchas + 2 de
  volcán en Alto. Medir con M0. Aprobado por el usuario 2026-11-24 (6/4/2), se aplica en la fase de luces.
- **F2.1 — Farolillo (Sonnet).** Forma nueva; luz real hasta el tope; halo para el resto.
- **F2.2 — Antorcha (Sonnet).** Llama animada barata; comparte tope con el farolillo.
- **F2.3 — Guirnalda (Sonnet).** Cable y bombillas emisivas con halo; sin luz real; parpadeo con el reloj compartido.
- **F2.4 — Poste de esquina (Sonnet).** Remate por familia (M) y bola roja emisiva de noche con `baseEmissive`.
- **F2.5 — Neón que sobre tras N3 (Sonnet).** Revisar topes de neón (`topMat`) y lo que quede; decidir si entra.
- **F2.6 — Cierre (Sonnet).** Tests de tope de `PointLight` por hoyo y calidad; parpadeo; previews.

Hecho cuando (F2): ningún hoyo supera el tope de luces reales; el resto del decorado se ve igual sin `PointLight`;
tests en verde; el usuario aprueba cada tema en laboratorio.

### Decisiones del usuario (2026-11-24)
1. **Muros y postes son pista:** sí se rediseñan, solo visual. La física y los segmentos no cambian.
2. **Luces (atracciones, lava, volcán, farolillos):** quedan igual por ahora. Se miran en la fase posterior, con shaders
   y optimización. La lava (la forma, no la luz) sí entra en el rediseño (Paso V).
3. **Tope de `PointLight` por hoyo** (F2.0): 6 en Alto, 4 en Medio, 2 en Bajo. Aprobado, aplicable en la fase de luces.
4. **Temas sin hoyo** (`meadow`, `autumn`, `volcano`): sí se rediseñan. Cada mapa tendrá un tema distinto (Paso T).

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

(2026-11-16) **Paso 1: sustitución en entornos.** `makeRoundTree` sustituye al árbol redondo viejo en pradera (`lushEnv`) y rama natural normal de `environment.js`; neón y temas sin árbol redondo no cambian. `ROUND_TREE_SCALE = 0.95` (medido: viejo 2,2 m, nuevo 2,4 m sin escalar). Consume 3 tiradas fijas del rng del hoyo: el resto del decorado de esos temas cambia de sitio, sigue determinista; colisiones/`place`/`clear`/`heightAt` intactos. Sol = primera luz direccional en todos los hoyos (test). Laboratorio pasa el tema al árbol. `tests/round-tree-env.test.js` (7). Sin ver en pantalla.

(2026-11-16) **Paso 2 — pino entregado en el laboratorio, pendiente de visto bueno.** `src/game/render/assets/pine.js` + `treeKit.js`, `tests/pine.test.js` (14/14, 5 mutaciones manuales detectadas). 4 variantes; triángulos máx. 218/500/998 (presupuesto 220/500/1000); 2 llamadas de dibujo por bosque; opción `snow` solo en color de vértice (pino nevado completo en Paso 9). Revisión limpia: sin bloqueantes; nit: `treeKit.js` duplica `withRim/treeLevel` de `roundTree.js` (unificar en el cierre); `pinePalette` solo oscurece verdes del tema si llegan por `theme`. `pnpm test` 342/347 (5 VFX ajenos), `pnpm build` ok. Aún NO sustituido en `environment.js`.

(2026-11-18) **Pino sustituido en entornos + Paso 3 palmera en laboratorio; sin commit, pendientes de visto bueno visual.**
- Pino: `makePine` sustituye al viejo en pradera (`lushEnv`) y rama natural normal. `PINE_SCALE = 0,76` iguala la altura media (2,37 m); queda más esbelto (ancho ~1,84 m vs 2,32 m, a juzgar a ojo). 3 tiradas fijas de rng. `opts.leaves` ahora se oscurece como el tema. `tests/pine-env.test.js` 7/7 (mutación detectada).
- Palmera: `src/game/render/assets/palm.js`, `tests/palm.test.js` 12/12 (5 mutaciones detectadas), registrada en el laboratorio. Triángulos máx. 200/594/1044 (presupuesto 250/600/1200); 2 llamadas de dibujo por grupo. Aún NO sustituida en `environment.js`: falta decidir escala frente a la palmera vieja.
- Revisión de contexto limpio (`refuter-correctness`): sin bloqueantes ni should-fix. Nits: ancho del pino no cubierto por test; `opts.leaves` ya no admite color literal (documentar); `palm.js` crea muchos `Vector3` al construir (medir `buildEnvironment` al conectar ~100 palmeras).
- `pnpm test` 361/366 (5 VFX ajenos). `pnpm build` ok. Sin verificar: GLSL en GPU real, vista en pantalla, previews sin recapturar.

(2026-11-18) **Palmera sustituida en entornos + Paso 4 arbustos en laboratorio; sin commit.**
- Palmera: `makePalm` sustituye a `makeTree('palm')` en `beach`/`beachNight`. `PALM_SCALE = 0,64` (altura media 2,64 m; ancho ~2,13 vs 2,84 m, más esbelta). 3 tiradas fijas de rng. `tests/palm-env.test.js` 6/6; mutación (quitar la rama `palm` de `natureTree`) verificada en rojo por el revisor.
- Arbustos: `src/game/render/assets/shrub.js` (3 formas, viento suave), `tests/shrub.test.js` 11/11 (5 mutaciones). Triángulos máx. 114/300/598 (presupuesto 120/300/600); 1 llamada de dibujo por grupo. Pendiente: escala frente a `makeBush`/`makeLushBush` y sustitución. Aviso: forma `mata` en Bajo con racimos de ~20 triángulos (silueta angulosa).
- Revisión de contexto limpio: sin bloqueantes ni should-fix. Nits: `palm-env` solo exige que alguna malla use la palmera nueva; GLSL de arbustos validado por texto.
- `pnpm test` 378/383 (5 VFX ajenos). Sin verificar: vista en pantalla, GLSL en GPU real, tiempos en móvil real.

(2026-11-18) **Arbustos rediseñados (commit 76e7be6) + Paso 5 césped nuevo en laboratorio; césped sin commit.**
- Arbustos: `shrub.js` nuevo (tronquito, ramas, tarjetas de hojas), `SHRUB_SCALE = 1` en `environment.js`; revisados por contexto limpio sin bloqueantes. Faltan ≥5 mutaciones manuales de `shrub.js` y su evidencia.
- Césped (Opus): `grass.js` reescrito (6 especies × 3 variantes, atlas pintado en JS, ≤5 llamadas de dibujo), `grassPatch.js`, entradas `grass-<especie>`, `decisions.md` 5 bis. Medido: 13 500/36 000/68 400 triángulos por campo, atlas 1,0 MB, 12/12 mutaciones detectadas. Se añadió una aserción de mip 4 a `tests/grass.test.js`.
- Revisión de contexto limpio: sin bloqueantes. Should-fix corregidos (Sonnet): `dispose` de `InstancedMesh` en el laboratorio y en `addGrass`, test del `.clone()` por campo. Nits abiertos: fundido por distancia y tono ocre sin test; el «antes» del laboratorio usa `preset.grass` y el «después» no.
- `pnpm test` 404 tests, 399 pasan (5 VFX ajenos). Sin verificar: GLSL en GPU real, subida de la textura no cuadrada con mipmaps propios, vista en pantalla/móvil. Césped aún NO sustituido en `environment.js`/`flora.js`.

(2026-11-18) **Césped sustituido en entornos + Paso 6 flores en laboratorio; sin commit.**
- Césped: `addGrass` sustituye al viejo (`environment.js`, `env.lod`, `env.dispose`; una línea en `GolfGame.js#buildScene`). `makeTuft`/`makeGrassClump` siguen (lava/caldera y «Antes» del laboratorio; se borran en el Paso F). `tests/grass-env.test.js` 8/8; mutaciones detectadas. Revisión limpia: sin bloqueantes; should-fix (test de `dispose` y tinte) corregido.
- Flores: `flower.js` (3 especies instanciadas, 3 llamadas de dibujo), `tests/flower.test.js` 16/16, 11 mutaciones detectadas. Triángulos por flor máx. 20/65/100; por campo máx. 3 764/16 040/29 358. Revisión limpia: sin bloqueantes. Should-fix abierto: el campo nuevo saca 3–4,6× más flores que el viejo (Alto 88 vs 29 en el laboratorio) → decidir densidad. Nits: `update(cam)` casi nunca oculta (esfera de todo el campo); `only` no es subconjunto exacto del campo mixto; test de viento no suma la inclinación del tallo.
- `pnpm test` 423/428 (5 VFX ajenos). Sin verificar: GLSL en GPU real, vista en pantalla/móvil.

(2026-11-19) **Flores y rocas sustituidas en entornos; sin commit, sin ver en pantalla.**
- Flores: `addFlowers` en `environment.js` (`env.lod`/`env.dispose`), `FLOWER_GAME_DENSITY` 0,13 (ajustable): 26/42/55 flores frente a 25,6/41,8/56,4 de las viejas. `tests/flower-env.test.js` 8/8; 4 mutaciones detectadas (densidad, dispose, lod, claro de pista).
- Rocas: `makeNatureRock` (1 tirada del hoyo por roca) sustituye a `makeRock`/`makeLushRock`/grupo de 3/río/`rockpile`; `ROCK_SCALE` canto 1,4, losa 1, grupo 0,85, montón 1,3; arenisca en cañón/playa, `bare` en nieve/ceniza, musgo solo en verdes. `tests/rock-env.test.js` 10/10; 4 mutaciones detectadas más una equivalente (quitar `sceneTheme`).
- `pnpm test` 465/470 (5 VFX ajenos); `pnpm build` ok, `assets-lab.html` no entra en `dist`. Sin verificar: vista en pantalla/GPU, rendimiento en móvil (hasta 25 000 triángulos de roca en Alto en el cañón), revisión de contexto limpio pendiente.

(2026-11-19) **Flores, rocas, agua y pez sustituidos en entornos; commit de cierre de los Pasos 6–8.**
- Flores (`addFlowers`) y rocas (`makeNatureRock`, `pile` para `rockpile`, arenisca/sin musgo por tema) sustituyen a las viejas en `environment.js`; el montón se aleja ≥ 3,4 m de la pista (`ROCK_PILE_MIN_D`). `tests/flower-env.test.js`, `tests/rock-env.test.js`.
- Agua nueva (`water.js`: lisa, normal-map procedural, fresnel, espuma por profundidad de vértice, oleaje 0/2/3 cm, ondas de salpicadura) y pez que salta (`fish.js`, 2–3 por hoyo) integrados en `environment.js`. Triángulos de agua máx. 1 131/2 038/3 491 (Bajo/Medio/Alto) frente a 16 200 fijos; 1 llamada de dibujo. `tests/water.test.js`, `tests/water-env.test.js`, `tests/fish.test.js`, `tests/fish-env.test.js`. `GolfGame.dispose` limpia el entorno.
- Revisiones de contexto limpio: sin bloqueantes; should-fix corregidos. Abierto: extremo oblicuo de la cinta del río en el borde del mapa (≤1 m, a 110 m).
- `pnpm test` 568/573 (5 VFX ajenos). `pnpm build` ok. Sin verificar: GLSL en GPU real, vista en pantalla, rendimiento en móvil (+~70 ms de `buildEnvironment` en Alto).

(2026-11-24) **Solo documentación: inventario de muros y farolas, pasos M y F2 añadidos a la spec.** Sin código tocado.
- Inventario leído en `course.js` (muros, postes), `themes.js` (flags de los 17 temas), `courses.js` (hoyo → tema), `environment.js` (farolillos, antorchas, guirnalda, luces de volcán), `attractions.js` y `course.js` (luces de atracciones y de lava).
- Hallazgo: 10 de 17 temas usan la madera normal; `snow` no tiene `iceWalls` (solo `glacier`); `meadow`, `autumn` y `volcano` no los usa ningún hoyo.
- Sin medir todavía: los triángulos y llamadas actuales de los muros los mide M0 antes de cualquier cambio.
- Estado del fichero: el cambio de «Paso F» de 2026-11-24 (sin commit) ya estaba en el worktree; se conserva tal cual.

## Next step
Revisión de contexto limpio de esta sustitución y visto bueno visual del usuario (flores y rocas en el juego); luego Pasos 4 (arbustos: visto bueno/sustitución), 8, 9 y F.

> Nota: agua y pez sustituidos en entornos, sin ver en pantalla.

> Nota (2026-11-19): paso 9 sustituido en entornos: pino nevado (x0,85), cactus (x0,97) y árbol seco (x1,115) por `natureTree`; sin ver en pantalla. Detalle en `decisions.md`.
