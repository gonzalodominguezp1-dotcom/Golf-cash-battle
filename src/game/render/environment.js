import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roughTone, softDotTexture } from './textures.js';
import { addWind, bakeStatic } from './batch.js';
import { quality } from './quality.js';
import { lavaMaterial } from './lava.js';
import { CUP_R } from '../physics.js';
import {
  getCyberGridTexture,
  makeHoloCrystal,
  makeCyberPylon,
  setupCyberpunkEnvironment,
} from './cyberpunkEnvironment.js';

// tiempo compartido por los sombreadores animados (viento, agua)
const windUniforms = { uTime: { value: 0 } };
// altura del terreno junto a una pista a ras de suelo (el green está a 0)
const GROUND_Y = -0.04;

// Cielo, terreno, agua y decorado low-poly alrededor del hoyo.

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1, z * 2.1) * 0.28 + noise(x * 4.3, z * 4.3) * 0.12;

/** Rectángulo que ocupa el hoyo (con sus zonas elevadas; maxY es la más alta). */
export function courseBounds(course) {
  const pts = [course.outline, ...(course.tiers ?? []).map((t) => t.poly)].flat();
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const maxY = Math.max(0, ...(course.tiers ?? []).map((t) => t.h));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), maxY };
}

/**
 * El volcán del hoyo de la caldera: elipse que rodea la cámara (el contorno)
 * con margen. q(x, z) es 1 en la pared de dentro y crece hacia fuera.
 */
const RIM = 9; // altura del borde del cráter sobre el suelo de la cámara
const FOOT = -7; // donde la ladera llega al suelo de fuera
function volcanoShape(course) {
  const xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 3, rz = (Math.max(...zs) - Math.min(...zs)) / 2 + 3;
  const q = (x, z) => Math.hypot((x - cx) / rx, (z - cz) / rz);
  // ladera de fuera: del borde (q = 1.22, y = RIM) al pie (q = 2.8, y = FOOT)
  const slope = (qq) => RIM - ((qq - 1.22) / (2.8 - 1.22)) * (RIM - FOOT);
  return { cx, cz, rx, rz, q, slope };
}

function distToBounds(b, x, z) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

export function buildEnvironment(scene, course, theme, rng) {
  const bounds = courseBounds(course);
  const animated = [(t) => (windUniforms.uTime.value = t)];
  const q = quality();
  // todo lo que no se mueve va aquí y al final se junta en pocas mallas
  const decor = new THREE.Group();
  const isNeon = !!theme.neon;
  // pista a ras de suelo: el terreno llega plano hasta las paredes (ver course.grounded)
  const grounded = !!course.grounded && !isNeon;

  // --- cielo con degradado y sol ---
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(theme.skyTop) },
        horizon: { value: new THREE.Color(theme.skyHorizon) },
        sunColor: { value: new THREE.Color(theme.sunColor) },
        sunDir: { value: sunDir },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(theme.skyHorizon, 40, 120);

  // --- luces ---
  scene.add(new THREE.HemisphereLight(theme.skyHorizon, theme.groundMid, theme.ambient));
  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sun.castShadow = q.shadows;
  sun.shadow.mapSize.set(q.shadowRes, q.shadowRes);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  // la sombra cubre el hoyo entero (y no más: cuanto más ajustada, más nítida)
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  // a ras de suelo la sombra se queda fija sobre el centro de la pista (shadowAnchor):
  // con una pista larga, centrada en la bola dejaba sin sombras el otro extremo
  const half = grounded ? Math.max(8, span * 0.5 + 2.5) : Math.max(8, span * 0.6 + 2);
  const shadowAnchor = grounded ? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } : null;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 80 });
  scene.add(sun, sun.target);
  // contraluces de color a ambos lados: dan los bordes rosa/cian que hacen vibrar la escena
  if (theme.rim) {
    const night = theme.sunIntensity < 2;
    theme.rim.forEach((color, i) => {
      const rim = new THREE.DirectionalLight(color, night ? 1.4 : theme.glowWalls ? 0.35 : 0.8);
      rim.position.set(i ? 12 : -12, 6, i ? 8 : -10);
      scene.add(rim);
    });
  }

  // --- terreno: colinas suaves con color por altura ---
  const size = 220, seg = 110;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const volcano = theme.caldera ? volcanoShape(course) : null;
  const heightAt = (x, z) => {
    // fuera del volcán: llanura de ceniza con lomas al pie de la montaña
    if (volcano) return FOOT - 0.4 + fbm(x * 0.05, z * 0.05) * 5 * THREE.MathUtils.smoothstep(volcano.q(x, z), 2.8, 4.5);
    const d = distToBounds(bounds, x, z);
    if (isNeon) {
      // Zona del campo y alrededores despejada y plana para garantizar cero fallos de posición (d < 8)
      const ramp = THREE.MathUtils.smoothstep(d, 8, 30);
      // Montañas de estética cyberpunk con crestas y cimas afiladas ("final picudo")
      const nx = x * 0.045, nz = z * 0.045;
      const n1 = noise(nx + 1.7, nz + 3.1);
      const ridge1 = 1.0 - Math.abs(n1 * 2 - 1);
      const n2 = noise(nx * 2.2 + 5.8, nz * 2.2 + 8.4);
      const ridge2 = 1.0 - Math.abs(n2 * 2 - 1);
      // Exponencial para culminar en picos angulares y agujas puntiagudas estilo cyberpunk
      const sharpPeak = Math.pow(ridge1, 2.6) * 16.0 + Math.pow(ridge2, 2.2) * 6.0;
      return theme.terrainOffset - 0.6 + (sharpPeak - 4.5) * ramp;
    }
    if (grounded) {
      // meseta plana junto a la pista (la rejilla es de 2 m: con margen para no
      // asomar entre las paredes) y luego lomas suaves hasta las mismas colinas de
      // fondo que el resto de hoyos, sin bajar hacia el agua
      let far = theme.terrainOffset * 0.7 - 1.25 + fbm(x * 0.06, z * 0.06) * 9;
      // colinas en terrazas: tramos llanos con escalones cortos entre ellos
      if (theme.terraces) {
        const step = 1.8, k = Math.floor(far / step);
        far = (k + THREE.MathUtils.smoothstep(far / step - k, 0.72, 0.9)) * step;
      }
      return GROUND_Y + (far - GROUND_Y) * THREE.MathUtils.smoothstep(d, 3.2, 26);
    }
    const ramp = THREE.MathUtils.smoothstep(d, 2, 16);
    return theme.terrainOffset * (1 - ramp * 0.3) - 0.55 + fbm(x * 0.06, z * 0.06) * 9 * ramp - 2.2 * ramp + ramp * ramp * 1.5;
  };
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  if (grounded && !course.noCup) {
    // sin losa debajo, el terreno se vería dentro del agujero: se hunden los
    // vértices de las celdas que tocan el hoyo (quedan tapados por el green)
    const [hx, hz] = course.cup, cell = size / seg + CUP_R + 0.02;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - hx) < cell && Math.abs(pos.getZ(i) - hz) < cell) pos.setY(i, -0.6);
  }
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(theme.groundLow), mid = new THREE.Color(theme.groundMid), high = new THREE.Color(theme.groundHigh);
  // prado junto a la pista: enlaza con el antegreen
  const lawn = grounded ? roughTone(theme).multiplyScalar(0.6) : null;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (isNeon) {
      // Gradiente oscuro de aleación metálica con aristas de neón en los picos altos
      const peakH = THREE.MathUtils.clamp((y + 0.5) / 12, 0, 1);
      c.setHex(theme.groundLow ?? 0x090b16);
      c.lerp(new THREE.Color(theme.groundMid ?? 0x141828), peakH * 0.8);
      if (peakH > 0.6) {
        c.lerp(new THREE.Color(theme.neon[0]), (peakH - 0.6) * 0.7);
      }
      c.toArray(colors, i * 3);
      continue;
    }
    // la orilla pasa a arena con un degradado, no de golpe
    const shore = THREE.MathUtils.smoothstep(y, theme.waterLevel + 0.2, theme.waterLevel + 0.7);
    if (y < 2.5) c.copy(mid).lerp(high, THREE.MathUtils.clamp((y - 0.5) / 3, 0, 1));
    else c.copy(high).lerp(new THREE.Color(0x8a8f86), THREE.MathUtils.clamp((y - 4) / 4, 0, 0.7));
    c.lerp(low, 1 - shore);
    if (lawn) c.lerp(lawn, 0.85 * (1 - THREE.MathUtils.smoothstep(distToBounds(bounds, x, z), 1.5, 9)));
    // manchas grandes y suaves: prados más claros y más oscuros
    c.offsetHSL(0, 0, (noise(x * 0.15 + 3, z * 0.15) - 0.5) * 0.08 + (hash(x, z) - 0.5) * 0.015);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMat = isNeon
    ? new THREE.MeshStandardMaterial({
        map: getCyberGridTexture(theme.neon[0], theme.groundLow ?? 0x070814),
        color: 0x14182a,
        roughness: 0.45,
        metalness: 0.65,
        flatShading: true,
        vertexColors: true,
      })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // --- agua ---
  if (volcano) {
    // dentro del volcán hay un lago de lava de verdad (costra que se mueve y se
    // rompe); fuera, nada de agua
    const lake = lavaMaterial({ flow: [0.15, 0.1], scale: 0.35, heat: -0.08 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.12, 64), lake);
    disc.rotation.x = -Math.PI / 2;
    disc.scale.set(volcano.rx, volcano.rz, 1);
    disc.position.set(volcano.cx, theme.waterLevel, volcano.cz);
    scene.add(disc);
    animated.push((t) => (lake.uniforms.uTime.value = t));
  } else {
    // las olas se mueven en la tarjeta gráfica (antes se recalculaban en el procesador)
    const waterGeo = new THREE.PlaneGeometry(size, size, 90, 90);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = theme.lava
      ? new THREE.MeshPhongMaterial({ color: theme.water, emissive: 0xff3a0a, emissiveIntensity: 0.9, shininess: 30, flatShading: true })
      : isNeon
      ? new THREE.MeshPhongMaterial({
          color: 0x07091e,
          emissive: theme.neon[1],
          emissiveIntensity: 0.22,
          shininess: 90,
          specular: theme.neon[0],
          transparent: true,
          opacity: 0.88,
          flatShading: true,
        })
      : new THREE.MeshPhongMaterial({ color: theme.water ?? 0x2bb3e6, shininess: 110, specular: 0xffffff, transparent: true, opacity: 0.86, flatShading: true });
    waterShader(waterMat, theme);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = theme.waterLevel;
    // a ras de suelo el terreno no baja hasta el agua: no se dibuja
    if (!grounded) scene.add(water);
    if (theme.lava) animated.push((t) => (water.material.emissiveIntensity = 0.9 + Math.sin(t * 1.7) * 0.25));
    else if (isNeon) animated.push((t) => (water.material.emissiveIntensity = 0.22 + Math.sin(t * 2.2) * 0.06));
  }

  // --- decorado ---
  const place = (minD, maxD, tries, fn) => {
    for (let i = 0; i < Math.round(tries * q.decor); i++) {
      const x = (bounds.minX + bounds.maxX) / 2 + (rng() - 0.5) * 2 * (maxD + 8);
      const z = (bounds.minZ + bounds.maxZ) / 2 + (rng() - 0.5) * 2 * (maxD + 12);
      const d = distToBounds(bounds, x, z);
      const y = heightAt(x, z);
      if (d < minD || d > maxD) continue;
      // nada bajo el agua, ni dentro o encima del volcán
      if (volcano ? volcano.q(x, z) < 2.9 : y < theme.waterLevel + 0.25) continue;
      fn(x, y, z, d);
    }
  };

  if (isNeon) {
    // Props perimetrales minimalistas, elegantes y bien separados del campo
    place(3.0, 12, 12, (x, y, z) => {
      decor.add(makeCyberPylon(x, y, z, theme.neon, rng() > 0.7));
    });
    place(3.5, 14, 8, (x, y, z) => {
      decor.add(makeHoloCrystal(x, y, z, theme.neon, rng, animated));
    });

    // Megaciudad de rascacielos lejanos, searchlights y tráfico aéreo limpio
    setupCyberpunkEnvironment(scene, decor, bounds, theme, rng, animated, q);
  } else {
    const leaves = theme.leaves?.map((color) => addWind(new THREE.MeshLambertMaterial({ color, flatShading: true }), windUniforms, WIND));
    // a ras de suelo nada pisa el antegreen, y detrás del tee queda un claro para la cámara
    const [tx, tz] = course.tee;
    const clear = (x, z) => !grounded || Math.hypot(x - tx, z - tz) > 9;
    place(grounded ? 4.5 : 2.2, 40, 140, (x, y, z) => {
      if (!clear(x, z)) return;
      const tree = makeTree(theme.trees[Math.floor(rng() * theme.trees.length)], rng, x, y, z, leaves);
      // los árboles se mecen con el viento (en el sombreador, ver addWind)
      tree.userData.swayRoot = true;
      decor.add(tree);
    });
    place(grounded ? 2.8 : 1.8, 30, 40, (x, y, z) => clear(x, z) && decor.add(makeRock(rng, x, y, z)));
    if (theme.flowers) place(grounded ? 1.6 : 1.2, 12, 110, (x, y, z) => decor.add(makeFlower(rng, x, y, z)));
    place(grounded ? 1.6 : 1, 14, 90, (x, y, z) => decor.add(makeTuft(rng, x, y, z, theme)));
    if (theme.lanterns) {
      // farolillos alrededor de la pista; solo unos pocos llevan luz real (cada luz cuesta en el móvil)
      const spots = theme.lanterns === 'many' ? perimeterSpots(course, grounded ? 1.7 : 1.3, 3.2) : [];
      if (!spots.length) place(grounded ? 1.7 : 1.2, grounded ? 3.5 : 3, 30, (x, y, z) => spots.length < 4 && spots.push([x, z]));
      const lamps = spots.map(([x, z], i) => {
        const lamp = theme.torches && i % 2 ? makeTorch(x, heightAt(x, z), z, i < 6) : makeLantern(x, heightAt(x, z), z, i, i < 6);
        decor.add(lamp);
        return lamp;
      });
      if (theme.festoon) decor.add(festoon(lamps));
      animated.push((t) => {
        for (const l of lamps) {
          const f = 1 + Math.sin(t * 9 + l.userData.phase) * 0.06 + Math.sin(t * 23 + l.userData.phase * 3) * 0.04;
          if (l.userData.light) l.userData.light.intensity = l.userData.base * f;
          l.userData.halo.material.opacity = 0.55 * f;
          if (l.userData.flame) l.userData.flame.scale.set(1, f * 1.1, 1);
        }
      });
    }
  }
  if (volcano) volcanoShell(scene, course, volcano, animated);
  else if (theme.lava) volcanoBackdrop(scene, course, bounds, heightAt, animated, rng);
  if (theme.mountains) distantMountains(scene, theme.mountains, rng);

  // --- nubes ---
  // nubes de algodón (solo para temas naturales, no en neón cyberpunk)
  if (theme.clouds && !isNeon) {
    // de día (lowClouds): más bajas, más gordas y de un blanco que apenas se sombrea
    const low = !!theme.lowClouds;
    const cloudMat = new THREE.MeshLambertMaterial({ color: theme.clouds, emissive: theme.clouds, emissiveIntensity: low ? 0.45 : 0.3 });
    const clouds = [];
    for (let i = 0; i < 12; i++) {
      const n = 3 + Math.floor(rng() * 4);
      const parts = [];
      for (let k = 0; k < n; k++) {
        const r = (1.5 + rng() * 2) * (low ? 1.5 : 1);
        const geo = new THREE.IcosahedronGeometry(r, 2);
        geo.scale(1, 0.62, 1);
        // la parte central más alta: forma de cúmulo
        geo.translate(k * 2 - n, rng() * 1 + (k > 0 && k < n - 1 ? 0.6 : 0), rng() * 1.5);
        parts.push(geo);
      }
      const g = new THREE.Mesh(mergeGeometries(parts), cloudMat);
      const a = rng() * Math.PI * 2, r = low ? 45 + rng() * 55 : 50 + rng() * 60;
      g.position.set(Math.cos(a) * r, low ? 11 + rng() * 14 : 18 + rng() * 22, Math.sin(a) * r);
      g.userData.speed = 0.4 + rng() * 0.6;
      clouds.push(g);
      scene.add(g);
    }
    animated.push((t, dt) => {
      for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 120) cl.position.x = -120;
      }
    });
  }

  if (theme.stars) {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, y = 0.12 + rng() * 0.88, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 170, y * 170, Math.sin(a) * r * 170], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, fog: false, transparent: true }));
    scene.add(stars);
    if (!isNeon) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1dc, fog: false }));
      moon.position.copy(sunDir).multiplyScalar(160);
      scene.add(moon);
    }
    animated.push((t) => (stars.material.opacity = 0.75 + Math.sin(t * 2) * 0.2));
  }

  // nieve que cae, hojas, luciérnagas o brasas que suben
  const fl = theme.floaters ?? (theme.snowfall ? { color: 0xffffff, count: 600, size: 0.07, speed: -0.6 } : null);
  if (fl) {
    const n = fl.count, H = 14;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(rng() - 0.5) * 40, rng() * H, (rng() - 0.5) * 40], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: fl.color, size: fl.size, transparent: true, opacity: 0.9, depthWrite: false });
    if (fl.glow) mat.blending = THREE.AdditiveBlending;
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    animated.push((t, dt) => {
      const p = g.attributes.position;
      for (let i = 0; i < n; i++) {
        let y = p.getY(i) + dt * fl.speed * (1 + (i % 5) * 0.2);
        if (y < 0) y += H;
        if (y > H) y -= H;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t + i) * dt * 0.25);
        p.setZ(i, p.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.15);
      }
      p.needsUpdate = true;
      if (fl.glow) mat.opacity = 0.7 + Math.sin(t * 3) * 0.25;
    });
  }

  bakeStatic(decor, scene);
  return { sun, sunDir, shadowAnchor, update: (t, dt) => animated.forEach((f) => f(t, dt)) };
}

const WIND = 0.025;

/**
 * Olas en el sombreador: el agua sube y baja con dos ondas cruzadas y una
 * franja de espuma clara donde toca la orilla (agua poco profunda = cerca de
 * la costa, que aquí se aproxima con el ruido de las olas).
 */
function waterShader(material, theme) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWave;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w1 = sin(position.x * 0.35 + uTime * 1.3) * 0.08;
        float w2 = cos(position.z * 0.4 + uTime * 1.1) * 0.08;
        float w3 = sin((position.x + position.z) * 0.9 + uTime * 2.1) * 0.025;
        transformed.y += w1 + w2 + w3;
        vWave = (w1 + w2 + w3) * 5.0;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWave;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        // crestas más claras
        gl_FragColor.rgb += vec3(${theme.lava ? '0.25, 0.08, 0.0' : theme.neon ? '0.25, 0.05, 0.3' : '0.12, 0.16, 0.18'}) * smoothstep(0.35, 0.8, vWave);`,
      );
  };
  material.customProgramCacheKey = () => 'water' + (theme.lava ? 'lava' : theme.neon ? 'neon' : '');
}

const leafMats = [0x2f9e44, 0x3bb54a, 0x25803a, 0x4cc25a].map((color) => addWind(new THREE.MeshLambertMaterial({ color, flatShading: true }), windUniforms, WIND));
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
const snowMat = addWind(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), windUniforms, WIND);
const frondMat = addWind(new THREE.MeshLambertMaterial({ color: 0x3bb54a, side: THREE.DoubleSide, flatShading: true }), windUniforms, WIND * 1.6);
const cocoMat = new THREE.MeshLambertMaterial({ color: 0x6b4423, flatShading: true });
const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4f9e3c, flatShading: true });
const deadMat = new THREE.MeshLambertMaterial({ color: 0x3a2a26, flatShading: true });
const mesaMat = new THREE.MeshLambertMaterial({ color: 0xb8653a, flatShading: true });

function shadowAll(g) {
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

function makeTree(kind, rng, x, y, z, leaves = leafMats) {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.9;
  const leaf = leaves[Math.floor(rng() * leaves.length)];
  if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.9, 8), trunkMat);
    trunk.position.y = 0.45;
    g.add(trunk);
    // cuatro pisos de ramas con el borde dentado
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(jaggedCone(1.05 - i * 0.22, 0.95, 12, rng), leaf);
      cone.position.y = 0.95 + i * 0.48;
      cone.rotation.y = rng() * 6;
      g.add(cone);
    }
  } else if (kind === 'palm') {
    let py = 0, px = 0;
    const lean = (rng() - 0.5) * 0.25;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.008, 0.14 - i * 0.008, 0.5, 8), trunkMat);
      seg.position.set(px, py + 0.25, 0);
      seg.rotation.z = -lean * i * 0.4;
      g.add(seg);
      py += 0.48;
      px += lean * i * 0.2;
    }
    for (let i = 0; i < 8; i++) {
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 4, 3, true), frondMat);
      fr.scale.set(1, 1, 0.25);
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      pivot.rotation.y = (i / 8) * Math.PI * 2;
      fr.position.set(0.8, -0.25, 0);
      fr.rotation.set(0, 0, -1.9);
      pivot.add(fr);
      g.add(pivot);
    }
    for (let k = 0; k < 3; k++) {
      const coco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), cocoMat);
      coco.position.set(px + Math.cos(k * 2.1) * 0.12, py - 0.12, Math.sin(k * 2.1) * 0.12);
      g.add(coco);
    }
  } else if (kind === 'snowpine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), trunkMat);
    trunk.position.y = 0.4;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(jaggedCone(1 - i * 0.25, 1.1, 12, rng), leafMats[2]);
      cone.position.y = 1 + i * 0.6;
      const snow = new THREE.Mesh(jaggedCone(0.62 - i * 0.15, 0.55, 12, rng), snowMat);
      snow.position.y = 1.3 + i * 0.6;
      g.add(cone, snow);
    }
  } else if (kind === 'cactus') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.4, 6, 12), cactusMat);
    body.position.y = 0.9;
    g.add(body);
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      const h = 0.7 + rng() * 0.5;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 6, 10), cactusMat);
      arm.position.set(side * 0.45, h + 0.25, 0);
      const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.25, 6, 10), cactusMat);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.set(side * 0.28, h, 0);
      g.add(arm, elbow);
    }
  } else if (kind === 'deadtree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.8, 5), deadMat);
    trunk.position.y = 0.9;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.8, 4), deadMat);
      const a = (i / 3) * Math.PI * 2 + rng();
      br.position.set(Math.cos(a) * 0.25, 1.2 + i * 0.2, Math.sin(a) * 0.25);
      br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      g.add(br);
    }
  } else if (kind === 'rockpile') {
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.6 + rng() * 0.6, 1), rng, 0.18), mesaMat);
      r.position.set((rng() - 0.5) * 1.2, 0.3 + i * 0.5, (rng() - 0.5) * 1.2);
      r.scale.y = 0.7;
      g.add(r);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.2, 8), trunkMat);
    trunk.position.y = 0.6;
    g.add(trunk);
    // dos ramas y una copa de varias bolas abultadas
    for (const side of [-1, 1]) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.6, 6), trunkMat);
      br.position.set(side * 0.18, 1.05, 0);
      br.rotation.z = -side * 0.7;
      g.add(br);
    }
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng();
      const blob = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.55 + rng() * 0.3, 1), rng, 0.12), leaf);
      blob.position.set(Math.cos(a) * 0.38, 1.45 + rng() * 0.35, Math.sin(a) * 0.38);
      g.add(blob);
    }
    const crown = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.7, 1), rng, 0.12), leaf);
    crown.position.y = 1.95;
    g.add(crown);
  }
  g.position.set(x, y - 0.05, z);
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  return shadowAll(g);
}

const rockMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a0, flatShading: true });
function makeRock(rng, x, y, z) {
  const m = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.3 + rng() * 0.6, 1), rng, 0.22), rockMat);
  m.position.set(x, y + 0.1, z);
  m.scale.set(1, 0.6 + rng() * 0.4, 1 + rng() * 0.4);
  m.rotation.set(rng(), rng() * 3, rng());
  m.castShadow = m.receiveShadow = true;
  return m;
}

const petalMats = [0xff5e7e, 0xffd23f, 0xffffff, 0xb27cff, 0xff8a3d].map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
const stemMat = new THREE.MeshLambertMaterial({ color: 0x2f8f3a });
const heartMat = new THREE.MeshLambertMaterial({ color: 0xffc93d });
function makeFlower(rng, x, y, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), stemMat);
  stem.position.y = 0.15;
  g.add(stem);
  // cinco pétalos alrededor de un botón
  const petal = petalMats[Math.floor(rng() * petalMats.length)];
  for (let k = 0; k < 5; k++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), petal);
    const a = (k / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.055, 0.31, Math.sin(a) * 0.055);
    p.scale.set(1, 0.35, 0.7);
    p.rotation.y = -a;
    g.add(p);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), heartMat);
  heart.position.y = 0.32;
  g.add(heart);
  g.position.set(x, y, z);
  g.rotation.y = rng() * 6;
  return g;
}

// Matas de hierba alta alrededor de la pista: varias hojas finas
const tuftMats = new Map();
function makeTuft(rng, x, y, z, theme) {
  if (!tuftMats.has(theme.groundHigh)) tuftMats.set(theme.groundHigh, addWind(new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.groundHigh).multiplyScalar(0.85), flatShading: true }), windUniforms, WIND * 3));
  const mat = tuftMats.get(theme.groundHigh);
  const g = new THREE.Group();
  const n = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3 + rng() * 0.25, 3), mat);
    const a = rng() * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.06, 0.15, Math.sin(a) * 0.06);
    blade.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(blade);
  }
  g.userData.swayRoot = true;
  g.position.set(x, y - 0.02, z);
  return g;
}

/** Cono con el borde de abajo en dientes de sierra (ramas de abeto). */
function jaggedCone(r, h, n, rng) {
  const geo = new THREE.ConeGeometry(r, h, n, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > -h / 2 + 0.01) continue;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = Math.round((a / (Math.PI * 2)) * n) % 2 ? 1.12 : 0.9;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    p.setY(i, y - (k > 1 ? 0.08 : 0) - rng() * 0.03);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Abolla una esfera para que parezca roca o copa de árbol, no una pelota. */
function lumpy(geo, rng, amount) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    // los vértices repetidos se mueven igual para no abrir grietas
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 1 + (rng() - 0.5) * amount * 2);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const LANTERN_COLORS = [0xff4a3d, 0xffb020, 0xff5fb0, 0xffe066, 0x5fd8ff];
const lampPostMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
const paperMats = new Map();
const torchPoleMat = new THREE.MeshLambertMaterial({ color: 0x7a4a24, flatShading: true });
const torchCupMat = new THREE.MeshLambertMaterial({ color: 0x4a2c14, flatShading: true });

// Puntos alrededor del contorno de la pista, separados `gap` y a `off` del borde.
function perimeterSpots(course, off, gap) {
  const b = courseBounds(course);
  const pts = [];
  const minX = b.minX - off, maxX = b.maxX + off, minZ = b.minZ - off, maxZ = b.maxZ + off;
  const edge = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / gap));
    for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  edge(minX, maxZ, maxX, maxZ);
  edge(maxX, maxZ, maxX, minZ);
  edge(maxX, minZ, minX, minZ);
  edge(minX, minZ, minX, maxZ);
  return pts;
}

function haloSprite(color, size) {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(size);
  return halo;
}

// Farol de jardín con farolillo de papel de color colgando
function makeLantern(x, y, z, i = 0, lit = true) {
  const g = new THREE.Group();
  const color = LANTERN_COLORS[i % LANTERN_COLORS.length];
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 8), lampPostMat);
  post.position.y = 0.75;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), post.material);
  arm.position.set(0.18, 1.48, 0);
  if (!paperMats.has(color)) paperMats.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.6 }));
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), paperMats.get(color));
  paper.scale.y = 1.25;
  paper.position.set(0.34, 1.26, 0);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 10), post.material);
  capTop.position.set(0.34, 1.48, 0);
  const halo = haloSprite(color, 1.3);
  halo.position.copy(paper.position);
  g.add(post, arm, paper, capTop, halo);
  g.userData = { halo, phase: i * 1.7 };
  if (lit) {
    const light = new THREE.PointLight(color, 3.2, 6.5, 1.4);
    light.position.copy(paper.position);
    g.add(light);
    Object.assign(g.userData, { light, base: light.intensity });
  }
  g.position.set(x, y, z);
  return g;
}

// Antorcha tiki con llama que parpadea
function makeTorch(x, y, z, lit = true) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 6), torchPoleMat);
  pole.position.y = 0.7;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.22, 8), torchCupMat);
  cup.position.y = 1.45;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
  flame.geometry.translate(0, 0.16, 0);
  flame.position.y = 1.55;
  flame.userData.keep = true; // se anima: no se junta con el resto
  const halo = haloSprite(0xff7a20, 1.4);
  halo.position.y = 1.7;
  g.add(pole, cup, flame, halo);
  g.userData = { halo, flame, phase: x * 3 + z };
  if (lit) {
    const light = new THREE.PointLight(0xff8a30, 3, 6, 1.4);
    light.position.y = 1.7;
    g.add(light);
    Object.assign(g.userData, { light, base: light.intensity });
  }
  g.position.set(x, y, z);
  return g;
}

// Guirnalda de bombillas colgando entre farolillo y farolillo
function festoon(lamps) {
  const g = new THREE.Group();
  const bulbGeo = new THREE.SphereGeometry(0.045, 6, 4);
  const mats = LANTERN_COLORS.map((color) => new THREE.MeshBasicMaterial({ color }));
  const wire = [];
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i].position, b = lamps[(i + 1) % lamps.length].position;
    if (a.distanceTo(b) > 6) continue;
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y += 1.5 - Math.sin(t * Math.PI) * 0.35;
      wire.push(p);
      if (k > 0 && k < n) {
        const bulb = new THREE.Mesh(bulbGeo, mats[(i + k) % mats.length]);
        bulb.position.copy(p).y -= 0.05;
        g.add(bulb);
      }
    }
  }
  const segs = [];
  for (let i = 0; i + 1 < wire.length; i++) if (wire[i].distanceTo(wire[i + 1]) < 1.2) segs.push(wire[i], wire[i + 1]);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0x222222 })));
  return g;
}

// Montañas lejanas de un solo color (sin sombreado: así no parecen nevadas), difuminadas por la niebla: una sola malla
function distantMountains(scene, color, rng) {
  const parts = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = ((i + rng() * 0.6) / n) * Math.PI * 2, r = 88 + rng() * 22;
    const h = 16 + rng() * 14, w = 16 + rng() * 14;
    const cone = new THREE.ConeGeometry(w, h, 6, 1);
    cone.rotateY(rng() * 3);
    cone.scale(1 + rng() * 0.6, 1, 1);
    cone.translate(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
    parts.push(cone);
  }
  const mountains = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color }));
  scene.add(mountains);
}

// El volcán del hoyo de la caldera: pared de dentro (que se ve desde la cámara
// de magma) con cascadas de lava, borde del cráter y ladera de fuera, recortada
// en terraza donde va el sendero (las zonas elevadas del hoyo).
function volcanoShell(scene, course, v, animated) {
  const { cx, cz, rx, rz } = v;
  // ruido de la roca, igual en los vértices repetidos
  const lumpy = (x, z, y, amp) => 1 + (noise(x * 2.2 + 5, z * 2.2 + y * 0.18) - 0.5) * amp + (noise(x * 7, z * 7 + y * 0.6) - 0.5) * amp * 0.3;
  const emissive = (mat, k) => {
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * smoothstep(0.35, 0.6, vColor.r - vColor.b) * ${k.toFixed(2)};`,
      );
    };
  };
  const rock = new THREE.Color(0x241b1d), hot = new THREE.Color(0xff5a14), c = new THREE.Color();

  // pared de dentro: de debajo del lago hasta el borde, abriéndose un poco
  const bottom = -5, H = RIM - bottom;
  const inner = new THREE.CylinderGeometry(1.08, 1, H, 120, 16, true).toNonIndexed();
  let pos = inner.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = y > H / 2 - 0.01 ? 1 : lumpy(x, z, y, 0.16);
    pos.setXYZ(i, x * rx * k, y + (y > H / 2 - 0.01 ? 0 : (noise(x * 3, z * 3) - 0.5) * 1.2), z * rz * k);
  }
  // cascadas de lava: franjas que bajan; color por vértice para que sean suaves
  const falls = [0.35, 1.3, 2.15, 3.4, 4.2, 5.05, 5.8];
  let colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z / rz, x / rx) + Math.PI;
    const h = (y + H / 2) / H;
    const fall = falls.some((f, j) => Math.abs(((a - f + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.03 && h < 0.55 + (j % 3) * 0.13);
    c.copy(rock).offsetHSL(0, 0, (noise(x * 0.4, z * 0.4 + y * 0.3) - 0.5) * 0.06 + h * 0.03);
    if (fall) c.copy(hot).lerp(new THREE.Color(0xffc040), 0.2 + noise(y * 0.5, a * 3) * 0.3);
    else if (h < 0.3) c.lerp(hot, (0.3 - h) * 1.6);
    c.toArray(colors, i * 3);
  }
  inner.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  inner.computeVertexNormals();
  const innerMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.BackSide });
  emissive(innerMat, 1.4);
  const wall = new THREE.Mesh(inner, innerMat);
  wall.position.set(cx, bottom + H / 2, cz);

  // ladera de fuera: anillo de rejilla del borde (q = 1.08·1.12) al pie
  const NA = 160, NR = 34, Q0 = 1.08, Q1 = 1.22, Q2 = 3;
  const opos = [], ocol = [], idx = [];
  for (let j = 0; j <= NR; j++) {
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const qq = Q0 + (j / NR) * (Q2 - Q0);
      // el labio del cráter es una cresta: sube desde la pared de dentro y luego baja la ladera
      let y = qq < Q1 ? RIM + Math.sin(((qq - Q0) / (Q1 - Q0)) * Math.PI) * 0.6 : v.slope(qq);
      const k = j === 0 ? 1 : lumpy(Math.cos(a) * 3, Math.sin(a) * 3, qq * 4, 0.1);
      let x = cx + Math.cos(a) * rx * qq * k, z = cz + Math.sin(a) * rz * qq * k;
      y += j === 0 ? 0 : (noise(x * 0.35, z * 0.35) - 0.5) * 1.6;
      // terraza del sendero: la montaña se recorta por debajo de la zona elevada
      for (const t of course.tiers ?? []) {
        const near = t.poly.some(([px, pz]) => Math.hypot(px - x, pz - z) < 6) || pointInPoly(t.poly, x, z);
        // (sin tocar el borde del cráter: detrás de la cueva queda la pared de roca)
        if (near && qq > 1.3 && distPoly(t.poly, x, z) < 1.4 && y > t.h - 0.3) y = t.h - 0.3 - Math.max(0, distPoly(t.poly, x, z) - 1) * 2;
      }
      opos.push(x, y, z);
      // vetas de lava que bajan por la ladera
      const flow = [0.9, 2.6, 4.1, 5.4].some((f) => Math.abs(((a - f + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.02 + noise(qq * 3, f) * 0.03) && qq < 2.3;
      c.copy(rock).offsetHSL(0, 0, (noise(x * 0.5, z * 0.5) - 0.5) * 0.08);
      if (flow || qq < Q1 - 0.05) c.copy(hot).lerp(new THREE.Color(0xffb040), noise(x, z) * 0.4);
      ocol.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + NA + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  let outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.Float32BufferAttribute(opos, 3));
  outer.setAttribute('color', new THREE.Float32BufferAttribute(ocol, 3));
  outer.setIndex(idx);
  outer = outer.toNonIndexed();
  outer.computeVertexNormals();
  // solo la cara de fuera: con la cámara dentro de la roca (la bola cruzando por
  // el tubo) la montaña no tapa la vista
  const outerMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  emissive(outerMat, 1.2);
  const mountain = new THREE.Mesh(outer, outerMat);
  mountain.receiveShadow = true;
  scene.add(wall, mountain);

  // el cráter brilla arriba y el lago ilumina la cámara desde abajo
  const glow = haloSprite(0xff7a2a, 30);
  glow.position.set(cx, RIM + 4, cz);
  glow.material.opacity = 0.3;
  const under = new THREE.PointLight(0xff5a14, 8, 40, 1.4);
  under.position.set(cx, -0.2, cz);
  // humo que sale del cráter
  const puffs = [];
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x3a3036, transparent: true, opacity: 0.45, flatShading: true, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + (i % 3) * 0.8, 0), smokeMat);
    m.userData.t = i / 10;
    puffs.push(m);
  }
  scene.add(glow, under, ...puffs);
  animated.push((t) => {
    under.intensity = 8 + Math.sin(t * 1.9) * 1.5 + Math.sin(t * 5.3) * 0.6;
    glow.material.opacity = 0.26 + Math.sin(t * 0.8) * 0.05;
    for (const p of puffs) {
      const k = (p.userData.t + t * 0.03) % 1;
      const a = p.userData.t * 9;
      p.position.set(cx + Math.cos(a) * rx * 0.7 + k * 8, RIM + 6 + k * 22, cz + Math.sin(a) * rz * 0.7);
      p.scale.setScalar(0.6 + k * 2.6);
    }
  });
}

function pointInPoly(poly, x, z) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ok = !ok;
  }
  return ok;
}

// distancia de (x, z) al polígono (0 dentro)
function distPoly(poly, x, z) {
  if (pointInPoly(poly, x, z)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

// Volcán de verdad detrás del hoyo: cono de roca, cráter de lava, coladas y humo
function volcanoBackdrop(scene, course, bounds, heightAt, animated, rng) {
  const cx = (bounds.minX + bounds.maxX) / 2 + 4, cz = bounds.minZ - 26;
  const H = 15, R = 17, rTop = 3;
  const geo = new THREE.CylinderGeometry(rTop, R, H, 28, 8, true).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (noise(x * 0.5 + 9, z * 0.5 + y * 0.3) - 0.5) * 0.35;
    if (y < H / 2 - 0.01) pos.setXYZ(i, x * k, y, z * k);
  }
  // coladas: franjas que bajan desde el cráter y brillan
  const flows = [0.6, 2.2, 3.9, 4.75, 5.5];
  const colors = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x2a2022), hot = new THREE.Color(0xff5a14), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const a = Math.atan2(z, x) + Math.PI;
    const h = (y + H / 2) / H;
    const inFlow = flows.some((f) => Math.abs(((a - f + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.05 + (1 - h) * 0.07);
    c.copy(rock).offsetHSL(0, 0, (hash(i, 7) - 0.5) * 0.06);
    if (inFlow && h > 0.15) c.copy(hot).lerp(new THREE.Color(0xffc040), h * 0.6);
    else if (h > 0.9) c.lerp(hot, (h - 0.9) * 6);
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // las coladas emiten luz propia: emisivo = color del vértice solo donde es lava
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor * smoothstep(0.35, 0.6, vColor.r - vColor.b) * 2.2;',
    );
  };
  const cone = new THREE.Mesh(geo, mat);
  const baseY = heightAt(cx, cz) - 3;
  cone.position.set(cx, baseY + H / 2, cz);
  scene.add(cone);
  // lago de lava en el cráter
  const crater = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(cx, baseY + H - 0.4, cz);
  const glow = haloSprite(0xff5a14, 12);
  glow.position.set(cx, baseY + H + 1.5, cz);
  glow.material.opacity = 0.5;
  const light = new THREE.PointLight(0xff5a14, 30, 45, 1.4);
  light.position.set(cx, baseY + H + 2, cz);
  scene.add(crater, glow, light);
  // humo que sale del cráter
  const puffs = [];
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x3a3036, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rng() * 1.2, 0), smokeMat);
    m.userData.t = i / 9;
    puffs.push(m);
    scene.add(m);
  }
  animated.push((t) => {
    light.intensity = 30 + Math.sin(t * 2.3) * 6;
    glow.material.opacity = 0.45 + Math.sin(t * 2.3) * 0.1;
    crater.material.color.setHSL(0.05 + Math.sin(t * 1.3) * 0.015, 1, 0.55);
    for (const p of puffs) {
      const k = (p.userData.t + t * 0.04) % 1;
      p.position.set(cx + Math.sin(k * 6 + p.userData.t * 9) * 2 + k * 6, baseY + H + k * 18, cz + Math.cos(k * 5) * 1.5);
      p.scale.setScalar(0.6 + k * 2.4);
    }
    smokeMat.opacity = 0.5;
  });
}
