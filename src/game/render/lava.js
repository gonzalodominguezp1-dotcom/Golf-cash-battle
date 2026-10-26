import * as THREE from 'three';

// Lava que fluye: ruido que se desplaza hacia flow, con costra oscura que se
// rompe y vetas al rojo. Va en coordenadas del mundo para que los trozos de
// un mismo río encajen. Por encima de 1 el resplandor (bloom) la recoge.
// scale: tamaño de las manchas (más bajo, más grandes); heat: cuánta parte
// está al rojo (los ríos más que el lago, que es sobre todo costra).
const VERT = `varying vec2 vP;
  #include <fog_pars_vertex>
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAG = `uniform float uTime; uniform vec2 uFlow; uniform float uScale; uniform float uHeat; varying vec2 vP;
  #include <fog_pars_fragment>
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    vec2 p = vP * uScale - uFlow * uTime * 0.4;
    float n = fbm(p * 0.9);
    float m = fbm(p * 2.2 + vec2(n * 2.0, -n) + uFlow * uTime * 0.2) + uHeat;
    // costra casi negra, magma naranja y, en las vetas, amarillo
    vec3 col = mix(vec3(0.07, 0.015, 0.01), vec3(1.1, 0.26, 0.03), smoothstep(0.42, 0.7, m));
    col = mix(col, vec3(1.6, 0.75, 0.16), smoothstep(0.72, 0.92, m));
    col *= 0.9 + 0.12 * sin(uTime * 2.2 + vP.x * 0.8 + vP.y * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

export function lavaMaterial({ flow = [0, 0], scale = 1, heat = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uFlow: { value: new THREE.Vector2(...flow) }, uScale: { value: scale }, uHeat: { value: heat } },
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
}
