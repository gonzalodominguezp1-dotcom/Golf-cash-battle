// El Huevo Mío (skin por código): bola de piel escrotal húmeda-satinada, sin bordes duros ni trazos negros.
// Capas (de abajo arriba):
//   - Carne: tono de baja frecuencia, moteado irregular (motas rojizas y pálidas), zonas algo pardas y rubor que late con uTime.
//   - Venas verdosas, finas, cortas y ramificadas (tronco + ramas + ramitas), con halo verdoso bajo la piel y leve abultado.
//   - Relieve ancho y blando: un campo de ruido W (con su gradiente) que también deforma rafe, arrugas y pliegues.
//   - Rafe: cresta suave y algo más oscura que va de polo a polo por delante (x ≈ he_rapheX(y), z > 0), algo sinuosa.
//     hairDecor.js usa la misma curva (seamX) para que los pelos se agrupen junto a ella.
//   - Rugosidad (rugae): arruguitas apretadas y onduladas que salen perpendiculares al rafe y se curvan en galón al alejarse;
//     perfil de lomas redondas y valles estrechos, cortadas en tramos. Solo normal + sombreado difuso y rojizo en los valles;
//     se funden a su color medio antes de hacer aliasing (bola lejana).
//   - 3 pliegues verticales anchos (a los lados y detrás, lejos del rafe).
//   - Folículos: bultitos diminutos (más junto al rafe), algunos con el puntito oscuro de la raíz del pelo.
//   - Golpe (uImpact) enrojece; borde rojizo emisivo (subsurface falso) que late con el rubor.
//   Los pelos NO están aquí: son geometría real (skins/hairDecor.js, `decor.hair` en skins.js). En Baja quedan pintados (ballPaint.js).
// Coste: 24 ruidos 3D en alta (fine = 1), 19 en media; Baja no ejecuta shader (canvas `flesh`). Folículos: 5 hashes por píxel, sin vecinas.
// Ajustes a ojo: quality.*.rugae (frecuencia de las arruguitas), crease (su relieve), bump (relieve ancho), wfreq (tamaño de W);
// en el GLSL HE_VEIN_W (grosor de vena), HE_RAPHE_W (anchura del rafe), HE_CHEV (curvatura en galón), HE_FOL_F (tamaño de folículos).
export default {
  glsl: /* glsl */ `
const float HE_VEIN_W = 0.010;   // semiancho de la vena principal en la esfera unitaria (finas)
const float HE_RAPHE_W = 0.034;  // semiancho de la cresta del rafe
const float HE_RAPHE_L = 0.011;  // semiancho de la línea pigmentada del rafe
const float HE_CHEV = 0.13;      // curvatura en galón de las arruguitas al alejarse del rafe
const float HE_FOL_F = 10.0;     // celdas de folículos por unidad (más = más pequeños y densos)
const vec3 HE_AXB = vec3(0.37, 0.28, -0.886); // ejes (unitarios) de las familias B y C de arruguitas:
const vec3 HE_AXC = vec3(0.923, 0.0, 0.385);   // C es perpendicular a B y a y (C reemplaza a B junto a sus polos)

// rafe: x = he_rapheX(y) (+ meneo de W). Misma curva que seamX en hairDecor.js.
float he_rapheX(float y) { return 0.045 * sin(2.7 * y + 0.6) + 0.02 * sin(6.1 * y + 1.9); }
float he_rapheDX(float y) { return 0.1215 * cos(2.7 * y + 0.6) + 0.122 * cos(6.1 * y + 1.9); }

// campo blando de baja frecuencia centrado en 0 (relieve ancho y deformación del resto de capas)
float he_warp(vec3 x) {
  float h = sk_noise3(x) - 0.5;
  #if SK_FINE > 0
  h += 0.4 * (sk_noise3(x * 2.31 + 4.7) - 0.5);
  #endif
  return h;
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float rim = 1.0 - clamp(nv.z, 0.0, 1.0);
  float px = max(length(fwidth(p)), 1e-4);                         // tamaño de un píxel sobre la esfera
  vec3 q = p + vec3(uSeed * 0.137, uSeed * 0.071, uSeed * 0.213);  // cada dueño tiene su propia piel
  float throb = 1.0 + 0.10 * sin(uTime * 1.7);

  // ---- campo blando W y su gradiente tangente ----
  vec3 x = q * SK_WFREQ_F;
  float W = he_warp(x);
  const float e = 0.06;
  vec3 gW = (vec3(he_warp(x + vec3(e, 0.0, 0.0)), he_warp(x + vec3(0.0, e, 0.0)), he_warp(x + vec3(0.0, 0.0, e))) - W) * (SK_WFREQ_F / e);
  gW -= dot(gW, p) * p;

  // ---- carne: tono, moteado irregular, zonas pardas y rubor ----
  float tone = sk_fbm3(q * 1.6, SK_TONE);
  float mot = sk_fbm3(q * 5.3 + vec3(3.7, -1.2, 8.1) + W * 1.5, 2);
  vec3 skin = mix(uPalBase * 0.8, uPalBase * 1.08, clamp(tone * 1.4 - 0.12, 0.0, 1.0));
  skin = mix(skin, uPalAccent, 0.28 * smoothstep(0.40, 0.60, mot));               // motas rojizas
  skin = mix(skin, uPalGlow, 0.20 * (1.0 - smoothstep(0.14, 0.30, mot)));        // motas pálidas
  skin = mix(skin, uPalSecondary * 1.6, 0.2 * smoothstep(0.42, 0.7, tone));       // zonas algo más pardas
  float blush = smoothstep(0.32, 0.70, sk_fbm3(q * 1.2 + 11.3, 2));
  skin = mix(skin, uPalAccent * 1.2, clamp(blush * 0.30 * throb, 0.0, 0.5));

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
  float n2 = sk_noise3(q * 4.3 + 17.0 + (mot - 0.375) * 1.2);
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
  vec3 veinCol = mix(vec3(0.05, 0.16, 0.12), vec3(0.08, 0.19, 0.17), smoothstep(0.25, 0.5, mot)); // verdoso
  skin = mix(skin, skin * vec3(0.86, 0.98, 0.90), halo * 0.4);    // velo verdoso bajo la piel
  skin = mix(skin, veinCol, vein * 0.72);
  float vb = vw * 1.8;
  float tv = clamp(distW / vb, 0.0, 1.0);
  vec3 dirV = g1 / max(gl, 1e-4) * smoothstep(0.05, 0.3, gl);
  vec3 gV = dirV * (-6.0 * tv * (1.0 - tv) / vb) * sign(s1) * presence;
  sk_nPert -= gV * 0.004;
  sk_dRough -= 0.05 * vein;

  // ---- relieve ancho: hondonadas blandas, algo más oscuras y rojizas ----
  sk_nPert -= gW * SK_BUMP_F;
  skin *= 0.93 + 0.12 * clamp(W + 0.5, 0.0, 1.0);
  skin = mix(skin, uPalAccent, 0.08 * (1.0 - smoothstep(-0.3, 0.1, W)));

  // ---- rafe: cresta blanda de polo a polo por delante, algo sinuosa y más oscura ----
  float s = p.x - he_rapheX(p.y) - 0.03 * W;                       // distancia (con signo) al rafe
  vec3 gS = vec3(1.0, -he_rapheDX(p.y), 0.0) - 0.03 * gW;
  gS -= dot(gS, p) * p;
  float rOn = smoothstep(-0.45, 0.05, p.z);                        // se apaga por detrás
  float rr = s / HE_RAPHE_W;
  float crest = exp(-rr * rr) * rOn;
  float aaC = 1.0 - smoothstep(0.5, 1.6, px / HE_RAPHE_W);
  sk_nPert -= gS * (-2.0 * rr / HE_RAPHE_W * crest * 0.007 * aaC);
  // color: gaussianas ensanchadas con el tamaño de píxel (sin aliasing ni contorno)
  float sC = sqrt(HE_RAPHE_W * HE_RAPHE_W + 0.25 * px * px);
  float crestC = (HE_RAPHE_W / sC) * exp(-(s * s) / (sC * sC)) * rOn;
  float sL = sqrt(HE_RAPHE_L * HE_RAPHE_L + 0.25 * px * px);
  float line = (HE_RAPHE_L / sL) * exp(-(s * s) / (sL * sL)) * rOn;
  skin *= 1.0 - 0.10 * crestC;
  skin = mix(skin, mix(uPalAccent, uPalSecondary, 0.55), 0.36 * line);

  // ---- rugosidad: arruguitas apretadas y onduladas ----
  // Familia A: perpendiculares al rafe, en galón al alejarse. Familias B y C: otras orientaciones; lejos del rafe se
  // mezclan por manchas y forman la red arrugada "contraída". Perfil seno algo redondeado: ni aristas ni líneas oscuras.
  // Cada familia son bandas alrededor de un eje: junto a sus polos se cambia a otra (sin dianas).
  float y = p.y;
  float farR = 1.0 - (1.0 - smoothstep(0.1, 0.8, abs(s))) * rOn;     // lejos del rafe (detrás no hay rafe)
  float wA = 0.08 + 0.12 * farR;                                    // más revueltas lejos del rafe
  float phA = SK_RUGAE_F * (y + 0.5 * y * y * y + wA * W - HE_CHEV * s * s); // y + y^3/2: paso casi uniforme sobre la esfera
  vec3 gA = SK_RUGAE_F * (vec3(0.0, 1.0 + 1.5 * y * y, 0.0) + wA * gW - (2.0 * HE_CHEV * s) * gS);
  gA -= dot(gA, p) * p;
  float tb = dot(p, HE_AXB);
  float phB = SK_RUGAE_F * 1.1 * (tb + 0.5 * tb * tb * tb + 0.2 * W);
  vec3 gB = SK_RUGAE_F * 1.1 * ((1.0 + 1.5 * tb * tb) * HE_AXB + 0.2 * gW);
  gB -= dot(gB, p) * p;
  float tc = dot(p, HE_AXC);
  float phC = SK_RUGAE_F * 1.05 * (tc + 0.5 * tc * tc * tc - 0.18 * W);
  vec3 gC = SK_RUGAE_F * 1.05 * ((1.0 + 1.5 * tc * tc) * HE_AXC - 0.18 * gW);
  gC -= dot(gC, p) * p;
  float m = smoothstep(0.35, 0.75, farR * 0.7 + (tone - 0.44) * 1.2 + 0.25 * W);
  m = max(m, smoothstep(0.75, 0.95, abs(y)));                      // en los polos de A mandan B/C
  float k = smoothstep(0.7, 0.92, abs(tb));                        // en los polos de B manda C
  float wB = m * (1.0 - k);
  float wC = m * k;
  float cA = 0.5 + 0.5 * sin(phA);
  float cB = 0.5 + 0.5 * sin(phB);
  float cC = 0.5 + 0.5 * sin(phC);
  float aaA = 1.0 - smoothstep(0.9, 2.2, length(gA) * px);         // se funden a su media antes del aliasing
  float aaB = 1.0 - smoothstep(0.9, 2.2, length(gB) * px);
  float aaC2 = 1.0 - smoothstep(0.9, 2.2, length(gC) * px);
  // altura h = c (1,5 - 0,5 c) (media 0,5625); dh/dfase = (1,5 - c) * 0,5 cos(fase)
  float hA = mix(0.5625, cA * (1.5 - 0.5 * cA), aaA);
  float hB = mix(0.5625, cB * (1.5 - 0.5 * cB), aaB);
  float hC = mix(0.5625, cC * (1.5 - 0.5 * cC), aaC2);
  vec3 gR = (1.0 - m) * gA * ((1.5 - cA) * 0.5 * cos(phA) * aaA)
          + wB * gB * ((1.5 - cB) * 0.5 * cos(phB) * aaB)
          + wC * gC * ((1.5 - cC) * 0.5 * cos(phC) * aaC2);
  float brk = smoothstep(0.28, 0.72, sk_noise3(q * 8.5 + 5.0 + W)); // tramos cortos
  float ampR = (0.35 + 0.65 * brk) * (0.55 + 0.45 * smoothstep(0.15, 0.5, mot)) * (1.0 - 0.45 * rOn * (1.0 - smoothstep(0.6, 2.2, abs(rr))));
  sk_nPert -= gR * (ampR * SK_CREASE_F);
  float hh = (1.0 - m) * hA + wB * hB + wC * hC;
  float cav = ampR * (1.0 - hh);                                   // cuánto valle (0..1)
  skin *= 1.0 - 0.16 * cav;
  skin = mix(skin, uPalAccent * 0.9, 0.16 * cav);                  // valles más rojizos
  skin = mix(skin, uPalGlow, 0.10 * ampR * max(hh - 0.5, 0.0));    // lomas algo pálidas
  sk_dRough += 0.24 * (cav - 0.4375 * ampR);                       // valles mates, lomas satinadas (húmedas)

  // ---- 3 pliegues verticales anchos a los lados y detrás (gaussianas, sin trazo duro) ----
  float latFade = smoothstep(-0.75, -0.35, y) * (1.0 - smoothstep(0.35, 0.75, y));
  float wr = 0.0;
  vec3 gF = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float a = i == 0 ? -1.75 : (i == 1 ? 1.8 : -3.05);
    float kw = 0.12 + 0.04 * float(i);
    vec3 Nw = vec3(cos(a), 0.0, sin(a));
    vec3 Mw = vec3(-sin(a), 0.0, cos(a));
    float dw = dot(p, Nw) + kw * W;
    float f = exp(-dw * dw * 200.0) * smoothstep(0.15, 0.5, dot(p, Mw)) * latFade * (i == 2 ? 0.7 : 1.0);
    wr += f;
    gF += (Nw + kw * gW) * (f * dw * 400.0);                       // gradiente de la altura (-f)
  }
  gF -= dot(gF, p) * p;
  wr = clamp(wr, 0.0, 1.0);
  sk_nPert -= gF * 0.008;
  skin *= 1.0 - 0.12 * wr;
  skin = mix(skin, uPalAccent * 0.85, 0.12 * wr);
  sk_dRough += 0.05 * wr;

  // ---- folículos: un punto por celda, lejos de su borde (no hace falta mirar las vecinas) ----
  vec3 fq = q * HE_FOL_F;
  vec3 fi = floor(fq);
  vec3 fd = fract(fq) - (0.3 + 0.4 * vec3(sk_hash(fi), sk_hash(fi + 17.0), sk_hash(fi + 41.0)));
  float fk = sk_hash(fi + 73.0);
  float fRad = 0.17 + 0.11 * fk;                                   // < 0,3: el bulto nunca toca el borde de la celda
  float fb = max(1.0 - dot(fd, fd) / (fRad * fRad), 0.0);
  float nearR = (1.0 - smoothstep(0.05, 0.4, abs(s))) * rOn;
  float fOn = smoothstep(0.30, 0.45, sk_hash(fi + 101.0) + 0.25 * nearR); // más junto al rafe
  float aaF = 1.0 - smoothstep(0.1, 0.3, px * HE_FOL_F);
  float fAmt = fOn * aaF;
  vec3 gFol = fd * (-4.0 * fb * HE_FOL_F / (fRad * fRad));         // gradiente de fb^2
  gFol -= dot(gFol, p) * p;
  sk_nPert -= gFol * (0.003 * fAmt);
  skin = mix(skin, uPalGlow, 0.07 * fb * fb * fAmt);               // bultito algo más pálido
  float sig2 = 0.0036 + 0.25 * px * px * HE_FOL_F * HE_FOL_F;
  float shaft = (0.0036 / sig2) * exp(-dot(fd, fd) / sig2) * step(0.35, fk) * fAmt;
  skin = mix(skin, uPalSecondary * 0.5, 0.55 * shaft);             // raíz del pelo

  // ---- golpe, luz bajo la piel (borde rojizo) ----
  skin = mix(skin, uPalAccent * 1.1, clamp(uImpact, 0.0, 1.0) * 0.4);
  sk_emis += mix(uPalAccent, uPalBase, 0.35) * (0.15 * rim * rim * (0.8 + 0.2 * throb) + 0.02 * (1.0 - cav));
  diffuse.rgb = skin;
}
`,
  uniforms: {},
  quality: {
    low: { tone: 2, wfreq: 2.4, fine: 0, bump: 0.03, rugae: 64, crease: 0.006 },
    medium: { tone: 2, wfreq: 2.4, fine: 0, bump: 0.03, rugae: 64, crease: 0.006 },
    high: { tone: 3, wfreq: 2.4, fine: 1, bump: 0.032, rugae: 64, crease: 0.0065 },
  },
};
