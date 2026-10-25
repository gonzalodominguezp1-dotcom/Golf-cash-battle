// Kintsugi Neón (P3a, docs/skins-premium-plan.md (b) #1): fibra de carbono tejida con grietas de oro
// pulido y núcleo magenta emisivo. Las vetas son aristas de un Voronoi 3D (distancia d2 - d1) con el
// dominio deformado; un pulso viaja a lo largo de ellas (fase = ruido espacial - tiempo) y hay un
// «latido» idle cada 2.5 s. uImpact = destello blanco + micro-grietas extra que se «reparan».
// uSeed desplaza el campo (cada instancia tiene sus propias grietas); uWear lo aplica la shaderLib.
// Supone material base ~ rough 0.16 / metal 0.72 (skins.js): se reajusta con sk_dRough / sk_dMetal.

const glsl = /* glsl */ `
const vec3 KN_CARBON = vec3(0.028, 0.028, 0.036);   // #07070A -> lineal aprox.
const vec3 KN_WEAVE  = vec3(0.09, 0.09, 0.115);     // trama #16161C
const vec3 KN_GOLD   = vec3(0.85, 0.50, 0.08);      // oro de reparación #E8B64A
const vec3 KN_CORE   = vec3(1.0, 0.80, 1.0);        // núcleo #FFE6FF

// Campo de distancia a las vetas (x = distancia a arista, y = id de celda)
vec2 kn_cracks(vec3 p, float scale, float off) {
  vec3 q = p * scale + vec3(uSeed * 0.731 + off);
#if SK_WARP > 0
  q += (vec3(sk_noise3(q * 0.9 + 3.1), sk_noise3(q * 0.9 + 7.7), sk_noise3(q * 0.9 + 11.3)) - 0.5) * 0.45;
#endif
  vec3 v = sk_voronoi3(q);
  return vec2(v.y, v.z);
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  float impact = clamp(uImpact, 0.0, 1.0);

  // --- fibra de carbono: sarga (twill) ---
  vec3 baseCol = KN_CARBON;
  float weave = 0.0;
  vec3 wn = vec3(0.0);
#if SK_WEAVE > 0
  float K = SK_WEAVE_F;
  float A = K * (p.x + p.y);
  float B = K * (p.y - p.x + p.z * 1.3);
  float sa = sin(A), sb = sin(B);
  weave = sa * sb;
  baseCol = mix(KN_CARBON, KN_WEAVE, smoothstep(-0.5, 0.8, weave));
  wn = (sb * cos(A) * vec3(1.0, 1.0, 0.0) + sa * cos(B) * vec3(-1.0, 1.0, 1.3)) * 0.018;
#endif

  // --- vetas ---
  vec2 c = kn_cracks(p, 2.3, 0.0);
  float w = 0.085 + impact * 0.03;                                        // la veta dorada es ancha: es lo que se lee
  float gold = 1.0 - smoothstep(w, w + 0.016, c.x);
  float core = 1.0 - smoothstep(0.0, w * 0.46, c.x);                      // hilo magenta fino dentro del oro
  float rim  = smoothstep(w * 0.8, w + 0.016, c.x) * (1.0 - smoothstep(w + 0.02, w + 0.06, c.x)); // halo magenta fuera del oro
  float lip  = smoothstep(w * 0.55, w, c.x) * gold;                       // borde del oro: bisel que atrapa luz
#if SK_FINE > 0
  // microgrietas finas (alta calidad) + micro-grieta extra que aparece con el golpe y se repara
  vec2 f = kn_cracks(p, 6.1, 17.0);
  float fw = 0.012 + impact * 0.02;
  float fine = (1.0 - smoothstep(fw, fw + 0.012, f.x)) * (0.35 + impact * 0.65);
  gold = max(gold, fine * 0.55);
  core = max(core, fine * 0.2);
#endif

  // --- pulso viajero a lo largo de las vetas ---
  float travel = uTime * (0.55 + clamp(uSpeed, 0.0, 1.0) * 1.4); // uSpeed llega en 0..1
  float ph = sk_noise3(p * 1.8 + uSeed) * 3.0 + sk_noise3(p * 4.0 + 5.0) * 0.8 - travel;
  float pulse = pow(0.5 + 0.5 * sin(6.2831853 * ph), 5.0);
  float bt = mod(uTime, 2.5);
  float beat = exp(-bt * 7.0) * 0.9 + exp(-abs(bt - 0.32) * 9.0) * 0.5; // latido doble
  float boost = 1.0 + clamp(uSpeed, 0.0, 1.0) * 1.1;
  float energy = (0.28 + pulse * 1.0 * boost + beat * 0.7) ;

  // --- composición ---
  vec3 col = baseCol;
  // oro con variación de veta (martillado) y borde más claro
  float hammer = sk_noise3(p * 38.0 + uSeed);
  vec3 goldCol = KN_GOLD * (0.8 + 0.5 * hammer) + vec3(0.25, 0.17, 0.05) * lip;
  col = mix(col, goldCol, gold);
  diffuse.rgb = col;

  float metal = gold;
  sk_dMetal += metal * 0.30 - (1.0 - metal) * 0.72;                  // carbono 0, oro ~1
  sk_dRough += (1.0 - metal) * 0.16 - metal * 0.04 + hammer * 0.05 * gold; // carbono 0.32, oro ~0.12
  sk_nPert += wn * (1.0 - gold);
  // oro bruñido: normal martillada + bisel en el borde (reflejos con forma)
  sk_nPert += sk_noiseGrad(p * 30.0 + uSeed, 0.04) * 0.012 * gold;
#if SK_FINE > 0
  {
    vec2 gd = vec2(dFdx(c.x), dFdy(c.x));
    float gl = length(gd);
    if (gl > 1e-6) {
      vec3 gv = vec3(gd / gl, 0.0);                                    // vista: hacia fuera del eje de la veta
      float bev = smoothstep(w * 0.2, w * 0.9, c.x) * gold * (1.0 - smoothstep(w, w + 0.02, c.x));
      sk_nPert += vec3(dot(gv, vObjX), dot(gv, vObjY), dot(gv, vObjZ)) * bev * 0.5;
    }
  }
#endif

  float flash = impact * impact; // destello a blanco en el golpe
  vec3 magenta = uPalAccent * 2.4;
  // el hilo magenta late dentro del oro; el oro mantiene una emisión cálida propia para que se lea también de noche
  vec3 hot = mix(magenta, KN_CORE * 4.0, clamp(0.45 + pulse * 0.55 + flash, 0.0, 1.0));
  sk_emis += hot * core * energy;
  sk_emis += goldCol * gold * (1.0 - core) * (0.22 + 0.22 * pulse + 0.15 * beat) + KN_CORE * flash * gold * 2.0;
  // halo magenta tenue alrededor de la veta
  sk_emis += uPalAccent * rim * (0.4 + 0.6 * energy);
}
`;

export default {
  glsl,
  uniforms: {},
  update() {},
  quality: {
    low: { warp: 0, weave: 0, fine: 0 },
    medium: { warp: 1, weave: 70, fine: 0 },
    high: { warp: 1, weave: 110, fine: 1 },
  },
};
