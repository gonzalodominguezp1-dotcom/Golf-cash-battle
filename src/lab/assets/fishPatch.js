// Parches del laboratorio con peces: el agua actual (lago o río de waterPatch.js, el mismo
// «Después» del paso 8) con 1–2 peces que saltan cada 2–3 s (fast: solo en el laboratorio)
// para verlos sin esperar. «Antes» = el mismo parche sin peces. Cámara más cerca: un pez mide
// ~0,3-0,5 m. Solo desarrollo: no entra en el build.
import * as THREE from 'three';
import { addFish } from '../../game/render/assets/fish.js';
import { setWaterRipples } from '../../game/render/assets/water.js';
import { windUniforms } from '../../game/render/assets/wind.js';
import { newLakePatch, newRiverPatch, lakeHeight, riverHeight, labRiver, LAB_WATER_Y } from './waterPatch.js';

const VIEW = { lake: { dist: 11, target: [1, LAB_WATER_Y, 2] }, river: { dist: 12, target: [0, LAB_WATER_Y, 0] } };

const RIPPLE_WINDOW = 2.5; // s de vida de un anillo (WATER_RIPPLES.life)
const WRAP = 3600; // vuelta del tiempo del viento

/**
 * Conecta el pez con el agua: en cada render (como el pez, que se mueve solo) pide a los peces
 * los saltos de los últimos RIPPLE_WINDOW s y los pone como anillos en el material del agua.
 * splashEvents acepta un intervalo que cruza la vuelta de la hora (t1 < t0).
 */
function connectRipples(root, fishes) {
  // waterMaterial() es uno por calidad+paleta y compartido: si pintáramos anillos en él, el «antes» (sin
  // peces, mismo nivel y tema) los mostraría. Este parche lleva su propia copia, con el uniforme uRipples
  // nuevo y el resto de uniformes (viento, luces, normal-map) compartidos por referencia.
  const own = new Map();
  root.userData.lab.measure.traverse((o) => {
    const src = o.isMesh && o.material?.uniforms?.uRipples ? o.material : null;
    if (!src) return;
    if (!own.has(src)) {
      const uniforms = { ...src.uniforms, uRipples: { value: src.uniforms.uRipples.value.map(() => new THREE.Vector4(0, 0, 0, 0)) } };
      const { vertexShader, fragmentShader, lights, fog, transparent, depthWrite } = src;
      const m = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, lights, fog, transparent, depthWrite });
      m.name = `${src.name}-lab-ripples`;
      own.set(src, m);
    }
    o.material = own.get(src);
  });
  const mats = new Set(own.values());
  if (!mats.size) return; // Bajo: sin anillos
  const base = root.updateMatrixWorld;
  root.updateMatrixWorld = function (force) {
    const t = windUniforms.uWind.value.w;
    const events = fishes.splashEvents(((t - RIPPLE_WINDOW) % WRAP + WRAP) % WRAP, t);
    for (const m of mats) setWaterRipples(m, events, t);
    base.call(this, force);
  };
}

function fishPatch(kind, rng, preset, { fish = true } = {}) {
  const g = kind === 'lake' ? newLakePatch(rng, preset) : newRiverPatch(rng, preset);
  if (!g) return null;
  g.userData.lab = { ...g.userData.lab, ...VIEW[kind] };
  if (!fish) return g;
  const fishes = addFish(g.userData.lab.measure, {
    rng,
    y: LAB_WATER_Y,
    heightAt: kind === 'lake' ? lakeHeight : riverHeight,
    river: kind === 'river' ? labRiver() : null,
    area: kind === 'lake' ? { x: 1, z: 2, r: 8 } : { x: 0, z: 0, r: 18 },
    theme: preset.sceneTheme,
    level: preset.level,
    fast: true,
    count: 2,
  });
  if (fishes) connectRipples(g, fishes);
  return g;
}

/** Lago del laboratorio con peces (opts.fish = false: el mismo lago sin peces, para el «antes»). */
export const fishLakePatch = (rng, preset, opts) => fishPatch('lake', rng, preset, opts);
/** Río del laboratorio con peces (opts.fish = false: sin peces). */
export const fishRiverPatch = (rng, preset, opts) => fishPatch('river', rng, preset, opts);
