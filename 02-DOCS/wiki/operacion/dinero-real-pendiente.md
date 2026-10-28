# Pendiente antes de dinero real

Hoy el juego usa créditos demo y no hay dinero real. Estos puntos deben cumplirse antes de activarlo. Las referencias son a la constitución (`sdd/constitution.md`, sección 5, S5.10 y S5.11).

- **Identidad:** proveedor real (Didit o equivalente) en lugar del modo pruebas, donde la fecha y el documento se escriben a mano.
- **Antibots y anticheat:** implementados, revisados y ajustados con datos reales (ver [validación y antibots](../backend/validacion-y-antibots.md)).
- **Revisión legal:** modelo de habilidad frente a juego de azar, por país.
- **Pagos:** pasarela en producción. Hoy los depósitos cripto están en pruebas (NOWPayments, sandbox por defecto).
- **Seguridad de base de datos:** auditoría de RLS y de las funciones `SECURITY DEFINER`.
- **Registro anónimo:** protección contra abuso.

Cuando se cumpla un punto, se anota aquí con la fecha y la prueba.
