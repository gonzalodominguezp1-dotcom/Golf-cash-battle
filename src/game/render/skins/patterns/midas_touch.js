// Patrón «Toque de Midas» (docs/skins-premium-plan.md, b #8; P3h).
// Oro 24K pulido con filigrana grabada (red curva de una superficie tipo Schwarz-P cortada con la
// esfera), pátina de bronce que se pierde al crecer el estado, AO de cavidad en los hoyuelos
// (voronoi, una capa) y chispas HDR en estados altos.
// Estado evolutivo: `update` acerca `uGild` (suavizado) a ctx.state/5; `uState` se usa para
// activar las chispas por escalones. `uWear` pule la filigrana (el desgaste borra el grabado).

const glsl = /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {
  float g = clamp(uGild, 0.0, 1.0);            // 0 = oro deslucido, 1 = oro 24K pulido

  // Filigrana: red de superficie tipo Schwarz-P con deformación de baja frecuencia (única por semilla).
  float wv = sk_fbm3(p * 2.1 + uSeed * 0.37, SK_OCT);
  vec3 q = p * 7.0 + vec3(wv, wv * 0.6, -wv * 0.8) * 2.4;
  float f = sin(q.x) + sin(q.y) + sin(q.z);
  float groove = (1.0 - smoothstep(0.0, 0.2, abs(f))) * SK_FIL_F * (1.0 - 0.5 * uWear);

  // Pátina: manchas de bronce, visibles solo en estados bajos.
  float mott = smoothstep(0.38, 0.72, sk_fbm3(p * 3.0 + uSeed * 1.9, SK_OCT));
  float patina = mott * (1.0 - g) * 0.4;

  // Hoyuelos: AO de cavidad en el centro de cada celda voronoi (en unidades de celda).
  vec3 vc = sk_voronoi3(p * SK_DIM_F);
  float cav = 1.0 - smoothstep(0.12, 0.30, vc.x);
  float ao = mix(1.0, 1.0 - 0.45 * cav, SK_AO_F);

  // Color: oro cálido con variación suave; filigrana incrustada oscura; pátina bronce.
  vec3 gold = mix(uPalAccent, uPalBase, 0.55 + 0.45 * mott);
  diffuse.rgb = mix(diffuse.rgb, gold, 0.85);
  diffuse.rgb = mix(diffuse.rgb, uPalSecondary * 1.4, patina);
  diffuse.rgb = mix(diffuse.rgb, uPalSecondary, groove * 0.65);
  diffuse.rgb *= ao * mix(0.92, 1.06, g);

  // Material: la filigrana y la pátina son más rugosas y menos metálicas; el oro pulido es más brillante.
  sk_dRough += groove * 0.22 + patina * 0.35 + cav * SK_AO_F * 0.15 - g * 0.04;
  sk_dMetal += -patina * 0.5 - groove * 0.1;

  // Relieve de la filigrana: la normal sigue el gradiente de la red (signo alterno en los surcos).
  vec3 gq = vec3(cos(q.x), cos(q.y), cos(q.z));
  sk_nPert += -sign(f) * groove * (gq / (length(gq) + 1e-4)) * 0.35;

  // Oro lleno de luz propia: un metal pulido en un entorno oscuro se vería oliváceo, así que el color base
  // aporta un resplandor cálido que sube hacia el borde (fresnel) y se atenúa con la pátina.
  float ndvM = clamp(dot(normalize(p), vec3(dot(normalize(vViewPosition), vObjX), dot(normalize(vViewPosition), vObjY), dot(normalize(vViewPosition), vObjZ))), 0.0, 1.0);
  sk_emis += diffuse.rgb * (0.1 + 0.3 * pow(1.0 - ndvM, 2.0)) * (1.0 - groove * 0.7);

  // Emisión HDR: brillo dorado tenue en los surcos (crece con el estado) y destello al golpear.
  float flick = 0.7 + 0.3 * sin(uTime * 1.7 + f);
  sk_emis += uPalBase * groove * ((0.04 + 0.5 * g) * flick + uImpact * 0.8);

  // Chispas doradas (solo Alta y estados >= 2): un destello redondo por celda, con parpadeo.
  if (SK_SPK > 0) {
    vec3 cp = p * 16.0;
    vec3 c = floor(cp);
    float h = sk_hash(c + floor(uSeed));
    vec3 off = (sk_hash3(c + 3.7) - 0.5) * 0.6;
    float spot = smoothstep(0.14, 0.0, length(fract(cp) - 0.5 - off));
    float tw = pow(max(0.0, sin(uTime * (1.5 + 3.0 * h) + h * 60.0)), 18.0);
    float star = step(0.85, h) * tw * spot * smoothstep(1.5, 2.5, uState) * smoothstep(0.25, 0.7, g);
    sk_emis += uPalGlow * star * 4.0;
  }
}
`;

export default {
  glsl,
  uniforms: {
    uGild: { value: 0 },
  },
  update(u, t, dt, ctx) {
    // Acerca el oro suavizado al estado de la bola (0..5 -> 0..1); sin saltos al cambiar de estado.
    const target = Math.min(1, Math.max(0, (ctx?.state ?? 0) / 5));
    const step = dt > 0 ? 1 - Math.exp(-4 * dt) : 0;
    u.uGild.value += (target - u.uGild.value) * step;
  },
  // Baja: la ruta low no compila shader (material estándar con textura horneada); estos valores
  // son los que usaría un fallback de shader en Baja.
  quality: {
    low: { oct: 1, fil: 0, dim: 7, ao: 0, spk: 0 },
    medium: { oct: 2, fil: 1, dim: 7, ao: 1, spk: 0 },
    high: { oct: 3, fil: 1, dim: 9, ao: 1, spk: 1 },
  },
};
