import * as THREE from 'three';
import { COMMON_UNIFORMS, GLSL_COMMON_DECL, GLSL_LIB, GLSL_REVEAL, DEFAULT_PATTERN_FN, declareUniforms } from './shaderLib.js';
import { getStudioEnv } from './envStudio.js';
import { getPattern, PATTERN_IDS } from './patterns/index.js';
import { getQuality } from '../quality.js';
import { TIERS } from '../../../progress/skins.js';
import { STILL_TIME, reducedMotion } from './fxRules.js';

// Material premium de bola.
//   createSkinMaterial(skin, { quality, instance, theme }, deps) -> { material, update, dispose, ... }
// `deps` lo aporta ballSkins.js ({ canvas(skin, dimples), legacy(material, skin, map, disposables) })
// para no tener un import circular; ballSkins.js exporta la versión ya enlazada.

const LEVEL = { low: 0, medium: 1, high: 2 };
const EMPTY_CTX = Object.freeze({ speed: 0, impact: 0, state: 0 });

// Extras por preset de acabado (la base —roughness/metalness/clearcoat— viene de skin.finish).
const PRESETS = {
  satin: { clearcoatRoughness: 0.3, sheen: 0, iridescence: 0, envMapIntensity: 0.7 },
  pearl: { clearcoatRoughness: 0.18, sheen: 0.5, iridescence: 0.1, envMapIntensity: 0.9 },
  pbr: { clearcoatRoughness: 0.1, sheen: 0, iridescence: 0, envMapIntensity: 1.1 },
  layered: { clearcoatRoughness: 0.06, sheen: 0, iridescence: 0.2, envMapIntensity: 1.25 },
  hdr: { clearcoatRoughness: 0.04, sheen: 0, iridescence: 0.3, envMapIntensity: 1.4 },
  reactive: { clearcoatRoughness: 0.03, sheen: 0, iridescence: 0.4, envMapIntensity: 1.6 },
};

// --- texturas compartidas (hoyuelos): no se liberan con el material ---
const dimples = {};
function dimpleNormal(level) {
  const file = level === 'low' ? 'dimples-normal-512.png' : 'dimples-normal.png';
  if (!dimples[file]) {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    const t = new THREE.TextureLoader().load(`${base}skins/${file}`);
    t.wrapS = THREE.RepeatWrapping; // sin costura en u=0/1
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    dimples[file] = t;
  }
  return dimples[file];
}

function seedValue(seed) {
  const n = Number.isFinite(seed) ? seed : 0;
  return ((Math.abs(n) * 0.6180339887) % 1) * 64;
}

function cloneUniform(u) {
  const v = u?.value;
  return { value: v && !v.isTexture && typeof v.clone === 'function' ? v.clone() : v };
}

function qualityDefines(pattern, level) {
  const q = pattern.quality?.[level];
  let out = `#define SK_Q ${LEVEL[level]}\n`;
  if (typeof q === 'number') out += `#define SK_LEVEL ${q}\n#define SK_LEVEL_F ${q.toFixed(4)}\n`;
  else if (q && typeof q === 'object') {
    for (const [k, v] of Object.entries(q)) {
      if (typeof v !== 'number') continue;
      const K = k.toUpperCase();
      out += `#define SK_${K} ${Number.isInteger(v) ? v : v.toFixed(4)}\n#define SK_${K}_F ${v.toFixed(4)}\n`;
    }
  }
  return out;
}

/** Patrón de shader de una skin, o null si no tiene (o es un stub vacío). */
export function patternFor(skin) {
  const id = skin.shader ?? (PATTERN_IDS.includes(skin.id) ? skin.id : null);
  const p = getPattern(id);
  return p && p.glsl && p.glsl.trim() ? p : null;
}

export function createSkinMaterial(skin, opts = {}, deps) {
  const level = LEVEL[opts.quality] !== undefined ? opts.quality : getQuality();
  const instance = opts.instance ?? {};
  const theme = opts.theme ?? null;
  const finish = skin.finish ?? {};
  const legacy = skin.material ?? {};
  const preset = PRESETS[finish.preset] ?? PRESETS.satin;
  const pal = skin.palette ?? { base: skin.base, accent: skin.accent, secondary: skin.secondary ?? skin.accent, glow: skin.shimmer ?? skin.accent };

  const disposables = [];
  const dark = !!theme && !!(theme.dark || theme.neon || theme.lava || (theme.sunIntensity !== undefined && theme.sunIntensity < 2));
  const envTint = theme?.rim ?? pal.glow ?? pal.accent ?? '#ffffff';
  const envMap = getStudioEnv(dark ? 'dark' : 'light', envTint);

  const base = {
    roughness: legacy.roughness ?? finish.roughness ?? 0.4,
    metalness: legacy.metalness ?? finish.metalness ?? 0,
    envMap,
    envMapIntensity: legacy.envMapIntensity ?? finish.envMapIntensity ?? preset.envMapIntensity,
  };

  let material;
  let legacyUpdate = null;
  let U = null;
  let pattern = null;
  let patU = null;

  if (level === 'low') {
    // Baja: material estándar + textura canvas horneada (con hoyuelos pintados), sin shader ni animación
    const map = new THREE.CanvasTexture(deps.canvas(skin, true));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    material = new THREE.MeshStandardMaterial({
      ...base,
      map,
      emissive: legacy.emissive ? new THREE.Color(legacy.emissive) : new THREE.Color(0),
      emissiveIntensity: legacy.emissiveIntensity ?? 0,
    });
    disposables.push(map);
  } else {
    pattern = patternFor(skin);
    const map = new THREE.CanvasTexture(deps.canvas(skin, false));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = level === 'high' ? 8 : 4;
    disposables.push(map);

    material = new THREE.MeshPhysicalMaterial({
      ...base,
      map,
      normalMap: dimpleNormal(level),
      normalScale: new THREE.Vector2(finish.dimples ?? 0.8, finish.dimples ?? 0.8),
      clearcoat: legacy.clearcoat ?? finish.clearcoat ?? 0,
      clearcoatRoughness: legacy.clearcoatRoughness ?? finish.clearcoatRoughness ?? preset.clearcoatRoughness,
      iridescence: legacy.iridescence ?? finish.iridescence ?? preset.iridescence,
      iridescenceIOR: legacy.iridescenceIOR ?? 1.6,
      sheen: preset.sheen,
      sheenColor: new THREE.Color(pal.accent ?? '#ffffff'),
      sheenRoughness: 0.5,
      emissive: legacy.emissive ? new THREE.Color(legacy.emissive) : new THREE.Color(0),
      emissiveIntensity: legacy.emissiveIntensity ?? 0,
    });

    const tierColor = new THREE.Color(TIERS[skin.tier ?? skin.rarity]?.color ?? '#ffffff');
    U = {};
    for (const [k, v] of Object.entries(COMMON_UNIFORMS)) U[k] = { value: v };
    U.uQuality.value = LEVEL[level];
    U.uRevealColor = { value: tierColor };
    U.uPalBase = { value: new THREE.Color(pal.base ?? '#ffffff') };
    U.uPalAccent = { value: new THREE.Color(pal.accent ?? '#ffffff') };
    U.uPalSecondary = { value: new THREE.Color(pal.secondary ?? pal.accent ?? '#ffffff') };
    U.uPalGlow = { value: new THREE.Color(pal.glow ?? pal.accent ?? '#ffffff') };
    U.uSeed.value = seedValue(instance.seed);
    patU = {};
    if (pattern) for (const [k, u] of Object.entries(pattern.uniforms ?? {})) patU[k] = cloneUniform(u);

    const head =
      (pattern ? qualityDefines(pattern, level) : `#define SK_Q ${LEVEL[level]}\n`) +
      GLSL_COMMON_DECL +
      declareUniforms(patU) +
      GLSL_LIB +
      GLSL_REVEAL +
      (pattern ? pattern.glsl : DEFAULT_PATTERN_FN);

    material.customProgramCacheKey = () => `skin:${pattern ? pattern.id : 'none'}:${level}`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, patU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjX;\nvarying vec3 vObjY;\nvarying vec3 vObjZ;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvObjPos = normalize(position);\nvObjX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));\nvObjY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));\nvObjZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${head}`)
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nsk_dRough = 0.0; sk_dMetal = 0.0; sk_emis = vec3(0.0); sk_nPert = vec3(0.0);\nskinPattern(vObjPos, diffuseColor);\nsk_applyReveal(vObjPos);',
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + sk_dRough, 0.04, 1.0);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(metalnessFactor + sk_dMetal, 0.0, 1.0);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + sk_nPert.x * vObjX + sk_nPert.y * vObjY + sk_nPert.z * vObjZ);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sk_emis;');
    };

    // Animación heredada (offsets del mapa, emisión) mientras la skin no tenga patrón de shader propio
    if (!pattern) legacyUpdate = deps.legacy(material, skin, map, disposables);
  }

  let disposed = false;
  const nativeDispose = material.dispose.bind(material);

  return {
    material,
    quality: level,
    update(t, dt, ctx) {
      if (disposed) return;
      // E2: con «reducir movimiento» la bola queda como su miniatura (hora fija, impacto a la mitad)
      const rm = reducedMotion();
      if (rm) {
        t = STILL_TIME;
        dt = 0;
      }
      if (U) {
        U.uTime.value = t;
        if (ctx) {
          U.uSpeed.value = rm ? 0 : ctx.speed ?? 0;
          U.uImpact.value = (ctx.impact ?? 0) * (rm ? 0.5 : 1);
          U.uState.value = ctx.state ?? 0;
        }
        if (pattern) pattern.update?.(patU, t, dt, ctx ?? EMPTY_CTX);
      }
      legacyUpdate?.(t, dt);
    },
    /** Disolución de reveal: 0 (invisible) → 1 (completa). */
    setReveal(v) {
      if (U) U.uReveal.value = v;
    },
    /** Cambia la semilla de patrón sin recompilar. */
    setInstance(inst = {}) {
      if (!U) return;
      U.uSeed.value = seedValue(inst.seed);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const d of disposables) d.dispose();
      disposables.length = 0;
      nativeDispose();
    },
  };
}
