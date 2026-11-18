// El Huevo Mío (skin por código): bola de carne húmeda, mate-satinada, sin bordes duros.
//   - Carne: tono de baja frecuencia, veteado tipo marmoleado (vetas pálidas y rojizas), rubor que late con uTime
//     y relieve de ondulaciones anchas y blandas (normal de poca intensidad, sin crestas).
//   - Arrugas verticales: 3 pliegues blandos a lo largo de meridianos (gaussianas anchas con normal suave).
//   - Venas verdosas, finas y ramificadas (tronco + ramas + ramitas), de grosor constante en el mundo (la distancia a la vena se
//     normaliza con el gradiente del ruido), borde suavizado con el tamaño de píxel y ligeramente abultadas.
//   - Los pelos NO están aquí: son geometría real (skins/hairDecor.js, `decor.hair` en skins.js) para que sobresalgan
//     de la silueta. En calidad baja (sin shader) quedan los pelos pintados de la textura 2D.
//   Con «reducir movimiento» (uTime fijo) el rubor no late. Al recibir un golpe (uImpact) la piel se enrojece.
// Coste: 24 ruidos 3D en alta (fine = 1), 18 en media; Baja no ejecuta shader (canvas `flesh`).
// Ajustes a ojo: quality.*.bump (relieve), wfreq (tamaño de las ondulaciones); en el GLSL HE_VEIN_W (grosor de vena).
export default {
  glsl: /* glsl */ `
const float HE_VEIN_W = 0.011;  // semiancho de la vena principal en la esfera unitaria (finas)

// relieve blando: ondulaciones anchas (sin abs ni crestas)
float he_relief(vec3 x) {
  float h = sk_noise3(x);
  #if SK_FINE > 0
  h += 0.35 * sk_noise3(x * 2.13 + 4.7);
  #endif
  return h;
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

  // ---- arrugas verticales: pliegues blandos a lo largo de 3 meridianos (gaussianas anchas, sin trazo duro) ----
  float wob = (sk_noise3(q * 2.6 + 21.0) - 0.5) * 0.08;
  float latFade = smoothstep(-0.7, -0.35, p.y) * (1.0 - smoothstep(0.35, 0.7, p.y));
  float wr = 0.0;
  vec3 gW = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float a = 0.5 + 2.1 * float(i) + 0.3 * float(i * i);
    vec3 Nw = vec3(cos(a), 0.0, sin(a));
    vec3 Mw = vec3(-sin(a), 0.0, cos(a));
    float dw = dot(p, Nw) + wob * (1.0 + 0.3 * float(i));
    float f = exp(-dw * dw * 260.0) * smoothstep(0.15, 0.5, dot(p, Mw)) * latFade * (i == 1 ? 0.6 : 1.0);
    wr += f;
    gW += Nw * (f * dw * 520.0);                                   // gradiente de la altura (-f)
  }
  gW -= dot(gW, p) * p;
  wr = clamp(wr, 0.0, 1.0);
  sk_nPert -= gW * 0.007;
  skin *= 1.0 - 0.14 * wr;
  skin = mix(skin, uPalAccent * 0.85, 0.12 * wr);
  sk_dRough += 0.06 * wr;

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
  float vMain = 1.0 - smoothstep(vw * 0.3, vw + px * 0.8, distW);
  // ramas y ramitas: isolíneas de otros dos ruidos que solo existen junto al tronco / junto a las ramas
  float n2 = sk_noise3(q * 4.3 + 17.0 + (marb - 0.5) * 1.2);
  float aa2 = fwidth(n2) * 0.8 + 1e-4;
  float d2 = abs(n2 - 0.5);
  float nearV = 1.0 - smoothstep(0.0, 0.2, abs(s1));
  float vBr = (1.0 - smoothstep(0.006, 0.018 + aa2, d2)) * nearV;
  float n3 = sk_noise3(q * 9.5 + 31.0);
  float aa3 = fwidth(n3) * 0.8 + 1e-4;
  float nearB = (1.0 - smoothstep(0.0, 0.16, d2)) * nearV;
  float vTw = (1.0 - smoothstep(0.004, 0.012 + aa3, abs(n3 - 0.5))) * nearB;
  float presence = smoothstep(0.46, 0.62, sk_noise3(q * 0.95 + 2.2)) * smoothstep(0.42, 0.58, sk_noise3(q * 2.4 + 8.0)); // zonas sueltas y tramos cortos
  float vein = max(vMain, max(vBr * 0.85, vTw * 0.65)) * presence;
  float halo = (1.0 - smoothstep(0.0, vw * 4.0, distW)) * presence;
  vec3 veinCol = mix(vec3(0.05, 0.17, 0.12), vec3(0.09, 0.20, 0.17), smoothstep(0.35, 0.65, marb)); // verdoso
  skin = mix(skin, skin * vec3(0.86, 0.98, 0.90), halo * 0.4);    // velo verdoso bajo la piel
  skin = mix(skin, veinCol, vein * 0.8);
  // abultado: perfil suave (smoothstep) en función de la distancia a la vena
  float vb = vw * 1.8;
  float tv = clamp(distW / vb, 0.0, 1.0);
  vec3 dirV = g1 / max(gl, 1e-4) * smoothstep(0.05, 0.3, gl);
  vec3 gV = dirV * (-6.0 * tv * (1.0 - tv) / vb) * sign(s1) * presence;
  sk_nPert -= gV * 0.004;
  sk_dRough -= 0.05 * vein;

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
