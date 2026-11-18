---
author: subagente developer (rama la-chaqueta-bionica)
branch: la-chaqueta-bionica
status: parado a medias (2026-11-18, el usuario pidió detener los subagentes)
---
# Notas de traspaso: mejora del césped (Paso 5 bis)

Petición del usuario: «mejora el césped con más detalle de textura, más frondosidad y más
variedad de especies y variantes». Feature: `assets-entorno-1a1.md`, Paso 5.

## 1. Qué está hecho

| Fichero | Estado |
|---|---|
| `tests/grass.test.js` | **Reescrito, completo (fase RED).** Pide la API nueva. Hoy falla al importar. |
| `src/game/render/assets/grass.js` | **Sin empezar.** Sigue siendo la versión anterior (1 InstancedMesh, briznas planas, 7 tests viejos). |
| `src/lab/assets/grassPatch.js` | Sin empezar. |
| `src/lab/assets/examples.js` | Sin empezar (solo se iba a tocar la entrada `grass`). |
| `src/lab/assetsLab.js` | Sin cambios. Seguramente no hace falta tocarlo. |
| `02-DOCS/wiki/sdd/decisions.md` | Sin cambios (la entrada del Paso 5 sigue con la versión anterior). |

No hay especies ni texturas hechas en código: solo el diseño (abajo) y los tests que lo fijan.

**Copia del estado anterior** (`grass.js`, `grass.test.js`, `grassPatch.js` y `examples.js`
antes de tocar nada) en la carpeta temporal de la sesión:
`C:\Users\DEV\AppData\Local\Temp\claude\d0d5eb40717eebad\1a9ca411-0ae2-4e9c-8266-6e8716045aa0\scratchpad\orig\`.
Ojo: `grass.js`, `grass.test.js` y `grassPatch.js` no están en git (sin seguimiento). Si esa
carpeta se borra, el test viejo se pierde. Para volver al estado anterior verde, copia de ahí
`grass.test.js` sobre `tests/grass.test.js`.

## 2. Estado de los tests
- `node --test tests/grass.test.js`: **falla al cargar**, porque falta la exportación
  `GRASS_ATLAS` (y otras: `grassAtlas`, `grassMixOf`, `GRASS_SPECIES`, `GRASS_SPECIES_INFO`,
  `GRASS_MAX_CALLS`). Se espera: es la fase RED, y `grass.js` aún no se ha cambiado.
- `pnpm test` completo antes de tocar nada: 398 tests, 392 pasan. Fallan 6: los 5 VFX
  ajenos y `arbusto: la silueta se rompe…` (`tests/shrub.test.js`, trabajo del otro agente
  de arbustos, no es mío). Ahora además falla `grass.test.js` entero.
- **Ninguna mutación aplicada.** No hay mutaciones a medias: `git status` solo muestra
  ficheros ajenos y los míos tal como se describen aquí.

## 3. Diseño decidido (lo fijan los tests nuevos)
- **API pública que se mantiene:** `makeGrassField`, `addGrass`, `grassColorAt`,
  `grassGroundColor`, `grassTuftGeometry(level, species='fine')`, `grassMaterial(level)`,
  `tuftTriangles(level, species?)` (sin especie = tope por mata), `GRASS_RNG_DRAWS = 1`,
  `GRASS_CLEAR`, `GRASS_TALL`, `GRASS_WIND_HEIGHT`, `GRASS_GROUND_SHADE`. `makeGrassField`
  devuelve además `meshes` (`mesh` = `meshes[0]`) y `addGrass.update(cam)` esconde cada malla.
- **Opciones nuevas:** `theme` (tema de escena → reparto con `grassMixOf`), `mix` (nombre o
  pesos), `only` (una sola especie, para el laboratorio; las mismas matas en los mismos sitios).
- **6 especies** (`GRASS_SPECIES`, en este orden = columna del atlas): `fine` (hierba fina
  corta), `broad` (ancha y arqueada), `clover` (tréboles), `seed` (espigas), `dry` (seca alta
  de bordes), `fern` (helecho u hoja larga, para la sombra). `GRASS_SPECIES_INFO[sp]` lleva
  `reach` (radio máximo, para las zonas libres), `dry` (0 = verde), `variants` (3) y el tono.
- **Variantes:** 3 por especie, elegidas con una tirada fija. Cambian la fila del atlas (el
  atributo por instancia `grassVar` = fila x tileH/height, sumado a `vMapUv.y` en el
  sombreador) y las proporciones alto/ancho (más de un 12 % entre variantes).
  `mesh.userData.variants` = variante de cada instancia.
- **Presupuesto (`GRASS_BUDGET`):** Bajo 9 tri/mata x 1500 matas = 13 500 (sin textura);
  Medio 12 x 3000 = 36 000; Alto 18 x 3800 = 68 400 (≤ 70 000). `GRASS_FIELD_TRIS =
  { low: 13500, medium: 36000, high: 70000 }`. Fundido como antes (22–30 / 30–40 / 38–48 m).
- **Llamadas de dibujo:** una InstancedMesh por especie presente, como mucho 5
  (`GRASS_MAX_CALLS`). Cada reparto de tema tiene como mucho 5 especies, incluida la de las
  matas altas. Un solo material por calidad, compartido por todas las especies.
- **Geometría pensada (sin escalar, sin pasar de 0,35 x 1,05 m de alto por el viento):**
  - Bajo: briznas geométricas con punta (3 tri cada una), color de vértice, sin textura.
  - Medio/Alto: tarjetas cruzadas o cintas con la textura (2 tri por tramo); el detalle de
    muchas briznas va pintado en la textura, no en triángulos.
  - Alturas y radios aproximados: fine 0,17/0,13; broad 0,26/0,22; clover 0,09/0,16 (con
    tarjeta casi horizontal); seed 0,31/0,13 (con relleno bajo); dry 0,36/0,17; fern
    0,22/0,33 (frondas en arco hacia fuera). El test exige que cada par de especies difiera
    ≥ 15 % en alto, radio o altura media, y ≥ 3 piezas por mata.
- **Textura:** atlas `DataTexture` RGBA pintado píxel a píxel en JS (no canvas), 512 x 384,
  teselas de 64 x 128 (6 columnas = especies, 3 filas = variantes), borde transparente de
  3 px, sRGB, `alphaTest` ≈ 0,5, `userData.keepUv = true`. Mipmaps propios hasta 1 x 1 que
  conservan la cobertura de la silueta (escala del alfa por tesela según el cuantil), para
  que de lejos las briznas no adelgacen hasta desaparecer. Memoria prevista: 786 KB la base,
  unos 1,05 MB con mipmaps (el test exige menos de 1,2 MB). Motivo para no usar canvas:
  se puede generar y probar en node (los tests no tienen `document`). Hay que anotarlo en
  `decisions.md`, porque el plan decía «pintadas en canvas».
- **Repartos por tema (`grassMixOf`):** neón, ciudad, lava y caldera → `null` (sin hierba).
  Nieve/glaciar → `snow` (fine/dry/seed, `muted` > 0, desaturado). Cactus → `desert`.
  Palmera → `beach` (seca > 40 %, matas altas de `dry`). `lowClouds && stoneWalls` →
  `jungle` (más helecho). `lushEnv` → `lush`. Sin flores, sin estrellas y solo árboles
  round/pine → `autumn`. Resto → `meadow` (5 especies; matas altas de `broad`).
  `theme.grassMix` lo puede fijar. El helecho se reparte más en las manchas oscuras de
  `grassColorAt`, y la seca en los bordes y las zonas secas (sin rng extra, según la posición).
- **rng:** sigue saliendo 1 tirada del rng del hoyo. El rng propio pasa de 7 a 9 tiradas fijas
  por candidato (+ especie y variante). Bajo ⊂ Medio ⊂ Alto también por malla de especie.
- **Zonas libres:** raíz a ≥ 0,45 m de la pista (igual que antes) y, además, ningún vértice a
  menos de `GRASS_CLEAR.leaf` = 0,2 m (raíz − `reach` x escala). El test comprueba que ese
  margen cubre lo que tumba el viento.
- **Color:** `grassColorAt` igual que antes. La mata = color del sitio x toque propio x tono
  de la especie (la seca y las espigas tiran al ocre). Con textura, el degradado del vértice
  es más suave (la textura ya lo lleva).

Cifras medidas: **ninguna todavía** (no hay código nuevo). Las cifras de arriba son el
presupuesto de diseño.

## 4. Cómo seguir
1. Abre primero `tests/grass.test.js` (nuevo, es la especificación) y `src/game/render/assets/grass.js`.
2. En `grass.js`, añade constantes y tablas (`GRASS_SPECIES`, `GRASS_SPECIES_INFO`,
   `GRASS_ATLAS`, `GRASS_MAX_CALLS`, el nuevo `GRASS_BUDGET`, los repartos) y `grassMixOf`.
   Después el atlas (`grassAtlas()`, con caché), las geometrías por especie y calidad
   (constructor de cintas: tarjeta, brizna con punta, fronda y cuadro plano), el material
   (inyectar `attribute float grassVar;` tras `#include <common>` y
   `vMapUv.y += grassVar;` tras `#include <uv_vertex>`, dentro de `#ifdef USE_MAP`), y por
   último `makeGrassField` con una malla por especie. Clona la geometría base por campo
   (`base.clone()` + `grassVar`) y no compartas los atributos entre campos: si se borra un
   campo, se borrarían también los búferes que usa otro.
3. Ve pasando los tests uno a uno: `node --test tests/grass.test.js`.
4. Laboratorio: en `grassPatch.js`, que `newGrassPatch(rng, preset, { only })` pase
   `theme: preset.sceneTheme`. En `examples.js`, solo en la parte de `grass`, registra
   además `grass-<especie>` («Césped · solo …») con `only`. No hace falta tocar `assetsLab.js`.
5. Haz ≥ 6 mutaciones manuales (por ejemplo: quitar `grassVar` del sombreador, saltar la
   comprobación de `reach`, tirada extra del rng del hoyo, una sola variante, más de 5
   especies en un reparto, sin mipmaps propios) y comprueba con `git diff` que quedan restauradas.
6. Actualiza la entrada del Paso 5 en `02-DOCS/wiki/sdd/decisions.md`.
7. Comprueba con `pnpm test` (lo esperado: solo los 5 VFX ajenos, más lo que tenga a medias
   el agente de arbustos) y con `pnpm build` (`assets-lab.html` no debe entrar en `dist`).

## 5. Qué no se ha verificado
Nada del diseño nuevo se ha ejecutado: ni el código, ni los presupuestos, ni el sombreador en
una GPU real, ni la vista en pantalla o en un móvil. Tampoco el coste en el móvil del
sobrepintado de la textura recortada (`alphaTest`) en Medio. Lo tiene que mirar el usuario en
el laboratorio cuando esté hecho.
