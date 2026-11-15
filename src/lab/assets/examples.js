// Asset de ejemplo: el decorado actual del juego como «antes» y «después» vacío.
// Los pasos siguientes del plan (02-DOCS/wiki/ftd/assets-entorno-1a1.md) sustituyen el null
// de makeNew por el diseño nuevo.
import { registerAsset } from '../assetRegistry.js';
import { makeTree, makeRock, makeFlower } from '../../game/render/environment.js';

registerAsset({
  id: 'tree-round',
  label: 'Árbol redondo',
  makeOld: (rng) => makeTree('round', rng, 0, 0, 0),
  makeNew: () => null,
});
registerAsset({
  id: 'pine',
  label: 'Pino',
  makeOld: (rng) => makeTree('pine', rng, 0, 0, 0),
  makeNew: () => null,
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
