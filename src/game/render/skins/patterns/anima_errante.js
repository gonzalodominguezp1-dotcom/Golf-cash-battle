// Ánima Errante (ideas_skins/_plan/spec-skins.md, skin 3): esfera lechosa lavanda con un espíritu en
// remolino (volutas finas cian y violeta) en su interior (espacio de vista), un núcleo blanco que «respira»
// y estrellas ancladas a la superficie que titilan.
//   uTime: giro del remolino (0,1 vueltas/s), respiro del núcleo (0,3 Hz), titileo de estrellas (0,6 Hz).
// Coste: 1 ruido para las volutas (+1 en alta) y una celda de estrellas dentro del disco interior; sin fbm.
// Baja no ejecuta shader (material estándar + canvas `spirit`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;
  vec2 q = nv.xy;
  float r = length(q);

  // cáscara lechosa lavanda: el centro se oscurece un poco para que destaque el interior
  diffuse.rgb = uPalBase * vec3(0.9, 0.82, 1.0) * mix(0.85, 0.45, pow(cz, 1.3));
  sk_emis += uPalBase * vec3(0.5, 0.42, 0.9) * 0.13 * (0.4 + 0.6 * pow(rim, 0.7));
  sk_emis += uPalGlow * pow(rim, 3.0) * 0.4;

  // remolino: se gira el plano más cuanto más cerca del centro y sobre él se miran las crestas de un ruido,
  // que quedan como volutas finas enroscadas (cian a media distancia, violeta junto al núcleo)
  float ang = SK_TWIST_F * 0.5 * (1.0 - smoothstep(0.0, 0.85, r)) - uTime * 0.6 + uSeed;
  float cs = cos(ang), sn = sin(ang);
  vec2 qq = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
  float n = sk_noise3(vec3(qq * 3.4, uTime * 0.1 + uSeed));
  #if SK_NOISE > 1
  n = 0.65 * n + 0.35 * sk_noise3(vec3(qq * 7.0 + 9.0, uTime * 0.15));
  #endif
  float fil = smoothstep(0.7, 0.95, 1.0 - abs(2.0 * n - 1.0));
  float fade = 1.0 - smoothstep(0.4, 0.82, r);
  float haze = smoothstep(0.3, 0.75, n) * fade;
  vec3 spirit = mix(uPalAccent, uPalSecondary, smoothstep(0.12, 0.5, r));
  diffuse.rgb = mix(diffuse.rgb, uPalAccent * 0.45, haze * 0.5);
  sk_emis += spirit * (fil * fade * 1.5 + haze * 0.35);

  // núcleo que respira: punto blanco pequeño sobre un disco violeta más ancho
  float br = 0.85 + 0.15 * sin(uTime * 1.9);
  sk_emis += vec3(1.0) * exp(-r * r * 70.0) * 2.2 * br + uPalAccent * exp(-r * r * 9.0) * 0.6;

  // estrellas: celdas del espacio de objeto (giran con la bola), solo dentro del disco interior
  float inner = smoothstep(0.85, 0.7, r);
  if (inner > 0.0) {
    vec3 sc = p * SK_STARS_F;
    float hs = sk_hash(floor(sc));
    if (hs > 0.985) {
      float dd = length(fract(sc) - 0.5);
      float tw = 0.6 + 0.4 * sin(uTime * 4.0 + hs * 6283.0);
      vec3 sCol = mix(vec3(1.0), mix(uPalAccent, uPalSecondary, fract(hs * 97.0)), 0.5);
      sk_emis += sCol * smoothstep(0.5, 0.06, dd) * tw * inner * 4.5;
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
