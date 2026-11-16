// Hook de módulos para tests: Node no importa .css, así que un import de hoja de estilos se vuelve un módulo vacío.
export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  return next(url, context);
}
