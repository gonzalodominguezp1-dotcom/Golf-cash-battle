// Asset de ejemplo: el decorado actual del juego como «antes» y «después» vacío.
// Los pasos siguientes del plan (02-DOCS/wiki/ftd/assets-entorno-1a1.md) sustituyen el null
// de makeNew por el diseño nuevo.
import { registerAsset } from '../assetRegistry.js';
import { makeTree, makeRock } from '../../game/render/environment.js';
import { makeRoundTree } from '../../game/render/assets/roundTree.js';
import { makePine } from '../../game/render/assets/pine.js';
import { makePalm } from '../../game/render/assets/palm.js';
import { makeShrub } from '../../game/render/assets/shrub.js';
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
registerAsset({
  id: 'rock',
  label: 'Roca',
  makeOld: (rng) => makeRock(rng, 0, 0, 0, 2),
  makeNew: () => null,
});
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
