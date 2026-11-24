// Asset de ejemplo: el decorado actual del juego como «antes» y «después» vacío.
// Los pasos siguientes del plan (02-DOCS/wiki/ftd/assets-entorno-1a1.md) sustituyen el null
// de makeNew por el diseño nuevo.
import { registerAsset } from '../assetRegistry.js';
import { makeTree, makeRock, buildEnvironment } from '../../game/render/environment.js';
import { COURSES } from '../../game/courses.js';
import { setQuality } from '../../game/render/quality.js';
import { makeRoundTree } from '../../game/render/assets/roundTree.js';
import { makePine } from '../../game/render/assets/pine.js';
import { makePalm } from '../../game/render/assets/palm.js';
import { makeSnowPine, makeCactus, makeDeadTree } from '../../game/render/assets/specials.js';
import { makeShrub } from '../../game/render/assets/shrub.js';
import { makeRock as makeNewRock, ROCK_TYPES, ROCK_TYPE_INFO } from '../../game/render/assets/rock.js';
import { makeBush } from '../../game/render/flora.js';
import { oldGrassPatch, newGrassPatch, oldFlowerPatch, newFlowerPatch } from './grassPatch.js';
import { oldLakePatch, newLakePatch, oldRiverPatch, newRiverPatch } from './waterPatch.js';
import { fishLakePatch, fishRiverPatch } from './fishPatch.js';
import { FLOWER_SPECIES, FLOWER_INFO } from '../../game/render/assets/flower.js';
import { GRASS_SPECIES, GRASS_SPECIES_INFO } from '../../game/render/assets/grass.js';
import { applyWind } from '../../game/render/assets/wind.js';
import { makeAsciiClouds, makeAsciiPillars, makeAsciiFlyers } from '../../game/render/assets/asciiNeon.js';
import { makeNeonCity } from '../../game/render/assets/neonCity.js';
import { makeCyberPylon, makeHoloCrystal, PYLON_VARIANTS } from '../../game/render/assets/neonProps.js';
import { THEMES } from '../../game/themes.js';
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
// Paso 9: especiales. El «antes» es makeTree('snowpine'|'cactus'|'deadtree') de hoy (ya con su escala x0,8-1,7).
// Escala del «después» para ir a la par con el juego: medido sobre 100 semillas (Medio), el viejo mide de media
// 3,36 m de alto y 3,32 de ancho (pino nevado), 2,23 x 1,15 (cactus) y 2,31 x 1,34 (árbol seco); el nuevo sin escalar,
// 3,94 x 2,52, 2,39 x 1,25 y 2,14 x 1,25. Se escalan por la altura media: x0,85, x0,93 y x1,08.
const SNOW_PINE_LAB_SCALE = 0.85, CACTUS_LAB_SCALE = 0.93, DEAD_TREE_LAB_SCALE = 1.08;
const scaled = (g, s) => (g.scale.setScalar(s), g);
registerAsset({
  id: 'snowpine',
  label: 'Pino nevado',
  makeOld: (rng) => makeTree('snowpine', rng, 0, 0, 0),
  // nieve de verdad (capa por piso, borde que cae, gorra) sobre el pino del Paso 2; no se mece
  makeNew: (rng, preset) => scaled(makeSnowPine(rng, preset), SNOW_PINE_LAB_SCALE),
});
registerAsset({
  id: 'cactus',
  label: 'Cactus',
  makeOld: (rng) => makeTree('cactus', rng, 0, 0, 0),
  // saguaro de 1-3 brazos con costillas suaves y flor opcional, o nopal de palas; casi rígido
  makeNew: (rng, preset) => scaled(makeCactus(rng, preset), CACTUS_LAB_SCALE),
});
registerAsset({
  id: 'cactus-nopal',
  label: 'Cactus · nopal (solo palas)',
  // el juego de hoy no tiene nopal: el «antes» es su único cactus (un saguaro) solo como referencia de tamaño, no es comparable forma a forma
  makeOld: (rng) => makeTree('cactus', rng, 0, 0, 0),
  makeNew: (rng, preset) => scaled(makeCactus(rng, preset, { variant: 3 }), CACTUS_LAB_SCALE),
});
registerAsset({
  id: 'deadtree',
  label: 'Árbol seco',
  makeOld: (rng) => makeTree('deadtree', rng, 0, 0, 0),
  // muerto en pie, retorcido, partido o tocón con raíces; sin hojas, casi rígido
  makeNew: (rng, preset) => scaled(makeDeadTree(rng, preset), DEAD_TREE_LAB_SCALE),
});
registerAsset({
  id: 'deadtree-stump',
  label: 'Árbol seco · tocón con raíces',
  // el juego de hoy no tiene tocón: el «antes» es su único árbol seco (de pie) solo como referencia de tamaño, no es comparable forma a forma
  makeOld: (rng) => makeTree('deadtree', rng, 0, 0, 0),
  makeNew: (rng, preset) => scaled(makeDeadTree(rng, preset, { variant: 3 }), DEAD_TREE_LAB_SCALE),
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
// Paso 8: agua lisa con normal-map que se desplaza, reflejo del cielo (fresnel), brillo del sol,
// espuma en la orilla por distancia a la costa y río que corre por su cauce; lago y río con un
// material compartido; juncos y nenúfares con el viento compartido (assets/water.js). El «antes»
// es el agua de hoy (plano facetado con olas de seno) con los juncos/nenúfares de flora.js.
// Aún NO sustituye nada en environment.js / flora.js (va tras el visto bueno).
registerAsset({
  id: 'water-lake',
  label: 'Agua · lago (parche 44 x 44 m)',
  makeOld: (rng, preset) => oldLakePatch(rng, preset),
  makeNew: (rng, preset) => newLakePatch(rng, preset),
});
registerAsset({
  id: 'water-river',
  label: 'Agua · río (parche 44 x 44 m)',
  makeOld: (rng, preset) => oldRiverPatch(rng, preset),
  makeNew: (rng, preset) => newRiverPatch(rng, preset),
});
// Pez (entre los pasos 8 y 9): 1–2 peces que asoman la aleta y saltan con salpicadura sobre el agua
// actual; en el laboratorio saltan cada 2–3 s (fast) para no esperar (en el juego, cada 6–19 s).
// «Antes» = el mismo parche sin peces. Temas sin peces (neón, lava, caldera, glaciar): el agua sola.
// Aún NO está en environment.js (va tras el visto bueno).
registerAsset({
  id: 'fish',
  label: 'Pez · lago (salta cada 2–3 s)',
  makeOld: (rng, preset) => fishLakePatch(rng, preset, { fish: false }),
  makeNew: (rng, preset) => fishLakePatch(rng, preset),
});
registerAsset({
  id: 'fish-river',
  label: 'Pez · río (salta cada 2–3 s)',
  makeOld: (rng, preset) => fishRiverPatch(rng, preset, { fish: false }),
  makeNew: (rng, preset) => fishRiverPatch(rng, preset),
});
// N7 (neón): nubes, pilares de energía y naves con textura ASCII (assets/asciiNeon.js), una malla por tipo y
// movimiento en el sombreador con el tiempo del viento. En el juego van a 96-146 m del hoyo; aquí, el anillo entero
// a escala LAB_ASCII_SCALE para verlo de cerca (la cámara mira desde dentro del anillo). Míralo con neon / neonPink;
// en los temas sin neón se usan los colores de `neon`. «Antes» = nada (el neón de hoy no tiene ASCII).
const LAB_ASCII_SCALE = 0.16;
const asciiPatch = (make, preset, view) => {
  const theme = preset.sceneTheme?.neon ? preset.sceneTheme : THEMES.neon;
  const g = new THREE.Group();
  const m = make({ level: preset.level, theme });
  m.scale.setScalar(LAB_ASCII_SCALE);
  g.add(m);
  // sin sombras (la sombra usaría la posición quieta, no la del sombreador); vista propia
  g.userData.lab = { keepShadows: true, ...view };
  return g;
};
const ASCII_ENTRIES = [
  { id: 'ascii-clouds', label: 'Neón · nubes ASCII (anillo x0,16)', make: makeAsciiClouds, view: { dist: 9, target: [0, 7, 0] } },
  { id: 'ascii-pillars', label: 'Neón · pilares de energía ASCII (anillo x0,16)', make: makeAsciiPillars, view: { dist: 9, target: [0, 3, 0] } },
  { id: 'ascii-flyers', label: 'Neón · naves ASCII con estela (anillo x0,16)', make: makeAsciiFlyers, view: { dist: 9, target: [0, 6.5, 0] } },
];
for (const { id, label, make, view } of ASCII_ENTRIES) {
  registerAsset({ id, label, makeOld: () => null, makeNew: (rng, preset) => asciiPatch(make, preset, view) });
}
// N2 (neón): ciudad lejana (assets/neonCity.js): torres escalonadas con agujas, antenas con baliza y helipuertos,
// franjas de neón y ventanas de la fachada de N0. En el juego va a 69-87 m del hoyo; aquí el anillo entero a la
// misma escala que el ASCII. Deja libres los pilares ASCII de la calidad elegida. «Antes» = nada (la ciudad vieja,
// 12 monolitos, ya no existe en el código).
registerAsset({
  id: 'neon-city',
  label: 'Neón · ciudad lejana (anillo x0,16)',
  makeOld: () => null,
  makeNew: (rng, preset) => {
    const theme = preset.sceneTheme?.neon ? preset.sceneTheme : THEMES.neon;
    const g = new THREE.Group();
    const city = makeNeonCity({ level: preset.level, theme });
    city.scale.setScalar(LAB_ASCII_SCALE);
    g.add(city);
    g.userData.lab = { keepShadows: true, dist: 9, target: [0, 2.6, 0] };
    return g;
  },
});
// N4 (neón): suelo y montañas tal como los monta environment.js en un hoyo neón (la malla «neon-terrain» con la
// rejilla de neón y las crestas bajo la línea de vista de la ciudad). Tamaño real, no a escala. «Antes» = nada.
registerAsset({
  id: 'neon-terrain',
  label: 'Neón · suelo y montañas (hoyo real, tamaño 1:1)',
  makeOld: () => null,
  makeNew: (rng, preset) => {
    const theme = preset.sceneTheme?.neon ? preset.sceneTheme : THEMES.neon;
    const course = COURSES.find((c) => THEMES[c.theme] === theme) ?? COURSES.find((c) => THEMES[c.theme]?.neon);
    setQuality(preset.level);
    const tmp = new THREE.Scene();
    buildEnvironment(tmp, course, THEMES[course.theme] ?? theme, rng);
    const terrain = tmp.children.find((o) => o.name === 'neon-terrain');
    tmp.remove(terrain);
    const g = new THREE.Group();
    g.add(terrain);
    g.userData.lab = { keepShadows: true, dist: 170, target: [0, 6, 0] };
    return g;
  },
});
// N3 (neón): pilones (poste de metal, 3 niveles de neón, base ancha, cabeza con halo; variantes lamp/post/beacon) y
// cristales holográficos (facetas de neón, anillo de datos, halo). «Antes» = nada (los viejos ya no están en el código).
// El laboratorio no tiene reloj de animación: se ven quietos. Míralos con neon / neonPink.
const propsTheme = (preset) => (preset.sceneTheme?.neon ? preset.sceneTheme : THEMES.neon);
registerAsset({
  id: 'neon-pylon',
  label: 'Neón · pilón (lamp, post, beacon)',
  makeOld: () => null,
  makeNew: (rng, preset) => {
    const pal = propsTheme(preset).neon;
    const g = new THREE.Group();
    PYLON_VARIANTS.forEach((variant, i) => {
      g.add(makeCyberPylon((i - 1) * 1.2, 0, 0, pal, variant === 'beacon', { level: preset.level, variant }));
    });
    g.userData.lab = { keepShadows: true, dist: 6, target: [0, 0.9, 0] };
    return g;
  },
});
registerAsset({
  id: 'neon-crystal',
  label: 'Neón · cristal holográfico',
  makeOld: () => null,
  makeNew: (rng, preset) => {
    const pal = propsTheme(preset).neon;
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(makeHoloCrystal((i - 1) * 1.1, 0, 0, pal, rng, null, { level: preset.level }));
    g.userData.lab = { keepShadows: true, dist: 5, target: [0, 0.8, 0] };
    return g;
  },
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
