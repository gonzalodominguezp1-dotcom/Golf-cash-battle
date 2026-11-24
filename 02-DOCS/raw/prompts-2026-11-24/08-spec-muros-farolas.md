# Prompt 8 — Añadir a la spec de assets: muros por tipo de mapa y farolas/luces

Soy Gonzalo. Trabaja en mi rama según `CLAUDE.md` (`la-yuinta-mangante`: fetch, checkout y pull antes de tocar nada). pnpm siempre.

**Solo documentación:** en esta sesión no se toca código del juego. El objetivo es ampliar la spec para que luego se ejecute como el resto de pasos.

## Qué quiero
En la spec de la feature de assets, `02-DOCS/wiki/ftd/assets-entorno-1a1.md` («Rediseño 1 a 1 de los assets de entorno»), añadir dos bloques nuevos de trabajo:
1. **Rehacer los muros de todos los mapas**, con **variaciones según el tipo de mapa** (creo que ahora es casi el mismo muro siempre).
2. **Farolas y luces** que se usan ahora, para modificarlas/rediseñarlas.

**Ojo:** esa spec es de mi compañero (rama `la-chaqueta-bionica`) y allí puede estar más actualizada que en mi rama. Antes de editar, compara la versión de `origin/la-chaqueta-bionica`, `origin/main` y la mía (`git diff`) y parte de la más nueva. No hagas push a su rama: el cambio va en la mía y luego se junta. Dime si hay diferencias.

## Inventario que tienes que hacer primero (y dejar escrito en la spec)
### Muros (pista)
- Se construyen en `src/game/render/course.js` (~185-330): un cuerpo (`RoundedBoxGeometry` o `BoxGeometry` troceada si hay relieve) + un remate (`capMat`) por cada segmento de `wallSegmentsOf(course)` (`src/game/physics.js`), postes cilíndricos con bola en las esquinas, y una franja de sombra de contacto (`aoStripTexture`). Los materiales cambian solo por flags del tema (`src/game/themes.js`):
  - normal: madera (`woodMaps`) + remate blanco; postes blancos con bola roja.
  - `glowWalls` (pradera de día): verde + remate que brilla con `theme.rim`.
  - `stoneWalls` (templo): madera teñida arenisca.
  - `iceWalls` (glaciar): azul hielo + remate de nieve.
  - `rockFloor`: roca.
  - neón/cyberpunk: cuerpo oscuro metálico + remate emisivo `neonColor(i)`.
- Los muros se vuelven transparentes cuando tapan la bola (`wallBlocksBall`, `mats`, `opacity`) y llevan `baseEmissive` para la noche: **eso tiene que seguir funcionando**.
- **Regla de oro:** la física/colisiones (`WALL_H`, `WALL_HALF`, segmentos) no cambian; solo lo visual.
- Haz una tabla: tema (`THEMES` en `themes.js`: meadow, meadowDay, jungle, beach, sunset, snow, glacier, canyon, autumn, night, volcano, caldera, neon, neonPink, gardenNight, beachNight, cyber2078) → qué muro lleva hoy → qué variación propones (p. ej. madera con tablones y clavos en pradera, piedra tallada con musgo en templo/selva, bloques de hielo translúcido con escarcha en glaciar/nieve, roca volcánica con grietas de lava en volcán/caldera, bambú/caña en playa, metal con tiras de neón y paneles en neón/cyberpunk, ladrillo/estacas en otoño, etc.). Indica qué hoyos usa cada tema (`src/game/courses.js`).

### Farolas y luces
- Farolillos y antorchas: `makeLantern`, `makeTorch`, `festoon`, `haloSprite`, `perimeterSpots` en `src/game/render/environment.js` (~406-425 y ~1087-1200); salen con `theme.lanterns` (`true` o `'many'`), `theme.torches`, `theme.festoon`. Solo unos pocos llevan `PointLight` real (coste en móvil) y parpadean en `animated`.
- Neón: pilones y cristales en `src/game/render/assets/neonProps.js` (variantes `lamp`, `post`, `beacon`; paso N3 de la spec).
- Luces de atracciones: `PointLight` en `src/game/render/attractions.js` (~377, ~596, ~693, ~734) y lava/volcán en `src/game/render/course.js` (~694, ~773, ~859).
- Postes de esquina de los muros (bola roja emisiva de noche).
- Haz una tabla: elemento → dónde está → en qué temas sale → si lleva luz real → propuesta de rediseño. Marca qué entra en el rediseño (decorado: farolillos, antorchas, guirnaldas, postes) y qué no (luces de atracciones, que la spec deja fuera con N5; pregúntame si quiero incluirlas).

## Cómo escribirlo en la spec
Sigue el formato de la spec (pasos con nombre, «Hecho cuando», presupuestos, quién lo hace):
- **Paso M — Muros por tipo de mapa** (subpasos por familia de tema, M1…Mn). Técnica igual que el resto: procedural en three.js, texturas pintadas en canvas, color de vértice/oclusión, materiales compartidos, `rng` con semilla, compatible con la transparencia que deja ver la bola, móvil primero (presupuesto de triángulos y llamadas de dibujo por hoyo en Bajo/Medio/Alto, comparado con el actual: mídelo). Entrada en el laboratorio `assets-lab.html` (`src/lab/assets/examples.js`) con antes/después por tema. Tests de presupuesto y de que las colisiones no cambian (modelo: `tests/*-env.test.js`).
- **Paso F2 — Farolas y luces** (subpasos: farolillo, antorcha, guirnalda, poste de esquina, y la parte de neón que no cubra N3). Máximo de `PointLight` reales por hoyo y por calidad, halo/emisivo barato para el resto, parpadeo con el mismo reloj, variaciones por tema.
- Añádelos al **Orden**, a la **Checklist** y al apartado «Ejecución» (qué va con el modelo grande y qué con el mediano, como el resto de pasos), y apunta las **decisiones abiertas** que tenga que tomar yo.
- Añade una entrada fechada (2026-11-24) en «Decisiones tomadas»: el usuario pide rehacer muros con variaciones por tipo de mapa y rediseñar farolas/luces.
- Si existe `02-DOCS/wiki/sdd/decisions.md`, apunta ahí la decisión también.

## Cierre
- Enséñame el diff de la spec antes de hacer commit.
- Commit en mi rama con mensaje en español (`📝 docs(assets): ...`). Sin PR salvo que lo pida.
