import * as THREE from 'three';

// Lluvia del hoyo 15 (tema cyber2078). Solo visual: este módulo no lo
// importa ni lo lee la simulación. La lluvia es una sola malla de segmentos (una gota = dos
// vértices) y la caída se calcula en la tarjeta gráfica, así que el coste en CPU es fijo.

const RAIN_HALF = { x: 22, z: 26 }; // volumen de lluvia alrededor del centro del hoyo (m)
const RAIN_H = 14; // altura de caída (m)
const RAIN_LEN = 0.9; // largo de la estela (m)
const RAIN_WIND = 0.12; // inclinación horizontal por metro de caída
const RAIN_FALL = 7; // velocidad de caída base (m/s)
const FOOT_PAD = 0.5; // margen alrededor del contorno del campo que queda libre de gotas

// generador con semilla fija: la lluvia es igual en cada carga (no depende de Math.random)
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Lluvia del hoyo. `q` es el preset de quality() (q.rain = número de gotas, 0 = sin lluvia).
 * Ninguna gota cae dentro del contorno del campo (más un margen): la bola nunca queda tapada.
 * Devuelve { update(t) } o null si el nivel no tiene lluvia.
 */
export function createRain(scene, course, q) {
  const n = Math.max(0, Math.floor(q?.rain ?? 0));
  if (!n) return null;
  const rng = seeded(4242);
  const xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const inside = (x, z) => x > b.minX - FOOT_PAD && x < b.maxX + FOOT_PAD && z > b.minZ - FOOT_PAD && z < b.maxZ + FOOT_PAD;

  const position = new Float32Array(n * 2 * 3);
  const seed = new Float32Array(n * 2 * 4);
  const tail = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let x, z;
    do {
      x = cx + (rng() * 2 - 1) * RAIN_HALF.x;
      z = cz + (rng() * 2 - 1) * RAIN_HALF.z;
    } while (inside(x, z));
    const phase = rng(), speed = 0.8 + rng() * 0.5, bright = 0.45 + rng() * 0.55;
    for (let v = 0; v < 2; v++) {
      const k = i * 2 + v;
      position.set([x, 0, z], k * 3);
      seed.set([phase, speed, bright, 0], k * 4);
      tail[k] = v;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uH: { value: RAIN_H },
      uLen: { value: RAIN_LEN },
      uWind: { value: RAIN_WIND },
      uFall: { value: RAIN_FALL },
      uOpacity: { value: 0.32 },
      uColor: { value: new THREE.Color(0xbfe9ff) },
    },
    vertexShader: `
      attribute vec4 aSeed;
      attribute float aTail;
      uniform float uTime, uH, uLen, uWind, uFall, uOpacity;
      varying float vA;
      void main() {
        // cabeza de la gota: cae de uH a 0 y vuelve arriba; la cola va por encima y hacia atrás
        float fall = mod(aSeed.x * uH + uTime * aSeed.y * uFall, uH);
        float y = uH - fall;
        float s = aTail * uLen;
        vec3 p = vec3(position.x - uWind * s, y + s, position.z - uWind * s);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        // se apaga al tocar el suelo, al acercarse a la cámara y en la distancia (sin manchar la vista)
        float fade = smoothstep(0.0, 0.6, y) * smoothstep(1.2, 3.0, dist) * (1.0 - smoothstep(34.0, 46.0, dist));
        vA = (1.0 - aTail) * aSeed.z * fade * uOpacity;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vA;
      void main() { gl_FragColor = vec4(uColor, vA); }`,
    transparent: true,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false; // los vértices se mueven en el sombreador: la caja de la malla no sirve
  lines.renderOrder = 2;
  scene.add(lines);
  return {
    update(t) {
      mat.uniforms.uTime.value = t;
    },
  };
}
