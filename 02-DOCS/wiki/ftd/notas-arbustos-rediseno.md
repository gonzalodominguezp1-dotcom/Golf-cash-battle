# Notas de traspaso: rediseño de los arbustos (Paso 4, más detalle)

Fecha: 2026-11-18. Rama `la-chaqueta-bionica`, worktree `.worktrees/la-chaqueta-bionica`. Sin commit.
Se paró por orden del coordinador, con el código en verde y antes de empezar las mutaciones manuales.

## 1) Qué se ha hecho
- `src/game/render/assets/shrub.js`: **completo.** `makeShrub` reescrito con la misma API (`SHRUB_BUDGET`,
  `SHRUB_VARIANTS`, `SHRUB_DEFAULTS`, `shrubMaterial`, `SHRUB_WIND_HEIGHT`, tiradas fijas, `bakeStatic`).
  Novedades: `shrubMaterials()` → `{ foliage, twigs }`; `shrubMaterial()` = `foliage`; `opts.bark`.
- `tests/shrub.test.js`: **completo**, reescrito con 13 tests (presupuesto nuevo, determinismo, tiradas fijas, 4 formas,
  ramas visibles, silueta rota, NaN/normales/caras, sin caras bajo el suelo, viento, materiales, color y paleta,
  calidad, `bakeStatic` con uv).
- `src/game/render/environment.js`: **completo** en lo que toca a los arbustos. Solo se cambió `SHRUB_SCALE` (de 1.15 a 1)
  y su comentario. `shrubPaletteOpts` y `makeNatureShrub` no se tocaron.
- `tests/shrub-env.test.js`: **completo.** Solo se cambió el test de tamaño (se hizo antes de recibir la orden de no tocarlo).
  Ahora mide con `seededRng` y pide que el alto y el ancho medios caigan entre los de los dos arbustos viejos (±5 cm).
  Motivo: la primera tirada de `lcg(i*101)` es casi 0, así que el factor de escala salía siempre x0,8.
- **Sin empezar:** las ≥5 mutaciones manuales y la anotación en `02-DOCS/wiki/sdd/decisions.md` (este fichero aparece
  modificado en git, pero no lo he tocado yo).

## 2) Tests
- `node --test tests/shrub.test.js tests/shrub-env.test.js`: 19/19 en verde.
- `pnpm test`: 398 tests, 393 pasan. Fallan 5, todos VFX ajenos (`vfx-runtime` x4 y el golden de `vfx-packs`).
- `pnpm build`: ok.
- **No quedan mutaciones sin restaurar**: no se llegó a aplicar ninguna.

## 3) Decisiones de diseño y cifras
- **Estructura.** Un tronquito (curva de Bézier) y una rama fina por penacho: hay 3–6 ramas más una guía hasta el penacho de
  encima. Cada penacho tiene:
  - una masa (icosaedro con abolladura, al 82–90 % del radio del penacho);
  - un borde que rompe la silueta: tarjetas en Medio y Alto, y en Bajo puntas (1 triángulo de dos caras) más vértices de la masa empujados en punta (`tufts`).
- **Textura.** Canvas de 256x128:
  - mitad izquierda: una ramita con hojas pequeñas y puntiagudas (la usan las tarjetas);
  - parche blanco opaco en la derecha (uv 0.8125, 0.5): la masa lo lee.

  Así masa y tarjetas comparten un material: `DoubleSide`, `alphaTest` 0.5, `keepUv`, luz de borde que no da la vuelta a la normal, viento `canopy`.
- **Materiales.** Las ramas usan otro material, con viento `trunk` (solo se doblan, con la misma altura y doblado que el follaje). Tras `bakeStatic`, todo el matorral son **2 llamadas de dibujo** (comprobado en el test).
- **Color.** Oclusión: abajo y dentro más oscuro. La punta de cada tarjeta es más clara y amarilla (x1,12) y su base más oscura. Cada penacho tiene un tono propio (±0,02 de matiz y ±0,04 de luz).
- **Viento.** Aleteo de la masa entre 0,12 y 0,42, base de tarjeta 0,35, punta 0,9. Cada penacho lleva su fase.
- **4 formas:** alto, montículo, bajo y abierto.
- **Ajuste al presupuesto** (`fit`), sin tiradas extra y en este orden:
  1. bajar el icosaedro de las masas pequeñas;
  2. quitar tarjetas, hasta `minCards`;
  3. bajar otra vez el icosaedro de las masas, hasta 0;
  4. bajar los lados de las ramas;
  5. quitar tubos de rama (primero la guía; quedan al menos 3);
  6. quitar puntas;
  7. quitar el penacho más pequeño.
- **Triángulos** (30 semillas x 4 formas). Presupuesto 160/450/900:
  - Bajo: entre 124 y 160 (78 % como mínimo);
  - Medio: entre 392 y 450 (87 %);
  - Alto: entre 804 y 897 (89 %).
  - Aviso: en Bajo, el montículo pierde algún penacho (unos 0,6 por arbusto de media).
- **Tamaño sin escalar** (Medio, alto x ancho): alto 1,42 x 0,94; montículo 0,83 x 1,60; bajo 0,59 x 0,86; abierto 1,07 x 1,13.
- **Escala.** `SHRUB_SCALE = 1`. Medido en 200 semillas, alto x ancho de caja girada:
  - nuevo: 1,02 x 1,43 m;
  - liso viejo: 0,72 x 1,61;
  - facetado viejo: 1,08 x 1,33.

  Las dos medidas quedan entre las de los dos viejos.
- **Tiempo.** Se construyen unos 360 arbustos en 0,35 s en node, aproximadamente 1 ms por arbusto.

## 4) Cómo continuar
1. Mutaciones manuales (≥5) sobre `src/game/render/assets/shrub.js`. Cada una debe poner algún test en rojo; luego se restaura y se comprueba con `git diff`. Sugeridas:
   - quitar `foliage.userData.keepUv = true`;
   - poner `wantCards` a 0;
   - poner `D.tufts` a 0 y `spikes` a 0 en Bajo;
   - pasar las ramas a la capa `canopy`;
   - quitar el filtro `GROUND`;
   - poner el tono de la punta de la tarjeta igual al de la base.
2. Anotar las decisiones en `02-DOCS/wiki/sdd/decisions.md`:
   - un material para la masa y las tarjetas, gracias al parche opaco;
   - escala 1;
   - el test de tamaño mide con `seededRng`.
3. Actualizar la evidencia en `02-DOCS/wiki/ftd/assets-entorno-1a1.md`.
4. Comprobar con `pnpm test` (esperado: solo los 5 VFX ajenos) y `pnpm build`.

Ficheros a abrir primero: `src/game/render/assets/shrub.js`, `tests/shrub.test.js`.

## 5) Sin verificar
- El aspecto en pantalla: no se ha abierto el laboratorio.
- El GLSL (viento, luz de borde con `faceDirection`) en una GPU real.
- La textura de canvas: en node es falsa.
- Que las hojas no desaparezcan de lejos con las mipmaps y `alphaTest`.
- Las sombras de las tarjetas.
- Los tiempos en un móvil real.

Qué debe mirar el usuario en el laboratorio:
- Las 4 formas en Bajo, Medio y Alto.
- Que las tarjetas se lean como ramitas de hoja puntiaguda y no como cuadrados.
- Que no se vea un borde blanco en las tarjetas lejanas.
- Que en el alto y en el abierto se vean el tronquito y las ramas.
- Que el viento sea suave: las ramas quietas y las puntas aleteando.
- El tamaño frente a los árboles en un hoyo de pradera.
