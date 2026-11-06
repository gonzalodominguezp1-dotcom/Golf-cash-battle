// Primera tanda de efectos (AC10). Datos puros: sin three, sin funciones, sin azar.
import portal from './portal.js';
import impacts from './impacts.js';
import skins from './skins.js';

export * from './portal.js';
export * from './impacts.js';
export * from './skins.js';

export const PACKS = [...portal, ...impacts, ...skins];

const BY_ID = new Map(PACKS.map((e) => [e.id, e]));
/** Efecto por id, o undefined si no existe. */
export const byId = (id) => BY_ID.get(id);
