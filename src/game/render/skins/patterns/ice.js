// Criónova (skin `ice`, Épica) — hielo falso: sin transmission; base translúcida simulada con
// fresnel + profundidad, grietas internas con parallax de 2 capas (vector de vista en espacio de
// objeto) y escarcha que crece desde los polos con la bola parada y se derrite al rodar.
// Ficha: docs/skins-premium-plan.md, (b) «5. Criónova». Baja (sin shader) usa el material estándar.

const glsl = /* glsl */ `
// (uFrost lo declara skinMaterial a partir de los uniforms del patron)

// Vector hacia la cámara en espacio de objeto (vObjX/Y/Z = ejes del objeto en espacio de vista)
vec3 ice_viewObj() {
  vec3 v = normalize(vViewPosition);
  return normalize(vec3(dot(v, vObjX), dot(v, vObjY), dot(v, vObjZ)));
}

// Una capa de grietas: aristas de voronoi sobre la esfera, desplazada por parallax.
// depth = profundidad aparente de la capa; devuelve 0..1 (1 = centro de grieta).
float ice_crack(vec3 p, vec3 vt, float depth, float scale, float width, float seedOff) {
  vec3 q = (p - vt * depth) * scale + vec3(seedOff, seedOff * 0.37, -seedOff * 0.71);
  vec3 vor = sk_voronoi3(q);
  float edge = vor.y;
  // ancho que se estrecha con la escala para no perder lectura a distancia
  return 1.0 - smoothstep(0.0, width, edge);
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 V = ice_viewObj();
  float ndv = clamp(dot(V, p), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);

  // componente tangente de la vista: base del parallax
  vec3 vt = V - p * dot(V, p);

  float wearW = 1.0 + uWear * 0.6;

  // --- translucidez simulada: más profundo/azul al centro, claro y lechoso en el borde ---
  vec3 cDeep = vec3(0.118, 0.435, 0.659);   // #1E6FA8
  vec3 cMid  = vec3(0.498, 0.839, 1.0);     // #7FD6FF
  vec3 cPale = vec3(0.910, 0.984, 1.0);     // #E8FBFF
  float milk = sk_fbm3(p * 2.3 + uSeed, SK_MILK);
  vec3 body = mix(cDeep, cMid, smoothstep(0.0, 0.85, ndv * 0.55 + milk * 0.75));
  body = mix(body, cPale, fres * 0.85 + milk * 0.12);
  body = mix(body, uPalBase, 0.25);
  diffuse.rgb = body;

  // --- grietas internas: 2 capas a distinta profundidad (parallax) ---
  float c1 = ice_crack(p, vt, 0.10, 3.2 * SK_SCALE_F, 0.055 * wearW, uSeed);
  float c2 = 0.0;
#if SK_LAYERS > 1
  c2 = ice_crack(p, vt, 0.34, 5.6 * SK_SCALE_F, 0.075 * wearW, uSeed * 1.7 + 11.0);
#endif
  // la capa profunda se atenúa (más azul), la superficial es blanca
  float cr = clamp(c1 + c2 * 0.7, 0.0, 1.0);
  diffuse.rgb = mix(diffuse.rgb, cDeep * 0.8, c2 * 0.5);
  diffuse.rgb = mix(diffuse.rgb, vec3(1.0), c1 * 0.9);
  // brillo interno de las grietas; el golpe las enciende
  sk_emis += vec3(0.75, 0.93, 1.0) * (c1 * 0.22 + c2 * 0.12) * (1.0 + uImpact * 5.0);

  // --- acabado: superficie casi espejo, grietas algo más rugosas ---
  sk_dRough += -0.25 + cr * 0.18;
  sk_dMetal += 0.0;

#if SK_NORMAL > 0
  // facetas suaves de hielo
  vec3 g = sk_noiseGrad(p * 6.0 + uSeed, 0.05);
  sk_nPert += g * 0.045;
#endif

  // --- escarcha desde los polos (eje Y del objeto), irregular por ruido ---
  if (uFrost > 0.002) {
    float pole = abs(p.y);
    float fn = sk_fbm3(p * 5.0 + uSeed * 0.5, SK_FROST_OCT);
    float reach = 1.0 - uFrost * 0.9;               // 1 = sin escarcha, 0.1 = casi cubierta
    float f = smoothstep(reach, reach + 0.18, pole + (fn - 0.5) * 0.45);
    f *= smoothstep(0.0, 0.25, uFrost);
    vec3 frostCol = mix(cPale, vec3(1.0), fn);
    diffuse.rgb = mix(diffuse.rgb, frostCol, f * 0.92);
    sk_dRough += f * 0.5;
    sk_emis *= 1.0 - f * 0.7;
  }
}
`;

export default {
  glsl,
  uniforms: {
    uFrost: { value: 0 },
  },
  // Escarcha: crece lenta con la bola parada (~3 s) y se derrite rápido al rodar (~0.6 s).
  update(u, t, dt, ctx) {
    const moving = (ctx?.speed ?? 0) > 0.25;
    const rate = moving ? -1.6 : 0.33;
    u.uFrost.value = Math.min(1, Math.max(0, u.uFrost.value + rate * (dt || 0)));
  },
  quality: {
    low: { layers: 1, milk: 1, normal: 0, frost_oct: 1, scale: 1 },
    medium: { layers: 2, milk: 2, normal: 0, frost_oct: 2, scale: 1 },
    high: { layers: 2, milk: 3, normal: 1, frost_oct: 3, scale: 1.15 },
  },
};
