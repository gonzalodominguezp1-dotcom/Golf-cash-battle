// Tormenta Voltaica (ideas_skins/_plan/spec-skins.md, skin 2): globo de plasma. Cristal con un núcleo
// violeta del que salen rayos hacia la superficie, dibujados en espacio de vista (no giran con la bola).
//   Los rayos cambian de FORMA (6-8 Hz, a saltos), no de brillo: el brillo global oscila <= 15 % a 0,4 Hz.
//   uSpeed: sube el ritmo de cambio de forma de los rayos (hasta 8 Hz).
//   uImpact: los rayos se ensanchan un poco con cada golpe.
// Baja no ejecuta shader (material estándar + canvas `plasma`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;
  float r = sqrt(max(0.0, 1.0 - cz * cz));          // = length(nv.xy)
  float a = atan(nv.y, nv.x + 1e-4);

  // cristal: borde claro, centro violeta profundo
  diffuse.rgb = mix(uPalSecondary * 0.55, uPalBase, pow(cz, 1.5));

  // núcleo
  sk_emis += uPalAccent * pow(cz, 12.0) * (2.0 + 0.3 * sin(uTime * 2.5));

  // rayos: carriles angulares con un desvío aleatorio que cambia a saltos (un solo ruido por fragmento)
  float ph = floor(uTime * (SK_RATE_F + 2.0 * uSpeed));
  float lane = a * (SK_BOLTS_F / 6.2831853);
  float j = (sk_noise3(vec3(r * 7.0, floor(lane) + uSeed, ph)) - 0.5) * 0.35 * r;
  float arc = abs(fract(lane) - 0.5 + j) * (6.2831853 / SK_BOLTS_F) * r;
  float w = 0.03 * (1.0 - 0.5 * r) * (1.0 + uImpact * 0.6);
  float mask = smoothstep(0.1, 0.22, r);
  float core = smoothstep(w, 0.0, arc) * mask;
  float haze = smoothstep(w * 5.0, 0.0, arc) * mask * 0.3;
  sk_emis += mix(uPalAccent, uPalSecondary, core * core) * (core * 2.5 + haze * 0.8);

  #if SK_BRANCH > 0
  // ramas: segundo juego de carriles, la mitad de ancho y el 40 % de intensidad
  float lane2 = a * (SK_BOLTS_F * 2.0 / 6.2831853);
  float j2 = (sk_noise3(vec3(r * 11.0 + 3.0, floor(lane2) + uSeed + 17.0, ph)) - 0.5) * 0.35 * r;
  float arc2 = abs(fract(lane2) - 0.5 + j2) * (6.2831853 / (SK_BOLTS_F * 2.0)) * r;
  float b2 = smoothstep(w * 0.5, 0.0, arc2) * smoothstep(0.35, 0.5, r) * 0.4;
  sk_emis += mix(uPalAccent, uPalSecondary, b2) * b2 * 2.5;
  #endif

  // halo cian del cristal
  sk_emis += uPalGlow * pow(rim, 4.0) * 0.4;
}
`,
  uniforms: {},
  update() {},
  quality: {
    low: { bolts: 6, rate: 6, branch: 0 },
    medium: { bolts: 6, rate: 6, branch: 0 },
    high: { bolts: 8, rate: 6, branch: 1 },
  },
};
