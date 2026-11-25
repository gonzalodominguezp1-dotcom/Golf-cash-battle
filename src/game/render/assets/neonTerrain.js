import * as THREE from 'three';
import { CITY_LAYOUT, cityRing } from './neonCity.js';

// Suelo y montañas de los temas neón (neon, neonPink, cyber2078 / hoyo 15), N4 2026-11-23. Solo dibujo: la física
// no usa este terreno, y heightAt no cambia en la pista ni en sus 5 m alrededor (allí la forma vieja ya es llana).
//
// - Montañas: la forma de crestas de antes (environment.js) se conserva, pero lo que SOBRESALE del llano se escala
//   para quedar bajo la línea de vista que va del ojo (cámara que sigue a la bola, ~1,45 m) al pie de la torre más
//   cercana posible de la ciudad (assets/neonCity.js). Cerca de la pista los cerros bajos siguen igual; a media
//   distancia quedan lomas suaves; el anillo de la ciudad es un llano (sin cerros ni charcos) y la sierra entera
//   vuelve detrás de la ciudad, con un pie que entra y sale según el rumbo (no es una pared).
// - Los hoyos (lo que queda por debajo del llano: el agua de neón) no se tocan salvo en el anillo de la ciudad.
//   Así el decorado neón cerca de la pista pasa el mismo filtro de altura y el rng del hoyo tira lo mismo.
// - Suelo: la rejilla de neón (getCyberGridTexture) también es el mapa de brillo, en el color del tema; un atributo
//   por vértice (aGlow) lo apaga bajo la pista y junto a ella. Misma malla y misma llamada de dibujo.
// - Sin rng: todo sale de la posición.

/** Ajustes (m). front/back son los mínimos; con un hoyo grande la ciudad (y con ella el llano) se aleja. */
export const NEON_TERRAIN = {
  eye: 1.4, // altura del ojo sobre la pista para la línea de vista (FOLLOW_HEIGHT de la cámara: 1,45)
  margin: 0.3, // el relieve queda al menos esto por debajo de la línea de vista
  peak: 17.5, // relieve máximo de la forma de crestas (22 - 4,5)
  // fachada más cercana posible de una torre, con 1,5 m de margen (69 - 7 / 2 - 1,5)
  front: CITY_LAYOUT.r[0] - CITY_LAYOUT.footprint[1] / 2 - 1.5,
  fill: 8, // antes del frente: los hoyos se rellenan poco a poco (el pie de las torres, en llano)
  // pie de la sierra: empieza detrás de la última torre (87 + 5,5 + 1,5) y está entera 14 m después
  back: [94, 108],
  backJitter: 6, // m que entra y sale el pie de la sierra según el rumbo
  glow: 0.45, // intensidad del brillo de la rejilla (suave: la rejilla no compite con la pista ni con el bloom)
  glowNear: [1.5, 8], // m desde la pista: sin brillo hasta glowNear[0], brillo entero desde glowNear[1]
  // tope de triángulos del terreno por calidad (una malla de 220 m; medido: 2 x seg², seg = 130 x terrainSeg:
  // Bajo 10368, Medio 19208, Alto 33800)
  tris: { low: 10500, medium: 19500, high: 34000 },
};

const smooth = THREE.MathUtils.smoothstep;

/**
 * Relieve del terreno neón para un hoyo. height(x, z, p, ramp): p = lo que la forma de crestas sube (o baja) sobre
 * el llano base0, ramp = su rampa desde la pista (0..1). Devuelve la altura final. Con p = 0 da base0 exacto.
 */
export function neonRelief(bounds, theme) {
  const T = NEON_TERRAIN;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const ring = cityRing(bounds);
  const front = Math.max(T.front, ring.rMin - CITY_LAYOUT.footprint[1] / 2 - 1.5);
  const back0 = Math.max(T.back[0], ring.rMax + ring.maxRadius + 1.5);
  const back1 = back0 + (T.back[1] - T.back[0]);
  const base0 = theme.terrainOffset - 0.6;
  // línea de vista del ojo al pie de la torre más cercana: lo que sube sobre el llano a r m del centro
  const rise = Math.max(0, T.eye - base0);
  const cone = (r) => Math.max(0, rise * (1 - r / front) - T.margin);
  const back = (x, z, r) => {
    const a = Math.atan2(z - cz, x - cx);
    const off = T.backJitter * (0.5 + 0.5 * Math.sin(3 * a + 1.3) * Math.cos(2 * a - 0.7));
    return smooth(r, back0 + off, back1 + off);
  };
  return {
    base0,
    front,
    back: [back0, back1],
    height(x, z, p, ramp) {
      if (p === 0) return base0 + p;
      const r = Math.hypot(x - cx, z - cz);
      const kb = r > back0 ? back(x, z, r) : 0;
      // hoyos: iguales salvo en el anillo de la ciudad
      if (p < 0) return base0 + p * Math.max(1 - smooth(r, front - T.fill, front), kb);
      // cerros: escalados para no pasar de la línea de vista (la forma de crestas puede subir peak x ramp)
      const k = Math.min(1, cone(r) / (T.peak * ramp));
      return base0 + p * Math.max(k, kb);
    },
  };
}

/** Atributo aGlow (0..1 por vértice) del brillo de la rejilla: 0 bajo la pista, 1 desde glowNear[1]. */
export function neonGlowAttribute(position, distToCourse) {
  const [a, b] = NEON_TERRAIN.glowNear;
  const g = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) g[i] = smooth(distToCourse(position.getX(i), position.getZ(i)), a, b);
  return new THREE.BufferAttribute(g, 1);
}

/** Material del terreno neón: metal oscuro con la rejilla de neón que brilla suave (mapa compartido, material propio). */
export function neonTerrainMaterial(grid) {
  const m = new THREE.MeshStandardMaterial({
    map: grid,
    color: 0x14182a,
    roughness: 0.45,
    metalness: 0.65,
    flatShading: true,
    vertexColors: true,
    // el color lo pone la rejilla (neón del tema); el fondo de la rejilla es casi negro y apenas brilla
    emissiveMap: grid,
    emissive: 0xffffff,
    emissiveIntensity: NEON_TERRAIN.glow,
  });
  m.name = 'neon-terrain';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;');
  };
  m.customProgramCacheKey = () => 'neon-terrain-glow';
  return m;
}
