// Códigos de canje: cada código desbloquea una skin que no se consigue de otra forma.
// El código se compara sin distinguir mayúsculas ni espacios. El catálogo está en el cliente, igual que el
// resto de requisitos de skin (el servidor tampoco comprueba ninguno, ver save_progress): es cosmético.

export const CODES = {
  RDR: 'huevo_mio',
};

/** «  rdr » -> «RDR». Siempre devuelve un string (nunca lanza). */
export const normalizeCode = (raw) => String(raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 32);

/** id de la skin que da el código, o null si no existe. */
export function skinForCode(raw) {
  const code = normalizeCode(raw);
  return Object.prototype.hasOwnProperty.call(CODES, code) ? CODES[code] : null;
}
