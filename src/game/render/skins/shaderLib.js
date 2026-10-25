// Biblioteca GLSL compartida por los materiales de skin premium (docs/skins-premium-plan.md, d).
// Todo trabaja en espacio de objeto sobre la esfera unitaria (`vObjPos`): sin costuras ni polos.

/** Uniforms comunes (valores por defecto; skinMaterial los clona por material). */
export const COMMON_UNIFORMS = {
  uTime: 0,
  uSpeed: 0,
  uImpact: 0,
  uWear: 0,
  uSeed: 0,
  uState: 0,
  uQuality: 1,
  uReveal: 1,
};

export const GLSL_COMMON_DECL = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uImpact;
uniform float uWear;
uniform float uSeed;
uniform float uState;
uniform float uQuality;
uniform float uReveal;
uniform vec3 uRevealColor;
uniform vec3 uUnder;
uniform vec3 uPalBase;
uniform vec3 uPalAccent;
uniform vec3 uPalSecondary;
uniform vec3 uPalGlow;
varying vec3 vObjPos;
varying vec3 vObjX;
varying vec3 vObjY;
varying vec3 vObjZ;
// Salidas del patrón / desgaste (se inicializan antes de cada llamada)
float sk_dRough;
float sk_dMetal;
vec3 sk_emis;
vec3 sk_nPert;
float sk_wearMask;
`;

export const GLSL_LIB = /* glsl */ `
float sk_hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 sk_hash3(vec3 p) {
  vec3 q = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453123);
}
float sk_noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sk_hash(i), sk_hash(i + vec3(1, 0, 0)), f.x), mix(sk_hash(i + vec3(0, 1, 0)), sk_hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(sk_hash(i + vec3(0, 0, 1)), sk_hash(i + vec3(1, 0, 1)), f.x), mix(sk_hash(i + vec3(0, 1, 1)), sk_hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// Octavas: constante en tiempo de compilación (el bucle se desenrolla).
float sk_fbm3(vec3 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * sk_noise3(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}
// Voronoi 3D: x = distancia al punto más cercano, y = distancia a la arista (d2 - d1), z = id de celda (0..1)
vec3 sk_voronoi3(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = sk_hash3(ip + g);
        vec3 r = g + o - fp;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = o.x; }
        else if (d < d2) { d2 = d; }
      }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, id);
}
float sk_fresnel(vec3 n, vec3 v, float power) {
  return pow(1.0 - clamp(dot(normalize(n), normalize(v)), 0.0, 1.0), power);
}
// Gradiente del ruido para perturbar la normal (diferencias finitas, 3 muestras extra)
vec3 sk_noiseGrad(vec3 p, float e) {
  float c = sk_noise3(p);
  return vec3(sk_noise3(p + vec3(e, 0, 0)) - c, sk_noise3(p + vec3(0, e, 0)) - c, sk_noise3(p + vec3(0, 0, e)) - c) / e;
}
`;

// Desgaste: arañazos y rozaduras por ruido 3D semillado. Revela la «subcapa» (finish.underlayer).
export const GLSL_WEAR = /* glsl */ `
void sk_applyWear(vec3 p, inout vec4 diffuse) {
  sk_wearMask = 0.0;
  if (uWear < 0.002) return;
  vec3 q = p * 4.0 + uSeed * 1.37;
  float scuff = sk_fbm3(q, 3);
  // arañazos finos: crestas de ruido alargado
  float s = abs(sk_noise3(vec3(p.x * 26.0, p.y * 3.0, p.z * 26.0) + uSeed) - 0.5);
  float scratch = 1.0 - smoothstep(0.0, 0.035, s);
  float thr = 1.0 - uWear * 0.55;
  float m = smoothstep(thr, thr + 0.12, scuff) * 0.85 + scratch * smoothstep(0.15, 0.7, uWear) * 0.6;
  m = clamp(m * (0.35 + uWear), 0.0, 1.0);
  sk_wearMask = m;
  diffuse.rgb = mix(diffuse.rgb, uUnder * (0.75 + 0.25 * scuff), m * 0.8);
  sk_dRough += m * 0.5;
  sk_dMetal -= m * 0.6;
}
`;

// Disolución de reveal: borde emisivo del color de tier. No-op con uReveal >= 1.
export const GLSL_REVEAL = /* glsl */ `
void sk_applyReveal(vec3 p) {
  if (uReveal >= 0.999) return;
  float n = sk_fbm3(p * 3.0 + uSeed, 3);
  float edge = uReveal * 1.25 - 0.1 - n;
  if (edge < 0.0) discard;
  float rim = 1.0 - smoothstep(0.0, 0.12, edge);
  sk_emis += uRevealColor * rim * 4.0;
}
`;

export const DEFAULT_PATTERN_FN = /* glsl */ `
void skinPattern(vec3 p, inout vec4 diffuse) {}
`;

/** Declaración GLSL de los uniforms propios de un patrón (tipo deducido del valor). */
export function declareUniforms(uniforms) {
  let out = '';
  for (const [name, u] of Object.entries(uniforms ?? {})) {
    const v = u?.value;
    let type = 'float';
    if (v && v.isColor) type = 'vec3';
    else if (v && v.isVector2) type = 'vec2';
    else if (v && v.isVector3) type = 'vec3';
    else if (v && v.isVector4) type = 'vec4';
    else if (v && v.isMatrix3) type = 'mat3';
    else if (v && v.isTexture) type = 'sampler2D';
    else if (typeof v === 'boolean') type = 'bool';
    out += `uniform ${type} ${name};\n`;
  }
  return out;
}
