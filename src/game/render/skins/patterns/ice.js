// Criónova (skin `ice`, Épica) — hielo falso: sin transmission; base translúcida simulada con
// fresnel + profundidad, grietas internas con parallax de 2 capas (vector de vista en espacio de
// objeto) y escarcha que crece desde los polos con la bola parada y se derrite al rodar.
// Criónova. Baja (sin shader) usa el material estándar.

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
  float fres = pow(1.0 - ndv, 2.5);

  // componente tangente de la vista: base del parallax
  vec3 vt = V - p * dot(V, p);

  // --- facetas de cristal: celdas grandes con inclinación propia (reflejos quebrados, con forma) ---
  vec3 fq = p * 2.1 * SK_SCALE_F + vec3(uSeed * 0.53);
  vec3 fv = sk_voronoi3(fq);
  vec3 tilt = sin(fv.z * vec3(37.0, 91.0, 53.0) + vec3(1.0, 2.0, 3.0));
  tilt -= p * dot(tilt, p);
  float facetEdge = 1.0 - smoothstep(0.0, 0.05, fv.y);   // arista entre facetas

  // --- translucidez simulada: profundidad azul intensa al centro, borde lechoso ---
  vec3 cDeep = vec3(0.050, 0.340, 0.800);
  vec3 cMid  = vec3(0.300, 0.780, 1.000);
  vec3 cPale = vec3(0.880, 0.975, 1.000);
  float milk = sk_fbm3(p * 2.3 + uSeed, SK_MILK);
  float depthT = clamp(ndv * 0.9 + (milk - 0.5) * 0.7 + (fv.z - 0.5) * 0.3, 0.0, 1.0);
  vec3 body = mix(cDeep * 0.35, cMid * 0.8, smoothstep(0.15, 0.95, depthT));
  body = mix(body, cPale, fres * 0.7);
  diffuse.rgb = body;

  // --- grietas internas: 2 capas a distinta profundidad (parallax) ---
  float c1 = ice_crack(p, vt, 0.10, 2.3 * SK_SCALE_F, 0.050, uSeed);
  float c2 = 0.0;
#if SK_LAYERS > 1
  c2 = ice_crack(p, vt, 0.38, 4.0 * SK_SCALE_F, 0.075, uSeed * 1.7 + 11.0);
#endif
  float cr = clamp(c1 + c2 * 0.7, 0.0, 1.0);
  // la capa profunda se ve azul oscuro (hundida), la superficial blanca y brillante
  diffuse.rgb = mix(diffuse.rgb, cDeep * 0.35, c2 * 0.65);
  diffuse.rgb = mix(diffuse.rgb, vec3(1.0), c1 * 0.95);
  diffuse.rgb = mix(diffuse.rgb, cPale, facetEdge * 0.35);
  // brillo interno: la luz «atrapada» en las grietas y en el corazón del hielo; el golpe lo enciende
  sk_emis += vec3(0.55, 0.88, 1.0) * (c1 * 0.8 + c2 * 0.12 + facetEdge * 0.3) * (1.0 + uImpact * 5.0);
  sk_emis += cDeep * (0.18 + 0.5 * milk) * smoothstep(0.0, 0.8, ndv) + cMid * 0.18 * fres + cPale * 0.3 * pow(1.0 - ndv, 4.0);

  // --- acabado: casi espejo; grietas más rugosas ---
  sk_dRough += -0.2 + cr * 0.2;
  sk_dMetal += 0.15;

  // facetas inclinadas: rompen los reflejos en esquirlas (todas las calidades; en alta además relieve fino)
  sk_nPert += tilt * 0.26 * (1.0 - facetEdge);
#if SK_NORMAL > 0
  vec3 g = sk_noiseGrad(p * 7.0 + uSeed, 0.05);
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
    const moving = (ctx?.speed ?? 0) > 0.03; // ctx.speed en 0..1
    const rate = moving ? -1.6 : 0.33;
    u.uFrost.value = Math.min(1, Math.max(0, u.uFrost.value + rate * (dt || 0)));
  },
  quality: {
    low: { layers: 1, milk: 1, normal: 0, frost_oct: 1, scale: 1 },
    medium: { layers: 2, milk: 2, normal: 0, frost_oct: 2, scale: 1 },
    high: { layers: 2, milk: 3, normal: 1, frost_oct: 3, scale: 1.15 },
  },
};
