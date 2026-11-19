// Asset de ejemplo: el decorado actual del juego como «antes» y «después» vacío.
// Los pasos siguientes del plan (02-DOCS/wiki/ftd/assets-entorno-1a1.md) sustituyen el null
// de makeNew por el diseño nuevo.
import { registerAsset } from '../assetRegistry.js';
import { makeTree, makeRock } from '../../game/render/environment.js';
import { makeRoundTree } from '../../game/render/assets/roundTree.js';
import { makePine } from '../../game/render/assets/pine.js';
import { makePalm } from '../../game/render/assets/palm.js';
import { makeShrub } from '../../game/render/assets/shrub.js';
import { makeRock as makeNewRock, ROCK_TYPES, ROCK_TYPE_INFO } from '../../game/render/assets/rock.js';
import { makeBush } from '../../game/render/flora.js';
import { oldGrassPatch, newGrassPatch, oldFlowerPatch, newFlowerPatch } from './grassPatch.js';
import { FLOWER_SPECIES, FLOWER_INFO } from '../../game/render/assets/flower.js';
import { GRASS_SPECIES, GRASS_SPECIES_INFO } from '../../game/render/assets/grass.js';
import { applyWind } from '../../game/render/assets/wind.js';
import * as THREE from 'three';

// «Antes» del arbusto: las mismas hojas facetadas que usa environment.js (leafMats no se exporta)
const OLD_LEAVES = [0x2f9e44, 0x3bb54a, 0x25803a, 0x4cc25a].map((color) => applyWind(new THREE.MeshLambertMaterial({ color, flatShading: true }), { layer: 'canopy' }));

registerAsset({
  id: 'tree-round',
  label: 'Árbol redondo',
  makeOld: (rng) => makeTree('round', rng, 0, 0, 0),
  // Paso 1: tronco curvo con ramas, copa de racimos lisos; tarjetas de hojas en Alto
  makeNew: (rng, preset) => makeRoundTree(rng, preset),
});
registerAsset({
  id: 'pine',
  label: 'Pino',
  makeOld: (rng) => makeTree('pine', rng, 0, 0, 0),
  // Paso 2: pisos lisos con borde ondulado, tronco a la vista, punta fina (paleta: preset.theme si viene)
  makeNew: (rng, preset) => makePine(rng, preset),
});
registerAsset({
  id: 'palm',
  label: 'Palmera',
  makeOld: (rng) => makeTree('palm', rng, 0, 0, 0),
  // Paso 3: tronco curvo con anillos, hojas arqueadas con foliolos que aletean (paleta: preset.theme si viene)
  makeNew: (rng, preset) => makePalm(rng, preset),
});
registerAsset({
  id: 'shrub',
  label: 'Arbusto',
  makeOld: (rng) => makeBush(rng, 0, 0, 0, OLD_LEAVES),
  // Paso 4: 2-4 racimos lisos bajos y anchos, viento suave (paleta: preset.theme si viene)
  makeNew: (rng, preset) => makeShrub(rng, preset),
});
registerAsset({
  id: 'grass',
  label: 'Césped (parche 19 x 22 m)',
  // «Antes»: addGrassField + makeTuft/makeGrassClump de hoy; Paso 5 bis: 6 especies x 3
  // variantes con atlas de hojas (Medio/Alto), reparto según el tema, manchas de color según
  // el mundo, matas altas junto a la pista, como mucho 5 llamadas de dibujo (assets/grass.js)
  makeOld: (rng, preset) => oldGrassPatch(rng, preset),
  makeNew: (rng, preset) => newGrassPatch(rng, preset),
});
// cada especie sola, en los mismos sitios (para mirarla de cerca frente al césped de hoy)
for (const sp of GRASS_SPECIES) {
  registerAsset({
    id: `grass-${sp}`,
    label: `Césped · solo ${GRASS_SPECIES_INFO[sp].label}`,
    makeOld: (rng, preset) => oldGrassPatch(rng, preset),
    makeNew: (rng, preset) => newGrassPatch(rng, preset, { only: sp }),
  });
}
// Paso 7: tres tipos lisos con color por capas (musgo arriba solo en temas verdes, base oscura),
// una llamada de dibujo por roca y sin viento (assets/rock.js). El «antes» es la roca facetada
// de hoy; el montón de rocas de hoy; el montón grande de hoy (rockpile) se compara con el montón nuevo (`pile`) en tres piedras.
// Aún NO sustituyen nada en environment.js (decisión pendiente tras el visto bueno).
for (const type of ROCK_TYPES.filter((t) => t !== 'pile')) {
  registerAsset({
    id: type === 'boulder' ? 'rock' : `rock-${type}`,
    label: `Roca · ${ROCK_TYPE_INFO[type].label.toLowerCase()}`,
    // tamaño 1 = el representativo de environment.js (usa 1, 0.7 y 0.45): diámetro medio
    // 2*(0.3+0.9u) = 1.5 m. Las rocas nuevas miden de media (30 semillas, Medio): canto 1.02 x 0.64 x
    // 0.87 m, losa 1.52 x 0.18 x 1.00 m, grupo 1.60 x 0.54 x 1.47 m.
    makeOld: (rng) => makeRock(rng, 0, 0, 0, 1),
    makeNew: (rng, preset) => makeNewRock(rng, preset, { type }),
  });
}
// Rocas sueltas de arenisca (canto rodado y losa): mismo «antes» y misma escala que `rock` / `rock-slab`.
for (const type of ['boulder', 'slab']) {
  registerAsset({
    id: type === 'boulder' ? 'rock-sandstone' : 'rock-slab-sandstone',
    label: `Roca · ${ROCK_TYPE_INFO[type].label.toLowerCase()} · arenisca`,
    makeOld: (rng) => makeRock(rng, 0, 0, 0, 1),
    makeNew: (rng, preset) => makeNewRock(rng, preset, { type, material: 'sandstone' }),
  });
}
// Rediseño del rockpile (montón grande de makeTree): `pile` de rock.js, 5-8 piedras apiladas.
// makeTree escala cada montón al azar con 0.8 + rng()*0.9 (0.8 a 1.7, media 1.25), lo que haría el
// «antes» incomparable entre semillas: se fija en 1.25 (la media del juego). Medido (30 semillas): el viejo
// a 1.25 mide 2.5-3.3 m de alto (media 2.9) y 3.1-4.9 m de ancho (media 3.9) (sin escalar: ~2.3 x 3.1 m de
// media, con las bolas desordenadas). El nuevo se muestra SIN escalar: 1.8-2.4 m de alto y 2.0-3.0 m de ancho
// (30 semillas, 3 variantes, 3 calidades), así que junto al viejo a 1.25 se ve ~25 % menor; al sustituir en
// environment.js hará falta una escala medida (~1.2 para igualar la media). Tres piedras: gris (musgo según
// el tema), sin musgo y arenisca.
const PILE_ENTRIES = [
  { id: 'rockpile', label: 'Montón de rocas (antes: rockpile)', material: 'gray' },
  { id: 'rockpile-bare', label: 'Montón de rocas · sin musgo', material: 'bare' },
  { id: 'rockpile-sandstone', label: 'Montón de rocas · arenisca', material: 'sandstone' },
];
for (const { id, label, material } of PILE_ENTRIES) {
  registerAsset({
    id,
    label,
    makeOld: (rng) => {
      const g = makeTree('rockpile', rng, 0, 0, 0);
      g.scale.setScalar(1.25);
      return g;
    },
    makeNew: (rng, preset) => makeNewRock(rng, preset, { type: 'pile', material }),
  });
}
registerAsset({
  id: 'flower',
  label: 'Flores (parche 19 x 22 m)',
  // «Antes»: makeFlower de hoy suelto; Paso 6: margarita, tulipán y campanilla instanciados
  // (una malla por especie, como mucho 3 llamadas), manchas por especie, paleta del tema y
  // tallo que se dobla con el viento (assets/flower.js). Los temas sin flores salen vacíos.
  makeOld: (rng, preset) => oldFlowerPatch(rng, preset),
  makeNew: (rng, preset) => newFlowerPatch(rng, preset),
});
// cada especie sola, en los mismos sitios (para mirarla de cerca)
for (const sp of FLOWER_SPECIES) {
  registerAsset({
    id: `flower-${sp}`,
    label: `Flores · solo ${FLOWER_INFO[sp].label}`,
    makeOld: (rng, preset) => oldFlowerPatch(rng, preset),
    makeNew: (rng, preset) => newFlowerPatch(rng, preset, { only: sp }),
  });
}
