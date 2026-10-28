// Marea Abisal (ideas_skins/_plan/spec-skins.md, skin 5): cristal azul abisal con venas bioluminiscentes
// cian finas y ramificadas que fluyen hacia arriba (iso-líneas de fbm de grosor constante en pantalla),
// puntos de luz agrupados a lo largo de las venas, más profundas hacia el centro, y reflejo nacarado arriba.
//   uFlow (propio): fase acumulada del flujo; avanza 0,08 u/s y hasta 5 veces más rápido al rodar.
//   Con «reducir movimiento» dt = 0 y las venas quedan quietas (la fase se acumula en update, no en uTime).
// Coste: fbm (SK_FBM octavas) + 1 ruido de máscara + 1 hash de celda; el grosor usa fwidth (derivadas).
// Baja no ejecuta shader (material estándar + canvas `abyss_veins`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;

  // cristal azul profundo (en la hoja es un azul saturado, no negro): el borde algo más claro, el centro más hondo
  diffuse.rgb = mix(uPalBase, uPalSecondary, 0.2) * mix(1.25, 0.75, cz);
  sk_emis += uPalSecondary * 0.05 * (0.5 + 0.5 * rim);

  // venas: iso-línea del fbm con grosor constante en pantalla (fwidth), agrupadas por una máscara suave
  vec3 fp = p * SK_FREQ_F + vec3(0.0, -uFlow, uSeed);
  float n = sk_fbm3(fp, SK_FBM);
  float live = smoothstep(0.22, 0.42, sk_noise3(p * 1.4 + vec3(uSeed + 5.0, 2.0, 1.0))) * smoothstep(0.9, 0.15, nv.y);
  float fw = clamp(fwidth(n), 0.0004, 0.014);
  float dn = abs(n - SK_MID_F);
  float vein = (1.0 - smoothstep(fw * 0.8, fw * 2.0, dn)) * live;
  float halo = (1.0 - smoothstep(fw * 1.5, fw * 7.0, dn)) * live;
  float pulse = 1.2 + 0.4 * sin(uTime * 1.3 + p.y * 4.0);
  float deep = mix(0.6, 1.0, cz);
  sk_emis += (uPalAccent * vein * pulse * 1.15 + uPalGlow * vein * vein * 0.5 + uPalAccent * halo * 0.22) * deep;
  diffuse.rgb = mix(diffuse.rgb, uPalAccent * 0.4, vein * 0.4);

  // puntos de luz en bloques, solo pegados a las venas (como las motas de la hoja)
  vec3 sc = p * 26.0;
  float hs = sk_hash(floor(sc));
  vec3 cf = abs(fract(sc) - 0.5);
  float blk = 1.0 - smoothstep(0.26, 0.4, max(cf.x, max(cf.y, cf.z)));
  sk_emis += uPalGlow * blk * step(0.8, hs) * smoothstep(0.05, 0.4, halo) * (1.0 - vein) * 1.3 * deep;

  #if SK_SPECKS > 0
  // plancton suelto: puntos fijos anclados a la superficie
  vec3 sc2 = p * 36.0;
  float hs2 = sk_hash(floor(sc2) + 3.0);
  if (hs2 > 0.988) sk_emis += uPalGlow * 0.8 * smoothstep(0.34, 0.1, length(fract(sc2) - 0.5));
  #endif

  // reflejo nacarado arriba y borde claro; tinte inferior de azul eléctrico
  sk_emis += mix(vec3(0.7, 0.85, 1.0), uPalGlow, 0.3) * (0.1 * smoothstep(0.1, 0.9, nv.y) + 0.3 * pow(rim, 3.5));
  sk_emis += uPalSecondary * 0.15 * smoothstep(0.2, -0.6, nv.y);
}
`,
  uniforms: { uFlow: { value: 0 } },
  update(u, t, dt, ctx) {
    u.uFlow.value += Math.min(dt, 0.1) * 0.08 * (1 + (ctx?.speed ?? 0) * 4);
  },
  quality: {
    low: { fbm: 2, freq: 2.8, specks: 0, mid: 0.375 },
    medium: { fbm: 2, freq: 2.8, specks: 0, mid: 0.375 },
    high: { fbm: 3, freq: 2.8, specks: 1, mid: 0.44 },
  },
};
