// Prisma Holo (docs/skins-premium-plan.md, ficha 7; contrato en ./index.js).
// Cromo base + lámina thin-film que cambia con dot(N,V) + purpurina que solo se enciende
// con cierto ángulo vista/luz. Todo en espacio de objeto: el espectro gira con la bola, no con el tiempo.
//
// Vista en espacio de objeto: V (vista) se pasa a la base del objeto con vObjX/Y/Z (ejes del objeto
// en vista, ortonormales). La normal de la esfera unitaria es la propia posición `p`.

export default {
  glsl: /* glsl */ `
vec3 holo_hue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 N = normalize(p);
  vec3 V = normalize(vViewPosition);
  vec3 Vo = vec3(dot(V, vObjX), dot(V, vObjY), dot(V, vObjZ));
  float ndv = clamp(dot(N, Vo), 0.0, 1.0);

  // Lámina tipo sticker «Holo»: facetas hexagonales (voronoi) con inclinación propia; cada una refleja
  // otra parte del espectro. Sobre eso, bandas de difracción que barren con el ángulo de vista.
  vec3 hq = p * 4.2 + vec3(uSeed * 0.37);
  vec3 hv = sk_voronoi3(hq);
  vec3 ft = sin(hv.z * vec3(43.0, 97.0, 61.0) + vec3(0.5, 1.7, 2.9));
  ft -= p * dot(ft, p);
  float cellEdge = 1.0 - smoothstep(0.0, 0.07, hv.y);

  // El espectro depende del ángulo (ndv), del grosor (ruido) y de la faceta; gira con la bola.
  float thick = sk_fbm3(p * 2.2 + uSeed * 0.71, SK_FBM);
  vec3 Vf = normalize(Vo + ft * 0.4);
  float ang = dot(N, Vf);
  float hue = ang * 1.7 + thick * 0.9 + hv.z * 0.12 + dot(p, vec3(0.6, 0.2, 0.4)) * 0.25;
  vec3 film = holo_hue(hue);
  // saturación alta con un blanco metálico en el centro de cada banda
  film = mix(vec3(dot(film, vec3(0.333))), film, 1.0) ;

  // Albedo: cromo azulado teñido por la lámina (metal: el color tiñe el reflejo)
  float filmAmt = 0.95;
  vec3 chrome = uPalBase * vec3(0.851, 0.871, 0.902) * diffuse.rgb;
  diffuse.rgb = clamp(chrome * mix(vec3(1.0), film * 1.35, filmAmt), 0.0, 1.0);
  diffuse.rgb = mix(diffuse.rgb, vec3(0.9), cellEdge * 0.35);

  // Metal casi espejo
  sk_dMetal += 0.55;
  sk_dRough -= 0.06;

  // Resplandor propio del espectro (la lámina «brilla» incluso donde no hay luz directa), más en el borde
  sk_emis += film * (0.2 + 0.34 * pow(1.0 - ndv, 1.6)) * filmAmt;

  // Facetas: normal inclinada -> reflejos quebrados en prismas
  sk_nPert += ft * 0.16 * (1.0 - cellEdge);

#if SK_SPARKLE > 0
  // Purpurina: rejilla en espacio de objeto. Cada celda tiene (o no) una escama con normal propia.
  vec3 g = p * float(SK_SPARKLE) + uSeed * 1.3;
  vec3 gc = floor(g);
  vec3 gf = fract(g) - 0.5;
  vec3 hc = sk_hash3(gc);
  float flake = step(0.72, hc.z);
  vec3 fn = normalize(sk_hash3(gc + 17.0) * 2.0 - 1.0);
  float dotm = 1.0 - smoothstep(0.0, 0.2, length(gf - (hc - 0.5) * 0.6));
  // Solo brilla cuando la mitad vista-luz coincide con la normal de la escama.
  vec3 Lo = normalize(vec3(0.35, 0.75, 0.55));
  vec3 Hf = normalize(Vo + Lo);
  float glint = pow(max(dot(fn, Hf), 0.0), 24.0);
  float sparkle = flake * dotm * glint * (1.6 + 0.8 * uSpeed + 0.8 * uImpact);
  sk_emis += (film * 0.6 + 0.6) * sparkle * 1.6;
  sk_dRough -= sparkle * 0.06;
#endif

#if SK_Q >= 2
  // Alta: microrrelieve de la lámina (perturbación suave de normal)
  sk_nPert += sk_noiseGrad(p * 14.0 + uSeed, 0.05) * 0.012;
#endif
}
`,
  uniforms: {},
  update() {},
  // Baja: sin purpurina ni relieve. Media: purpurina. Alta: purpurina densa + relieve.
  quality: {
    low: { fbm: 2, sparkle: 0 },
    medium: { fbm: 3, sparkle: 20 },
    high: { fbm: 4, sparkle: 36 },
  },
};
