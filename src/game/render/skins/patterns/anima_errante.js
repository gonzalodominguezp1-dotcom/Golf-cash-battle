// Ánima Errante (ideas_skins/_plan/spec-skins.md, skin 3): esfera lechosa lavanda con un espíritu en
// espiral violeta y cian en su interior (espacio de vista), un núcleo que «respira» y estrellas
// ancladas a la superficie que titilan.
//   uTime: giro de la espiral (0,1 vueltas/s), respiro del núcleo (0,3 Hz), titileo de estrellas (0,6 Hz).
// Baja no ejecuta shader (material estándar + canvas `spirit`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;
  vec2 q = nv.xy;
  float r = length(q);
  float a = atan(q.y, q.x + 1e-4);

  // cáscara lechosa: el centro se oscurece un poco para que destaque el interior
  diffuse.rgb = uPalBase * mix(0.55, 0.14, pow(cz, 1.2));
  sk_emis += uPalGlow * pow(rim, 3.0) * 0.45;

  // espíritu: espiral de 2 brazos
  float s = 2.0 * a + SK_TWIST_F * r - uTime * 0.6 + uSeed;
  #if SK_NOISE > 1
  s += 1.6 * (sk_noise3(vec3(q * 2.0 + 5.0, uTime * 0.1)) - 0.5);
  #endif
  float w = smoothstep(0.3, 1.0, sin(s)) * (1.0 - r);
  vec3 spirit = mix(uPalAccent, uPalSecondary, sk_noise3(vec3(q * 3.0, uTime * 0.15)));
  diffuse.rgb = mix(diffuse.rgb, spirit * 0.5, w * 0.8);
  sk_emis += spirit * w * 1.5;

  // núcleo que respira
  sk_emis += vec3(1.0) * pow(cz, 50.0) * 2.0 * (0.85 + 0.15 * sin(uTime * 1.9));

  // estrellas: celdas del espacio de objeto (giran con la bola), solo dentro del disco interior
  float inner = smoothstep(0.85, 0.7, r);
  if (inner > 0.0) {
    vec3 sc = p * SK_STARS_F;
    float hs = sk_hash(floor(sc));
    if (hs > 0.985) {
      float dd = length(fract(sc) - 0.5);
      float tw = 0.6 + 0.4 * sin(uTime * 4.0 + hs * 6283.0);
      sk_emis += vec3(1.0) * smoothstep(0.38, 0.1, dd) * tw * inner * 3.0;
    }
  }
}
`,
  uniforms: {},
  update() {},
  quality: {
    low: { twist: 5, stars: 28, noise: 1 },
    medium: { twist: 5, stars: 28, noise: 1 },
    high: { twist: 6, stars: 40, noise: 2 },
  },
};
