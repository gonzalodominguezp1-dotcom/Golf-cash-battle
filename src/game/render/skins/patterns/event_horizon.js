// P3f · Horizonte de Sucesos (docs/skins-premium-plan.md, ficha 6): esfera negra pura (rough 1, sin
// reflejo) con anillo de fotones por fresnel invertido en el borde. El disco de acreción es FX (P5).
//   uState (racha 0..5): el halo del borde vira oro -> rosa -> violeta y gana intensidad.
//   uSeed: fase y orientación del temblor de lente en el anillo.
// Baja no ejecuta shader (material estándar + canvas); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  // normal en espacio de vista reconstruida con los ejes de objeto; el rayo de vista ~ +Z
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float rim = 1.0 - clamp(nv.z, 0.0, 1.0);

  // negro absoluto, mate y sin reflejo
  diffuse.rgb = vec3(0.0);
  sk_dRough = 1.0;
  sk_dMetal = -1.0;

  // color del halo según racha: acento (oro) -> secundario (rosa) -> brillo (violeta)
  float s = clamp(uState / 5.0, 0.0, 1.0);
  vec3 halo = s < 0.5 ? mix(uPalAccent, uPalSecondary, s * 2.0) : mix(uPalSecondary, uPalGlow, s * 2.0 - 1.0);

  // temblor de lente que recorre el anillo (semilla = fase)
  float wob = 1.0;
  #if SK_NOISE > 0
  vec3 q = p * SK_FREQ_F + vec3(uTime * 0.35, uSeed, -uTime * 0.2);
  wob = 0.75 + 0.5 * sk_fbm3(q, SK_NOISE);
  #endif

  // anillo de fotones: núcleo blanco muy fino + halo de color más ancho
  float core = pow(rim, SK_RING_F) * wob;
  float glow = pow(rim, SK_HALO_F) * wob;
  float boost = 1.0 + s * 0.8 + uImpact * 1.5;
  vec3 e = vec3(1.0) * core * 3.0 + halo * glow * 1.6 * boost;

  #if SK_Q >= 2
  // alta: segundo anillo de lente más tenue, algo hacia dentro, desplazado por la semilla
  float r2 = exp(-pow((rim - 0.62) * 9.0, 2.0)) * (0.5 + 0.5 * sin(p.y * 6.0 + uSeed + uTime * 0.5));
  e += halo * r2 * 0.25 * boost;
  #endif

  sk_emis += e;
}
`,
  uniforms: {},
  update() {},
  quality: {
    low: { noise: 0, freq: 2, ring: 7, halo: 3 },
    medium: { noise: 2, freq: 2.5, ring: 7, halo: 3 },
    high: { noise: 3, freq: 3, ring: 8, halo: 3 },
  },
};
