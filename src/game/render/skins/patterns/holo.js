// Prisma Holo (docs/skins-premium-plan.md, ficha 7; contrato en ./index.js).
// Cromo base + lámina thin-film que cambia con dot(N,V) + purpurina que solo se enciende
// con cierto ángulo vista/luz. Todo en espacio de objeto: el espectro gira con la bola, no con el tiempo.
//
// Vista en espacio de objeto: V (vista) se pasa a la base del objeto con vObjX/Y/Z (ejes del objeto
// en vista, ortonormales). La normal de la esfera unitaria es la propia posición `p`.

export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 N = normalize(p);
  vec3 V = normalize(vViewPosition);
  vec3 Vo = vec3(dot(V, vObjX), dot(V, vObjY), dot(V, vObjZ));
  float ndv = clamp(dot(N, Vo), 0.0, 1.0);

  // Thin-film: grosor variable sobre la superficie (ruido en espacio de objeto + semilla);
  // la diferencia de camino óptico depende del ángulo (ley de Snell con n = 1.5).
  float sin2 = 1.0 - ndv * ndv;
  float cosT = sqrt(max(1.0 - sin2 / 2.25, 0.0));
  float thick = sk_fbm3(p * 2.4 + uSeed * 0.71, SK_FBM);
  float opd = 3.0 * cosT * (300.0 + 650.0 * thick);
  vec3 film = 0.5 + 0.5 * cos(6.2831853 * opd / vec3(650.0, 550.0, 450.0));

  // Cromo base (#D9DEE6 con base blanca) tintado por la lámina; el desgaste la va apagando.
  float filmAmt = 0.85 * (1.0 - 0.45 * uWear);
  vec3 chrome = uPalBase * vec3(0.851, 0.871, 0.902) * diffuse.rgb;
  diffuse.rgb = clamp(chrome * mix(vec3(1.0), film * 1.2, filmAmt), 0.0, 1.0);

  // Metalness 1 y rugosidad 0.12 (la base de épica es 0.45 / 0.15).
  sk_dMetal += 0.55;
  sk_dRough -= 0.03;

#if SK_SPARKLE > 0
  // Purpurina: rejilla en espacio de objeto. Cada celda tiene (o no) una escama con normal propia.
  vec3 g = p * float(SK_SPARKLE) + uSeed * 1.3;
  vec3 gc = floor(g);
  vec3 gf = fract(g) - 0.5;
  vec3 hc = sk_hash3(gc);
  float flake = step(0.8 + 0.12 * uWear, hc.z);
  vec3 fn = normalize(sk_hash3(gc + 17.0) * 2.0 - 1.0);
  float dotm = 1.0 - smoothstep(0.0, 0.16, length(gf - (hc - 0.5) * 0.6));
  // Solo brilla cuando la mitad vista-luz coincide con la normal de la escama.
  vec3 Lo = normalize(vec3(0.35, 0.75, 0.55));
  vec3 Hf = normalize(Vo + Lo);
  float glint = pow(max(dot(fn, Hf), 0.0), 36.0);
  float sparkle = flake * dotm * glint * (1.0 + 0.6 * uSpeed + 0.8 * uImpact);
  sk_emis += film * sparkle * 0.9;
  sk_dRough -= sparkle * 0.06;
#endif

#if SK_Q >= 2
  // Alta: microrrelieve de la lámina (perturbación suave de normal)
  sk_nPert = sk_noiseGrad(p * 14.0 + uSeed, 0.05) * 0.01;
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
