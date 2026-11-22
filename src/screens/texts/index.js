// Diccionario de textos de las pantallas. Toda cadena visible vive en texts/<ns>.js.
const dicts = new Map();

export function register(ns, dict) {
  dicts.set(ns, { ...(dicts.get(ns) || {}), ...dict });
}

function missing(key) {
  // En pruebas (Node, sin import.meta.env) lanza; en el navegador devuelve la clave.
  if (typeof import.meta.env === 'undefined') throw new Error(`Texto inexistente: ${key}`);
  console.warn(`Texto inexistente: ${key}`);
  return key;
}

export function t(key, vars) {
  const dot = key.indexOf('.');
  const ns = dot < 0 ? key : key.slice(0, dot);
  const name = dot < 0 ? '' : key.slice(dot + 1);
  const raw = dicts.get(ns)?.[name];
  if (typeof raw !== 'string') return missing(key);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
