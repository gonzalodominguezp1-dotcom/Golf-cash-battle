import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Elementos con textura ASCII en los mapas de neón (2026-11-23): nubes de caracteres, pilares de energía que suben
// y naves voladoras con estela. Solo entorno lejano: sin física, sin rng del hoyo. Ver assets/asciiNeon.js.

const ascii = await import('../src/game/render/assets/asciiNeon.js');
const { ASCII_BUDGET, ASCII_MAX_CALLS, ASCII_MAX_TRIS, ASCII_GLYPHS, ASCII_PERIOD, ASCII_LAYOUT } = ascii;
const { asciiGlyphAtlas, glyphCoverage, makeAsciiClouds, makeAsciiPillars, makeAsciiFlyers, addAsciiNeon } = ascii;

// el atlas se genera ANTES de que exista ningún `document` (node puro, sin canvas)
const NO_DOC = typeof globalThis.document === 'undefined';
const ATLAS_NO_DOC = asciiGlyphAtlas();

// el resto del entorno (fachadas, carteles) sí usa canvas: un doble mínimo basta
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { setQuality, isAutoQuality, getQuality } = await import('../src/game/render/quality.js');
const { windUniforms } = await import('../src/game/render/assets/wind.js');

const LEVELS = ['low', 'medium', 'high'];
const NEON = ['neon', 'neonPink', 'cyber2078'];
const BOUNDS = { minX: -4, maxX: 4, minZ: -10, maxZ: 10, maxY: 0 };
function withQuality(level, fn) {
  const prev = isAutoQuality() ? null : getQuality();
  setQuality(level);
  try {
    return fn();
  } finally {
    setQuality(prev);
  }
}
function lcg(seed) {
  let s = seed;
  const f = () => (f.calls++, (s = (s * 16807) % 2147483647) / 2147483647);
  f.calls = 0;
  return f;
}
const quadsOf = (m) => m.geometry.index.count / 6;
const trisOf = (m) => m.geometry.index.count / 3;
const asciiGroup = (scene) => scene.children.find((o) => o.name === 'ascii-neon');

test('atlas de glifos: DataTexture pequeña (≤ 512 px) generada en node sin document, compartida y con cada glifo distinto', () => {
  assert.ok(NO_DOC, 'el atlas se generó sin document');
  assert.ok(ATLAS_NO_DOC && ATLAS_NO_DOC.isDataTexture, 'DataTexture (no null) en node');
  const { width, height } = ATLAS_NO_DOC.image;
  assert.ok(width <= 512 && height <= 512, `${width} x ${height}`);
  assert.equal(asciiGlyphAtlas(), ATLAS_NO_DOC, 'una sola textura compartida');
  const src = readFileSync(new URL('../src/game/render/assets/asciiNeon.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /document\b/, 'sin canvas: no depende de document');
  assert.doesNotMatch(src, /Math\.random/);
  // solo ASCII imprimible + bloques ░▒▓█ ■ y la doble barra ║ (nada de emoji)
  for (const ch of ASCII_GLYPHS) {
    const c = ch.codePointAt(0);
    assert.ok((c >= 0x20 && c < 0x7f) || '░▒▓█■║'.includes(ch), `glifo ${ch} (U+${c.toString(16)})`);
  }
  // el espacio vacío; los demás con tinta; los sombreados de menos a más
  assert.equal(glyphCoverage(' '), 0);
  for (const ch of ASCII_GLYPHS.replace(' ', '')) assert.ok(glyphCoverage(ch) > 0, `glifo ${ch} con tinta`);
  assert.ok(glyphCoverage('░') < glyphCoverage('▒') && glyphCoverage('▒') < glyphCoverage('▓') && glyphCoverage('▓') < glyphCoverage('█'));
  // glifos distintos dan teselas distintas
  const tiles = new Set([...ASCII_GLYPHS].map((ch) => ascii.glyphTile(ch).join(',')));
  assert.equal(tiles.size, ASCII_GLYPHS.length);
});

test('presupuesto por calidad: nubes, pilares y naves según Bajo < Medio < Alto; ≤ 3 llamadas y triángulos bajo el tope', () => {
  assert.ok(ASCII_BUDGET.clouds.low <= 4 && ASCII_BUDGET.pillars.low <= 2);
  assert.ok(ASCII_BUDGET.flyers.low >= 1 && ASCII_BUDGET.flyers.high <= 2);
  for (const k of ['clouds', 'pillars']) assert.ok(ASCII_BUDGET[k].low < ASCII_BUDGET[k].medium && ASCII_BUDGET[k].medium < ASCII_BUDGET[k].high, k);
  assert.equal(ASCII_MAX_CALLS, 3);
  // medido: Bajo 14, Medio 26, Alto 36 triángulos (2 por elemento); tope escrito aquí y en el código
  assert.equal(ASCII_MAX_TRIS, 64);
  for (const level of LEVELS) {
    const theme = THEMES.neon;
    assert.equal(quadsOf(makeAsciiClouds({ level, theme })), ASCII_BUDGET.clouds[level], `nubes ${level}`);
    assert.equal(quadsOf(makeAsciiPillars({ level, theme })), ASCII_BUDGET.pillars[level], `pilares ${level}`);
    assert.equal(quadsOf(makeAsciiFlyers({ level, theme })), ASCII_BUDGET.flyers[level], `naves ${level}`);
    const scene = new THREE.Scene();
    const h = addAsciiNeon(scene, { bounds: BOUNDS, theme, level });
    const meshes = asciiGroup(scene).children.filter((o) => o.isMesh);
    assert.equal(h.stats.calls, meshes.length);
    assert.ok(h.stats.calls <= ASCII_MAX_CALLS, `${level}: ${h.stats.calls} llamadas`);
    assert.equal(h.stats.triangles, meshes.reduce((s, m) => s + trisOf(m), 0));
    assert.ok(h.stats.triangles <= ASCII_MAX_TRIS, `${level}: ${h.stats.triangles} triángulos`);
    assert.equal(h.stats.points, 0, 'sin puntos');
  }
});

test('entorno neón real: un grupo ascii-neon con ≤ 3 llamadas por hoyo, solo en temas neón; 0 tiradas del rng del hoyo', () => {
  const neonCourses = COURSES.filter((c) => THEMES[c.theme].neon);
  assert.ok(neonCourses.length >= 4);
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses) {
        const scene = new THREE.Scene(), base = lcg(7);
        let fromAscii = 0;
        const rng = () => {
          const lim = Error.stackTraceLimit;
          Error.stackTraceLimit = 60;
          const st = new Error().stack;
          Error.stackTraceLimit = lim;
          if (/assets[\\/]asciiNeon\.js/.test(st)) fromAscii++;
          return base();
        };
        const env = buildEnvironment(scene, c, THEMES[c.theme], rng);
        assert.equal(fromAscii, 0, `${c.name} (${level}): ASCII no tira del rng del hoyo`);
        const g = asciiGroup(scene);
        assert.ok(g, `${c.name} (${level}): ASCII`);
        const meshes = g.children.filter((o) => o.isMesh);
        assert.ok(meshes.length >= 1 && meshes.length <= ASCII_MAX_CALLS, `${c.name} (${level}): ${meshes.length} llamadas`);
        assert.ok(meshes.reduce((s, m) => s + trisOf(m), 0) <= ASCII_MAX_TRIS);
        // misma textura de glifos en todos los hoyos (no se duplica)
        for (const m of meshes) assert.equal(m.material.uniforms.uAtlas.value, asciiGlyphAtlas());
        env.dispose();
        assert.ok(!asciiGroup(scene), `${c.name}: dispose quita el ASCII`);
      }
    });
  // temas naturales: nada de ASCII
  for (const c of COURSES.filter((c) => !THEMES[c.theme].neon).slice(0, 3)) {
    const scene = new THREE.Scene();
    buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
    assert.ok(!asciiGroup(scene), c.name);
  }
});

test('el decorado neón no se mueve: mismas tiradas del rng del hoyo con y sin ASCII', () => {
  // addAsciiNeon no recibe rng (semilla propia): se comprueba que el reparto entero no depende de él
  const c = COURSES.find((c) => c.theme === 'neon');
  const a = lcg(7), b = lcg(7);
  buildEnvironment(new THREE.Scene(), c, THEMES.neon, a);
  const s2 = new THREE.Scene();
  addAsciiNeon(s2, { bounds: courseBounds(c), theme: THEMES.neon, level: 'high' });
  buildEnvironment(s2, c, THEMES.neon, b);
  assert.equal(a.calls, b.calls);
  // y es determinista: dos montajes, mismas posiciones
  const p = () => {
    const s = new THREE.Scene();
    addAsciiNeon(s, { bounds: BOUNDS, theme: THEMES.neonPink, level: 'high' });
    return asciiGroup(s).children.map((m) => Array.from(m.geometry.attributes.position.array));
  };
  assert.deepEqual(p(), p());
});

test('no toca física: lejos de la pista, sin sombras, sin rayos y sin tocar el hoyo', () => {
  for (const k of NEON) {
    const scene = new THREE.Scene();
    const c = COURSES.find((c) => c.theme === k);
    const b = courseBounds(c);
    const before = JSON.stringify(c);
    addAsciiNeon(scene, { bounds: b, theme: THEMES[k], level: 'high' });
    assert.equal(JSON.stringify(c), before, `${k}: el hoyo no cambia`);
    const g = asciiGroup(scene);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 30, 0), new THREE.Vector3(1, 0, 0));
    ray.far = 1000;
    for (let i = 0; i < 16; i++) {
      ray.ray.direction.set(Math.cos(i), 0.1, Math.sin(i)).normalize();
      assert.equal(ray.intersectObject(g, true).length, 0, `${k}: sin rayos (no es suelo ni pared)`);
    }
    g.traverse((o) => {
      assert.equal(o.castShadow, false);
      assert.equal(o.receiveShadow, false);
      assert.equal(o.userData.collider, undefined);
    });
    // todo lejano (≥ 60 m de la pista), en el aire o en el horizonte, y dentro de la cúpula del cielo (radio 180)
    for (const m of g.children) {
      const P = m.geometry.attributes.position.array, o = m.position;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i] + o.x, y = P[i + 1] + o.y, z = P[i + 2] + o.z;
        const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
        assert.ok(Math.hypot(dx, dz) >= 60, `${k}/${m.name}: ${Math.hypot(dx, dz).toFixed(1)} m de la pista`);
        assert.ok(Math.hypot(x, y, z) < 178, `${k}/${m.name}: dentro del cielo`);
      }
    }
  }
  const src = readFileSync(new URL('../src/game/render/assets/asciiNeon.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /physics|course\.js/, 'no importa la física ni el hoyo');
});

test('animación en el sombreador: tiempo del viento, órbitas y desplazamiento sin salto a la hora; update no crea objetos', () => {
  const scene = new THREE.Scene();
  const animated = [];
  const h = addAsciiNeon(scene, { bounds: BOUNDS, theme: THEMES.neon, level: 'high', animated });
  assert.ok(animated.includes(h.update));
  const g = asciiGroup(scene);
  const snapshot = () => g.children.map((m) => [m.uuid, m.geometry.uuid, m.material.uuid, m.geometry.attributes.position.version]);
  const s0 = snapshot(), n0 = scene.children.length;
  for (let i = 0; i < 200; i++) h.update(i / 60, 1 / 60);
  assert.deepEqual(snapshot(), s0, 'sin objetos ni geometría nuevos por fotograma');
  assert.equal(scene.children.length, n0);
  for (const m of g.children) {
    assert.match(m.material.vertexShader, /uWind\.w/, `${m.name}: tiempo del viento en el sombreador`);
    assert.equal(m.material.uniforms.uWind, windUniforms.uWind, `${m.name}: uWind compartido por referencia`);
    assert.equal(m.frustumCulled, false);
    // vueltas por hora enteras (la hora del viento vuelve a 0 sin salto); nubes y naves se mueven, los pilares no
    const O = m.geometry.attributes.aOrbit.array;
    for (let i = 3; i < O.length; i += 4) {
      assert.ok(Math.abs(O[i] - Math.round(O[i])) < 1e-6, `${m.name}: ${O[i]} vueltas/h`);
      if (m.name !== 'ascii-pillars') assert.notEqual(O[i], 0, `${m.name}: deriva`);
    }
  }
  // pilares: el texto sube con filas por hora múltiplo del periodo de la secuencia
  const pillars = g.children.find((m) => m.name === 'ascii-pillars');
  assert.match(pillars.material.fragmentShader, /mod\(/);
  // GLSL: nada de pow con una base que puede ser negativa (no definido en todas las GPU)
  for (const m of g.children) assert.doesNotMatch(m.material.fragmentShader, /pow\(\(?[^,]*-/, m.name);
  const S = pillars.geometry.attributes.aSeed.array;
  for (let i = 1; i < S.length; i += 4) {
    const k = (S[i] * 3600) / ASCII_PERIOD;
    assert.ok(S[i] > 0 && Math.abs(k - Math.round(k)) < 1e-3, `pilar: ${S[i]} filas/s`);
  }
  // capas: nubes arriba, pilares desde el horizonte, naves entre medias
  assert.ok(ASCII_LAYOUT.clouds.y[0] > 30 && ASCII_LAYOUT.pillars.y[0] <= 0 && ASCII_LAYOUT.flyers.y[0] > 30);
});

test('dispose: quita el grupo y libera geometrías y materiales una sola vez; el atlas compartido no se libera', () => {
  const scene = new THREE.Scene();
  const h = addAsciiNeon(scene, { bounds: BOUNDS, theme: THEMES.neonPink, level: 'medium' });
  const g = asciiGroup(scene);
  const freed = [];
  for (const m of g.children) {
    m.geometry.addEventListener('dispose', () => freed.push(`${m.name}-geo`));
    m.material.addEventListener('dispose', () => freed.push(`${m.name}-mat`));
  }
  let atlasFreed = 0;
  const atlas = asciiGlyphAtlas();
  const onAtlas = () => atlasFreed++;
  atlas.addEventListener('dispose', onAtlas);
  h.dispose();
  assert.ok(!asciiGroup(scene));
  assert.equal(freed.length, g.children.length * 2);
  assert.doesNotThrow(() => h.dispose());
  assert.equal(freed.length, g.children.length * 2, 'sin doble liberación');
  assert.equal(atlasFreed, 0, 'la textura de glifos es compartida');
  atlas.removeEventListener('dispose', onAtlas);
});

test('sin tema neón: addAsciiNeon no añade nada y su dispose no falla', () => {
  const scene = new THREE.Scene();
  const h = addAsciiNeon(scene, { bounds: BOUNDS, theme: THEMES.meadow, level: 'high' });
  assert.equal(scene.children.length, 0);
  assert.equal(h.stats.calls, 0);
  assert.doesNotThrow(() => (h.update(1, 1 / 60), h.dispose(), h.dispose()));
});
