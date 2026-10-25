// Damasco Imperial (P3b, docs/skins-premium-plan.md (b) #2): acero de capas forjadas. Bandas onduladas
// (fbm con dominio deformado) alternan capa clara pulida (#9FB3B8) y acero oscuro (#1C2326); en cada
// frontera corre un filo verde (#10B981) y un grabado dorado (#C9A44C) sigue curvas de nivel de otro fbm.
// El patrón se lee por reflejo: metalness 1 en todo el objeto, rough 0.18 en capas claras y 0.34 en oscuras.
// Los deltas de rough/metal se suman a la base de la ficha (rough 0.14, metal 0.92).
// Animación: barrido de luz que recorre las capas (velocidad ligada a uSpeed) y «respiración» del filo
// en idle. uSeed desplaza bandas y grabado; uWear lo aplica la shaderLib y atenúa el grabado.

const glsl = /* glsl */ `
const vec3 DM_STEEL = vec3(0.0103, 0.0168, 0.0194);   // #1C2326 -> lineal aprox.
const vec3 DM_LAYER = vec3(0.347, 0.451, 0.479);      // #9FB3B8 -> lineal aprox.
const vec3 DM_EDGE  = vec3(0.005, 0.485, 0.220);      // #10B981 -> lineal aprox.
const vec3 DM_GOLD  = vec3(0.584, 0.371, 0.073);      // #C9A44C -> lineal aprox.

void skinPattern(vec3 p, inout vec4 diffuse) {
  float spd = clamp(uSpeed, 0.0, 1.0);
  vec3 q = p * 2.6 + uSeed * 0.73;

  // Dominio deformado: las capas se pliegan y ondulan como en el acero forjado
  float warp = sk_fbm3(q * 1.3 + 3.1, SK_FBM);
  float ax = p.y * 4.5 + p.x * 0.8 + warp * 2.2 + uSeed * 0.11;
  float wave = 0.5 + 0.5 * sin(ax * 6.2831853);
  float layer = smoothstep(0.4, 0.6, wave);                    // 1 = capa clara, 0 = acero oscuro
  float edge = 1.0 - smoothstep(0.0, 0.09, abs(wave - 0.5));   // filo verde en cada frontera

  // Grabado dorado: curvas de nivel de un fbm distinto, solo sobre el acero oscuro
  float gl = sk_fbm3(q * 2.3 + 9.0, SK_FBM);
  float eng = (1.0 - smoothstep(0.0, 0.012, abs(gl - 0.5))) * (1.0 - layer) * (1.0 - uWear * 0.5);

  // Grano de forja
  float grain = sk_fbm3(q * 6.0, SK_FBM);

  vec3 col = mix(DM_STEEL, DM_LAYER, layer);
  col *= 0.85 + 0.3 * grain;
  col = mix(col, DM_EDGE, edge * 0.8);
  col = mix(col, DM_GOLD, eng);
  diffuse.rgb = col;

  // Material: metal 1 (base 0.92), rough 0.18 claro / 0.34 oscuro (base 0.14)
  sk_dMetal += 0.08;
  sk_dRough += mix(0.20, 0.04, layer);

  // Barrido de luz: un destello que recorre las capas claras; más rápido al rodar
  float sx = fract(p.x * 0.45 + p.z * 0.25 - uTime * (0.06 + 0.5 * spd));
  float d = (sx - 0.5) * 9.0;
  float sweep = exp(-d * d) * layer;
  sk_dRough -= sweep * 0.10;
  sk_emis += DM_LAYER * sweep * 0.6;

  // Filo verde: respira en idle y se apaga algo al rodar; grabado dorado con brillo tenue
  float breathe = 0.85 + 0.15 * sin(uTime * 1.2);
  sk_emis += DM_EDGE * edge * 0.35 * breathe * (1.0 - spd * 0.5);
  sk_emis += DM_GOLD * eng * 0.15;

  // Relieve de las capas: la normal sigue el gradiente del fbm de dominio (variante por calidad)
  sk_nPert = sk_noiseGrad(q * 1.5, 0.02) * (SK_NRM_F * 0.25);
}
`;

export default {
  glsl,
  uniforms: {},
  quality: {
    low: { fbm: 2, nrm: 0 },
    medium: { fbm: 3, nrm: 0.1 },
    high: { fbm: 5, nrm: 0.16 },
  },
};
