// El Huevo Mío (skin por código): bola de carne con tono irregular, rubor que late, venas finas bajo la piel,
// arrugas (pliegues de ruido deformado con normal y valle oscuro) y unos pocos pelos negros ligeramente rizados.
//   Los pelos viven en una rejilla 3D (celda de 0,5): cada celda con raíz sobre la esfera dibuja como mucho un pelo,
//   que se queda dentro de su celda (por eso no se corta). Llevan una sombra suave sobre la piel para que se lean
//   como levantados, pero son pintura: no rompen la silueta de la esfera.
//   Con «reducir movimiento» (uTime fijo) el rubor no late. Al recibir un golpe (uImpact) la piel se enrojece.
// Coste: ~16 ruidos 3D en alta (fine = 1), ~12 en media. Baja no ejecuta shader (canvas `flesh`).
// Ajustes a ojo: quality.*.bump (relieve de arrugas), wfreq (densidad de arrugas); HS / DENS en el GLSL (pelos).
export default {
  glsl: /* glsl */ `
const mat3 HE_ROT = mat3(0.8, 0.6, 0.0, -0.48, 0.64, 0.6, 0.36, -0.48, 0.8);
const float HE_HS = 2.0;    // celdas por unidad: el pelo mide ~0,2, la celda 0,5
const float HE_DENS = 0.6;  // fracción de celdas válidas que llevan pelo

// altura de la piel: 0 en el fondo del pliegue, 1 en la cresta
float he_height(vec3 ww) {
  float h = smoothstep(0.0, 0.2, abs(sk_noise3(ww) - 0.5));
  #if SK_FINE > 0
  h = h * 0.7 + smoothstep(0.0, 0.14, abs(sk_noise3(ww * 2.6 + 9.0) - 0.5)) * 0.3;
  #endif
  return h;
}

// Máscara de un pelo: a = distancia a lo largo, b = a lo ancho (plano tangente en la raíz), L = largo,
// A/K/ph = amplitud, frecuencia y fase del rizo, w = grosor.
float he_strand(float a, float b, float L, float A, float K, float ph, float w) {
  float ar = clamp(a / L, 0.0, 1.0);
  float amp = A * (0.35 + 0.65 * ar);
  float centre = amp * sin(a * K + ph) * smoothstep(0.0, 0.04, a);
  float slope = amp * K * cos(a * K + ph);
  float dist = abs(b - centre) / sqrt(1.0 + slope * slope);
  float wid = w * (1.0 - 0.55 * ar);
  float along = smoothstep(-0.004, 0.0, a) * (1.0 - smoothstep(L - 0.012, L, a));
  return (1.0 - smoothstep(wid * 0.5, wid, dist)) * along;
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;
  float px = length(fwidth(p));                       // tamaño de un píxel sobre la esfera (antes de cualquier rama)
  vec3 q = p + vec3(uSeed * 0.137, uSeed * 0.071, uSeed * 0.213); // cada dueño tiene su propia piel
  float throb = 1.0 + 0.10 * sin(uTime * 1.7);

  // ---- tono, rubor y venas ----
  float tone = sk_fbm3(q * 2.1, SK_TONE);
  float blush = smoothstep(0.3, 0.75, sk_fbm3(q * 1.5 + 11.3, 2));
  vec3 skin = mix(uPalBase * 0.82, uPalBase * 1.08, clamp(tone * 1.15, 0.0, 1.0));
  skin = mix(skin, uPalAccent * 1.3, clamp(blush * 0.34 * throb, 0.0, 0.6));
  float vn = abs(sk_noise3(q * 3.2 + 5.5) - 0.5);
  float vein = (1.0 - smoothstep(0.0, 0.028, vn)) * smoothstep(0.35, 0.65, sk_noise3(q * 1.1 + 2.2));
  skin = mix(skin, vec3(0.22, 0.14, 0.22), vein * 0.3);

  // ---- arrugas ----
  vec3 w = q * SK_WFREQ_F;
  vec3 warp = (vec3(sk_noise3(w * 0.6 + 3.1), sk_noise3(w * 0.6 + 7.7), sk_noise3(w * 0.6 + 1.3)) - 0.5) * 1.8;
  vec3 ww = w + warp;
  float crease = 1.0 - smoothstep(0.0, 0.05, abs(sk_noise3(ww) - 0.5));
  float h0 = he_height(ww);
  float e = 0.06;
  vec3 g = vec3(he_height(ww + vec3(e, 0.0, 0.0)) - h0, he_height(ww + vec3(0.0, e, 0.0)) - h0, he_height(ww + vec3(0.0, 0.0, e)) - h0) / e * SK_WFREQ_F;
  g -= dot(g, p) * p;                                  // solo la parte tangente a la esfera
  sk_nPert -= g * SK_BUMP_F;
  skin = mix(skin, uPalSecondary, crease * 0.5);       // fondo del pliegue
  skin *= mix(0.78, 1.0, h0);                          // oclusión: los valles oscurecen
  sk_dRough += 0.2 * crease + 0.1 * (1.0 - h0) - 0.08; // pliegues mates, crestas algo más brillantes
  #if SK_FINE > 0
  sk_nPert += sk_noiseGrad(p * 38.0 + uSeed, 0.05) * 0.006; // poro fino
  #endif

  // ---- pelos ----
  vec3 pr = HE_ROT * p;
  vec3 off = vec3(uSeed * 0.173, uSeed * 0.291, uSeed * 0.113) + 0.37;
  vec3 c = floor(pr * HE_HS + off);
  float hP = sk_hash(c + 3.7);
  vec3 hJ = sk_hash3(c + 7.1) - 0.5;
  vec3 hD = sk_hash3(c + 29.1) - 0.5;
  vec3 hK = sk_hash3(c + 41.9);
  float hL = sk_hash(c + 53.3);
  vec3 centerW = (c + 0.5 - off) / HE_HS;
  vec3 rootW = normalize(centerW + hJ * (0.8 / HE_HS));            // raíz sobre la esfera
  vec3 inCell = abs(rootW * HE_HS + off - (c + 0.5));
  float valid = step(max(inCell.x, max(inCell.y, inCell.z)), 0.36) * step(hP, HE_DENS);
  vec3 td = hD - dot(hD, rootW) * rootW;
  vec3 d = td / max(length(td), 1e-4);
  d *= (dot(d, centerW - rootW) < 0.0) ? -1.0 : 1.0;              // apunta hacia dentro de la celda
  vec3 ev = cross(rootW, d);
  vec3 v = pr - rootW;
  float L = 0.15 + 0.08 * hL;
  float A = 0.016 + 0.012 * hK.x;                                  // rizo suave
  float K = 30.0 + 16.0 * hK.y;
  float ph = 6.2831853 * hK.z;
  float wid = max(0.010, px * 1.2);
  float hair = he_strand(dot(v, d), dot(v, ev), L, A, K, ph, wid) * valid;
  // sombra sobre la piel: el mismo pelo desplazado hacia abajo en pantalla
  vec3 shO = vec3(-vObjX.y, -vObjY.y, -vObjZ.y);
  vec3 shR = HE_ROT * shO;
  shR -= dot(shR, rootW) * rootW;
  vec3 v2 = v - shR * 0.02;
  float shadow = he_strand(dot(v2, d), dot(v2, ev), L, A, K, ph, wid * 2.4) * valid * (1.0 - hair);
  float pore = (1.0 - smoothstep(0.008, 0.03, length(v))) * valid;
  skin *= 1.0 - 0.5 * shadow;
  skin = mix(skin, uPalSecondary * 0.6, pore * 0.5);
  skin = mix(skin, vec3(0.012, 0.010, 0.010), hair);
  sk_dRough -= 0.3 * hair;                                         // el pelo brilla más que la piel

  // ---- golpe, luz bajo la piel ----
  skin = mix(skin, uPalAccent * 1.1, clamp(uImpact, 0.0, 1.0) * 0.4);
  sk_emis += mix(uPalAccent, uPalBase, 0.4) * 0.16 * pow(rim, 2.2) * (0.8 + 0.2 * throb);
  diffuse.rgb = skin;
}
`,
  uniforms: {},
  quality: {
    low: { tone: 2, wfreq: 4.2, fine: 0, bump: 0.01 },
    medium: { tone: 2, wfreq: 4.2, fine: 0, bump: 0.01 },
    high: { tone: 3, wfreq: 4.6, fine: 1, bump: 0.011 },
  },
};
