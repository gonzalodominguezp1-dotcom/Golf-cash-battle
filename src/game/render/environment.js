import * as THREE from 'three';
import { softDotTexture } from './textures.js';

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

export function courseBounds(course) {
  const xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function distToBounds(b, x, z) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

export function buildEnvironment(scene, course, theme, rng) {
  const bounds = courseBounds(course);
  const animated = [];

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
  sun.castShadow = true;
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 900 && (window.matchMedia?.('(pointer: fine)').matches ?? true);
  const shadowRes = isDesktop ? 4096 : 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 });
  scene.add(sun, sun.target);
  // contraluces de color a ambos lados: dan los bordes rosa/cian que hacen vibrar la escena
  if (theme.rim) {
    const night = theme.sunIntensity < 2;
    theme.rim.forEach((color, i) => {
      const rim = new THREE.DirectionalLight(color, night ? 1.4 : 0.8);
      rim.position.set(i ? 12 : -12, 6, i ? 8 : -10);
      scene.add(rim);
    });
  }

  // --- terreno low-poly ---
  const size = 220, seg = 110;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const heightAt = (x, z) => {
    const d = distToBounds(bounds, x, z);
    const ramp = THREE.MathUtils.smoothstep(d, 2, 16);
    return theme.terrainOffset * (1 - ramp * 0.3) - 0.55 + fbm(x * 0.06, z * 0.06) * 9 * ramp - 2.2 * ramp + ramp * ramp * 1.5;
  };
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(theme.groundLow), mid = new THREE.Color(theme.groundMid), high = new THREE.Color(theme.groundHigh);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    if (y < theme.waterLevel + 0.35) c.copy(low);
    else if (y < 2.5) c.copy(mid).lerp(high, THREE.MathUtils.clamp((y - 0.5) / 3, 0, 1));
    else c.copy(high).lerp(new THREE.Color(0x8a8f86), THREE.MathUtils.clamp((y - 4) / 4, 0, 0.7));
    c.offsetHSL(0, 0, (hash(i, 3) - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // --- agua ---
  const waterGeo = new THREE.PlaneGeometry(size, size, 60, 60);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    theme.lava
      ? new THREE.MeshPhongMaterial({ color: theme.water, emissive: 0xff3a0a, emissiveIntensity: 0.9, shininess: 30, flatShading: true })
      : new THREE.MeshPhongMaterial({ color: theme.water ?? 0x2bb3e6, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.85, flatShading: true }),
  );
  water.position.y = theme.waterLevel;
  scene.add(water);
  if (theme.lava) animated.push((t) => (water.material.emissiveIntensity = 0.9 + Math.sin(t * 1.7) * 0.25));
  const base = Float32Array.from(waterGeo.attributes.position.array);
  animated.push((t) => {
    const p = waterGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      p.setY(i, Math.sin(x * 0.35 + t * 1.3) * 0.08 + Math.cos(z * 0.4 + t * 1.1) * 0.08);
    }
    p.needsUpdate = true;
    waterGeo.computeVertexNormals();
  });

  // --- decorado ---
  const place = (minD, maxD, tries, fn) => {
    for (let i = 0; i < tries; i++) {
      const x = (bounds.minX + bounds.maxX) / 2 + (rng() - 0.5) * 2 * (maxD + 8);
      const z = (bounds.minZ + bounds.maxZ) / 2 + (rng() - 0.5) * 2 * (maxD + 12);
      const d = distToBounds(bounds, x, z);
      const y = heightAt(x, z);
      if (d < minD || d > maxD || y < theme.waterLevel + 0.25) continue;
      fn(x, y, z, d);
    }
  };
  const leaves = theme.leaves?.map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
  const trees = [];
  place(2.2, 40, 140, (x, y, z) => {
    const tree = makeTree(theme.trees[Math.floor(rng() * theme.trees.length)], rng, x, y, z, leaves);
    tree.userData.phase = rng() * 6.28;
    trees.push(tree);
    scene.add(tree);
  });
  // los árboles se mecen un poco con el viento
  animated.push((t) => {
    for (const tr of trees) tr.rotation.z = Math.sin(t * 1.1 + tr.userData.phase) * 0.025;
  });
  place(1.8, 30, 40, (x, y, z) => scene.add(makeRock(rng, x, y, z)));
  if (theme.flowers) place(1.2, 12, 70, (x, y, z) => scene.add(makeFlower(rng, x, y, z)));
  if (theme.lanterns) {
    // farolillos alrededor de la pista; solo unos pocos llevan luz real (cada luz cuesta en el móvil)
    const spots = theme.lanterns === 'many' ? perimeterSpots(course, 1.3, 3.2) : [];
    if (!spots.length) place(1.2, 3, 30, (x, y, z) => spots.length < 4 && spots.push([x, z]));
    const lamps = spots.map(([x, z], i) => {
      const lamp = theme.torches && i % 2 ? makeTorch(x, heightAt(x, z), z, i < 6) : makeLantern(x, heightAt(x, z), z, i, i < 6);
      scene.add(lamp);
      return lamp;
    });
    if (theme.festoon) scene.add(festoon(lamps));
    animated.push((t) => {
      for (const l of lamps) {
        const f = 1 + Math.sin(t * 9 + l.userData.phase) * 0.06 + Math.sin(t * 23 + l.userData.phase * 3) * 0.04;
        if (l.userData.light) l.userData.light.intensity = l.userData.base * f;
        l.userData.halo.material.opacity = 0.55 * f;
        if (l.userData.flame) l.userData.flame.scale.set(1, f * 1.1, 1);
      }
    });
  }
  if (theme.lava) volcanoBackdrop(scene, course, bounds, heightAt, animated, rng);

  // --- nubes ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: theme.clouds, flatShading: true, emissive: theme.clouds, emissiveIntensity: 0.25 });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + rng() * 2, 0), cloudMat);
      m.position.set(k * 2 - n, rng() * 1, rng() * 1.5);
      m.scale.y = 0.6;
      g.add(m);
    }
    const a = rng() * Math.PI * 2, r = 50 + rng() * 60;
    g.position.set(Math.cos(a) * r, 18 + rng() * 22, Math.sin(a) * r);
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
    const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1dc, fog: false }));
    moon.position.copy(sunDir).multiplyScalar(160);
    scene.add(moon);
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

  return { sun, sunDir, update: (t, dt) => animated.forEach((f) => f(t, dt)) };
}

const leafMats = [0x2f9e44, 0x3bb54a, 0x25803a, 0x4cc25a].map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
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
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), trunkMat);
    trunk.position.y = 0.4;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1 - i * 0.25, 1.1, 7), leaf);
      cone.position.y = 1 + i * 0.6;
      g.add(cone);
    }
  } else if (kind === 'palm') {
    let py = 0, px = 0;
    const lean = (rng() - 0.5) * 0.25;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.008, 0.14 - i * 0.008, 0.5, 6), trunkMat);
      seg.position.set(px, py + 0.25, 0);
      seg.rotation.z = -lean * i * 0.4;
      g.add(seg);
      py += 0.48;
      px += lean * i * 0.2;
    }
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3bb54a, side: THREE.DoubleSide, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 4, 1, true), leafMat);
      fr.scale.set(1, 1, 0.25);
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      fr.position.set(0.8, -0.25, 0);
      fr.rotation.set(0, 0, -1.9);
      pivot.add(fr);
      g.add(pivot);
    }
    const coco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: 0x6b4423, flatShading: true }));
    coco.position.set(px + 0.1, py - 0.1, 0.05);
    g.add(coco);
  } else if (kind === 'snowpine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), trunkMat);
    trunk.position.y = 0.4;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1 - i * 0.25, 1.1, 7), leafMats[2]);
      cone.position.y = 1 + i * 0.6;
      const snow = new THREE.Mesh(new THREE.ConeGeometry(0.62 - i * 0.15, 0.55, 7), snowMat);
      snow.position.y = 1.3 + i * 0.6;
      g.add(cone, snow);
    }
  } else if (kind === 'cactus') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.4, 4, 8), cactusMat);
    body.position.y = 0.9;
    g.add(body);
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      const h = 0.7 + rng() * 0.5;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 4, 8), cactusMat);
      arm.position.set(side * 0.45, h + 0.25, 0);
      const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.25, 4, 8), cactusMat);
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
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 0.6, 0), mesaMat);
      r.position.set((rng() - 0.5) * 1.2, 0.3 + i * 0.5, (rng() - 0.5) * 1.2);
      r.scale.y = 0.7;
      g.add(r);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.1, 6), trunkMat);
    trunk.position.y = 0.55;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rng() * 0.3, 0), leaf);
      blob.position.set((rng() - 0.5) * 0.6, 1.4 + rng() * 0.5, (rng() - 0.5) * 0.6);
      g.add(blob);
    }
  }
  g.position.set(x, y - 0.05, z);
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  return shadowAll(g);
}

const rockMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a0, flatShading: true });
function makeRock(rng, x, y, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.6, 0), rockMat);
  m.position.set(x, y + 0.1, z);
  m.scale.set(1, 0.6 + rng() * 0.4, 1 + rng() * 0.4);
  m.rotation.set(rng(), rng() * 3, rng());
  m.castShadow = m.receiveShadow = true;
  return m;
}

const petalColors = [0xff5e7e, 0xffd23f, 0xffffff, 0xb27cff, 0xff8a3d];
function makeFlower(rng, x, y, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }));
  stem.position.y = 0.15;
  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.08, 0),
    new THREE.MeshLambertMaterial({ color: petalColors[Math.floor(rng() * petalColors.length)], flatShading: true }),
  );
  head.position.y = 0.32;
  g.add(stem, head);
  g.position.set(x, y, z);
  return g;
}

const LANTERN_COLORS = [0xff4a3d, 0xffb020, 0xff5fb0, 0xffe066, 0x5fd8ff];

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
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a33 }));
  post.position.y = 0.75;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), post.material);
  arm.position.set(0.18, 1.48, 0);
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.6 }));
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
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x7a4a24, flatShading: true }));
  pole.position.y = 0.7;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x4a2c14, flatShading: true }));
  cup.position.y = 1.45;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
  flame.geometry.translate(0, 0.16, 0);
  flame.position.y = 1.55;
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
