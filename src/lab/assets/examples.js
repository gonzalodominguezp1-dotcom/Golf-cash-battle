// Asset de ejemplo: el decorado actual del juego como «antes» y «después» vacío.
// Los pasos siguientes del plan (02-DOCS/wiki/ftd/assets-entorno-1a1.md) sustituyen el null
// de makeNew por el diseño nuevo.
import { registerAsset } from '../assetRegistry.js';
import { makeTree, makeRock, makeFlower } from '../../game/render/environment.js';
import { makeRoundTree } from '../../game/render/assets/roundTree.js';
import { makePine } from '../../game/render/assets/pine.js';
import { makePalm } from '../../game/render/assets/palm.js';

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
  id: 'rock',
  label: 'Roca',
  makeOld: (rng) => makeRock(rng, 0, 0, 0, 2),
  makeNew: () => null,
});
registerAsset({
  id: 'flower',
  label: 'Flor',
  makeOld: (rng) => makeFlower(rng, 0, 0, 0),
  makeNew: () => null,
});
