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

## Next step
Ver «ESTADO PARA RETOMAR» arriba: sustituir el pino en `environment.js` y seguir con el Paso 3 (palmera).
