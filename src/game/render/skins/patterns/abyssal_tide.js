// Marea Abisal (ideas_skins/_plan/spec-skins.md, skin 5): cristal azul abisal con venas bioluminiscentes
// cian que fluyen hacia arriba (iso-líneas de fbm), más profundas hacia el centro, y plancton en alta.
//   uFlow (propio): fase acumulada del flujo; avanza 0,08 u/s y hasta 5 veces más rápido al rodar.
//   Con «reducir movimiento» dt = 0 y las venas quedan quietas (la fase se acumula en update, no en uTime).
// Baja no ejecuta shader (material estándar + canvas `abyss_veins`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);

  // fondo: el borde algo más claro (cristal), el centro más hondo
  diffuse.rgb = uPalBase * mix(1.25, 0.8, cz);

  // venas
  float n = sk_fbm3(p * SK_FREQ_F + vec3(0.0, -uFlow, uSeed), SK_FBM);
  float v = 1.0 - abs(n - SK_MID_F) * 2.0;
  float vein = smoothstep(0.95, 0.99, v);
  float pulse = 1.2 + 0.4 * sin(uTime * 1.3 + p.y * 4.0);
  sk_emis += uPalAccent * vein * pulse * mix(0.6, 1.0, cz);
  diffuse.rgb = mix(diffuse.rgb, uPalAccent * 0.4, vein * 0.4);

  #if SK_SPECKS > 0
  // plancton: puntos fijos anclados a la superficie
  vec3 sc = p * 36.0;
  float hs = sk_hash(floor(sc));
  if (hs > 0.988) sk_emis += uPalGlow * 0.8 * smoothstep(0.34, 0.1, length(fract(sc) - 0.5));
  #endif

  // tinte inferior: azul eléctrico en la parte baja
  sk_emis += uPalSecondary * 0.15 * smoothstep(0.2, -0.6, nv.y);
}
`,
  uniforms: { uFlow: { value: 0 } },
  update(u, t, dt, ctx) {
    u.uFlow.value += Math.min(dt, 0.1) * 0.08 * (1 + (ctx?.speed ?? 0) * 4);
  },
  quality: {
    low: { fbm: 2, freq: 2.2, specks: 0, mid: 0.375 },
    medium: { fbm: 2, freq: 2.2, specks: 0, mid: 0.375 },
    high: { fbm: 3, freq: 2.4, specks: 1, mid: 0.44 },
  },
};
