// Antimateria del Vacío (ideas_skins/_plan/spec-skins.md, skin 1): cáscara violeta-índigo resquebrajada. Las
// grietas son fijas (la identidad de la bola, cambian con uSeed): unas pocas manchas de hueco negro de borde
// dentado, con grietas finas que salen de ellas y un borde incandescente; en alta, una espiral dibujada en
// espacio de vista dentro del hueco (imita el interior sin transparencia).
//   uTime: pulso del borde de las grietas (0,5 Hz) y giro lento de la espiral (0,2 vueltas/s).
//   uImpact: el borde de las grietas se aviva con cada golpe.
// Coste: fbm (SK_FBM octavas) + 2 ruidos de un solo paso (máscara de manchas y dentado del borde).
// Baja no ejecuta shader (material estándar + canvas `void_cracks`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  // normal en espacio de vista (rayo de vista ~ +Z): el «interior» no gira con la superficie
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float cz = clamp(nv.z, 0.0, 1.0);
  float rim = 1.0 - cz;

  // cáscara violeta-índigo (en la hoja es bastante más clara que el hueco): mezcla de base y acento
  diffuse.rgb = mix(uPalBase, uPalAccent * vec3(0.5, 0.65, 1.0), 0.17) * (0.75 + 0.5 * pow(cz, 0.6));

  // grietas: iso-línea del fbm que solo «vive» dentro de unas pocas manchas (máscara de baja frecuencia); en
  // el corazón de cada mancha el hueco se ensancha hasta ser un parche irregular. Fuera de ellas, cáscara lisa.
  float f = sk_fbm3(p * 2.6 + uSeed, SK_FBM);
  float m = sk_noise3(p * 1.5 + vec3(uSeed * 0.7 + SK_OFS_F, 1.9, 0.5));
  float blob = smoothstep(0.54, 0.74, m);
  float live = smoothstep(0.43, 0.52, m);
  float jag = sk_noise3(p * 21.0 + uSeed) - 0.5;
  float d = abs(f - SK_MID_F) + jag * 0.034 * (0.35 + blob);
  float wHole = 0.005 + 0.04 * blob * blob;
  float inner = smoothstep(wHole, wHole + 0.004, d);
  float hole = (1.0 - inner) * live;
  float edge = inner * (1.0 - smoothstep(wHole + 0.005, wHole + 0.03, d)) * live;
  float halo = (1.0 - smoothstep(wHole + 0.004, wHole + 0.1, d)) * inner * live;

  // borde incandescente: violeta con un filo claro pegado al límite del hueco
  float pulse = 1.7 + 0.3 * sin(uTime * 3.1) + uImpact * 1.5;
  float wire = (1.0 - smoothstep(wHole + 0.004, wHole + 0.011, d)) * inner * live;
  sk_emis += uPalAccent * (edge * pulse + halo * 0.3) + uPalGlow * wire * 1.0;

  // hueco: negro mate (como el horizonte de sucesos)
  diffuse.rgb *= 1.0 - hole;
  // destellos violeta en lo hondo del hueco (la hoja los muestra entre la negrura)
  sk_emis += uPalAccent * hole * smoothstep(0.12, 0.5, jag) * 0.7;
  sk_dRough = hole;
  sk_dMetal = -hole;

  #if SK_SWIRL > 0
  // singularidad: espiral oscura en el hueco, con el centro negro
  float r = length(nv.xy);
  float s = sin(2.0 * atan(nv.y, nv.x + 1e-4) + 8.0 * r - uTime * 1.2);
  sk_emis += uPalAccent * hole * 0.35 * smoothstep(0.4, 1.0, s) * smoothstep(0.1, 0.35, r);
  #endif

  // borde de lente: fresnel cian fino
  sk_emis += uPalSecondary * pow(rim, 4.0) * 0.8;
}
`,
  uniforms: {},
  update() {},
  quality: {
    low: { fbm: 2, swirl: 0, mid: 0.375, ofs: 4.3 },
    medium: { fbm: 2, swirl: 0, mid: 0.375, ofs: 4.3 },
    high: { fbm: 3, swirl: 1, mid: 0.44, ofs: 4.3 },
  },
};
