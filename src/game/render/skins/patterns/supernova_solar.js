// Patrón «Supernova Solar» (docs/skins-premium-plan.md, ficha 3 de (b)): plasma emisivo HDR con
// granulación solar (voronoi 3D con celdas que derivan + dominio deformado por fbm), manchas solares
// oscuras, protuberancias en el limbo y corona. Rough 0.6 efectivo, sin barniz: es una estrella.
//   - low: sin shader (skinMaterial usa la textura horneada); variante definida por coherencia.
//   - medium: 1 capa de voronoi + fbm 3 + limbo.
//   - high: 2 capas de voronoi + fbm 4 + corona exterior + relieve de granos (sk_nPert).
//   - uSeed desplaza el dominio del ruido (cada bola tiene su disposición de granos y manchas).
//   - uWear apaga ligeramente el plasma (estrella «enfriada»); el desgaste base lo aplica shaderLib.

const glsl = /* glsl */ `
// pendiente de brillo -> color de plasma: fondo oscuro, naranja, ámbar, núcleo blanco-cálido
vec3 snRamp(float h) {
  vec3 dark = vec3(0.165, 0.020, 0.0);
  vec3 c = mix(dark, uPalBase, smoothstep(0.0, 0.45, h));
  c = mix(c, uPalAccent, smoothstep(0.4, 0.8, h));
  c = mix(c, uPalSecondary, smoothstep(0.78, 1.0, h));
  return c;
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  float t = uTime * 0.10;
  vec3 so = vec3(uSeed * 0.731, uSeed * 1.173, uSeed * 0.419);

  // Fresnel aproximado (esfera, cámara en +Z de vista): nz = componente Z de la normal en vista
  float nz = clamp(p.x * vObjX.z + p.y * vObjY.z + p.z * vObjZ.z, 0.0, 1.0);
  float limb = 1.0 - nz;

  // convección: dominio deformado lentamente por fbm, celdas que derivan en 3D
  vec3 q = p * 3.2 + so;
  vec3 warp = vec3(
    sk_fbm3(q * 0.7 + vec3(t * 0.9, 0.0, 0.0), SK_OCT),
    sk_fbm3(q * 0.7 + vec3(0.0, t * 0.8, 5.2), SK_OCT),
    sk_fbm3(q * 0.7 + vec3(3.1, 0.0, t * 0.7), SK_OCT)) - 0.5;
  vec3 pc = q + warp * 1.1 + vec3(t * 0.7, -t * 0.5, t * 0.35);

  vec3 v1 = sk_voronoi3(pc);
  // granulo: centro caliente, carriles intergranulares oscuros
  float gran = smoothstep(0.0, 0.34, v1.y);
  float core = 1.0 - smoothstep(0.0, 0.62, v1.x);
  float h = 0.05 + 0.50 * gran + 0.28 * core * gran;
#if SK_LAYERS > 1
  // segunda capa, más fina y a otra velocidad (supergranulación/microgranulación)
  vec3 v2 = sk_voronoi3(pc * 2.3 + vec3(-t * 1.6, t * 1.1, 4.7));
  float g2 = smoothstep(0.0, 0.3, v2.y);
  h = h * (0.72 + 0.28 * g2) + 0.07 * (v2.z - 0.5);
#endif
  // variación de celda y pulso lento de cada granulo
  h += (v1.z - 0.5) * 0.14 + 0.06 * sin(uTime * 0.9 + v1.z * 40.0);

  // manchas solares: zonas amplias y oscuras con penumbra
  float spotN = sk_fbm3(p * 1.7 + so + vec3(t * 0.12, 0.0, 0.0), SK_OCT);
  float spot = smoothstep(0.60, 0.72, spotN);
  float penum = smoothstep(0.54, 0.62, spotN);
  h = mix(h, h * 0.45, penum * 0.6);
  h = mix(h, 0.05, spot * 0.85);

  // brillo sube con la velocidad y con el impacto
  float heat = clamp(uSpeed, 0.0, 1.0) * 0.35   // uSpeed en 0..1
     + uImpact * 0.6 + uHeat;
  h = clamp(h + heat * 0.25, 0.0, 1.0);

  vec3 col = snRamp(h);
  float lum = 0.75 + 1.5 * smoothstep(0.45, 1.0, h) + heat * 1.0;
  // oscurecimiento suave de limbo (como el Sol real) para dar volumen
  float ld = mix(1.0, 0.62, pow(limb, 1.6));
  // desgaste: plasma algo más apagado
  float cool = 1.0 - 0.35 * uWear;

  vec3 emis = col * lum * ld * cool;

  // protuberancias: lenguas de fuego en el limbo, animadas
  float pr = sk_noise3(p * 4.0 + so + vec3(0.0, t * 2.2, t * 1.4));
  pr = pr * 0.6 + 0.4 * sk_noise3(p * 9.0 + so - vec3(t * 3.0));
  float prom = pow(limb, 2.4) * smoothstep(0.35, 0.85, pr);
  emis += uPalAccent * prom * (1.8 + 1.4 * heat);
  emis += uPalGlow * pow(limb, 5.0) * 0.8;

#if SK_CORONA > 0
  // corona: halo rojizo-blanco muy en el borde con rayos radiales
  float rays = sk_noise3(p * 6.0 + so + vec3(t * 1.2));
  emis += mix(uPalBase, uPalSecondary, 0.45) * pow(limb, 7.0) * (0.9 + 1.6 * rays) * (1.0 + heat);
#endif

  // sombras de manchas sin emisión extra; el albedo es oscuro (la luz la pone la emisión)
  diffuse.rgb = mix(uPalBase * 0.16, vec3(0.04, 0.008, 0.0), spot);
  sk_dRough = 0.2 + 0.12 * (1.0 - gran);
  sk_dMetal = -0.3;
  sk_emis += emis;

#if SK_RELIEF > 0
  // relieve sutil de granos: normal empujada por el gradiente del campo
  sk_nPert += sk_noiseGrad(pc * 1.3, 0.05) * 0.05;
#endif
}
`;

export default {
  glsl,
  uniforms: { uHeat: { value: 0 } },
  quality: {
    low: { oct: 2, layers: 1, corona: 0, relief: 0 },
    medium: { oct: 3, layers: 1, corona: 0, relief: 0 },
    high: { oct: 4, layers: 2, corona: 1, relief: 1 },
  },
  // uHeat: calor suavizado (sube al rodar rápido, decae al parar)
  update(u, t, dt, ctx) {
    const target = Math.min(1, ctx.speed ?? 0) * 0.6 + (ctx.impact ?? 0) * 0.4;
    const k = 1 - Math.exp(-(dt || 0.016) * (target > u.uHeat.value ? 8 : 2.5));
    u.uHeat.value += (target - u.uHeat.value) * k;
  },
};
