import * as THREE from 'three';

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
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 });
  scene.add(sun, sun.target);

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
    new THREE.MeshPhongMaterial({ color: theme.water ?? 0x2bb3e6, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.85, flatShading: true }),
  );
  water.position.y = theme.waterLevel;
  scene.add(water);
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
  place(2.2, 40, 140, (x, y, z) => scene.add(makeTree(theme.trees[Math.floor(rng() * theme.trees.length)], rng, x, y, z)));
  place(1.8, 30, 40, (x, y, z) => scene.add(makeRock(rng, x, y, z)));
  if (theme.flowers) place(1.2, 12, 70, (x, y, z) => scene.add(makeFlower(rng, x, y, z)));
  if (theme.lanterns) {
    const lamps = [];
    place(1.2, 3, 30, (x, y, z) => lamps.length < 3 && lamps.push(makeLantern(x, y, z)));
    lamps.forEach((l) => scene.add(l));
  }

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

  if (theme.snowfall) {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(rng() - 0.5) * 40, rng() * 14, (rng() - 0.5) * 40], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.9 }));
    flakes.frustumCulled = false;
    scene.add(flakes);
    animated.push((t, dt) => {
      const p = g.attributes.position;
      for (let i = 0; i < n; i++) {
        let y = p.getY(i) - dt * (0.6 + (i % 5) * 0.12);
        if (y < 0) y += 14;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t + i) * dt * 0.2);
      }
      p.needsUpdate = true;
    });
  }

  return { sun, sunDir, update: (t, dt) => animated.forEach((f) => f(t, dt)) };
}

const leafMats = [0x2f9e44, 0x3bb54a, 0x25803a, 0x4cc25a].map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4f9e3c, flatShading: true });
const mesaMat = new THREE.MeshLambertMaterial({ color: 0xb8653a, flatShading: true });

function shadowAll(g) {
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

function makeTree(kind, rng, x, y, z) {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.9;
  const leaf = leafMats[Math.floor(rng() * leafMats.length)];
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

function makeLantern(x, y, z) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  post.position.y = 0.7;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
  glow.position.y = 1.5;
  const light = new THREE.PointLight(0xffb060, 3, 6, 1.5);
  light.position.y = 1.5;
  g.add(post, glow, light);
  g.position.set(x, y, z);
  return g;
}
