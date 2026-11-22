import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addFish, makeFish, planFish, fishGeometry, fishTriangles, splashGeometry, splashTriangles, fishMaterial, splashMaterial,
  fishSlot, fishSchedule, fishJumpAt, fishJump, fishPoseAt, fishSplashEvents, fishBendOffset, fishTiming, splashState,
  fishPaletteName, fishPaletteOf, fishSupported,
  FISH_BUDGET, FISH_SPLASH_BUDGET, FISH_MAX, FISH_MAX_CALLS, FISH_SPLASH_CALLS, FISH_RNG_DRAWS, FISH_CLEAR, FISH_REACH,
  FISH_SCHEDULE, FISH_JUMP, FISH_FAR, FISH_SPLASH, FISH_SPECIES, FISH_PALETTES, FISH_BEND,
} from '../src/game/render/assets/fish.js';
import { makeRiver } from '../src/game/render/flora.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { windUniforms } from '../src/game/render/assets/wind.js';
import { seededRng } from '../src/lab/assetRegistry.js';
import { THEMES } from '../src/game/themes.js';

// Pez que salta de vez en cuando en el agua (entre los pasos 8 y 9 de assets-entorno-1a1). Ver assets/fish.js.

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = [1, 7, 42, 1234, 99991];
const WRAP = FISH_SCHEDULE.wrap;

// Hoyo de prueba: pista de 6 x 24 m con el tee en un extremo; una charca honda que se mete
// bajo la pista (el pez debe quedarse lejos de ella) y un río de flora.makeRiver al lado.
const bounds = { minX: -3, maxX: 3, minZ: -12, maxZ: 12 };
const tee = [0, -11];
const Y = -1.6; // nivel del agua (pradera)
const pond = { x: 9, z: 2, r: 9 };
const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
const base = (x, z) => {
  const s = Math.hypot(x - pond.x, z - pond.z) / pond.r;
  // taza: 1,4 m de hondo en el centro, orilla a s = 0,8, tierra seca 0,5 m sobre el agua fuera
  return Y - 1.4 + 1.9 * THREE.MathUtils.smoothstep(s, 0.35, 1.05);
};
const river = makeRiver(bounds, THEMES.meadow, seededRng(5), { grounded: false, enabled: true });
const heightAt = (x, z) => river.carve(x, z, base(x, z));
const hole = (seed = 1, extra = {}) => ({
  rng: seededRng(seed), y: Y, heightAt, river, courseDist: distBox, tee, area: { x: 0, z: 0, r: 30 }, theme: THEMES.meadow, ...extra,
});
const plan = (seed = 1, extra = {}) => planFish(hole(seed, extra));
const wet = (x, z, depth = 0) => heightAt(x, z) <= Y - depth;

/** Puntos del carril de un salto (los que el plan debe haber validado), cada `step` m. */
function lanePoints(spot, lane, step = 0.1) {
  const out = [];
  const [a, b] = spot.extent;
  for (let s = a; s <= b + 1e-9; s += step) out.push([spot.x + Math.cos(lane) * s, spot.z + Math.sin(lane) * s]);
  return out;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// ---------- presupuesto ----------

test('pez: presupuesto de triángulos por pez y calidad medido (Bajo ≈ 40, Medio ≈ 90, Alto ≈ 160) y se aprovecha', () => {
  assert.deepEqual(FISH_BUDGET, { low: 40, medium: 90, high: 160 });
  let prev = 0;
  for (const l of LEVELS) {
    const t = fishTriangles(l);
    const g = fishGeometry(l);
    assert.ok(Number.isInteger(t), `${l}: triángulos enteros (${t})`);
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['fishTone', 4]]) {
      assert.equal(g.attributes[name].array.length, t * 3 * size, `${l}: ${name} completo`);
      assert.ok(g.attributes[name].array.every(Number.isFinite), `${l}: ${name} sin NaN`);
    }
    assert.ok(t <= FISH_BUDGET[l], `${l}: ${t} > ${FISH_BUDGET[l]}`);
    assert.ok(t >= FISH_BUDGET[l] * 0.85, `${l}: ${t} aprovecha poco el presupuesto`);
    assert.ok(t > prev, 'cada calidad añade detalle');
    prev = t;
  }
  // salpicadura: anillos siempre; en Bajo sin gotas ni corona (todo plano en el agua)
  for (const l of LEVELS) assert.ok(splashTriangles(l) <= FISH_SPLASH_BUDGET[l], `salpicadura ${l}`);
  const low = splashGeometry('low').attributes.position;
  for (let i = 0; i < low.count; i++) assert.equal(low.getY(i), 0, 'Bajo: solo anillos en el agua');
  for (const l of ['medium', 'high']) {
    const p = splashGeometry(l).attributes.position;
    let up = 0;
    for (let i = 0; i < p.count; i++) up = Math.max(up, p.getY(i));
    assert.ok(up > 0.5, `${l}: corona y gotas sobre el agua`);
  }
});

test('pez: un solo draw call para todos los peces del hoyo (InstancedMesh), salpicadura en otra, sin sombras', () => {
  assert.equal(FISH_MAX_CALLS, 1);
  assert.equal(FISH_SPLASH_CALLS, 1);
  for (const l of LEVELS) {
    for (const seed of SEEDS) {
      const f = makeFish({ ...hole(seed), level: l });
      assert.ok(f, `semilla ${seed}: hay peces`);
      const meshes = [];
      f.group.traverse((o) => o.isMesh && meshes.push(o));
      assert.equal(meshes.length, 2, 'peces + salpicadura');
      assert.ok(f.fishMesh.isInstancedMesh && f.splashMesh.isInstancedMesh);
      assert.ok(f.fishMesh.count >= 1 && f.fishMesh.count <= FISH_MAX);
      assert.equal(f.fishMesh.material, fishMaterial());
      assert.equal(f.splashMesh.material, splashMaterial());
      for (const m of meshes) assert.equal(m.castShadow || m.receiveShadow, false);
      assert.equal(f.stats.calls, 1);
      assert.equal(f.stats.trianglesPerFish, fishTriangles(l));
    }
  }
});

// ---------- determinismo y rng ----------

test('pez: el rng del hoyo pierde SIEMPRE una tirada (FISH_RNG_DRAWS), con o sin peces, en cualquier calidad o tema', () => {
  assert.equal(FISH_RNG_DRAWS, 1);
  const cases = [
    { level: 'low' }, { level: 'high' }, { theme: THEMES.neon }, { theme: THEMES.volcano }, { theme: THEMES.glacier },
    { heightAt: () => 0 }, // sin agua
    { fast: true },
  ];
  for (const extra of cases) {
    const r = seededRng(77), ref = seededRng(77);
    planFish({ ...hole(1, extra), rng: r });
    ref();
    assert.equal(r(), ref(), JSON.stringify(Object.keys(extra)));
    const r2 = seededRng(78), ref2 = seededRng(78);
    makeFish({ ...hole(1, extra), rng: r2 });
    ref2();
    assert.equal(r2(), ref2());
  }
});

test('pez: determinista (misma semilla, mismo plan y mismos saltos); la semilla los cambia; la calidad no', () => {
  const a = plan(7), b = plan(7), c = plan(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.spots, c.spots);
  for (const l of LEVELS) assert.deepEqual(makeFish({ ...hole(7), level: l }).plan, a, 'el plan no depende de la calidad');
  for (let t = 0; t < 300; t += 0.37) assert.deepEqual(fishPoseAt(a, t), fishPoseAt(b, t));
});

// ---------- calendario ----------

test('pez: calendario de intervalos irregulares de ~6–20 s, reproducible y periódico con el tiempo del viento', () => {
  const N = Math.round(WRAP / FISH_SCHEDULE.period);
  assert.equal(N * FISH_SCHEDULE.period, WRAP, 'un número entero de huecos por vuelta del tiempo del viento');
  for (const seed of SEEDS) {
    const starts = Array.from({ length: N }, (_, k) => fishSlot(k, seed).start);
    const gaps = starts.map((s, k) => (((starts[(k + 1) % N] - s) % WRAP) + WRAP) % WRAP);
    for (const g of gaps) assert.ok(g >= 6 && g <= 20, `semilla ${seed}: hueco de ${g.toFixed(2)} s`);
    const mean = gaps.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / N);
    assert.ok(sd > 1.5, `irregular (desviación ${sd.toFixed(2)} s)`);
    assert.ok(new Set(gaps.map((g) => g.toFixed(2))).size > N * 0.8, 'casi ningún hueco se repite');
    // reproducible: fishSchedule devuelve los mismos inicios
    const list = fishSchedule(seed, 0, WRAP).map((s) => s.start);
    assert.deepEqual([...list].sort((p, q) => p - q), [...starts].map((s) => ((s % WRAP) + WRAP) % WRAP).sort((p, q) => p - q));
    assert.deepEqual(fishSchedule(seed, 100, 400), fishSchedule(seed, 100, 400));
  }
  assert.notDeepEqual(fishSchedule(1, 0, 200).map((s) => s.start), fishSchedule(2, 0, 200).map((s) => s.start));
  // laboratorio: fast acorta los intervalos a 2–3 s
  const Nf = Math.round(WRAP / FISH_SCHEDULE.fast.period);
  assert.equal(Nf * FISH_SCHEDULE.fast.period, WRAP);
  for (let k = 0; k < Nf; k++) {
    const g = ((fishSlot((k + 1) % Nf, 3, { fast: true }).start - fishSlot(k, 3, { fast: true }).start) % WRAP + WRAP) % WRAP;
    assert.ok(g >= 2 && g <= 3, `fast: hueco de ${g.toFixed(2)} s`);
  }
});

test('pez: uno saltando a la vez (las ventanas de dos saltos nunca se pisan) y fishJumpAt es periódico', () => {
  for (const fast of [false, true]) {
    const N = Math.round(WRAP / (fast ? FISH_SCHEDULE.fast.period : FISH_SCHEDULE.period));
    for (const seed of [1, 42]) {
      for (let k = 0; k < N; k++) {
        const a = fishSlot(k, seed, { fast }), b = fishSlot((k + 1) % N, seed, { fast });
        const ta = fishTiming(seed, k, { fast });
        const gap = (((b.start - a.start) % WRAP) + WRAP) % WRAP;
        assert.ok(ta.end + fishTiming(seed, (k + 1) % N, { fast }).approach < gap, `fast=${fast} k=${k}: se pisan`);
      }
      for (let t = 0; t < 120; t += 0.53) {
        const j = fishJumpAt(t, seed, { fast }), w = fishJumpAt(t + WRAP, seed, { fast });
        assert.equal(w?.k, j?.k, 'el mismo salto una hora después');
        if (j) {
          assert.ok(Math.abs(w.local - j.local) < 1e-9);
          assert.ok(j.local >= -j.approach && j.local <= j.end);
        }
      }
    }
  }
});

test('pez: nunca dos saltos idénticos seguidos (altura, sitio o dirección cambian siempre)', () => {
  const [h0, h1] = FISH_JUMP.height;
  for (const seed of SEEDS) {
    const p = plan(seed);
    const N = Math.round(WRAP / FISH_SCHEDULE.period);
    for (let k = 0; k < N; k++) {
      const a = fishJump(p, k), b = fishJump(p, (k + 1) % N);
      assert.ok(Math.abs(a.height - b.height) >= 0.25 * (h1 - h0), `semilla ${seed} k=${k}: alturas casi iguales`);
      assert.notDeepEqual([a.x0, a.z0, a.heading, a.height], [b.x0, b.z0, b.heading, b.height]);
    }
  }
});

// ---------- trayectoria ----------

test('pez: salto en parábola que empieza y acaba bajo el agua, con la rotación siguiendo la tangente', () => {
  for (const seed of SEEDS) {
    const p = plan(seed);
    const slot = fishSchedule(p.seed, 50, 400)[0];
    const j = fishJump(p, slot.k);
    const t0 = slot.start;
    const dt = 0.01;
    const air = [];
    for (let tau = 0; tau <= j.air + 1e-9; tau += dt) air.push(fishPoseAt(p, t0 + tau));
    assert.ok(air.every(Boolean), 'visible durante todo el vuelo');
    assert.ok(air[0].y < Y, 'sale de debajo del agua');
    assert.ok(air[air.length - 1].y < Y + 1e-6, 'vuelve a entrar en el agua');
    const top = Math.max(...air.map((q) => q.y));
    assert.ok(Math.abs(top - (Y + j.height)) < 0.01, `vértice a la altura del salto (${top.toFixed(3)})`);
    // parábola: segunda diferencia constante = -g dt²
    for (let i = 1; i < air.length - 1; i++) {
      const d2 = air[i + 1].y - 2 * air[i].y + air[i - 1].y;
      assert.ok(Math.abs(d2 + FISH_JUMP.gravity * dt * dt) < 1e-6, 'aceleración constante hacia abajo');
    }
    // en línea recta en planta y a velocidad constante, en la dirección del salto
    for (let i = 1; i < air.length; i++) {
      const dx = air[i].x - air[i - 1].x, dz = air[i].z - air[i - 1].z;
      assert.ok(Math.abs(Math.hypot(dx, dz) - j.length / j.air * dt) < 1e-6);
      assert.ok(Math.abs(Math.atan2(dz, dx) - j.heading) < 1e-6 || Math.abs(Math.abs(Math.atan2(dz, dx) - j.heading) - 2 * Math.PI) < 1e-6);
    }
    // la nariz sigue la tangente: cabeceo = atan(vy / vh), del morro arriba al morro abajo
    for (let i = 1; i < air.length - 1; i++) {
      const vy = (air[i + 1].y - air[i - 1].y) / (2 * dt), vh = j.length / j.air;
      assert.ok(Math.abs(air[i].pitch - Math.atan2(vy, vh)) < 0.02, 'cabeceo según la tangente');
    }
    assert.ok(air[1].pitch > 0.6 && air[air.length - 2].pitch < -0.6);
    // el giro de la instancia lleva el eje x local (la nariz) a lo largo de la tangente
    const q = air[Math.floor(air.length / 4)];
    const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(q.quaternion);
    assert.ok(Math.abs(Math.asin(nose.y) - q.pitch) < 1e-6);
    assert.ok(Math.abs(Math.atan2(nose.z, nose.x) - j.heading) < 1e-6 || Math.abs(Math.abs(Math.atan2(nose.z, nose.x) - j.heading) - 2 * Math.PI) < 1e-6);
  }
});

test('pez: coletazo con onda lateral en el cuerpo (cabeza quieta, cola amplia) y más fuerte en el aire', () => {
  for (const ph of [0, 1, 2.5]) {
    assert.ok(Math.abs(fishBendOffset(0.5, ph, 1)) < 1e-9, 'la nariz no se mueve');
  }
  let tail = 0, mid = 0;
  for (let ph = 0; ph < 6.3; ph += 0.1) {
    tail = Math.max(tail, Math.abs(fishBendOffset(-0.5, ph, 1)));
    mid = Math.max(mid, Math.abs(fishBendOffset(0, ph, 1)));
  }
  assert.ok(tail > 0.9 && mid < tail * 0.5, 'la onda crece hacia la cola');
  // la onda viaja hacia la cola: el máximo en x = 0 llega antes que en x = -0.4
  const p = plan(1), slot = fishSchedule(p.seed, 50, 400)[0], j = fishJump(p, slot.k);
  const before = fishPoseAt(p, slot.start - j.approach * 0.5), inAir = fishPoseAt(p, slot.start + j.air * 0.3);
  assert.ok(inAir.wagAmp > before.wagAmp, 'coletazo más fuerte en el aire');
  assert.ok(Math.abs(fishPoseAt(p, slot.start + 0.01).wagPhase - fishPoseAt(p, slot.start).wagPhase) > 0, 'la cola se mueve');
});

test('pez: antes de saltar asoma la aleta bajo la superficie y tras entrar se hunde y desaparece', () => {
  const p = plan(42), slot = fishSchedule(p.seed, 50, 400)[0], j = fishJump(p, slot.k);
  assert.equal(fishPoseAt(p, slot.start - j.approach - 0.05), null, 'invisible antes de acercarse');
  const near = fishPoseAt(p, slot.start - j.approach * 0.5);
  assert.ok(near && near.y < Y && near.y > Y - 0.3, 'nada justo bajo la superficie');
  assert.ok(near.y + near.finTop > Y, 'la aleta dorsal asoma');
  assert.equal(fishPoseAt(p, slot.start + j.end + 0.05), null, 'invisible al acabar');
  const last = fishPoseAt(p, slot.start + j.end - 0.01);
  assert.ok(last.y < Y - FISH_JUMP.dive * 0.8, 'desaparece ya hundido');
});

// ---------- zonas válidas ----------

test('pez: solo sobre agua honda, a ≥ 1,5 m de la orilla, lejos de la pista y del tee, y cerca del hoyo', () => {
  for (const seed of SEEDS) {
    const p = plan(seed);
    assert.ok(p.spots.length >= 2, `semilla ${seed}: hay sitios (${p.spots.length})`);
    for (const s of p.spots) {
      assert.ok(distBox(s.x, s.z) <= FISH_REACH);
      for (const lane of s.lanes) {
        for (const [x, z] of lanePoints(s, lane)) {
          assert.ok(wet(x, z, FISH_CLEAR.depth), `semilla ${seed}: poco fondo en (${x.toFixed(2)}, ${z.toFixed(2)})`);
          for (let a = 0; a < 36; a++) {
            const r = FISH_CLEAR.shore * 0.93;
            assert.ok(wet(x + Math.cos((a / 36) * 6.283) * r, z + Math.sin((a / 36) * 6.283) * r), 'a menos de 1,5 m de la orilla');
          }
          assert.ok(distBox(x, z) >= FISH_CLEAR.course, `sobre o junto a la pista (${distBox(x, z).toFixed(2)} m)`);
          assert.ok(Math.hypot(x - tee[0], z - tee[1]) >= FISH_CLEAR.tee);
        }
      }
    }
    // todo lo que se dibuja (pez y salpicaduras) cae en esas zonas
    for (const slot of fishSchedule(p.seed, 0, 600)) {
      const j = fishJump(p, slot.k);
      for (let tau = -j.approach; tau <= j.end; tau += 0.05) {
        const q = fishPoseAt(p, slot.start + tau);
        if (!q) continue;
        assert.ok(wet(q.x, q.z, FISH_CLEAR.depth));
        assert.ok(distBox(q.x, q.z) >= FISH_CLEAR.course - 1e-6);
      }
    }
    for (const e of fishSplashEvents(p, 0, 600)) {
      assert.ok(wet(e.x, e.z, FISH_CLEAR.depth));
      assert.ok(distBox(e.x, e.z) - FISH_SPLASH.radius * e.intensity >= FISH_CLEAR.course - 1.2, 'la salpicadura no toca la pista');
    }
  }
});

test('pez: con el tee junto a la charca, nada del salto a menos de FISH_CLEAR.tee del tee', () => {
  const near = [3, 2]; // tee en el borde de la pista que da a la charca
  let n = 0, closest = Infinity;
  for (const seed of [...SEEDS, 11, 12, 13, 14, 15]) {
    const p = planFish({ ...hole(seed), tee: near, river: null, area: { x: 11, z: 2, r: 8 } });
    for (const s of p.spots) {
      for (const lane of s.lanes) {
        for (const [x, z] of lanePoints(s, lane)) {
          closest = Math.min(closest, Math.hypot(x - near[0], z - near[1]));
          n++;
        }
      }
    }
  }
  assert.ok(n > 0, 'hay carriles en la charca');
  assert.ok(closest >= FISH_CLEAR.tee, `a ${closest.toFixed(2)} m del tee`);
});

test('pez: con orilla en acantilado (hondo hasta el borde) el carril entero queda a ≥ 1,5 m de la orilla', () => {
  // la profundidad sola no basta: el agua es honda hasta el mismo borde
  const R = 5.5, cx = 14, cz = 4;
  const cliff = (x, z) => (Math.hypot(x - cx, z - cz) < R ? Y - 1.2 : Y + 0.5);
  let n = 0;
  for (const seed of SEEDS) {
    const p = planFish({ ...hole(seed), heightAt: cliff, river: null, area: { x: cx, z: cz, r: R } });
    for (const s of p.spots) {
      for (const lane of s.lanes) {
        for (const [x, z] of lanePoints(s, lane)) {
          assert.ok(Math.hypot(x - cx, z - cz) <= R - FISH_CLEAR.shore + 1e-6, `semilla ${seed}: a ${(R - Math.hypot(x - cx, z - cz)).toFixed(2)} m de la orilla`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 0, 'hay carriles en la charca');
});

test('pez: en el río salta siguiendo river.along, por el centro del cauce', () => {
  // solo río: sin charca
  const flat = (x, z) => river.carve(x, z, Y + 0.5);
  let riverJumps = 0;
  for (const seed of SEEDS) {
    const p = planFish({ ...hole(seed), heightAt: flat });
    assert.ok(p.spots.length >= 1, `semilla ${seed}: hay sitios en el río`);
    for (const s of p.spots) {
      assert.equal(s.kind, 'river');
      assert.ok(river.dist(s.x, s.z) <= river.w - FISH_CLEAR.shore + 0.05, 'por el centro del cauce');
      // la dirección del carril es la del cauce (tangente de river.along; el hoyo está centrado en 0)
      for (const lane of s.lanes) {
        const a = [Math.cos(lane), Math.sin(lane)];
        const alongZ = Math.abs(river.along(1, 0)[1] - river.along(0, 0)[1]) > 0.5;
        const tt = alongZ ? s.z : s.x;
        const p0 = river.along(tt - 0.5, 0), p1 = river.along(tt + 0.5, 0);
        const tg = [p1[0] - p0[0], p1[1] - p0[1]], l = Math.hypot(...tg);
        assert.ok(Math.abs(a[0] * tg[0] / l + a[1] * tg[1] / l) > 0.97, 'a lo largo del río');
      }
      riverJumps++;
    }
  }
  assert.ok(riverJumps > 0);
});

test('pez: sin agua honda no hay peces (tierra seca, charca somera o pegada a la pista)', () => {
  assert.equal(planFish({ ...hole(1), heightAt: () => Y + 0.3, river: null }).spots.length, 0);
  assert.equal(addFish(new THREE.Scene(), { ...hole(1), heightAt: () => Y + 0.3, river: null }), null);
  // charca somera (30 cm): nada
  assert.equal(planFish({ ...hole(1), heightAt: () => Y - 0.3, river: null }).spots.length, 0);
  // agua honda solo bajo la pista: nada
  const under = (x, z) => (distBox(x, z) < 3 ? Y - 2 : Y + 0.5);
  assert.equal(planFish({ ...hole(1), heightAt: under, river: null }).spots.length, 0);
});

// ---------- temas ----------

test('pez: temas sin peces (neón, ciudad, lava, caldera, glaciar helado) y paleta propia en el resto', () => {
  for (const id of ['neon', 'neonPink', 'cyber2078', 'volcano', 'caldera', 'glacier']) {
    assert.equal(fishSupported(THEMES[id]), false, id);
    assert.equal(fishPaletteName(THEMES[id]), null, id);
    assert.equal(planFish(hole(1, { theme: THEMES[id] })).fish.length, 0, id);
    assert.equal(addFish(new THREE.Scene(), hole(1, { theme: THEMES[id] })), null, id);
  }
  const expect = { meadow: 'temperate', meadowDay: 'temperate', sunset: 'temperate', autumn: 'temperate', night: 'temperate', canyon: 'temperate', gardenNight: 'koi', jungle: 'jungle', beach: 'tropical', beachNight: 'tropical', snow: 'cold' };
  for (const [id, name] of Object.entries(expect)) {
    assert.equal(fishPaletteName(THEMES[id]), name, id);
    const pal = fishPaletteOf(THEMES[id]);
    assert.ok(pal.species.length >= 2 && pal.species.length <= 3, `${id}: 2–3 especies`);
    for (const sp of pal.species) assert.ok(FISH_SPECIES[sp], sp);
  }
  assert.equal(fishPaletteName(null), 'temperate');
  // cada pez del hoyo es de una especie distinta (si caben) y de su paleta
  for (const id of Object.keys(expect)) {
    const p = plan(3, { theme: THEMES[id] });
    const sp = p.fish.map((f) => f.species);
    assert.equal(new Set(sp).size, sp.length, `${id}: especies distintas`);
    for (const s of sp) assert.ok(FISH_PALETTES[expect[id]].species.includes(s));
  }
  // el frío lleva colores fríos: más azul que rojo en el lomo
  for (const sp of FISH_PALETTES.cold.species) {
    const c = new THREE.Color(FISH_SPECIES[sp].back);
    assert.ok(c.b >= c.r, `${sp}: lomo frío`);
  }
});

test('pez: color por instancia (lomo, vientre, acento) con máscara por vértice; ojo oscuro', () => {
  const f = makeFish({ ...hole(1), level: 'high' });
  const g = f.fishMesh.geometry;
  for (const a of ['fishBack', 'fishBelly', 'fishAccent', 'fishPat', 'fishWag']) {
    assert.ok(g.getAttribute(a)?.isInstancedBufferAttribute, a);
  }
  const tone = g.getAttribute('fishTone'), col = g.getAttribute('color'), pos = g.getAttribute('position');
  assert.equal(tone.itemSize, 4);
  // el lomo (arriba) pesa hacia fishBack y el vientre (abajo) hacia fishBelly
  let top = -1, bottom = 2, dark = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i)) < 0.15) {
      if (pos.getY(i) > 0.08) top = Math.max(top, tone.getX(i));
      if (pos.getY(i) < -0.08) bottom = Math.min(bottom, tone.getX(i));
    }
    if (col.getX(i) < 0.1) dark++;
  }
  assert.ok(top > 0.8 && bottom < 0.2, `contrasombreado (lomo ${top}, vientre ${bottom})`);
  assert.ok(dark >= 6, 'ojos oscuros');
  const back = g.getAttribute('fishBack');
  const sp = FISH_SPECIES[f.plan.fish[0].species];
  // el lomo de la especie con el matiz propio del pez (tint, ±8 %); vientre y acento, los de la especie
  const c = new THREE.Color(sp.back).multiplyScalar(f.plan.fish[0].tint);
  assert.ok(Math.abs(back.getX(0) - Math.min(1, c.r)) < 1e-6 && Math.abs(back.getZ(0) - Math.min(1, c.b)) < 1e-6);
  const belly = new THREE.Color(sp.belly), accent = new THREE.Color(sp.accent);
  assert.ok(Math.abs(g.getAttribute('fishBelly').getY(0) - belly.g) < 1e-6);
  assert.ok(Math.abs(g.getAttribute('fishAccent').getX(0) - accent.r) < 1e-6);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(g.getAttribute('fishPat').array[i] - sp.pat[i]) < 1e-6);
});

// ---------- sombreador ----------

test('pez: material compartido Lambert liso con color de vértice, dos caras, luz de borde, coletazo y bandas en el sombreador', () => {
  const m = fishMaterial();
  assert.equal(m, fishMaterial());
  assert.ok(m.isMeshLambertMaterial && m.vertexColors && !m.flatShading);
  assert.equal(m.side, THREE.DoubleSide);
  const sh = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>\n#include <color_vertex>\n',
    fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <color_fragment>\n#include <opaque_fragment>\n',
  };
  m.onBeforeCompile(sh, null);
  for (const s of ['attribute vec4 fishTone;', 'attribute vec3 fishBack;', 'attribute vec3 fishBelly;', 'attribute vec3 fishAccent;', 'attribute vec3 fishPat;', 'attribute vec2 fishWag;']) {
    assert.ok(sh.vertexShader.includes(s), s);
  }
  // la onda del coletazo usa las mismas constantes que fishBendOffset
  assert.ok(sh.vertexShader.includes('transformed.z +='));
  // el número de onda del GLSL se extrae del literal (en su contexto) y se compara con FISH_BEND y con fishBendOffset
  const mk = /sin\(fishWag\.x - fishA \* ([0-9.eE+-]+)\)/.exec(sh.vertexShader);
  assert.ok(mk, 'sin(fishWag.x - fishA * k) en el sombreador');
  const kGlsl = parseFloat(mk[1]);
  assert.ok(Math.abs(kGlsl - FISH_BEND.k) < 1e-6, `k del GLSL ${kGlsl} != FISH_BEND.k ${FISH_BEND.k}`);
  for (const x of [0.5, 0.3, 0, -0.25, -0.5]) {
    for (const ph of [0, 1.1, 4.2]) {
      const a2 = Math.min(1, Math.max(0, 0.5 - x));
      assert.ok(Math.abs(fishBendOffset(x, ph, 0.12) - 0.12 * a2 * a2 * Math.sin(ph - a2 * kGlsl)) < 1e-6, `x ${x} fase ${ph}`);
    }
  }
  assert.ok(sh.vertexShader.includes('fishWag.x') && sh.vertexShader.includes('fishWag.y'));
  assert.ok(sh.vertexShader.includes('mix(fishBelly, fishBack, fishTone.x)'));
  assert.ok(sh.fragmentShader.includes('vFishBand'), 'bandas en el fragmento');
  assert.ok(sh.fragmentShader.includes('directionalLights[0]'), 'luz de borde');
  assert.ok(m.customProgramCacheKey().includes('gcb-fish'));
  // salpicadura: aditiva, sin escribir profundidad, sin niebla
  const s = splashMaterial();
  assert.equal(s.blending, THREE.AdditiveBlending);
  assert.equal(s.depthWrite, false);
  assert.equal(s.fog, false);
  assert.ok(s.vertexColors);
});

// ---------- salpicaduras ----------

test('salpicadura: eventos puros (salida y entrada) donde el pez cruza la superficie, para que el agua dibuje ondas', () => {
  for (const seed of SEEDS) {
    const p = plan(seed);
    const ev = fishSplashEvents(p, 0, 300);
    assert.deepEqual(ev, fishSplashEvents(p, 0, 300), 'pura');
    assert.ok(ev.length >= 2 * 300 / 20, 'dos por salto');
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'ordenados por tiempo');
    // el intervalo se puede partir sin perder ni repetir eventos
    assert.deepEqual([...fishSplashEvents(p, 0, 137.3), ...fishSplashEvents(p, 137.3, 300)], ev);
    for (const e of ev) {
      assert.ok(e.t >= 0 && e.t < 300);
      assert.ok(e.intensity > 0 && e.intensity <= 1);
      assert.ok(['exit', 'entry'].includes(e.kind));
      // en ese instante el pez cruza la superficie justo ahí
      const q = fishPoseAt(p, e.t);
      assert.ok(q && Math.abs(q.y - Y) < 1e-6, `${e.kind}: el pez está en la superficie`);
      assert.ok(Math.hypot(q.x - e.x, q.z - e.z) < 1e-6);
      assert.equal(e.y, Y);
    }
    const byK = new Map();
    for (const e of ev) byK.set(e.k, [...(byK.get(e.k) ?? []), e]);
    for (const list of byK.values()) {
      if (list.length < 2) continue;
      assert.deepEqual(list.map((e) => e.kind), ['exit', 'entry']);
      assert.ok(list[1].intensity > list[0].intensity, 'la entrada salpica más');
    }
  }
  // el intervalo que cruza la vuelta del tiempo (t1 < t0) devuelve lo de los dos lados
  const p = plan(1);
  const wrapEv = fishSplashEvents(p, WRAP - 60, 60);
  assert.deepEqual(wrapEv, [...fishSplashEvents(p, WRAP - 60, WRAP), ...fishSplashEvents(p, 0, 60)]);
});

test('salpicadura: anillos que crecen y se apagan; corona que sube y baja', () => {
  const a = splashState(0, 1), b = splashState(FISH_SPLASH.life * 0.3, 1), c = splashState(FISH_SPLASH.life * 0.99, 1);
  assert.ok(a.radius < b.radius && b.radius < c.radius, 'el anillo crece');
  assert.ok(a.fade > b.fade && b.fade > c.fade && c.fade < 0.05, 'y se apaga');
  assert.ok(b.height > a.height && b.height > c.height, 'la corona sube y baja');
  assert.equal(splashState(FISH_SPLASH.life + 0.01, 1), null);
  assert.equal(splashState(-0.01, 1), null);
  assert.ok(splashState(0.3, 0.5).radius < splashState(0.3, 1).radius, 'la intensidad escala');
});

test('pez: update(t) enseña el pez solo durante su salto y la salpicadura tras salir del agua', () => {
  const f = makeFish({ ...hole(7), level: 'medium' });
  const slot = fishSchedule(f.plan.seed, 30, 400)[0], j = fishJump(f.plan, slot.k);
  f.update(slot.start - j.approach - 0.5);
  assert.equal(f.fishMesh.visible, false);
  assert.equal(f.splashMesh.visible, false);
  f.update(slot.start + j.air * 0.5);
  assert.equal(f.fishMesh.visible, true);
  assert.equal(f.splashMesh.visible, true, 'salpicadura de salida');
  // solo una instancia con tamaño: las demás, a escala 0
  let shown = 0;
  for (let i = 0; i < f.fishMesh.count; i++) {
    f.fishMesh.getMatrixAt(i, _m);
    _m.decompose(_p, _q, _s);
    if (_s.x > 0) {
      shown++;
      const q = fishPoseAt(f.plan, slot.start + j.air * 0.5);
      assert.ok(_p.distanceTo(new THREE.Vector3(q.x, q.y, q.z)) < 1e-5);
      assert.equal(i, q.fish);
    }
  }
  assert.equal(shown, 1, 'uno saltando a la vez');
  f.update(slot.start + j.end + FISH_SPLASH.life + 0.1);
  assert.equal(f.fishMesh.visible, false);
  assert.equal(f.splashMesh.visible, false);
  // sin tiempo: usa el del viento compartido (uWind.w)
  const w = windUniforms.uWind.value.w;
  windUniforms.uWind.value.w = slot.start + j.air * 0.5;
  f.update();
  assert.equal(f.fishMesh.visible, true);
  windUniforms.uWind.value.w = w;
});

test('pez: la salpicadura se dibuja por encima de la cresta máxima del oleaje (+1 cm) en las 3 calidades', async () => {
  const { swellMaxAmp } = await import('../src/game/render/assets/water.js');
  for (const level of ['low', 'medium', 'high']) {
    const f = makeFish({ ...hole(7), level });
    const slot = fishSchedule(f.plan.seed, 30, 400)[0], j = fishJump(f.plan, slot.k);
    f.update(slot.start + j.air * 0.5);
    assert.equal(f.splashMesh.visible, true, level);
    f.splashMesh.getMatrixAt(0, _m);
    _m.decompose(_p, _q, _s);
    assert.ok(_s.x > 0, `${level}: instancia 0 viva`);
    assert.ok(_p.y - f.plan.y >= swellMaxAmp(level) + 0.01 - 1e-6, `${level}: ${_p.y - f.plan.y} < cresta + 1 cm`);
  }
});

test('pez: se mueve solo (cada fotograma con el tiempo del viento) sin que nadie llame a update', () => {
  const scene = new THREE.Scene();
  const f = addFish(scene, { ...hole(7), level: 'low' });
  const slot = fishSchedule(f.plan.seed, 30, 400)[0], j = fishJump(f.plan, slot.k);
  const w = windUniforms.uWind.value.w;
  windUniforms.uWind.value.w = slot.start + j.air * 0.5;
  scene.updateMatrixWorld(); // lo que hace el renderer en cada render()
  assert.equal(f.fishMesh.visible, true);
  windUniforms.uWind.value.w = slot.start - 3;
  scene.updateMatrixWorld();
  assert.equal(f.fishMesh.visible, false);
  windUniforms.uWind.value.w = w;
  f.dispose();
});

// ---------- compatibilidad ----------

test('pez: bakeStatic no lo funde con el decorado (userData.keep): sale intacto al padre', () => {
  const root = new THREE.Group(), out = new THREE.Group();
  const f = makeFish({ ...hole(1), level: 'medium' });
  root.add(f.group);
  const rock = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
  root.add(rock);
  bakeStatic(root, out);
  assert.ok(out.children.includes(f.group), 'el grupo del pez pasa tal cual');
  assert.ok(f.group.children.includes(f.fishMesh) && f.group.children.includes(f.splashMesh));
  assert.equal(f.fishMesh.geometry.getAttribute('fishTone').itemSize, 4, 'sin perder atributos');
});

test('pez: dispose quita el grupo y libera InstancedMesh y geometrías clonadas, no el material compartido', () => {
  const scene = new THREE.Scene();
  const f = addFish(scene, { ...hole(1), level: 'high' });
  assert.ok(scene.children.includes(f.group));
  assert.notEqual(f.fishMesh.geometry, fishGeometry('high'), 'geometría clonada por hoyo');
  assert.notEqual(f.splashMesh.geometry, splashGeometry('high'));
  const seen = [];
  for (const o of [f.fishMesh.geometry, f.splashMesh.geometry, f.fishMesh, f.splashMesh]) o.addEventListener('dispose', () => seen.push(o));
  let matGone = false;
  fishMaterial().addEventListener('dispose', () => (matGone = true));
  splashMaterial().addEventListener('dispose', () => (matGone = true));
  f.dispose();
  assert.ok(!scene.children.includes(f.group));
  assert.equal(seen.length, 4);
  assert.equal(matGone, false);
  // la geometría compartida sigue sirviendo a otro hoyo
  assert.equal(fishGeometry('high').attributes.position.count / 3, fishTriangles('high'));
});

test('pez: solo dibujo: no toca el río ni el terreno que recibe; la calidad se acepta como nombre, preset o lod', () => {
  const before = JSON.stringify([river.w, river.y, river.grounded]);
  for (const level of ['low', { level: 'high' }, { lod: 1 }, 2, undefined]) {
    const f = makeFish({ ...hole(1), level });
    assert.ok(f.stats.level);
  }
  assert.equal(JSON.stringify([river.w, river.y, river.grounded]), before);
  assert.equal(makeFish({ ...hole(1), level: { lod: 0 } }).stats.level, 'low');
  assert.equal(makeFish({ ...hole(1), level: 2 }).stats.level, 'high');
});

// ---------- laboratorio ----------

test('laboratorio: parche de lago y de río con peces que saltan a menudo (fast) sobre el agua actual', async () => {
  const { fishLakePatch, fishRiverPatch } = await import('../src/lab/assets/fishPatch.js');
  for (const [make, kind] of [[fishLakePatch, 'lake'], [fishRiverPatch, 'river']]) {
    for (const level of LEVELS) {
      const preset = { level, sceneTheme: THEMES.meadowDay };
      const old = make(seededRng(3), preset, { fish: false });
      const neu = make(seededRng(3), preset);
      assert.ok(old && neu, kind);
      let fishOld = null, fishNew = null;
      old.traverse((o) => o.userData.fish && (fishOld = o));
      neu.traverse((o) => o.userData.fish && (fishNew = o));
      assert.equal(fishOld, null, 'el «antes» es el agua sin peces');
      assert.ok(fishNew, `${kind}: hay peces`);
      const st = fishNew.userData.fish;
      assert.ok(st.fish >= 1 && st.fish <= 2, `${kind}: 1–2 peces en el laboratorio (${st.fish})`);
      assert.ok(st.fast, 'saltos cada 2–3 s');
      assert.ok(neu.userData.lab.dist <= 14, 'cámara cerca para ver el pez');
    }
  }
  // tema sin peces: el «después» es el agua sola
  const lava = fishLakePatch(seededRng(3), { level: 'medium', sceneTheme: THEMES.glacier });
  if (lava) {
    let any = null;
    lava.traverse((o) => o.userData.fish && (any = o));
    assert.equal(any === null, true, "glaciar: sin peces");
  }
});

// ---------- revisión: ocultación por distancia, lecho, count 0, entradas inválidas ----------

test('pez: con auto (por defecto) la ocultación por distancia sobrevive a scene.updateMatrixWorld y vuelve al acercar la cámara', () => {
  const scene = new THREE.Scene();
  const f = addFish(scene, { ...hole(7), level: 'low' });
  const slot = fishSchedule(f.plan.seed, 30, 400)[0], j = fishJump(f.plan, slot.k);
  const t = slot.start + j.air * 0.5, q = fishPoseAt(f.plan, t);
  const w = windUniforms.uWind.value.w;
  windUniforms.uWind.value.w = t;
  const lejos = new THREE.Vector3(q.x + FISH_FAR + 10, q.y, q.z), cerca = new THREE.Vector3(q.x + 3, q.y, q.z);
  f.update(undefined, lejos);
  assert.equal(f.fishMesh.visible, false, 'lejos: oculto');
  scene.updateMatrixWorld();
  assert.equal(f.fishMesh.visible, false, 'el gancho no lo deshace');
  assert.equal(f.splashMesh.visible, false);
  f.update(undefined, cerca);
  scene.updateMatrixWorld();
  assert.equal(f.fishMesh.visible, true, 'cerca: visible');
  f.update(undefined, null);
  scene.updateMatrixWorld();
  assert.equal(f.fishMesh.visible, true, 'sin cámara: siempre visible');
  windUniforms.uWind.value.w = w;
  f.dispose();
});

test('pez: el pez entero (medio alto 0,13 x alto) cabe sobre el lecho en un sitio de la profundidad mínima, todo el recorrido', () => {
  const bed = Y - (FISH_CLEAR.depth + 0.05);
  const biggest = Math.max(...Object.values(FISH_SPECIES).map((S) => S.length * 1.1 * S.hk));
  let minGap = Infinity;
  // recorrido completo con el tiempo real de cada hueco
  for (const seed of SEEDS) {
    const p = plan(seed);
    for (const slot of fishSchedule(p.seed, 0, 600)) {
      const j = fishJump(p, slot.k), F = p.fish[j.fish];
      for (let tau = -j.approach; tau <= j.end; tau += 0.02) {
        const pose = fishPoseAt(p, slot.start + tau);
        if (!pose) continue;
        minGap = Math.min(minGap, pose.y - 0.13 * F.length * F.hk - bed);
      }
    }
  }
  assert.ok(Number.isFinite(minGap), 'se midió');
  assert.ok(minGap >= 0, `minBedGap ${minGap.toFixed(3)} m: atraviesa el lecho`);
  assert.ok(FISH_JUMP.dive + 0.13 * biggest <= FISH_CLEAR.depth + 0.05, 'dive cabe con el pez más alto');
  assert.ok(plan(1).spots.length > 0, 'sigue habiendo sitios válidos');
});

test('pez: count 0 da 0 peces (plan sin peces, addFish -> null); count 1 da uno', () => {
  const p = plan(7, { count: 0 });
  assert.equal(p.fish.length, 0);
  assert.equal(addFish(new THREE.Scene(), { ...hole(7), count: 0 }), null);
  assert.equal(plan(7, { count: 1 }).fish.length, 1);
  assert.equal(fishPoseAt(p, 10), null);
});

test('pez: un river sin along/dist/w da plan vacío (como un heightAt inválido), sin lanzar', () => {
  for (const bad of [{}, { y: Y }, { along: () => [0, 0], dist: () => 0 }, { w: 3, dist: () => 0 }, { w: NaN, along: () => [0, 0], dist: () => 0 }]) {
    const p = plan(7, { river: bad });
    assert.equal(p.spots.length, 0, JSON.stringify(Object.keys(bad)));
    assert.equal(p.fish.length, 0);
    assert.equal(addFish(new THREE.Scene(), { ...hole(7), river: bad }), null);
  }
  assert.equal(plan(7, { heightAt: 5 }).spots.length, 0);
});

test('pez: una sonda de orilla con altura NaN cuenta como NO apta (el sitio se rechaza)', () => {
  // agua honda en un disco y NaN fuera: el carril cabe en el disco, pero los anillos de sus puntos salen a NaN
  const disc = (r) => (x, z) => (Math.hypot(x - 11, z - 2) <= r ? Y - 2 : NaN);
  const extra = { river: null, area: { x: 11, z: 2, r: 4 }, courseDist: null, tee: null };
  assert.ok(planFish({ ...hole(7), ...extra, heightAt: disc(6) }).spots.length > 0, 'control: disco grande con sitios');
  assert.equal(planFish({ ...hole(7), ...extra, heightAt: disc(2.6) }).spots.length, 0, 'NaN en el anillo: sin sitios');
});
