// Kintsugi Neón (P3a, docs/skins-premium-plan.md (b) #1): fibra de carbono tejida con grietas de oro
// pulido y núcleo magenta emisivo. Las vetas son aristas de un Voronoi 3D (distancia d2 - d1) con el
// dominio deformado; un pulso viaja a lo largo de ellas (fase = ruido espacial - tiempo) y hay un
// «latido» idle cada 2.5 s. uImpact = destello blanco + micro-grietas extra que se «reparan».
// uSeed desplaza el campo (cada instancia tiene sus propias grietas); uWear lo aplica la shaderLib.
// Supone material base ~ rough 0.16 / metal 0.72 (skins.js): se reajusta con sk_dRough / sk_dMetal.

const glsl = /* glsl */ `
const vec3 KN_CARBON = vec3(0.028, 0.028, 0.036);   // #07070A -> lineal aprox.
const vec3 KN_WEAVE  = vec3(0.09, 0.09, 0.115);     // trama #16161C
const vec3 KN_GOLD   = vec3(0.80, 0.47, 0.07);      // oro de reparación #E8B64A
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
  float w = 0.055 + impact * 0.03;
  float gold = 1.0 - smoothstep(w, w + 0.022, c.x);
  float core = 1.0 - smoothstep(0.0, w * 0.5, c.x);
  float rim  = smoothstep(w * 0.4, w + 0.03, c.x) * (1.0 - smoothstep(w + 0.03, w + 0.07, c.x)); // borde: leve relieve
#if SK_FINE > 0
  // microgrietas finas (alta calidad) + micro-grieta extra que aparece con el golpe y se repara
  vec2 f = kn_cracks(p, 6.1, 17.0);
  float fw = 0.012 + impact * 0.02;
  float fine = (1.0 - smoothstep(fw, fw + 0.012, f.x)) * (0.35 + impact * 0.65);
  gold = max(gold, fine * 0.8);
  core = max(core, fine * 0.5);
#endif

  // --- pulso viajero a lo largo de las vetas ---
  float travel = uTime * (0.55 + clamp(uSpeed, 0.0, 12.0) * 0.12);
  float ph = sk_noise3(p * 1.8 + uSeed) * 3.0 + sk_noise3(p * 4.0 + 5.0) * 0.8 - travel;
  float pulse = pow(0.5 + 0.5 * sin(6.2831853 * ph), 5.0);
  float bt = mod(uTime, 2.5);
  float beat = exp(-bt * 7.0) * 0.9 + exp(-abs(bt - 0.32) * 9.0) * 0.5; // latido doble
  float boost = 1.0 + clamp(uSpeed * 0.1, 0.0, 1.2);
  float energy = (0.28 + pulse * 1.0 * boost + beat * 0.7) ;

  // --- composición ---
  vec3 col = baseCol;
  col = mix(col, KN_GOLD, gold);
  diffuse.rgb = col;

  float metal = gold;
  sk_dMetal += metal * 0.30 - (1.0 - metal) * 0.72;                  // carbono 0, oro ~1
  sk_dRough += (1.0 - metal) * 0.16 - metal * 0.01;                  // carbono 0.32, oro 0.15
  sk_nPert += wn * (1.0 - gold) - rim * 0.0;

  float flash = impact * impact; // destello a blanco en el golpe
  vec3 magenta = uPalAccent * 2.2;
  vec3 em = mix(magenta, KN_CORE * 3.5, clamp(core * (0.35 + pulse * 0.6) + flash, 0.0, 1.0));
  sk_emis += em * (core * energy + gold * 0.12 * energy) + KN_CORE * flash * gold * 2.5;
  // halo magenta tenue alrededor de la veta
  sk_emis += uPalAccent * rim * (0.10 + 0.25 * energy);
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
