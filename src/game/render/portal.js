import * as THREE from 'three';

// Portales: espiral de plasma en el suelo con un neón contenido y una
// luminiscencia que tiembla como el aire sobre el asfalto caliente. La
// deformación solo afecta a la luz que sale del portal (se deforma el propio
// campo de luz), nunca al resto de la escena.

const NOISE = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += noise3(p) * a; p = p * 2.03 + 11.7; a *= 0.5; }
    return v / 0.9375;
  }
  // ola de calor: desplazamiento que sube y ondula con el tiempo
  vec2 heatWarp(vec2 p, float t) {
    return vec2(
      fbm3(vec3(p * 2.6, t * 0.9) + vec3(0.0, -t * 1.4, 0.0)),
      fbm3(vec3(p * 2.6 + 5.3, t * 0.9 + 3.1) + vec3(0.0, -t * 1.4, 0.0))) - 0.5;
  }
`;

/** Espiral de plasma en el suelo y halo que se derrama sobre el césped. */
function plasmaMaterial(color, time, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) }, uSeed: { value: seed } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSeed;
      varying vec2 vP;
      ${NOISE}
      void main() {
        float t = uTime + uSeed * 13.0;
        vec2 p = vP; // en radios del portal: el borde está en 1
        float d = length(p);
        float a = atan(p.y, p.x);

        // espiral: cuatro brazos logarítmicos que giran hacia dentro
        float swirl = a * 4.0 + log(max(d, 0.03)) * 5.5 + t * 2.2;
        // plasma turbulento que viaja por los brazos
        float ca = cos(t * 0.6 + 2.2 / (d + 0.35)), sa = sin(t * 0.6 + 2.2 / (d + 0.35));
        vec2 q = mat2(ca, -sa, sa, ca) * p;
        float plasma = fbm3(vec3(q * 2.4, t * 0.45));
        float arm = 0.5 + 0.5 * sin(swirl + (plasma - 0.5) * 4.0);
        float filament = pow(arm, 5.0);
        float sheath = pow(arm, 1.6) * 0.35;
        // hebras finas que se retuercen entre los brazos, como descargas de plasma
        float turb = fbm3(vec3(q * 6.0, t * 1.1));
        float strand = pow(0.5 + 0.5 * sin(swirl * 2.0 - t * 1.3 + turb * 7.0), 14.0) * 0.6;
        filament = filament * (0.6 + 0.8 * turb) + strand * smoothstep(0.25, 0.6, d);

        float inside = smoothstep(1.0, 0.82, d);
        float eye = smoothstep(0.05, 0.32, d); // ojo oscuro en el centro del vórtice
        float spiral = (filament + sheath) * inside * eye * (0.55 + 0.75 * plasma);
        float core = exp(-d * d * 18.0) * 0.35 * (0.8 + 0.2 * sin(t * 3.0));
        float rim = exp(-pow((d - 0.97) * 14.0, 2.0)) * 0.55;

        // halo: la luz que sale del portal, deformada por la ola de calor
        vec2 w = heatWarp(p * 0.8, t);
        float dh = length(p + w * 0.35 * smoothstep(0.7, 1.6, d));
        float halo = exp(-max(dh - 0.95, 0.0) * 3.4) * (1.0 - inside * 0.6);
        halo *= 0.28 * (0.85 + 0.3 * fbm3(vec3(p * 3.0, t * 1.3)));

        vec3 hot = mix(uColor, vec3(1.0), 0.55);
        vec3 col = uColor * (spiral * 0.75 + rim + halo) + hot * (filament * inside * eye * 0.22 + core);
        col *= smoothstep(1.9, 1.35, d); // fundido al borde del disco
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Columna de luz que sube del portal. Los rayos y el borde superior se
 * deforman con un campo de ruido que asciende (ola de calor) y la malla
 * ondula un poco, así que el aire luminoso tiembla.
 */
function hazeMaterial(color, time, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(color) }, uSeed: { value: seed } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vFacing;
      ${NOISE}
      void main() {
        vUv = uv;
        float t = uTime + uSeed * 13.0;
        vec3 pos = position;
        // la columna respira y se tuerce con el calor, más cuanto más arriba
        float n = noise3(vec3(pos.xz * 3.0, pos.y * 2.0 - t * 1.6)) - 0.5;
        pos.xz *= 1.0 + n * 0.35 * uv.y;
        pos.x += sin(pos.y * 4.0 - t * 2.3) * 0.025 * uv.y;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vec3 nrm = normalize(mat3(modelMatrix) * normal);
        vFacing = abs(dot(nrm, normalize(cameraPosition - world.xyz)));
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vFacing;
      ${NOISE}
      void main() {
        float t = uTime + uSeed * 13.0;
        float ang = vUv.x * 6.2831853;
        vec2 ring = vec2(cos(ang), sin(ang)) * 1.4;
        float h = vUv.y;
        // ola de calor: el campo de luz se desplaza con ruido que sube
        vec3 hp = vec3(ring, h * 3.2 - t * 1.5);
        vec2 warp = vec2(fbm3(hp), fbm3(hp + 7.3)) - 0.5;
        float hw = h + warp.y * (0.12 + h * 0.35);
        float rays = 0.55 + 0.45 * sin(ang * 7.0 + warp.x * 6.0 + noise3(vec3(ring * 2.0, h * 1.5 - t * 0.6)) * 4.0);
        float fall = exp(-max(hw, 0.0) * 3.2) * smoothstep(0.0, 0.06, h);
        float shimmer = 0.75 + 0.5 * fbm3(vec3(ring * 3.0, h * 6.0 - t * 2.4));
        float a = fall * rays * shimmer * pow(vFacing, 1.3);
        gl_FragColor = vec4(uColor * a * 0.42, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Portal en el suelo. `time` es un uniform compartido por todos los portales
 * de la pista; basta con actualizar su valor cada fotograma.
 */
export function buildPortal(scene, [x, z], r, color, y, time, seed = 0) {
  const g = new THREE.Group();
  // fondo oscuro para que la espiral se lea también sobre césped claro
  const well = new THREE.Mesh(
    new THREE.CircleGeometry(r, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.06), transparent: true, opacity: 0.94, depthWrite: false }),
  );
  well.rotation.x = -Math.PI / 2;
  well.position.y = 0.005;
  // la espiral se dibuja en radios del portal (borde en 1) y el halo llega a ~1.9
  const plasmaGeo = new THREE.CircleGeometry(1.9, 64);
  const plasma = new THREE.Mesh(plasmaGeo, plasmaMaterial(color, time, seed));
  plasma.rotation.x = -Math.PI / 2;
  plasma.scale.setScalar(r);
  plasma.position.y = 0.008;
  plasma.renderOrder = 2;
  // aro fino de neón, sin pasarse de intensidad
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.03, 10, 48),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.35 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.022;
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.98, 1.5, 40, 12, true), hazeMaterial(color, time, seed));
  haze.position.y = 0.75;
  haze.renderOrder = 3;
  const light = new THREE.PointLight(color, 1.4, 3, 1.5);
  light.position.y = 0.35;
  g.add(well, plasma, ring, haze, light);
  g.position.set(x, y, z);
  scene.add(g);
  return {
    update(t) {
      // la luz del portal parpadea suavemente al ritmo del plasma
      light.intensity = 1.4 + Math.sin(t * 3.1 + seed * 5) * 0.18 + Math.sin(t * 7.3 + seed) * 0.08;
    },
  };
}
