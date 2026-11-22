// Reglas puras del calentamiento de GPU (sin three ni DOM): las reutilizan F1c, F2 y F3.

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'lightMap', 'displacementMap', 'specularMap'];

/** Cede el hilo principal: scheduler.yield si existe, si no un setTimeout(0). */
export function yieldToMain() {
  return globalThis.scheduler?.yield?.() ?? new Promise((r) => setTimeout(r, 0));
}

/**
 * Ejecuta los pasos (sync o async) uno por tarea, cediendo entre ellos.
 * signal.cancelled corta y resuelve { cancelled: true }. Un error se propaga.
 */
export async function runSteps(steps, { signal, yieldFn = yieldToMain, onProgress } = {}) {
  const n = steps.length;
  for (let i = 0; i < n; i++) {
    if (signal?.cancelled) return { cancelled: true };
    await steps[i]();
    onProgress?.((i + 1) / n);
    if (i < n - 1) {
      await yieldFn();
      if (signal?.cancelled) return { cancelled: true };
    }
  }
  return { cancelled: false };
}

/** Resuelve { ok: true, value } o { ok: false, timeout: true } si pasan `ms`. */
export function withCap(promise, ms, timers = { setTimeout, clearTimeout }) {
  return new Promise((resolve, reject) => {
    const id = timers.setTimeout(() => resolve({ ok: false, timeout: true }), ms);
    Promise.resolve(promise).then(
      (value) => { timers.clearTimeout(id); resolve({ ok: true, value }); },
      (err) => { timers.clearTimeout(id); reject(err); },
    );
  });
}

/**
 * Clave de un hoyo preparado: si al arrancar no coincide (otro hoyo, otra skin, otro acabado u otra calidad),
 * la preparación no vale y se construye como siempre.
 */
export function keyOf(course, skin, instance, quality) {
  return `${course?.name ?? ''}|${skin?.id ?? ''}|${instance?.seed ?? ''}|${quality ?? ''}`;
}

export function chunk(list, n) {
  const size = Math.max(1, Math.floor(n) || 1);
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Todas las texturas de los materiales bajo `root` (mapas estándar y uniforms de shaders). */
export function collectTextures(root) {
  const found = new Set();
  const add = (t) => { if (t && t.isTexture) found.add(t); };
  const visitMaterial = (m) => {
    if (!m) return;
    for (const slot of TEXTURE_SLOTS) add(m[slot]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u?.value);
  };
  const visit = (o) => {
    const mat = o.material;
    if (Array.isArray(mat)) mat.forEach(visitMaterial);
    else visitMaterial(mat);
  };
  if (typeof root?.traverse === 'function') root.traverse(visit);
  else if (root) visit(root);
  return found;
}
