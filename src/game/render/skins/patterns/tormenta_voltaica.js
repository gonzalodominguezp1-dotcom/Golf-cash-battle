// Tormenta Voltaica (ideas_skins/_plan/spec-skins.md, skin 2): globo de plasma. Cristal con un núcleo
// violeta bien definido (una esfera pequeña de borde claro) del que salen rayos en zigzag hacia la superficie,
// dibujados en espacio de vista (no giran con la bola).
//   Los rayos cambian de FORMA (6-8 Hz, a saltos), no de brillo: el brillo global oscila <= 15 % a 0,4 Hz.
//   uSpeed: sube el ritmo de cambio de forma de los rayos (hasta 8 Hz).
//   uImpact: los rayos se ensanchan un poco con cada golpe.
// Coste: 1 ruido por fragmento (2 con ramas, solo alta) + onda triangular para los quiebros; sin fbm.
// Baja no ejecuta shader (material estándar + canvas `plasma`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;
  float r = sqrt(max(0.0, 1.0 - cz * cz));          // = length(nv.xy)
  float a = atan(nv.y, nv.x + 1e-4);

  // cristal: borde claro (hielo), interior violeta profundo
  diffuse.rgb = mix(uPalSecondary * vec3(0.4, 0.5, 0.75), mix(uPalBase, uPalAccent, 0.16), pow(cz, 1.1));
  // luz interior difusa: el volumen de la bola es violeta, no negro
  sk_emis += mix(uPalAccent, uPalGlow, 0.25) * (0.13 + 0.02 * sin(uTime * 2.5)) * pow(cz, 1.3);

  // núcleo: esfera pequeña con el centro casi blanco y un anillo más saturado en el borde, y su halo
  float orb = smoothstep(0.25, 0.2, r);
  float orbRim = smoothstep(0.11, 0.24, r) * orb;
  vec3 orbCol = mix(vec3(1.0), uPalAccent, clamp(r * 3.2, 0.0, 1.0));
  sk_emis += orbCol * orb * (0.8 + 0.12 * sin(uTime * 2.5)) + uPalAccent * orbRim * 1.0;
  sk_emis += uPalAccent * exp(-r * r * 16.0) * 0.55 * (1.0 - orb);

  // rayos: carriles angulares con desvío aleatorio (cambia a saltos) más un quiebro en zigzag
  float ph = floor(uTime * (SK_RATE_F + 2.0 * uSpeed));
  float lane = a * (SK_BOLTS_F / 6.2831853);
  float id = floor(lane);
  float n = sk_noise3(vec3(r * 9.0, id + uSeed, ph));
  float zz = abs(fract(r * 6.0 + n * 3.0) - 0.5) - 0.25;     // diente de sierra: quiebros nítidos
  float j = ((n - 0.5) * 0.4 + zz * 0.22) * r;
  float arc = abs(fract(lane) - 0.5 + j) * (6.2831853 / SK_BOLTS_F) * r;
  float w = 0.026 * (1.0 - 0.45 * r) * (1.0 + uImpact * 0.6);
  float mask = smoothstep(0.2, 0.27, r);
  float core = smoothstep(w, 0.0, arc) * mask;
  float haze = smoothstep(w * 6.0, 0.0, arc) * mask * 0.3;
  sk_emis += mix(uPalAccent, vec3(1.0), core * core) * (core * 2.6 + haze * 0.9);

  #if SK_BRANCH > 0
  // ramas: segundo juego de carriles, la mitad de ancho y el 40 % de intensidad
  float lane2 = a * (SK_BOLTS_F * 2.0 / 6.2831853);
  float n2 = sk_noise3(vec3(r * 12.0 + 3.0, floor(lane2) + uSeed + 17.0, ph));
  float zz2 = abs(fract(r * 8.0 + n2 * 3.0) - 0.5) - 0.25;
  float j2 = ((n2 - 0.5) * 0.4 + zz2 * 0.22) * r;
  float arc2 = abs(fract(lane2) - 0.5 + j2) * (6.2831853 / (SK_BOLTS_F * 2.0)) * r;
  float b2 = smoothstep(w * 0.55, 0.0, arc2) * smoothstep(0.34, 0.5, r) * smoothstep(1.0, 0.7, r + n2 * 0.5) * 0.5;
  sk_emis += mix(uPalAccent, uPalSecondary, b2) * b2 * 2.5;
  #endif

  // halo del cristal: borde cian-blanco, más intenso que antes (en la hoja el borde brilla)
  sk_emis += mix(uPalGlow, uPalSecondary, 0.5) * pow(rim, 3.5) * 0.5;
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
