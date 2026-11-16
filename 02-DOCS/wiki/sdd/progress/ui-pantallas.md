# Progreso: ui-pantallas

## Decision queue

- [blocking] T034 (Cuenta, tier 2: contraseña, identidad, sesión). Revisión humana antes de fusionar a main (no bloquea seguir en la rama). Revisar: cambio de contraseña (campos vaciados, mensajes fijos), cierre de sesión, nombre de usuario, `kycStart` (`location.href = r.url` viene del servidor, conservado tal cual; hoy la identidad está desactivada con `KYC_DISABLED`), y que Monedero sigue siendo el de `main.js` (hueco `ctx.legacy['account.monedero']`) hasta T035.
