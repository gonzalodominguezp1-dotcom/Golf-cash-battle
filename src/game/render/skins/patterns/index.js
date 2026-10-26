// Registro de patrones de shader por skin. Contrato de cada patrón (P3a…P3h), en
// `patterns/<id>.js`, exportando (default o con nombre) un objeto:
//   {
//     glsl: string,          // define `void skinPattern(vec3 p, inout vec4 diffuse)`; `p` = posición unitaria
//                            // en espacio de objeto. Puede escribir sk_dRough, sk_dMetal (aditivos),
//                            // sk_emis (HDR, sumado a la emisión) y sk_nPert (perturbación de normal en
//                            // espacio de objeto). Tiene a mano uTime, uSpeed, uImpact, uSeed,
//                            // uState, uQuality, uPal{Base,Accent,Secondary,Glow} y shaderLib (sk_*).
//                            // También se definen SK_Q (0 baja, 1 media, 2 alta) y, por cada clave de
//                            // quality[nivel], `SK_<CLAVE>` (entero si lo es) y `SK_<CLAVE>_F` (siempre float);
//                            // p. ej. { fbm: 3 } -> SK_FBM 3 y SK_FBM_F 3.0000.
//     uniforms: { nombre: { value } },  // propios; tipo GLSL deducido del valor; se clonan por material
//     update(u, t, dt, ctx), // u = uniforms propios del material, ctx = { speed, impact, state, quality, instance }
//     quality: { low, medium, high },   // números u objetos de números
//   }
// Un patrón con `glsl` vacío es un stub: la skin se ve con su base pintada y el acabado de su tier.
// Los archivos nuevos de esta carpeta se registran solos (import.meta.glob).

export const PATTERN_IDS = [
  'kintsugi_neon',
  'damascus_imperial',
  'supernova_solar',
  'crimson_dragon',
  'ice',
  'event_horizon',
  'holo',
  'midas_touch',
  'antimatter_void',
  'tormenta_voltaica',
  'anima_errante',
  'cronometro_laton',
  'abyssal_tide',
];

function stub(id) {
  return { id, glsl: '', uniforms: {}, update() {}, quality: { low: {}, medium: {}, high: {} } };
}

const REGISTRY = new Map(PATTERN_IDS.map((id) => [id, stub(id)]));

let modules = {};
try {
  modules = import.meta.glob(['./*.js', '!./index.js'], { eager: true });
} catch {
  // fuera de Vite (tests con node): solo stubs
}
for (const [path, mod] of Object.entries(modules)) {
  const id = path.replace(/^\.\//, '').replace(/\.js$/, '');
  const p = mod.default ?? mod.pattern ?? mod;
  if (p && typeof p === 'object' && 'glsl' in p) REGISTRY.set(id, { id, ...stub(id), ...p });
}

/** Patrón registrado (o `null`). Un stub devuelve un objeto con `glsl` vacío. */
export function getPattern(id) {
  return (id && REGISTRY.get(id)) || null;
}

export function registerPattern(id, pattern) {
  REGISTRY.set(id, { id, ...stub(id), ...pattern });
}
