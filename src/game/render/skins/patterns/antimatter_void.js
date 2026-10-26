// Antimateria del Vacío (ideas_skins/_plan/spec-skins.md, skin 1): cáscara índigo resquebrajada. Las
// grietas son fijas (la identidad de la bola, cambian con uSeed): hueco negro con borde incandescente y,
// en alta, una espiral dibujada en espacio de vista dentro del hueco (imita el interior sin transparencia).
//   uTime: pulso del borde de las grietas (0,5 Hz) y giro lento de la espiral (0,2 vueltas/s).
//   uImpact: el borde de las grietas se aviva con cada golpe.
// Baja no ejecuta shader (material estándar + canvas `void_cracks`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  // normal en espacio de vista (rayo de vista ~ +Z): el «interior» no gira con la superficie
  vec3 nv = normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ);
  float rim = 1.0 - clamp(nv.z, 0.0, 1.0);

  diffuse.rgb = uPalBase;

  // grietas: iso-línea del fbm; hueco en el centro, borde incandescente a los lados
  float f = sk_fbm3(p * 2.6 + uSeed, SK_FBM);
  float d = abs(f - SK_MID_F);
  float hole = 1.0 - smoothstep(0.013, 0.017, d);
  float edge = smoothstep(0.013, 0.017, d) * (1.0 - smoothstep(0.026, 0.042, d));
  float halo = (1.0 - smoothstep(0.017, 0.09, d)) * (1.0 - hole);

  float pulse = 1.6 + 0.3 * sin(uTime * 3.1) + uImpact * 1.5;
  sk_emis += uPalAccent * (edge * pulse + halo * 0.18);

  // hueco: negro mate (como el horizonte de sucesos)
  diffuse.rgb *= 1.0 - hole;
  sk_dRough = hole;
  sk_dMetal = -hole;

  #if SK_SWIRL > 0
  // singularidad: espiral oscura en el hueco, con el centro negro
  float r = length(nv.xy);
  float s = sin(2.0 * atan(nv.y, nv.x + 1e-4) + 8.0 * r - uTime * 1.2);
  sk_emis += uPalAccent * hole * 0.35 * smoothstep(0.4, 1.0, s) * smoothstep(0.1, 0.35, r);
  #endif

  // borde de lente: fresnel cian fino
  sk_emis += uPalSecondary * pow(rim, 5.0) * 0.5;
}
`,
  uniforms: {},
  update() {},
  quality: {
    low: { fbm: 2, swirl: 0, mid: 0.375 },
    medium: { fbm: 2, swirl: 0, mid: 0.375 },
    high: { fbm: 3, swirl: 1, mid: 0.44 },
  },
};
