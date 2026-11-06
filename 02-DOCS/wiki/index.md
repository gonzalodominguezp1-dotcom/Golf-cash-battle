# Wiki de Golf Cash Battle

Mapa de la documentación del proyecto. Cada página cubre un tema y enlaza con el código donde vive.

## Proyecto

- [Juego y economía](juego/reglas-y-economia.md): modos de juego, hoyos, niveles de mesa, comisión y reparto del bote.
- [Iconos](juego/iconos/index.md): set de iconos dibujados a mano en 3D, hoja numerada y cómo usarlos.
- [Arquitectura y stack](arquitectura/estructura-y-stack.md): tecnologías, carpetas de `src/` y cómo se conectan las partes.
- [Backend en Supabase](backend/supabase.md): tablas, funciones, Edge Functions, migraciones y configuración del panel.
- [Validación de golpes y antibots](backend/validacion-y-antibots.md): cómo el servidor comprueba cada tiro y cómo marca cuentas sospechosas.
- [Flujo de trabajo y despliegue](operacion/flujo-y-despliegue.md): ramas, PR, CI, Vercel, scripts y secretos.
- [Pendiente antes de dinero real](operacion/dinero-real-pendiente.md): lo que falta para cobrar a jugadores de verdad.

## Gobierno y normas

- [Constitución](sdd/constitution.md): reglas no negociables del proyecto (stack, calidad, seguridad, accesibilidad, rendimiento).
- [Configuración SDD](sdd/config.yaml): comandos de prueba y verificación que usa el flujo SDD.
- [Spec: banco de VFX y efectos](sdd/specs/vfx-lab-efectos.md): banco de pruebas, portales, choques y efectos de skin (borrador, autopilot).
- [Decisiones del harness](harness/decisions.md): registro de decisiones de RSC.
- [Plan de instalación](harness/installation-plan.md) y [perfil de usuario](harness/user-profile.md).

## Entrada de documentos

- `../raw/`: documentos sin procesar. Se añaden ahí y después se convierten en páginas de esta wiki.
