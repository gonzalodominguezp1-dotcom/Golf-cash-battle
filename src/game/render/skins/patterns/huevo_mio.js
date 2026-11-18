// El Huevo Mío (skin por código): bola de carne húmeda, mate-satinada, sin bordes duros.
//   - Carne: tono de baja frecuencia, veteado tipo marmoleado (vetas pálidas y rojizas), rubor que late con uTime
//     y relieve de ondulaciones anchas y blandas (normal de poca intensidad, sin crestas).
//   - Venas azul-violáceas/rojizas, ramificadas, de grosor medio constante en el mundo (la distancia a la vena se
//     normaliza con el gradiente del ruido), borde suavizado con el tamaño de píxel y ligeramente abultadas.
//   - Pelos negros ligeramente rizados en tres rejillas 3D de distinta escala y giro. Cada celda con raíz sobre la
//     esfera lleva como mucho un pelo; su largo se recorta a lo que cabe en la celda en línea recta y se funde junto
//     a las paredes, así que nunca se corta en seco. Llevan sombra suave sobre la piel y un poro en la raíz. Son
//     pintura: no rompen la silueta. Tres rejillas (A, B, C): unos 300 pelos (≈150 visibles a la vez).
//   Con «reducir movimiento» (uTime fijo) el rubor no late. Al recibir un golpe (uImpact) la piel se enrojece.
// Coste: 23 ruidos 3D en alta (fine = 1), 18 en media; los pelos solo usan hashes. Baja no ejecuta shader (canvas `flesh`).
// Ajustes a ojo: quality.*.bump (relieve), wfreq (tamaño de las ondulaciones); en el GLSL HE_VEIN_W (grosor de
//   vena), HE_HS_* / HE_DENS_* / HE_LEN_* (densidad y largo de pelo), HE_HAIR_W (grosor del pelo).
export default {
  glsl: /* glsl */ `
const mat3 HE_ROT_A = mat3(0.8, 0.6, 0.0, -0.48, 0.64, 0.6, 0.36, -0.48, 0.8);
const mat3 HE_ROT_B = mat3(0.6, 0.0, 0.8, 0.64, 0.6, -0.48, -0.48, 0.8, 0.36);
const float HE_HS_A = 3.0;      // celdas por unidad (rejilla de pelos largos)
const float HE_DENS_A = 1.0;    // fracción de celdas válidas con pelo
const float HE_LEN_A = 0.22;    // largo deseado (se recorta a lo que cabe en la celda)
const float HE_HS_B = 5.0;      // rejilla de pelos cortos
const float HE_DENS_B = 0.9;
const float HE_LEN_B = 0.13;
const float HE_HS_C = 6.8;      // tercera rejilla: pelos cortos y muy abundantes
const float HE_DENS_C = 0.9;
const float HE_LEN_C = 0.10;
const float HE_HAIR_W = 0.0075; // grosor del pelo en la esfera unitaria (mínimo: un píxel)
const float HE_VEIN_W = 0.024;  // semiancho de la vena principal en la esfera unitaria

// relieve blando: ondulaciones anchas (sin abs ni crestas)
float he_relief(vec3 x) {
  float h = sk_noise3(x);
  #if SK_FINE > 0
  h += 0.35 * sk_noise3(x * 2.13 + 4.7);
  #endif
  return h;
}

// Máscara de un pelo: a = distancia a lo largo, b = a lo ancho (plano tangente en la raíz), L = largo (> 0),
// A/K/ph = amplitud, frecuencia y fase del rizo, B = curvatura, hw = semiancho, aa = suavizado del borde (> 0).
float he_strand(float a, float b, float L, float A, float K, float ph, float B, float hw, float aa) {
  float ar = clamp(a / L, 0.0, 1.0);
  float ramp = smoothstep(0.0, 0.25, ar);
  float centre = A * ramp * sin(a * K + ph) + B * a * a;
  float slope = A * ramp * K * cos(a * K + ph) + 2.0 * B * a;
  float dist = abs(b - centre) * inversesqrt(1.0 + slope * slope);
  float w = hw * (1.0 - 0.55 * ar);
  float along = smoothstep(-aa, aa, a) * (1.0 - smoothstep(L * 0.82, L, a));
  return (1.0 - smoothstep(w - aa, w + aa, dist)) * along;
}

// Una capa de pelos en una rejilla girada (rot) de hs celdas por unidad. Devuelve (pelo, sombra, poro).
// shO = abajo de la pantalla en espacio de objeto; px = tamaño de un píxel en la esfera (> 0).
vec3 he_hairLayer(vec3 p, mat3 rot, float hs, float dens, float len, float salt, vec3 shO, float px) {
  vec3 pr = rot * p;
  vec3 off = vec3(uSeed * 0.173, uSeed * 0.291, uSeed * 0.113) + 0.37 + salt;
  vec3 gp = pr * hs + off;
  vec3 c = floor(gp);
  vec3 fc = gp - c;
  float hP = sk_hash(c + 3.7 + salt);
  vec3 hJ = sk_hash3(c + 7.1 + salt) - 0.5;
  vec3 hD = sk_hash3(c + 29.1 + salt) - 0.5;
  vec3 hK = sk_hash3(c + 41.9 + salt);
  vec3 centerW = (c + 0.5 - off) / hs;
  vec3 rr = centerW + hJ * (0.7 / hs);
  float rl = length(rr);
  vec3 rootW = rr / max(rl, 1e-4);                                   // raíz sobre la esfera
  vec3 rg = rootW * hs + off - c;                                    // raíz en coordenadas de celda (0..1 dentro)
  vec3 inC = abs(rg - 0.5);
  float valid = step(max(inC.x, max(inC.y, inC.z)), 0.32) * step(hP, dens) * step(1e-3, rl);
  // dirección tangente: hacia el centro de la celda más un giro aleatorio
  vec3 toC = centerW - rootW;
  toC -= dot(toC, rootW) * rootW;
  vec3 rt = hD - dot(hD, rootW) * rootW;
  vec3 dd = toC * hs + rt * 1.2;
  float dl = length(dd);
  valid *= step(1e-3, dl);
  vec3 d = dd / max(dl, 1e-3);
  vec3 ev = cross(rootW, d);
  // largo: lo que cabe en la celda en línea recta desde la raíz (con margen), recortado al deseado
  vec3 tq = mix(rg, 1.0 - rg, step(0.0, d)) / max(abs(d), vec3(1e-3));
  float Lw = len * (0.75 + 0.5 * hK.x);
  float L = min(Lw, 0.8 * min(tq.x, min(tq.y, tq.z)) / hs);
  valid *= step(0.4 * Lw, L);
  L = max(L, 0.02);
  float A = L * (0.07 + 0.06 * hK.y);                                // rizo suave
  float K = 6.2831853 * (1.3 + 1.2 * hK.z) / L;                      // 1,3-2,5 ondas a lo largo
  float ph = 6.2831853 * fract(hK.x * 7.13 + hK.y * 3.7);
  float B = (hK.z - 0.5) * 0.9;                                      // leve curvatura
  vec3 v = pr - rootW;
  float aa = px * 0.7;
  float hw = max(HE_HAIR_W, px * 1.1) * 0.5;
  float hair = he_strand(dot(v, d), dot(v, ev), L, A, K, ph, B, hw, aa);
  hair *= clamp(HE_HAIR_W / (px * 1.1), 0.55, 1.0);                  // de lejos, algo más tenue: no se empasta
  // sombra sobre la piel: el mismo pelo, desplazado hacia abajo en pantalla, más ancho y difuso
  vec3 sr = rot * shO;
  sr -= dot(sr, rootW) * rootW;
  vec3 v2 = v - sr * 0.016;
  float sh = he_strand(dot(v2, d), dot(v2, ev), L, A, K, ph, B, hw * 2.2, aa + 0.008);
  float pore = 1.0 - smoothstep(0.003, 0.014, length(v));
  // fundido junto a las paredes de la celda: nunca un corte seco
  vec3 fw = min(fc, 1.0 - fc);
  float wall = smoothstep(0.0, 0.06, min(fw.x, min(fw.y, fw.z)));
  return vec3(hair, sh, pore) * (valid * wall);
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float rim = 1.0 - clamp(nv.z, 0.0, 1.0);
  float px = max(length(fwidth(p)), 1e-4);                         // tamaño de un píxel sobre la esfera
  vec3 q = p + vec3(uSeed * 0.137, uSeed * 0.071, uSeed * 0.213);  // cada dueño tiene su propia piel
  float throb = 1.0 + 0.10 * sin(uTime * 1.7);

  // ---- carne: tono, veteado marmoleado y rubor (todo de baja frecuencia) ----
  float tone = sk_fbm3(q * 1.7, SK_TONE);
  float marb = sk_fbm3(q * 2.2 + vec3(tone * 1.8, 3.1, -tone), 2);
  float band = 0.5 + 0.5 * sin(6.2831853 * (marb * 2.2 + q.y * 0.4));
  vec3 skin = mix(uPalBase * 0.86, uPalBase * 1.06, clamp(tone * 1.3 - 0.15, 0.0, 1.0));
  skin = mix(skin, uPalGlow, 0.24 * smoothstep(0.55, 1.0, band));             // vetas pálidas
  skin = mix(skin, uPalAccent, 0.16 * (1.0 - smoothstep(0.0, 0.4, band)));    // vetas rojizas
  float blush = smoothstep(0.35, 0.72, sk_fbm3(q * 1.3 + 11.3, 2));
  skin = mix(skin, uPalAccent * 1.25, clamp(blush * 0.38 * throb, 0.0, 0.6));

  // ---- relieve blando ----
  vec3 x = q * SK_WFREQ_F;
  float h0 = he_relief(x);
  float e = 0.07;
  vec3 gR = vec3(he_relief(x + vec3(e, 0.0, 0.0)) - h0, he_relief(x + vec3(0.0, e, 0.0)) - h0, he_relief(x + vec3(0.0, 0.0, e)) - h0) / e * SK_WFREQ_F;
  gR -= dot(gR, p) * p;                                            // solo la parte tangente a la esfera
  sk_nPert -= gR * SK_BUMP_F;
  float hc = clamp(h0, 0.0, 1.0);
  skin *= 0.92 + 0.1 * hc;                                         // valles apenas más oscuros
  sk_dRough += 0.06 - 0.12 * hc;                                   // lomas algo más satinadas

  // ---- venas: isolínea 0,5 de un ruido; distancia en el mundo = |n - 0,5| / |gradiente| ----
  vec3 vq = q * 1.9 + (tone - 0.5) * vec3(1.4, -1.0, 0.8);
  float n1 = sk_noise3(vq);
  float ve = 0.05;
  vec3 g1 = vec3(sk_noise3(vq + vec3(ve, 0.0, 0.0)) - n1, sk_noise3(vq + vec3(0.0, ve, 0.0)) - n1, sk_noise3(vq + vec3(0.0, 0.0, ve)) - n1) / ve * 1.9;
  g1 -= dot(g1, p) * p;
  float gl = length(g1);
  float s1 = n1 - 0.5;
  float distW = abs(s1) / max(gl, 0.3);
  float vw = HE_VEIN_W * (0.75 + 0.5 * tone);                      // grosor que varía a lo largo
  float vMain = 1.0 - smoothstep(vw * 0.35, vw + px * 0.8, distW);
  float n2 = sk_noise3(q * 4.3 + 17.0 + (marb - 0.5) * 1.2);
  float aa2 = fwidth(n2) * 0.8 + 1e-4;
  float nearV = 1.0 - smoothstep(0.0, 0.17, abs(s1));              // las ramas nacen junto a una vena gruesa
  float vBr = (1.0 - smoothstep(0.012, 0.036 + aa2, abs(n2 - 0.5))) * nearV;
  float presence = smoothstep(0.5, 0.66, sk_noise3(q * 0.95 + 2.2)) * smoothstep(0.42, 0.58, sk_noise3(q * 2.4 + 8.0)); // zonas sueltas y tramos cortos
  float vein = max(vMain, vBr * 0.5) * presence;
  float halo = (1.0 - smoothstep(0.0, vw * 3.0, distW)) * presence;
  vec3 veinCol = mix(vec3(0.10, 0.12, 0.34), vec3(0.30, 0.07, 0.15), smoothstep(0.35, 0.65, marb));
  skin = mix(skin, skin * vec3(0.84, 0.82, 1.0), halo * 0.4);     // velo azulado bajo la piel
  skin = mix(skin, veinCol, vein * 0.8);
  // abultado: perfil suave (smoothstep) en función de la distancia a la vena
  float vb = vw * 1.8;
  float tv = clamp(distW / vb, 0.0, 1.0);
  vec3 dirV = g1 / max(gl, 1e-4) * smoothstep(0.05, 0.3, gl);
  vec3 gV = dirV * (-6.0 * tv * (1.0 - tv) / vb) * sign(s1) * presence;
  sk_nPert -= gV * 0.004;
  sk_dRough -= 0.05 * vein;

  // ---- pelos (dos rejillas) ----
  vec3 shO = vec3(-vObjX.y, -vObjY.y, -vObjZ.y);
  vec3 hA = he_hairLayer(p, HE_ROT_A, HE_HS_A, HE_DENS_A, HE_LEN_A, 0.0, shO, px);
  vec3 hB = he_hairLayer(p, HE_ROT_B, HE_HS_B, HE_DENS_B, HE_LEN_B, 0.53, shO, px);
  vec3 hC = he_hairLayer(p, transpose(HE_ROT_A), HE_HS_C, HE_DENS_C, HE_LEN_C, 1.07, shO, px);
  float hair = max(hA.x, max(hB.x, hC.x));
  float shadow = max(hA.y, max(hB.y, hC.y)) * (1.0 - hair);
  float pore = max(hA.z, max(hB.z, hC.z));
  skin *= 1.0 - 0.45 * shadow;
  skin *= 1.0 - 0.25 * pore;
  skin = mix(skin, vec3(0.014, 0.010, 0.009), hair);
  sk_dRough -= 0.25 * hair;                                        // el pelo brilla más que la piel

  // ---- golpe, luz bajo la piel ----
  skin = mix(skin, uPalAccent * 1.1, clamp(uImpact, 0.0, 1.0) * 0.4);
  sk_emis += mix(uPalAccent, uPalBase, 0.4) * 0.16 * pow(rim, 2.2) * (0.8 + 0.2 * throb);
  diffuse.rgb = skin;
}
`,
  uniforms: {},
  quality: {
    low: { tone: 2, wfreq: 2.2, fine: 0, bump: 0.028 },
    medium: { tone: 2, wfreq: 2.2, fine: 0, bump: 0.028 },
    high: { tone: 3, wfreq: 2.4, fine: 1, bump: 0.03 },
  },
};
