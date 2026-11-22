# Hoja de ruta de remediación — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06 · **actualizado tras la reauditoría sobre `5a05874`**. **Nada de esto se ha implementado.** Son propuestas priorizadas; los IDs remiten a `BUGS-AND-ISSUES.md`.

> **Antes de empezar:** la rama está 20 commits por detrás de `main` (`5a05874`). `main` cambia, entre otros, `GolfGame.js`, `main.js`, `physics.js`, `TournamentService.js` y `submit-hole`, y añade 5 migraciones (partidas en vivo, grupos y la **desactivación temporal de la verificación de cuenta**). Hay que traer `main` a la rama y volver a comprobar cada hallazgo sobre el código resultante antes de corregirlo. Según una lectura rápida: GCB-030 parece resuelto en `main` (tope de 20 tiros) y GCB-006 está **peor** (`_paid_block` ya no exige email confirmado, KYC ni edad).

## Prioridades

| Prioridad | Significado | Cuándo |
|---|---|---|
| **P0** | Bloquea cualquier torneo con valor (incluidos créditos que se puedan comprar) | Antes del próximo despliegue de torneos |
| **P1** | Integridad o seguridad grave | Siguiente iteración |
| **P2** | Defectos reales con impacto acotado | Planificar |
| **P3** | Calidad, deuda y documentación | Continuo |

---

## P0

| # | ID | Acción propuesta | Esfuerzo | Verificación |
|---|---|---|---|---|
| 1 | GCB-001 | **Un solo intento por hoyo.** Añadir `start_hole(t, hole)` idempotente que registre `started_at` en `tournament_holes` (o en una tabla nueva) con la hora del servidor. Al reanudar un hoyo ya empezado sin enviar, aplicar `max_strokes` (o los golpes ya comprometidos). Opcional y más robusto: enviar cada tiro según ocurre (`submit_shot`) y repetir de forma incremental. | M | Test SQL: `start_hole` dos veces → el segundo intento se puntúa con el máximo. E2E: recargar a mitad de hoyo → no se puede repetir |
| 2 | GCB-002 | **Quitar la descalificación relativa al más rápido** en torneos asíncronos (es injusta incluso sin trampas). Si se quiere un límite de tiempo, que sea **absoluto por hoyo**, medido con `now() - started_at` del servidor (paso 1) y con margen de red. Eliminar el campo `end` del cliente. | S–M | `scenario_dq.sql` adaptado: quien da menos golpes gana siempre; un hoyo de más de X s del servidor se puntúa con el máximo |
| 3 | GCB-005 | **Versionar el esquema base:** `supabase db dump` (esquema `public`, trigger de `auth.users`, RPC heredadas y `demo_deposit`/`credit_deposit`) como migración base. Ejecutar `supabase/audit/auth_security_audit.sql` en producción y guardar el resultado en `audit/`. Revisar en concreto si `profiles`, `wallets`, `transactions` y `app_config` admiten escritura directa. | S | `supabase db reset` en local reproduce la producción; las consultas 1, 2, 4 y 6 de la auditoría SQL devuelven 0 filas |
| 4 | — | **Sin dinero comprable** (depósitos) mientras P0-1 y P0-2 no estén resueltos. Desactivar `crypto-deposit` o forzar el sandbox. | XS | `crypto-deposit` responde `not_configured` |

## P1

| # | ID | Acción propuesta | Esfuerzo |
|---|---|---|---|
| 5 | GCB-003 | No avanzar `tick` durante la pausa (`GolfGame.#frame`: comprobar `paused` antes de `this.tick++`), o desactivar la pausa en torneos. Añadir un test de propiedad: repetición con pausas = repetición sin pausas. | S |
| 6 | GCB-004 | Quitar el listener `onKeyR` (y el de `fullscreenchange`, GCB-026) al salir de la pantalla; comprobar `view.isConnected` e ignorar eventos que vengan de `INPUT` o `TEXTAREA`. A medio plazo, vistas con `mount`/`unmount` (ver P3-25). | XS |
| 7 | GCB-006 | Interruptor explícito `KYC_STUB_ENABLED` (por defecto `false`) para el modo pruebas; en producción, sin claves de Didit → `not_configured`. **Revisar la migración `temp_disable_account_verification` de `main`** y fijar una fecha para retirarla. | XS |
| 8 | GCB-007 | Separar los saldos: `wallets.demo_balance` y `wallets.balance`, o tablas distintas. `demo_deposit` y los depósitos sandbox solo sobre el saldo demo; las mesas de pago con saldo real solo cuando se cumpla S5.11. | M |
| 9 | GCB-009 | `perform pg_advisory_xact_lock(hashtextextended('join:'||v_uid::text,0));` al inicio de `join_tournament` (y en `leave_tournament`), o un índice único parcial de inscripción activa. | XS |
| 10 | GCB-008 | `v_share := trunc(prize / winners, 2)` y el residuo a `commission`. Invariante en un test: `sum(payout) + commission = pot`. Lo mismo en `MatchService.settle`. | XS |
| 11 | GCB-018 | No tragar errores de `leave()`: mostrar un error con reintento y confirmar el reembolso con `wallet.getBalance()`. | XS |
| 12 | Edge | Fijar la versión de `npm:@supabase/supabase-js@2.x.y` en las 4 funciones. Comprobar la configuración desplegada (`verify_jwt` de `kyc`, secrets, `NOWPAYMENTS_SANDBOX`). | XS |

## P2

| # | ID | Acción propuesta | Esfuerzo |
|---|---|---|---|
| 13 | GCB-010 | Unificar el criterio del tick límite (cliente `>=` o repetición `>`); test del borde. Puede desaparecer con P0-2. | XS |
| 14 | GCB-011 | Identificador estable `course_id` (texto) en `courses.js`, `tournaments` y `shot_signals`; reetiquetar o excluir el histórico anterior a `20261030120000` de la línea base del antibots. | M |
| 15 | GCB-012 | XP calculada en el servidor a partir de `tournament_entries` (y de la práctica con límites); topes también en el primer guardado; límite de frecuencia de `save_progress`. | M |
| 16 | GCB-013 | Límites por defecto en el código y rechazar si no son finitos; añadir `crypto_min_deposit` y `crypto_max_deposit` en una migración. | XS |
| 17 | GCB-014 | Revisar el antibots con datos reales (S5.10): marcas de tiempo del servidor por tiro (con P0-1), suprimir el suelo `Math.max(8, …)` del cliente si se mantiene la señal, umbrales en `app_config`. | M |
| 18 | GCB-015 | `_ranking_rows`: `and t.entry_fee > 0` (criterio 2 de la especificación del ranking) y un mínimo de rivales distintos. | XS |
| 19 | GCB-016 | Cambiar «Premio Garantizado» por «Hasta X» o por el bote actual; servir `tiers` y `commission` desde el servidor. | XS |
| 20 | GCB-017 | Con sesión válida y error del servidor: pantalla de error y reintento, sin modo local. | S |
| 21 | GCB-019 | Proyecto Supabase de staging; `VITE_SUPABASE_*` por entorno en Vercel; quitar el valor por defecto de producción del código; CSP por entorno. | S |
| 22 | GCB-020 | Permitir el zoom; un componente `Modal` accesible (`role="dialog"`, `aria-modal`, foco atrapado y devuelto). | S |
| 23 | GCB-021 | Avatares en Supabase Storage (URLs) o límite de unos 64 KB en el `check`. | S |
| 24 | GCB-022 | **Tests:** Postgres 16 en CI con la migración base y tests de `join`, `settle`, `leave`, `save_progress`, `_apply_tx`, `review_player` y `get_ranking` (cierre idempotente, criterio 7 de la especificación); `deno test` para `kyc`, `crypto-deposit` y `nowpayments-ipn`; sustituir los 9 tests tautológicos de `desktop-controls.test.js`; cobertura con `--all`. | L |
| 25 | GCB-023 | `vite >= 6.4.4`; `dev` sin `--host` por defecto (`dev:lan` aparte). | S |
| 26 | GCB-046 | Reescribir `site.webmanifest` sin «wagering» (revisión legal). | XS |

## P3

| # | ID | Acción propuesta |
|---|---|---|
| 27 | A-2 | Partir `src/main.js` en vistas (`lobby`, `account`, `wallet`, `tournament`, `freeplay`, `play`) con ciclo de vida; estado en un store. |
| 28 | GCB-025 | Escapar con `esc()` todas las interpolaciones de datos del servidor (`t.note`, `p.name`) o construir con `textContent`. |
| 29 | GCB-024 | Fijar el `deadline` en `start_round` (limitado por `closes_at`). |
| 30 | GCB-027, GCB-028, GCB-031, GCB-032, GCB-037, GCB-043 | Pequeñas correcciones de interfaz y progreso (deduplicar XP en el servidor, validar `#hoyoN`, `isSunk` con `maxStrokesOf`, texto del avatar, error en `bindWallet`, `skinlab` solo en desarrollo). |
| 31 | GCB-029 | Quitar `first_ticks` de `_tournament_json` (innecesario tras P0-2). |
| 32 | GCB-033 | Borrar `SupabaseMatchService`, los métodos que lanzan en `SupabaseWallet`, `_record_hole` y las RPC heredadas (`revoke` y `drop` en una migración). |
| 33 | GCB-034 | Alinear el README y la wiki (17 hoyos, torneos asíncronos, funciones reales); quitar «EN VIVO» si no aplica. |
| 34 | GCB-035, GCB-036, GCB-038, GCB-039, GCB-040, GCB-041, GCB-042, GCB-047 | Escapar comodines del `ILIKE`; aviso o cancelación anticipada de la revancha en solitario; `engines.node >=22`; quitar `git push` de la lista de autoaprobados; índices y vista materializada del ranking; perfilar WebGL y `forceContextLoss`; verificar la firma del IPN sobre el cuerpo crudo si el proveedor lo permite y comprobar `actually_paid`; mantener `route-planner.mjs` fuera de un repositorio público. |
| 35 | — | Linter (ESLint o Biome), anunciado como pendiente en `sdd/config.yaml`. |

## Dependencias entre tareas

```
P0-3 (esquema base) ──► P2-24 (tests SQL en CI) ──► verificación de casi todo lo demás
P0-1 (start_hole) ──► P0-2 (tiempo del servidor) ──► P2-13, P3-31 se simplifican
P0-1 ──► P2-17 (antibots con tiempos reales)
P2-14 (course_id) antes de añadir o quitar hoyos
P1-8 (saldos separados) + S5.11 antes de activar dinero real
```

## Criterio para dar el plan por terminado

- `scenario_rounding.sql`, `scenario_dq.sql` y `race_join.sh` (`audit/evidence/`), adaptados como tests de CI, en verde.
- `pause_desync2.mjs` adaptado: 0 divergencias.
- `auth_security_audit.sql` en producción sin filas en las consultas que deben devolver 0.
- Volver a ejecutar esta auditoría sobre la rama ya sincronizada con `main`.

## Actualización tras la reauditoría (`5a05874`)

La nota inicial sobre sincronizar con `main` ya está hecha **en local** (la rama local `la-chaqueta-bionica` = `5a05874`, sin push). Cambios en el plan:

**P0 — se añaden o suben:**

| # | ID | Acción propuesta | Esfuerzo |
|---|---|---|---|
| 0a | GCB-048 | Canales Realtime **privados** (`config: { private: true }`) con políticas de `realtime.messages` que solo dejen leer y escribir en `golf:<id>` a los participantes del torneo y, al escribir, solo con su asiento. **Quitar `noteRemoteSunk` de los mensajes entre clientes**: el contador, si existe, sale del servidor (`tournament_status`). | S |
| 0b | GCB-049 | No difundir los tiros de un hoyo hasta que todos los jugadores reales lo hayan cerrado en el servidor (o difundir con retraso solo la posición de la bola). En `submit-hole`, marcar como sospechosa y retener una lista de tiros idéntica a otra ya registrada en el mismo torneo y hoyo. | S–M |
| 0c | GCB-006 | **Retirar `20261106120000_temp_disable_account_verification.sql`** (restaurar `_paid_block` original) antes de abrir mesas con valor. Si hace falta desactivar algo para pruebas, que sea con un interruptor en `app_config` que falle de forma segura y con un test que impida desplegarlo activo. | XS |
| 1 | GCB-001 | Igual que antes; además, en vivo, que reanudar un hoyo ya empezado lo puntúe con lo comprometido o con el máximo. | M |

**P1 — se añade:**

| # | ID | Acción propuesta | Esfuerzo |
|---|---|---|---|
| 5b | GCB-050 | Subir `live_idle_seconds` (por ejemplo a 3-5 min), no liquidar por inactividad mientras quede plazo de juego, permitir reconectar (`beginLive` ya reanuda) y avisar en la interfaz. | S |

**P2 — se añaden:**

| # | ID | Acción propuesta | Esfuerzo |
|---|---|---|---|
| 14b | GCB-051 | Junto con `course_id` estable (GCB-011): test que compare `app_config.course_max_strokes` con `COURSES[i].maxStrokes`, o guardar el máximo del hoyo en `tournaments`. | XS |
| 24b | GCB-053 | Sustituir los tests de `party.test.js` que leen el SQL por tests de comportamiento contra Postgres con todas las migraciones. | S |
| 36 | GCB-040 | Separar el latido (`touch_entry`, que solo actualiza `last_seen`) de la liquidación (`pg_cron` o liquidación perezosa con límite de frecuencia). | S |

**P3 — se añade:** GCB-052 (`cleanShots` con el máximo del hoyo).

**Hecho en `5a05874`:** GCB-030 (máximo por hoyo y tope de 20 tiros), GCB-024 (plazo desde `starts_at`) y GCB-036 (las salas arrancan a los 15 s). Se retiran del plan.

**Orden recomendado:** 0c (una migración) → 0a → 0b → 1 y 2 (GCB-001/002) → 3 (esquema base) → P1.
