---
type: constitution
title: golfito — Constitution
description: Principios no negociables de Golf Cash Battle (minigolf 3D multijugador). Ratificada en v1.0.0.
tags: [sdd, constitution]
timestamp: 2026-10-27T12:00:00Z
topic: sdd
status: ratified
version: 1.1.0
---

# golfito — Constitution

Reglas numeradas y comprobables. Cada fase del flujo SDD (`specify`, `plan`, `tasks`, `implement`, `verify`, `review`, `ship`) debe cumplirlas. Si una regla estorba, se cambia aquí con una enmienda, no se salta.

## Hechos del proyecto

- Producto: minigolf 3D para navegador y móvil, con partidas de 8 jugadores y entrada. Hoy funciona solo con créditos demo; **no hay dinero real**.
- Tipo: software · alcance: crecimiento medio (`growing`).
- Objetivo de rsc en el proyecto: compañero del proyecto para auditar, analizar, generar, corregir y proponer en todas las fases, con criterio y revisión legal y de riesgos.
- Flujo: el equipo trabaja en rama y PR contra `main`. El agente puede trabajar directamente en `main` por decisión del proyecto (`.rsc.json`).

## 1. Stack canon

- **C1.1** Node 22 en CI (`engines` exige Node 20 o superior). pnpm 11.24.0 fijado en `packageManager`.
- **C1.2** Vite 5 para el cliente, Three.js 0.169 para el render, `@supabase/supabase-js` 2.x para el backend. JavaScript ES modules en el cliente.
- **C1.3** Edge Functions en Deno (`supabase/functions/`), comprobadas con `deno check` en CI.
- **C1.4** `src/game/physics.js`, `src/game/replay.js` y `src/game/courses.js` no importan Three.js ni el DOM. Así la misma física corre en el navegador y en el servidor.
- **C1.5** Las dependencias van con lockfile (`pnpm install --frozen-lockfile`). No se añade una dependencia sin justificarla en el PR.

## 2. Quality bar

- **Q2.1** `pnpm test` y `pnpm run build` pasan en verde antes de fusionar. Es el mínimo, no el objetivo.
- **Q2.2** La física es determinista: operaciones exactas en IEEE 754. Cada cambio en `physics.js`, `replay.js` o `courses.js` lleva `pnpm run sync:functions` y un nuevo despliegue de `submit-hole`, en el mismo PR.
- **Q2.3** Los hoyos se añaden siempre al final de `courses.js`. Después se sube `course_count` en `app_config`. Los índices existentes no se reordenan.
- **Q2.4** La física avanza a paso fijo, independiente de los FPS. Lo visual (cámara lenta, temblor, sonido) no altera la física.
- **Q2.5** Todo cambio en el juego se prueba en móvil real o en un emulador de gama media antes de fusionar (ver sección 7).

## 3. Conventions

- **K3.1** Commits con gitmoji al inicio, seguidos de un encabezado Conventional Commits, por ejemplo `✨ feat(skins): …`.
- **K3.2** Cambios de base de datos solo como migración nueva en `supabase/migrations/`. Nunca se editan tablas a mano en el panel.
- **K3.3** La interfaz de usuario está en español. Los identificadores de código pueden estar en inglés o en español, pero dentro de un mismo módulo se usa un solo idioma.
- **K3.4** Un módulo nuevo entra en su carpeta de `src/` (`game/`, `wallet/`, `match/`, `account/`, `antibot/`, `ui/`, `progress/`, `admin/`). No se crean carpetas nuevas de nivel superior sin motivo.
- **K3.5** Autoría: los commits del repositorio llevan como autor a **Chakets**, o a **La Yuinta** (dueño del repositorio). Ningún commit lleva trailers de IA (`Co-Authored-By` con un modelo, «Generated with…»). Rige desde la versión 1.1.0: los commits anteriores ya publicados no se reescriben.

## 4. Branching & shipping

- **B4.1** Para el equipo, todo cambio entra por PR contra `main`. Ningún push directo a `main` salvo la excepción de B4.2.
- **B4.2** El agente puede trabajar en `main` porque el proyecto lo decidió (`.rsc.json`). Aun así, cada cambio pasa por las mismas verificaciones que un PR.
- **B4.3** Un PR no se fusiona con checks en rojo ni sin revisión humana cuando toca seguridad, pagos o antibots.
- **B4.4** Al fusionar en `main`, Vercel publica la web. Cada PR tiene su vista previa.

## 5. Security & privacy floor

- **S5.1** Se cumple la edición vigente del **OWASP Top 10**. Cada cambio que toque entrada de usuario, autenticación, acceso a datos o red se revisa contra esa lista.
- **S5.2** Ninguna dependencia puede tener una **CVE** publicada sin resolver. Las dependencias se revisan con `pnpm audit` (cliente) y con la herramienta equivalente para Deno. Una CVE crítica o alta bloquea el merge hasta corregirla o documentar la excepción en la sección 8.
- **S5.3** La clave pública (`sb_publishable_…`) puede estar en el código. Es pública por diseño y no da acceso a nada que RLS no permita. El riesgo está en lo que RLS y las funciones dejan hacer, no en que la clave se vea.
- **S5.4** La clave `service_role` nunca aparece en el cliente, en el repositorio ni en logs. Solo vive como secret de las Edge Functions (`SUPABASE_SERVICE_ROLE_KEY`).
- **S5.5** Toda tabla tiene RLS activado. Ninguna función `SECURITY DEFINER` se publica sin fijar `search_path` y sin comprobar `auth.uid()`.
- **S5.6** Los secretos van en variables de entorno o en secrets del proveedor. `.env` nunca se versiona. `.env.example` solo contiene marcadores.
- **S5.7** El saldo y los golpes los decide el servidor. El cliente solo envía cada tiro (`tick`, `yaw`, `power`).
- **S5.8** Los datos personales se minimizan. El número de documento se guarda como hash, nunca en claro. Los logs no contienen datos personales.
- **S5.9** Las cuentas anónimas no reciben créditos adicionales sin control de abuso (límite de creación y de llamadas). Antes de dinero real, hace falta una protección de registro verificada.
- **S5.10** Antibots y anticheat (`src/antibot/`, `shot_signals`, `player_risk`) deben estar implementados y revisados **antes de pasar a producción**. Su revisión es obligatoria antes de dinero real.
- **S5.11** Dinero real no se activa hasta cumplir **todos** estos requisitos: revisión legal del modelo de habilidad por país, proveedor de identidad real (Didit o equivalente, sin modo pruebas), antibots y anticheat en producción, y auditoría de RLS y funciones.

## 6. UX / accessibility floor

- **U6.1** Fluidez de menús: las transiciones de menú van a 60 FPS y tardan como máximo **1 s** en completarse.
- **U6.2** Fácil de usar para todo tipo de público: un jugador nuevo llega a jugar sin manual. Los textos son claros y cortos, en español sencillo.
- **U6.3** Número de menús y pantallas limitado. Propuesta: como máximo **3 toques** desde la pantalla de inicio hasta empezar a jugar. Cualquier pantalla nueva justifica por qué no puede integrarse en una existente.
- **U6.4** Objetivos táctiles de al menos **44×44 px**. Accesible con una mano en móvil.
- **U6.5** Contraste de texto mínimo WCAG AA. Ninguna información se transmite solo con color.
- **U6.6** Sonidos con botón de silencio visible. Ningún efecto parpadea más de 3 veces por segundo.
- **U6.7** Todo funciona en vertical y horizontal en móvil, sin scroll horizontal.

## 7. Performance budgets

- **P7.1** Mínimo obligatorio: móvil de gama media o baja de 2024 a **60 FPS**. La calidad gráfica se ajusta automáticamente para cumplirlo.
- **P7.2** Objetivo de escritorio: fluido en monitores **4K a 144 Hz**. Los ajustes de calidad permiten llegar a ese objetivo en hardware capaz.
- **P7.3** Transiciones de menú: **máximo 1 s**.
- **P7.4** Preparación de partida y cambio de mapa: **máximo 5 s**.
- **P7.5** Cada PR que toque render, cámara o carga anota en su descripción cómo se midió (dispositivo, FPS, tiempo de carga).

## 8. Knowledge & decisions

- **D8.1** Las decisiones de producto y arquitectura se registran en `02-DOCS/wiki/` (carpeta `harness/` para el perfil y el plan de instalación).
- **D8.2** Las excepciones a esta constitución se apuntan en la tabla de enmiendas con fecha, motivo y responsable.
- **D8.3** Los documentos de diseño de skins viven en `docs/`. Mientras no se decida otra ubicación, esa es la oficial.
- **D8.4** Excepción a S5.2, decidida por el equipo: CI y `verify.sh` auditan solo las dependencias de producción (`pnpm audit --prod`), con cualquier severidad. Las devDependencies quedan fuera. Hay dos CVE altas en `vite` 5.4.21 (GHSA-fx2h-pf6j-xcff y GHSA-587h-7wmj-h5pm) que afectan solo al servidor de desarrollo, y el script `dev` lo expone con `--host`. Se revisa cuando se suba `vite` a 6.4.4 o más.

## Definition of Done (el criterio que usa `verify`)

Un cambio está terminado cuando:

1. `pnpm test` y `pnpm run build` pasan.
2. Si cambia la base de datos, hay migración nueva y está en el PR.
3. Si cambia la física, `replay.js` o `courses.js`, se ha ejecutado `pnpm run sync:functions` y `submit-hole` se vuelve a desplegar.
4. `pnpm audit --prod` no reporta ninguna CVE sin resolver en dependencias de producción (excepción de devDependencies en D8.4).
5. No hay secretos en el diff, ni `service_role` en el cliente.
6. Si toca interfaz, cumple la sección 6, y si toca render o carga, cumple la sección 7 con la medición anotada.
7. Si toca entrada de usuario o acceso a datos, se ha revisado contra OWASP Top 10.

## Brechas conocidas frente a esta constitución

Estas reglas son el objetivo. Hoy no todas se cumplen. Cada brecha tiene que cerrarse antes de la fase que la necesita:

- **Auditoría de CVE:** `pnpm audit --prod` está en CI y en `verify.sh`. Las devDependencies no se auditan: `vite` 5.4.21 tiene dos CVE altas (GHSA-fx2h-pf6j-xcff, GHSA-587h-7wmj-h5pm) que afectan al servidor de desarrollo. Pendiente: subir `vite` a >=6.4.4 (cambio mayor) o registrar una excepción documentada en S5.2.
- **Funciones `SECURITY DEFINER`:** 7 migraciones las definen. Falta revisar que cada una cumpla S5.5.
- **Rendimiento:** no hay medición de FPS ni de tiempos de carga en CI. Falta un procedimiento de medida.
- **Auditoría de dependencias de Deno (S5.2):** ni CI ni `verify.sh` auditan las dependencias de las Edge Functions. Hay que añadir la herramienta equivalente.
- **Sincronización de la física:** la DoD #3 exige `sync:functions`, pero no hay modo de comprobación que falle si la copia no está al día.
- **Autoría (K3.5):** `verify.sh` la comprueba solo en los commits nuevos frente a `origin/main`, y no se ejecuta en CI. La regla no es retroactiva.
- **Anticheat y antibots:** existen, pero no están revisados para producción (S5.10).
- **Registro anónimo:** falta una protección contra abuso (S5.9) antes de cualquier salida pública.
- **Dinero real:** pendiente. No se activa hasta S5.11.

## Amendment log (append-only)

| Date | Version | Change | Why |
|------|---------|--------|-----|
| 2026-10-27 | draft | Borrador generado por `rsc onboard`. | La fase SDD necesita una constitución. |
| 2026-10-27 | 1.0.0 | Constitución redactada y ratificada con las reglas de stack, calidad, seguridad (OWASP, CVE, RLS, claves), UX, rendimiento y definición de terminado. | Primera versión aprobada por el equipo. El uso de `VITE_BACKEND=local` no cambia y no se regula aquí. |
| 2026-10-27 | 1.1.0 | Añadida K3.5: autoría de commits (Chakets o La Yuinta) y sin trailers de IA. | Resuelve el conflicto con la skill `ship`, que pedía otra autoría y prohibía los trailers de IA. Se actualiza la brecha de auditoría de CVE (ahora en CI, con las devDependencies pendientes). |
