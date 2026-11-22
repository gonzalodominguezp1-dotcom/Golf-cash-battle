# Inventario de defectos — Golf Cash Battle

- **Rama auditada:** `la-chaqueta-bionica`. Primera pasada sobre `386c815`; **reauditoría el 2026-11-06 sobre `5a05874`**, tras actualizar la rama en local con avance rápido hasta `main` a petición del usuario (sin push). La columna «Estado en `5a05874`» dice qué ha pasado con cada hallazgo; los números de línea del detalle de GCB-001…047 se refieren a `386c815` salvo que se indique otra cosa.
- **Fecha:** 2026-11-06.
- **Alcance:** todo el repositorio. Cobertura detallada en `AUDIT-COVERAGE.md`.
- **Regla:** no se ha modificado ningún archivo del proyecto. Solo se han creado `audit/` y sus evidencias.

## Cómo leer este documento

**Estado de verificación:**

| Estado | Significado |
|---|---|
| **CONFIRMADO (ejecución)** | Reproducido ejecutando código: Postgres 16 desechable con las migraciones reales, o la física real con Node. Script en `audit/evidence/`. |
| **CONFIRMADO (estático)** | Demostrado siguiendo el código línea a línea; no depende de nada fuera del repo. |
| **CONDICIONAL** | Correcto según el código del repo, pero depende de configuración o esquema que no está en el repo. |
| **SOSPECHA** | Riesgo plausible que no se ha podido demostrar. |

**Severidad:**

| Severidad | Criterio |
|---|---|
| CRITICAL | Rompe la integridad del resultado o del dinero de los torneos sin necesidad de herramientas especiales. |
| HIGH | Fallo grave de integridad, seguridad o funcionalidad. |
| MEDIUM | Fallo real con impacto acotado. |
| LOW | Defecto menor o de defensa en profundidad. |
| INFO | Observación. |

> **Contexto:** el proyecto se declara «prototipo con créditos demo, sin dinero real» (README, `dinero-real-pendiente.md`). Las severidades valoran el producto tal como está diseñado: torneos de pago con bote y premios en un saldo que ya admite depósitos cripto (en sandbox). Cuando un hallazgo solo es grave con dinero real, se indica.

---

## Resumen

| ID | Sev. | Verificación | Título | Estado en `5a05874` |
|---|---|---|---|---|
| GCB-001 | CRITICAL | CONFIRMADO (estático) | Repetición ilimitada de cada hoyo de torneo (mulligan) | SIGUE (parcial: salir desde la app ya penaliza; recargar o cerrar la app sigue reiniciando el hoyo) |
| GCB-002 | CRITICAL | CONFIRMADO (ejecución) | Descalificación retroactiva por un `sunk_tick` declarado por el cliente: puede ganar quien da más golpes | SIGUE (reejecutado) |
| GCB-003 | HIGH | CONFIRMADO (ejecución) | La pausa desincroniza la física del cliente y la del servidor | SIGUE (reejecutado) |
| GCB-004 | HIGH | CONFIRMADO (estático) | Listener «R» huérfano: tras usar Juego Libre, cualquier «r» (en torneo o en un input) salta a un hoyo libre | SIGUE |
| GCB-005 | HIGH | CONFIRMADO (estático) | El esquema base de la BD (saldo, transacciones, RLS) no está en el repositorio | SIGUE |
| GCB-006 | CRITICAL | CONFIRMADO (estático) | KYC en modo pruebas: autoverificación libre y bypass de «una persona, una cuenta» | **EMPEORA** (verificación desactivada; sube a CRITICAL) |
| GCB-007 | HIGH | CONFIRMADO (estático) | Créditos demo gratuitos, depósitos y premios comparten el mismo saldo | SIGUE |
| GCB-008 | MEDIUM | CONFIRMADO (ejecución) | El reparto entre empatados paga más que el premio (crea dinero) | SIGUE (reejecutado) |
| GCB-009 | MEDIUM | CONFIRMADO (ejecución) | Carrera en `join_tournament`: doble inscripción y doble cobro | SIGUE (reejecutado; también entre mesas y vía grupos) |
| GCB-010 | MEDIUM | CONFIRMADO (estático) | Off-by-one: un tiro en el tick límite invalida el hoyo entero | SIGUE |
| GCB-011 | MEDIUM | CONFIRMADO (estático) | La renumeración de hoyos (viola Q2.3) contamina la línea base antibots y el historial | SIGUE (+ GCB-051) |
| GCB-012 | MEDIUM | CONFIRMADO (ejecución) | Progreso/XP autoritativo del cliente; primer guardado sin topes; nivel y marco públicos falsificables | SIGUE |
| GCB-013 | MEDIUM | CONDICIONAL | `crypto-deposit` acepta cualquier importe (incluso negativo) si falta la configuración de límites | SIGUE |
| GCB-014 | MEDIUM | CONFIRMADO (estático) | Señales antibots del gesto falsificables y sin efecto con el cliente oficial | SIGUE |
| GCB-015 | MEDIUM | CONFIRMADO (estático) | El ranking cuenta victorias en mesas gratuitas: inflado con cuentas secundarias | SIGUE |
| GCB-016 | MEDIUM | CONFIRMADO (ejecución) | «Premio Garantizado» engañoso: el premio real depende de los inscritos | SIGUE |
| GCB-017 | MEDIUM | CONFIRMADO (estático) | Caída silenciosa a modo local: con sesión válida se juegan «torneos» contra bots con saldo local | SIGUE |
| GCB-018 | MEDIUM | CONFIRMADO (estático) | Salir con «recuperar entrada» traga el error: el jugador puede perder la entrada sin saberlo | SIGUE |
| GCB-019 | MEDIUM | CONFIRMADO (estático) | `pnpm dev` y las vistas previas usan por defecto la BD de producción | SIGUE |
| GCB-020 | MEDIUM | CONFIRMADO (estático) | Accesibilidad: zoom bloqueado y modales sin semántica ni gestión de foco | SIGUE |
| GCB-021 | MEDIUM | CONFIRMADO (estático) | `my_friends` incrusta avatares de hasta 600 KB por amigo | SIGUE (también en `my_party`) |
| GCB-022 | MEDIUM | CONFIRMADO (estático) | El dinero en SQL y las Edge Functions no tienen ningún test | SIGUE |
| GCB-023 | MEDIUM | CONFIRMADO (ejecución) | 9 avisos de seguridad en dependencias de desarrollo con `vite --host` (excepción D8.4 documentada) | SIGUE |
| GCB-024 | LOW | CONFIRMADO (estático) | El plazo de 20 min empieza al inscribirse, no al empezar a jugar | **CORREGIDO** en lo esencial (plazo desde `starts_at`) |
| GCB-025 | LOW | CONFIRMADO (estático) | Interpolaciones sin escapar en `innerHTML` (nota de movimiento, nombres) | SIGUE |
| GCB-026 | LOW | CONFIRMADO (estático) | Listener `fullscreenchange` que se acumula en cada hoyo | SIGUE |
| GCB-027 | LOW | CONFIRMADO (estático) | XP de torneo deduplicada solo por `localStorage` (se cobra en cada dispositivo) | SIGUE |
| GCB-028 | LOW | CONFIRMADO (estático) | `#hoyoN` fuera de rango rompe la práctica | SIGUE |
| GCB-029 | LOW | CONFIRMADO (estático) | `first_ticks` revela el rendimiento de los rivales antes de terminar | SIGUE y **AMPLIADO** (golpes de rivales visibles entre hoyos) |
| GCB-030 | LOW | CONFIRMADO (estático) | Tope fijo de 8 tiros en `submit-hole` y de 8 golpes al liquidar frente a hoyos largos de 12 y 20 (latente) | **CORREGIDO** (`_course_max`, tope de 20) |
| GCB-031 | LOW | CONFIRMADO (estático) | `isSunk` ignora el `maxStrokes` de los hoyos largos | SIGUE |
| GCB-032 | LOW | CONFIRMADO (estático) | Texto del editor de avatar obsoleto («solo se guarda en este dispositivo») | SIGUE |
| GCB-033 | LOW | CONFIRMADO (estático) | Código muerto: `SupabaseMatchService` y RPC heredadas sin versionar | SIGUE |
| GCB-034 | LOW | CONFIRMADO (estático) | Documentación desalineada con el código | PARCIAL («en vivo» ya es cierto; README sigue con 14 hoyos) |
| GCB-035 | LOW | CONFIRMADO (estático) | `admin_players`: comodines `%`/`_` sin escapar en la búsqueda | SIGUE |
| GCB-036 | LOW | CONFIRMADO (estático) | Una revancha en solitario espera 15 min hasta el reembolso | **CORREGIDO** de facto (la sala arranca en 15 s) |
| GCB-037 | LOW | CONFIRMADO (estático) | `bindWallet` relanza el error y deja el botón deshabilitado | SIGUE |
| GCB-038 | LOW | CONFIRMADO (estático) | `engines.node >=20` frente a supabase-js 2.118, que exige Node ≥22 | SIGUE |
| GCB-039 | LOW | CONFIRMADO (estático) | Permisos del agente: `git commit` y `git push` autoaprobados en `.claude/settings.json` | SIGUE |
| GCB-040 | LOW | CONFIRMADO (estático) | Rendimiento del ranking: 2–3 recorridos completos por llamada y liquidación perezosa en cada `join` | **EMPEORA** (latido cada 4 s que liquida) |
| GCB-041 | LOW | SOSPECHA | `GolfGame.dispose` no libera materiales y texturas ni fuerza la pérdida de contexto WebGL | SIGUE |
| GCB-042 | LOW | SOSPECHA | IPN de NOWPayments: firma sobre JSON re-serializado y comprobación de `price_amount` en lugar de lo pagado | SIGUE |
| GCB-043 | LOW | CONFIRMADO (estático) | `?skinlab=1` (laboratorio de skins) accesible en producción | SIGUE |
| GCB-044 | INFO | CONFIRMADO (estático) | La semilla de las skins difiere entre cliente y servidor (limitación documentada) | SIGUE |
| GCB-045 | INFO | CONFIRMADO (estático) | CORS `*` en las Edge Functions (aceptable con bearer token) | SIGUE |
| GCB-046 | MEDIUM | CONFIRMADO (estático) | El manifiesto PWA se describe como «wagering platform» (apuestas), en contra del modelo de habilidad | SIGUE |
| GCB-047 | LOW | CONDICIONAL | `scripts/route-planner.mjs` es un buscador del tiro óptimo con la física real (ayuda a bots si el repo es público) | SIGUE (amplificado por GCB-049) |
| GCB-048 | CRITICAL | CONFIRMADO (estático) | Canal en tiempo real sin autorización: un mensaje `done` falsificado descalifica a los rivales | **NUEVO** |
| GCB-049 | CRITICAL | CONFIRMADO (estático) | El canal emite los tiros exactos de los rivales: copiarlos garantiza su mismo resultado | **NUEVO** |
| GCB-050 | HIGH | CONFIRMADO (ejecución) | Latido de 45 s: una desconexión breve (pantalla bloqueada) liquida la partida y apunta el máximo | **NUEVO** |
| GCB-051 | MEDIUM | CONFIRMADO (estático) | `course_max_strokes` por índice de hoyo en `app_config`, duplicado de `courses.js` | **NUEVO** |
| GCB-052 | LOW | CONFIRMADO (estático) | `cleanShots` descarta los tiros de un rival a partir del 13.º (el Templo admite 20) | **NUEVO** |
| GCB-053 | LOW | CONFIRMADO (estático) | Tests que leen el texto del SQL; uno pasa aunque la función efectiva ya no lo cumple | **NUEVO** |

**Hallazgos descartados como falsos positivos** (verificados y retirados):

- *«`createBackend()` sin `.catch` deja la app colgada en "Conectando…"»*: falso. `src/backend/index.js:12-19` captura el error y cae a modo local. El problema real es GCB-017.
- *«Las copias de `submit-hole/game` pueden divergir de `src/` sin control»*: falso. `tests/replay.test.js:93` compara los archivos.
- *«La curva de nivel del cliente y del servidor no coincide»*: falso. 0 discrepancias en 81.000 valores comparados (`levelOf` frente a `_level_of_xp`).
- *«La física usa `Math.sin`/`Math.cos` dependientes del motor»*: falso. `physics.js` usa polinomios propios (`dsin`/`dcos`); `courses.js` y `replay.js` tampoco usan funciones trascendentes.
- *«Las migraciones tienen errores de sintaxis»*: falso. Las 18 se aplican sin error en Postgres 16 sobre un esquema base simulado (`audit/evidence/stub_baseline.sql`).

---

## Detalle

### GCB-001 — Repetición ilimitada de cada hoyo de torneo (mulligan) · CRITICAL · CONFIRMADO (estático)

- **Archivos:**
  - `src/main.js:1846-1857` (`playOnlineHole`)
  - `src/main.js:1859-1868` (`submitOnline`)
  - `src/main.js:1780-1784` (`continueRound`)
  - `src/main.js:1349-1355` (Salir al Lobby)
  - `src/main.js:2037-2042` («Tus torneos»)
  - `supabase/migrations/20261020170000_hole_timer.sql:159-194` (`_record_timed_hole`)
- **Evidencia:**
  - Los tiros de un hoyo solo salen del cliente en `onDone: (g) => submitOnline(match, index, g, …)` (línea 1855), cuando el hoyo termina.
  - El servidor no guarda que un hoyo «ha empezado»: `start_round` solo marca el inicio de la ronda, y `_record_timed_hole` solo exige `p_hole = v_played`.
  - `continueRound` reanuda con `playOnlineHole(match, match.me.holesPlayed)`, que vuelve a cargar el hoyo desde el tee con 0 golpes y `tick = 0`.
- **Escenario de fallo:** en el hoyo 1, el jugador falla los dos primeros tiros. Pulsa Esc → «Salir al Lobby» (o recarga la página) → «Tus torneos» → la partida «Sin terminar · 0/3». El hoyo empieza de nuevo. Repite hasta conseguir un hoyo en uno y solo entonces se envía. El único límite es el plazo de 20 min.
- **Impacto:**
  - Rompe la premisa de «juego de habilidad, mismas condiciones para todos»: el resultado de un torneo de pago lo decide quien sabe que puede repetir.
  - Viola la regla S5.7 de la constitución en la práctica.
  - El ticks se reinicia en cada intento, así que tampoco penaliza en el contador de 20 s (GCB-002).
- **Solución recomendada:**
  - Registrar en el servidor el inicio de cada hoyo (`start_hole(t, hole)` idempotente que guarde `started_at`) y aceptar un único intento por hoyo.
  - Enviar cada tiro según ocurre (o al menos un compromiso por tiro) para que abandonar cuente como los golpes ya dados más la penalización.
  - Al reanudar un hoyo empezado, aplicar el máximo de golpes en lugar de reiniciarlo.

> **Actualización `5a05874`:** salir desde la app ahora penaliza: `showLobby` → `stopLive` (`src/main.js:2029-2038`) → `leave()`, y se apuntan los golpes máximos de lo que falta. Pero **recargar la página o cerrar la app sigue reiniciando el hoyo**: se vuelve a pulsar la mesa, `join_tournament` responde `active_match` mientras el último latido tenga menos de 45 s, `TournamentService.join` devuelve la partida con `resumed`, y `beginLive` → `playLiveHole(live, holesPlayed)` (`src/main.js:2174-2189`) carga el hoyo desde el tee. Sigue en CRITICAL.

### GCB-002 — Descalificación retroactiva por un `sunk_tick` declarado por el cliente · CRITICAL · CONFIRMADO (ejecución)

- **Archivos:**
  - `supabase/migrations/20261020170000_hole_timer.sql:88-106` (bucle de descalificación en `_settle_tournament`)
  - `supabase/functions/submit-hole/index.ts:31-34,52,63-64`
  - `src/game/replay.js:20-75`
- **Evidencia:**
  - `sunk_tick` sale de la repetición de unos tiros cuyo `tick` elige el cliente. No se contrasta con el reloj real del servidor.
  - El campo `end` es opcional y también lo envía el cliente.
  - Al liquidar, `update tournament_holes set strokes = v_max, dq = true … where th.sunk_tick > v_first + v_lim` descalifica a todo el que embocó más de 20 s (en ticks) después del más rápido. Da igual cuándo jugara cada uno.
  - Ejecutado con `audit/evidence/scenario_dq.sql`:

    ```
     name   | scores  | total | position | payout
     cheat  | {3,3,3} |     9 |        1 |  18.00
     honest | {8,3,3} |    14 |        2 |      0
    ```

    El jugador honesto hizo 2+3+3 = 8 golpes y el otro 3+3+3 = 9. El honesto pierde 18 créditos porque su hoyo de 2 golpes (embocado en el tick 2700, a los 22,5 s) pasa a 8 de forma retroactiva.
- **Escenarios de fallo:**
  1. **Sin trampas.** En un torneo asíncrono, el jugador que juega primero no ve contador porque aún no hay `first_ticks`. Tarda 25 s en embocar. Horas o minutos después alguien emboca en 3 s y el primero queda descalificado al liquidar, sin haber visto nunca un contador.
  2. **Con trampas.** Un jugador envía tiros con los ticks mínimos posibles (justo cuando la bola se para) para fijar un `first_tick` muy bajo y descalificar a los demás. Puede además omitir `end` para no autodescalificarse.
  3. **Congelar el reloj.** Con la pestaña oculta, `requestAnimationFrame` se detiene y los ticks no avanzan. El «tiempo» se puede congelar a voluntad.
- **Impacto:** cambia el ganador y el reparto del bote. Es el defecto de mayor impacto económico directo.
- **Solución recomendada:**
  - En modo asíncrono, eliminar la descalificación relativa al más rápido o sustituirla por un límite absoluto por hoyo.
  - Medir ese límite con el reloj del servidor, desde un `start_hole` registrado (ver GCB-001).
  - Si se mantiene un contador, aplicarlo solo a quien lo vio en pantalla (registrar el `first_tick` que se le mostró al empezar el hoyo).

> **Actualización `5a05874`:** reejecutado con `audit/evidence/scenario_live.sql` (escenario B) sobre las 23 migraciones: mismo resultado (gana 9 frente a 8, 18 créditos). Las partidas ahora arrancan a la vez, pero el `sunk_tick` sigue siendo un tick del cliente contado desde que cada uno carga el hoyo. Además, en vivo el contador local también se activa con los mensajes del canal en tiempo real, que se pueden falsificar (GCB-048).

### GCB-003 — La pausa desincroniza la física del cliente y la del servidor · HIGH · CONFIRMADO (ejecución)

- **Archivos:**
  - `src/game/GolfGame.js:1281-1289` (`#frame`)
  - `src/game/GolfGame.js:251-264` (`setPaused`)
  - `src/main.js:1218-1227` (menú de ajustes)
- **Evidencia:**
  - En `while (this.acc >= DT) { … this.tick++; … if (this.sunk || this.paused || this.timedOut) continue; … step(...) }` el tick avanza durante la pausa pero no se llama a `step()`.
  - `replayHole` (servidor) simula todos los ticks.
  - Los obstáculos móviles dependen de `t = tick·DT` (`spinnerSegment`, molinos, bloques), así que el cliente y el servidor calculan trayectorias distintas.
  - Ejecutado con `audit/evidence/pause_desync2.mjs`: «tiros con obstáculos móviles: 440, resultados distintos tras pausar: 87». Por ejemplo, en *Bloques* el servidor deja la bola en (2.403, 3.743) y el cliente en (2.347, 2.342).
- **Escenario:** en un hoyo de torneo con molinos o bloques, el jugador pulsa Esc mientras la bola rueda y reanuda. En su pantalla emboca; el servidor repite y obtiene otro resultado (`unfinished`, `ball_moving` o más golpes). Se rechaza el hoyo (`invalid_shots`) o se apunta una puntuación distinta de la vista.
- **Impacto:** puntuaciones de torneo erróneas y hoyos que no se pueden enviar, en mesas de pago. También rompe la regla Q2.4.
- **Solución recomendada:**
  - Opción A: no avanzar `tick` durante la pausa. El servidor solo ve ticks de simulación, así que pausar equivale a «congelar el tiempo», que la repetición ya modela.
  - Opción B: no permitir la pausa en torneos.
  - Añadir un test que repita con pausas.

> **Actualización `5a05874`:** sin cambios: `src/game/GolfGame.js:1349-1355` sigue avanzando `tick` antes de comprobar `paused`. `pause_desync2.mjs` reejecutado con la física nueva: 87/440.

### GCB-004 — Listener «R» huérfano que navega a Juego Libre desde cualquier pantalla · HIGH · CONFIRMADO (estático)

- **Archivo:** `src/main.js:1472-1484`.
- **Evidencia:**
  - En cada hoyo de Juego Libre se ejecuta `window.addEventListener('keydown', onKeyR)` y nunca se quita.
  - La condición `e.code === 'KeyR' && !game?.paused && !view.querySelector('.in-game-settings-overlay')` usa `game`, que es la variable global del juego actual (cualquier modo), y `view`, que es la vista antigua ya desconectada, donde `querySelector` devuelve `null`.
  - `onRestartHole` siempre existe en Juego Libre: `() => playFreePlay(courseIndex)`.
  - No se filtra `e.target` (inputs).
- **Escenario:**
  1. Jugar el hoyo 3 en Juego Libre.
  2. Ir a un torneo de pago.
  3. Pulsar «r» a mitad de hoyo: se abre `playFreePlay(2)` y se abandona el hoyo del torneo, que además se puede repetir (GCB-001).
  4. Igual al escribir «r» en «Añadir amigo» o «Cambiar nombre»: la app salta al hoyo libre.
  5. Con N hoyos libres visitados, una pulsación lanza N `playFreePlay` que compiten entre sí.
- **Impacto:** pérdida de partida, navegación errática y entradas de texto inutilizables.
- **Solución recomendada:** guardar la función de limpieza y quitar el listener en `game.dispose()` o al cambiar de pantalla; comprobar `view.isConnected` y el destino del evento (no actuar si es `INPUT` o `TEXTAREA`).

### GCB-005 — El esquema base de la BD no está en el repositorio · HIGH · CONFIRMADO (estático)

- **Archivos:**
  - `supabase/migrations/*`
  - `supabase/audit/auth_security_audit.sql:3-4`, que lo reconoce
  - `02-DOCS/wiki/backend/supabase.md:17`
- **Evidencia:** ninguna migración crea `profiles`, `tiers`, `app_config`, `wallets`, `transactions`, `matches`, `match_players` ni `deposits`, el tipo `tx_type`, la función `_cfg`, el trigger de alta de usuarios, ni las RPC `demo_deposit`, `credit_deposit`, `join_match`, `submit_hole`, `finish_match_tb`, `abandon_match` y `active_match`. Sí se usan: 23 llamadas a `_cfg`, `_apply_tx` sobre `wallets` y `transactions`, y el cliente llama a `demo_deposit` (`src/wallet/SupabaseWallet.js:34`).
- **Impacto:**
  - Imposible recrear la BD desde el repo: no hay entorno de pruebas ni recuperación ante desastres.
  - Las piezas más sensibles del dinero (límite diario de recarga demo, acreditación de depósitos, políticas RLS de `wallets`, `profiles` y `transactions`, trigger de saldo inicial) no son auditables.
  - Si `profiles` admitiera `UPDATE` directo por el usuario, `kyc_status`, `birthdate` o `username` serían falsificables. No se ha podido comprobar.
- **Solución recomendada:** `supabase db dump --schema public` (más el trigger de `auth.users`) como migración base `00000000000000_baseline.sql`, ejecutar `auth_security_audit.sql` contra producción y versionar el resultado.

### GCB-006 — KYC en modo pruebas: autoverificación libre · HIGH · CONFIRMADO (estático)

- **Archivos:**
  - `supabase/functions/kyc/index.ts:44-85`
  - `src/main.js:951-972` (`kycStubForm`)
- **Evidencia:**
  - Si faltan `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` o `DIDIT_WEBHOOK_SECRET`, `action: 'stub'` marca la cuenta como `verified` con la fecha y el número de documento que escriba el usuario.
  - El hash anti-duplicados se calcula sobre ese texto libre: cambiar un carácter del «documento» crea otra identidad.
  - No hay ningún interruptor explícito (variable de entorno) que impida el modo pruebas en producción: basta con que falte un secret.
- **Impacto:**
  - Las mesas de pago quedan protegidas solo por el email confirmado.
  - Un menor puede declararse mayor de edad.
  - Una persona puede tener varias cuentas verificadas, lo que permite colusión en torneos.
  - Es un bloqueante explícito de la regla S5.11, pero hoy está activo.
- **Solución recomendada:** permitir el modo pruebas solo con una variable explícita (`KYC_STUB_ENABLED=true`) y nunca en el proyecto de producción. Si no, devolver `not_configured`.

> **Actualización `5a05874` — EMPEORA, sube a CRITICAL:** `supabase/migrations/20261106120000_temp_disable_account_verification.sql:9-18` reduce `_paid_block` a «no anónimo y no en revisión». Ya no se exige email confirmado, KYC ni edad. **Ejecutado:** una cuenta con `email_confirmed_at = null` y `birthdate = 2015-01-01` (11 años) obtiene `_paid_block = NULL`, entra en una mesa de Oro y se le cobran 10 créditos. La migración se presenta como «TEMPORAL», sin fecha ni mecanismo de vuelta atrás automático. Con depósitos cripto activos (aunque sea en sandbox), esto permite jugar con dinero a menores y a cuentas sin identificar.

### GCB-007 — Créditos demo, depósitos y premios en el mismo saldo · HIGH · CONFIRMADO (estático)

- **Archivos:**
  - `src/wallet/SupabaseWallet.js:33-38` (`demo_deposit`)
  - `src/main.js:1010-1016,1055-1067` (botones +50/+200)
  - `supabase/functions/crypto-deposit/index.ts`
  - `supabase/migrations/20261019140000_accounts_kyc_antibot.sql:127-151` (`_apply_tx`)
- **Evidencia:** solo existe `wallets.balance`. Ahí suman las recargas demo (gratis), los depósitos cripto (sandbox por defecto) y los premios. No hay distinción por origen ni restricción de retirada.
- **Impacto:** el día que se active el dinero real, los créditos gratuitos se convertirán en dinero real. Hoy, los depósitos sandbox de NOWPayments (gratuitos) ya acreditan saldo de verdad.
- **Solución recomendada:** separar los saldos (`demo` y `real`) o desactivar `demo_deposit` en producción; marcar `deposits.sandbox` y no acreditar depósitos sandbox en el saldo de producción.

### GCB-008 — El reparto entre empatados paga más que el premio · MEDIUM · CONFIRMADO (ejecución)

- **Archivos:**
  - `supabase/migrations/20261020170000_hole_timer.sql:141` (y `20261019100000_async_tournaments.sql:160`)
  - `src/match/MatchService.js:21`
- **Evidencia:**
  - `v_share := round(v_t.prize / v_winners, 2)`, y cada ganador recibe `v_share`.
  - Ejecutado con `audit/evidence/scenario_rounding.sql`: 7 jugadores en Bronce, 4 empatados → `prize 6.30`, `payouts 1.58,1.58,1.58,1.58`, `sum 6.32`, transacciones `prize = 6.32` frente a `entry = -7`.
  - En JS (práctica local): 7 ganadores de Oro → `share 10.29`, `sum 72.03` sobre un premio de 72.
- **Impacto:** la plataforma paga hasta varios céntimos por torneo de más. El total de premios más la comisión supera el bote, así que la contabilidad no cuadra.
- **Solución recomendada:** `floor(prize / winners, 2)` y asignar el resto a la comisión (o al primer ganador por desempate), con la invariante `sum(payout) + commission = pot` comprobada en un test.

> **Actualización `5a05874`:** `_settle_tournament` se redefine dos veces más (`matchmaking_parties`, `live_matches`, `temple_online`) con el mismo `v_share := round(v_t.prize / v_winners, 2)`. Reejecutado (`scenario_live.sql`, escenario A): 6,32 pagados sobre un premio de 6,30.

### GCB-009 — Carrera en `join_tournament`: doble inscripción · MEDIUM · CONFIRMADO (ejecución, ventana ampliada)

- **Archivo:** `supabase/migrations/20261027140000_rematch_groups.sql:75-80,99-109`.
- **Evidencia:**
  - La comprobación `if exists (… e.user_id = v_uid … ) then raise exception 'active_match'` no bloquea nada.
  - Dos llamadas simultáneas pasan la comprobación. La segunda salta el torneo bloqueado por la primera (`for update skip locked`) y crea otro.
  - Ejecutado con `audit/evidence/race_join.sh` (con `pg_sleep` para que la ventana sea determinista): `entries 2 | tournaments 2`, saldo `100 → 90`, dos transacciones `entry -5`.
- **Impacto:** se rompe la regla «un torneo activo por jugador»: cobros dobles y estados inconsistentes en el cliente (que solo sigue uno).
- **Solución recomendada:** `pg_advisory_xact_lock(hashtext('join:'||v_uid))` al inicio de la función, o un índice único parcial que impida dos inscripciones activas del mismo usuario.

> **Actualización `5a05874`:** `join_tournament` añade `pg_advisory_xact_lock('matchmaking:'||p_tier)` (`live_matches.sql:265`), pero **después** de comprobar `_in_active_match` (línea 248) y por mesa, no por usuario. Reejecutado: misma mesa → 2 inscripciones (saldo 100 → 90); **mesas distintas** (Plata y Oro a la vez) → 2 inscripciones (100 → 85). `_party_queue` (`matchmaking_parties.sql:450-487`) abre otra vía de entrada con la misma comprobación previa al candado.

### GCB-010 — Off-by-one en el tick límite · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `src/game/GolfGame.js:1288` (se agota el tiempo cuando `this.tick > this.deadlineTick`, así que se puede tirar en `tick == deadlineTick`)
  - `src/game/GolfGame.js:340` (`endTick = deadlineTick`)
  - `src/game/replay.js:34` (`if (timed && s.tick >= endTick) return fail('bad_tick')`)
- **Escenario:** el jugador suelta el tiro justo en el último tick. El cliente lo acepta, en el tick siguiente marca tiempo agotado y envía `end = deadlineTick`. El servidor rechaza todo el hoyo con `invalid_shots`, el cliente muestra «El servidor no ha podido validar…» y el hoyo no se registra.
- **Solución recomendada:** unificar el criterio (`>=` en el cliente o `>` en la repetición) y añadir un test del borde.

### GCB-011 — Renumeración de hoyos · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `supabase/migrations/20261030120000_fourteen_courses.sql:1-4` («Se quitan siete hoyos… y los índices se renumeran»)
  - `02-DOCS/wiki/sdd/constitution.md:35` (Q2.3: «Los índices existentes no se reordenan»)
  - `supabase/migrations/20261019140000_accounts_kyc_antibot.sql:304-318` (`_risk_inputs` agrupa `shot_signals` por `course`)
- **Impacto:**
  - Las filas antiguas de `shot_signals`, `tournament_holes` y `tournaments.courses` apuntan ahora a otros hoyos.
  - La línea base del antibots (media de golpes por índice) mezcla hoyos distintos, lo que produce falsos positivos y negativos de `too_accurate`.
  - Los torneos abiertos durante el despliegue se repitieron con otro hoyo.
  - El panel de admin muestra «Hoyo N» incorrectos.
- **Solución recomendada:** identificadores estables por hoyo (`course_id` de texto) en lugar de índices; migración que reetiquete el histórico o lo excluya de la línea base (`created_at < fecha`).

### GCB-012 — Progreso autoritativo del cliente · MEDIUM · CONFIRMADO (ejecución)

- **Archivos:**
  - `supabase/migrations/20261027120000_save_progress_clamp.sql:48-57`
  - `src/progress/Progress.js:89` y `#save` (231-235)
  - `supabase/migrations/20261102120000_ranking_prestige.sql:172-185` (`set_frame` confía en la XP guardada)
- **Evidencia (ejecución):**
  - Primer `save_progress('{"xp":1e15,"wins":999999999}')` aceptado (`v_first` no aplica topes).
  - `_level_of_xp` = 9.999.991; `set_frame('p150')` OK.
  - Luego +2000 por llamada, sin límite de frecuencia: cada `equip()` dispara un guardado.
  - En el cliente, `attach()` da por buena la XP local si es mayor y la XP de `localStorage` es editable.
- **Impacto:** el nivel y el marco de prestigio que se ven en el ranking público y en la lista de amigos son falsificables; las skins «exclusivas» se desbloquean editando `localStorage`. No afecta al saldo ni al número de victorias del ranking, que salen de `tournament_entries`.
- **Solución recomendada:** calcular la XP en el servidor a partir de `tournament_entries` (y de la práctica con límites), aplicar topes también en el primer guardado (o como mucho lo que justifiquen las partidas registradas) y limitar la frecuencia de las llamadas.

### GCB-013 — `crypto-deposit` deja pasar importes si falta la configuración · MEDIUM · CONDICIONAL

- **Archivo:** `supabase/functions/crypto-deposit/index.ts:26-32`.
- **Evidencia:** `limit(k)` devuelve `Number(undefined)`, que es `NaN`, si no existe la clave en `app_config`. `amount < NaN` y `amount > NaN` dan `false`, así que se acepta cualquier número finito, incluso negativo o enorme. Las claves `crypto_min_deposit` y `crypto_max_deposit` no aparecen en ninguna migración del repo.
- **Impacto:** si producción no tiene esas filas, se crean depósitos con cualquier importe. El efecto final depende de `credit_deposit`, que no está en el repo.
- **Solución recomendada:** validar contra valores por defecto codificados y rechazar si el límite no es un número finito; insertar las claves en una migración.

### GCB-014 — Señales antibots falsificables o sin efecto · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `src/game/GolfGame.js:802` (`d: Math.max(8, dragTicks)`)
  - `src/game/GolfGame.js:1053` (`Math.max(12, …)`)
  - `src/antibot/risk.js:19-23` (`minDragTicks: 4`)
  - `supabase/functions/submit-hole/index.ts:57` (`aim` lo envía el cliente)
- **Evidencia:** el cliente oficial nunca envía `d` por debajo de 8, así que `no_gesture` no puede saltar con él. Un bot envía valores aleatorios humanos. Las esperas (`waits`) salen de ticks que elige el cliente.
- **Impacto:** el antibots solo detecta bots ingenuos. Las cuentas honestas pueden salir marcadas por `too_accurate` con una línea base contaminada (GCB-011).
- **Solución recomendada:** tratar estas señales como débiles, combinarlas con tiempos reales del servidor (marcas por tiro) y ajustar los umbrales con datos. Requisito S5.10 pendiente.

### GCB-015 — El ranking cuenta victorias en mesas gratuitas · MEDIUM · CONFIRMADO (estático)

- **Archivo:** `supabase/migrations/20261102120000_ranking_prestige.sql:55-66`, que no filtra por `entry_fee > 0`.
- **Evidencia:** `join_tournament('practice')` es invocable por RPC por cualquier usuario autenticado. El cliente oficial juega la práctica en local, pero la API lo permite, y la práctica no exige KYC (`_check_paid_entry` solo actúa con `entry_fee > 0`).
- **Escenario:** el jugador A y sus cuentas secundarias entran en mesas de práctica; las secundarias no juegan o se dejan perder; A suma victorias y obtiene las bolas exclusivas de top 10 o nº 1.
- - **Contra la especificación:** incumple el criterio de aceptación 2 de `02-DOCS/wiki/sdd/specs/ranking-prestigio.md` («Las victorias en Práctica no cambian el ranking»). El criterio 7 («tests SQL/RPC del ranking y del cierre idempotente») tampoco se cumple: no existen.
- **Solución recomendada:** contar solo mesas con `entry_fee > 0`, o exigir un mínimo de rivales distintos y verificados.

### GCB-016 — «Premio Garantizado» engañoso · MEDIUM · CONFIRMADO (ejecución)

- **Archivo:** `src/main.js:289` (`Premio Garantizado … ${coin(prizeFor(tier))}`, con `prizeFor` = entrada × 8 × 0,9).
- **Evidencia:** el servidor reparte `entry_fee * v_n` (inscritos reales). En la ejecución de GCB-008, con 7 jugadores el premio fue 6,30 y no los 7,20 anunciados. Con 2 jugadores, el premio de Oro es 18 en lugar de 72.
- **Impacto:** publicidad engañosa en un producto de dinero (riesgo regulatorio).
- **Solución recomendada:** mostrar «hasta X» o el bote actual del torneo, y retirar «Garantizado».

### GCB-017 — Caída silenciosa a modo local · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `src/backend/index.js:12-19`
  - `src/main.js:255,1090-1091`
- **Evidencia:** cualquier excepción de `connectSupabase()` (por ejemplo `getBalance` o `account.load`) devuelve un backend `local` con `LocalWallet` (100 créditos). En ese modo, «Jugar Torneo» crea una partida contra 7 bots con «premios» en saldo local.
- **Impacto:** un usuario con sesión válida y un fallo transitorio juega «torneos» falsos y ve otro saldo. Solo aparece el aviso discreto «Modo sin conexión».
- **Solución recomendada:** con sesión válida, mostrar un error y reintentar en lugar de degradar; limitar el modo local a `VITE_BACKEND=local`.

### GCB-018 — Errores tragados al recuperar la entrada · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `src/main.js:1840` (`await backend.tournaments.leave(match).catch(() => { }); showLobby();`)
  - `src/main.js:1902` (lo mismo en «Saltar» desempate)
- **Escenario:** «Salir y recuperar entrada» con la red caída. El error se ignora y se vuelve al lobby como si se hubiera devuelto la entrada. El jugador sigue inscrito sin empezar; al liquidar se le apuntan los golpes máximos y pierde la entrada.
- **Solución recomendada:** mostrar el error y reintentar; confirmar el reembolso con el saldo devuelto.

### GCB-019 — Desarrollo y vistas previas contra la BD de producción · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `src/backend/supabase.js:8-10` (URL y clave de producción por defecto)
  - `README.md` («Sin configurar nada, `pnpm dev` usa el backend de Supabase de producción»)
  - `vercel.json` (CSP con el host de producción codificado)
- **Impacto:** las pruebas manuales, las vistas previas de PR y las ramas en desarrollo leen y escriben datos de producción (torneos, saldos, ranking).
- **Solución recomendada:** un proyecto Supabase de staging y variables por entorno en Vercel; sin valor por defecto para producción en el código.

### GCB-020 — Accesibilidad · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `index.html:5` (`maximum-scale=1, user-scalable=no`, que incumple WCAG 1.4.4)
  - `src/main.js`: 12 superposiciones `class="overlay"` sin `role="dialog"`, `aria-modal` ni gestión del foco; solo el visor de skins lo tiene
  - `src/ui/skinReveal.css:155` (`outline: none` en el orbe)
- **Solución recomendada:** permitir el zoom; un componente de modal con `role="dialog"`, `aria-labelledby`, foco inicial, ciclo de foco y retorno al cerrar.

### GCB-021 — Avatares de 600 KB por amigo · MEDIUM · CONFIRMADO (estático)

- **Archivos:**
  - `supabase/migrations/20261103130000_avatar_friends.sql:10-15` (límite `length < 600000`)
  - `supabase/migrations/20261103130000_avatar_friends.sql:144-172` (`my_friends` devuelve `p.avatar` de cada amigo)
- **Impacto:** con 50 amigos, la respuesta puede pasar de 25 MB y se pide en cada visita a la Cuenta (`friendsPanel`). Alto consumo de datos móviles y de base de datos. (El cliente genera WebP de 256 px, normalmente de pocos KB, pero el servidor admite hasta 600 KB.)
- **Solución recomendada:** guardar las imágenes en Storage y devolver URLs, o bajar el límite a ~64 KB.

### GCB-022 — Dinero en SQL y Edge Functions sin tests · MEDIUM · CONFIRMADO (estático)

- **Evidencia:**
  - Ningún test toca `supabase/migrations` ni las funciones `kyc`, `crypto-deposit` y `nowpayments-ipn`.
  - `tests/economy.test.js` prueba `settle()` en JS, que solo usa la práctica local.
  - Los defectos GCB-002, GCB-008 y GCB-009 se habrían detectado con tests de SQL.
  - Tres migraciones dicen literalmente «SQL no probado contra Postgres» (`save_progress_clamp`, `ranking_prestige` y `avatar_friends`).
- **Solución recomendada:** ver `TEST-AND-COVERAGE-REPORT.md` (pgTAP o un Postgres en CI con el esquema base de GCB-005).

### GCB-023 — Avisos de seguridad en dependencias de desarrollo · MEDIUM · CONFIRMADO (ejecución)

- **Evidencia:**
  - `pnpm audit --prod`: «No known vulnerabilities found».
  - `pnpm audit`: 9 avisos (1 alto, 7 moderados, 1 bajo) en `vite@5.4.21` y `esbuild@0.21.5`, entre ellos GHSA-587h-7wmj-h5pm (alto) y GHSA-67mh-4wv8-2f99 (esbuild). Detalle en `audit/evidence/pnpm-audit-full.json`.
  - `package.json:6` arranca `vite --host`, que expone el servidor en la red local.
  - El CI audita solo `--prod` (`.github/workflows/ci.yml:32`).
  - Excepción documentada en la constitución (D8.4).
- **Solución recomendada:** subir a `vite >= 6.4.4` y quitar `--host` por defecto (que sea opcional).

### GCB-024 — El plazo empieza al inscribirse · LOW · CONFIRMADO (estático)

- **Archivo:** `supabase/migrations/20261027140000_rematch_groups.sql:130-132` (`deadline = now() + play_minutes` en la inscripción; `start_round` no lo amplía).
- **Impacto:** quien espera en la sala 15 min solo tiene 5 min para jugar, aunque la interfaz promete «20 min para terminar».
- **Solución recomendada:** fijar el `deadline` en `start_round`, limitado por `closes_at`.

> **Actualización `5a05874` — CORREGIDO en lo esencial:** `deadline = greatest(now(), starts_at) + play_minutes` (`live_matches.sql:218`); la partida arranca para todos en `starts_at`.

### GCB-025 — `innerHTML` sin escapar · LOW · CONFIRMADO (estático)

- **Archivo:** `src/main.js:1040` (`${t.note}`), `1126`, `1161`, `1561`, `1606`, `1608`, `1651` y `1812` (`p.name`).
- **Evidencia:** existe `esc()` (línea 506) pero no se usa en estos puntos. Hoy los nombres están limitados por la regex de `set_username` y las notas las genera el servidor, pero `profiles`, `transactions` y su RLS no son auditables (GCB-005).
- **Solución recomendada:** escapar siempre con `esc()` o construir el DOM con `textContent`.

### GCB-026 — Listener `fullscreenchange` acumulativo · LOW · CONFIRMADO (estático)

`src/main.js:1504`: cada `playScreen` en móvil añade un listener en `document` que nunca se quita y que conserva una referencia a vistas antiguas. **Solución recomendada:** quitarlo al salir.

### GCB-027 — XP de torneo deduplicada en `localStorage` · LOW · CONFIRMADO (estático)

`src/main.js:1922-1941`: `gcb.tournaments.recorded`. Cada dispositivo (o tras borrar datos) vuelve a sumar la XP y las victorias del mismo torneo. **Solución recomendada:** que el servidor marque el torneo como contabilizado (relacionado con GCB-012).

### GCB-028 — `#hoyoN` fuera de rango · LOW · CONFIRMADO (estático)

`src/main.js:1087,1101,1532`: `#hoyo0` o `#hoyo99` hacen que `courses = [-1]` o `[98]` y `COURSES[...]` sea `undefined`, lo que rompe `playScreen`. Es una herramienta de pruebas expuesta en producción. **Solución recomendada:** validar el rango o activarlo solo en desarrollo.

### GCB-029 — `first_ticks` revela el rendimiento de los rivales · LOW · CONFIRMADO (estático)

`supabase/migrations/20261027140000_rematch_groups.sql:23-29`: antes de terminar, el jugador recibe el tick en el que embocó el más rápido de cada hoyo. Eso aproxima cuántos golpes dio, cuando el diseño dice que «nadie juega sabiendo qué tiene que batir». **Solución recomendada:** desaparece con la corrección de GCB-002.

> **Actualización `5a05874` — AMPLIADO:** además de `first_ticks` (`live_matches.sql:285`), `_tournament_json` devuelve ahora los golpes de cada rival en los hoyos que tú ya has jugado (`e.scores[1:v.played]`, línea 303). Junto con GCB-001, el jugador sabe exactamente qué resultado tiene que batir antes de repetir un hoyo.

### GCB-030 — Topes fijos de 8 frente a hoyos largos · LOW (latente) · CONFIRMADO (estático)

- **Archivos:**
  - `supabase/functions/submit-hole/index.ts:32` (`shots.length > 8`)
  - `hole_timer.sql` (`v_max := _cfg('max_strokes')` = 8)
  - `src/game/courses.js` (*El Templo de la Selva*: `maxStrokes: 20`; *El Glaciar*: `maxStrokes: 12`)
- **Estado:** hoy no ocurre porque `course_count = 15` y esos hoyos (índices 15 y 16) solo se juegan en Juego Libre. Si se sube `course_count` como dice la documentación, los envíos de más de 8 tiros se rechazarán y las descalificaciones se apuntarán 8 golpes en hoyos de par 12.
- **Solución recomendada:** usar `course.maxStrokes` en la función y guardar el máximo por hoyo en el torneo.

> **Actualización `5a05874` — CORREGIDO:** `submit-hole` admite hasta 20 tiros (`index.ts:34`) y la liquidación usa el máximo de cada hoyo (`_course_max`, `20261105120000_temple_online.sql`). Queda la fragilidad de GCB-051.

### GCB-031 — `isSunk` ignora `maxStrokes` · LOW · CONFIRMADO (estático)

`src/progress/Progress.js:243`: con `MAX_STROKES_PER_HOLE = 8` fijo, embocar con entre 8 y 19 golpes en el Templo no cuenta para el contador de la skin.

### GCB-032 — Texto de avatar obsoleto · LOW · CONFIRMADO (estático)

`src/main.js:883,897` dice «solo se guarda en este dispositivo», pero `AvatarStore.onChange` llama a `set_avatar` (`src/main.js:2350`) y el avatar se guarda en el servidor y lo ven los amigos. Información de privacidad incorrecta.

### GCB-033 — Código muerto e integración heredada · LOW · CONFIRMADO (estático)

- **Evidencia:**
  - `src/match/SupabaseMatchService.js` completo: en modo Supabase, `main.js:1091` siempre usa `practice`, porque `backend.tournaments` existe siempre.
  - `SupabaseWallet.chargeEntry`, `payPrize` y `refund` (lanzan error).
  - `public._record_hole` (sustituida por `_record_timed_hole`).
  - El trigger `_legacy_free_only` sobre `matches`.
  - Las RPC `join_match`, `submit_hole` (que acepta golpes declarados por el cliente), `finish_match_tb` y `abandon_match`: el cliente las llama pero no están en el repo.
- **Riesgo:** si esas RPC siguen desplegadas, aceptan puntuaciones del cliente (protegidas solo por el trigger de entrada 0).
- **Solución recomendada:** borrar el código y revocar o eliminar las RPC heredadas en una migración.

### GCB-034 — Documentación desalineada · LOW · CONFIRMADO (estático)

- **README:**
  - «14 hoyos», cuando el catálogo tiene 17 y `course_count` = 15.
  - «los otros 7 juegan el mismo hoyo a la vez… Clasificación en vivo»: falso en torneos, que son asíncronos con puntuaciones ocultas.
  - Lista funciones que no están en el repo.
- **`reglas-y-economia.md`:** «15 hoyos» y la misma «clasificación en vivo».
- **Interfaz:** el lobby muestra «EN VIVO» (`main.js:261`).

> **Actualización `5a05874` — PARCIAL:** con las partidas en vivo, «clasificación en vivo» y «EN VIVO» ya son ciertos. El README sigue diciendo «14 hoyos» (`README.md:11`), cuando el catálogo tiene 17 y `course_count = 17`; `reglas-y-economia.md` dice 15.

### GCB-035 — Comodines en `admin_players` · LOW · CONFIRMADO (estático)

`supabase/migrations/20261019160000_admin_panel.sql:93`: `ilike '%' || p_search || '%'` sin escapar `%` ni `_`. No es una inyección SQL; solo da coincidencias inesperadas. Solo afecta a administradores.

### GCB-036 — Revancha en solitario · LOW · CONFIRMADO (estático)

`rematch_groups.sql:82-97`: los torneos de revancha excluyen a desconocidos. Si solo uno la pide, espera los 15 min de `closes_at` para recibir el reembolso, sin aviso en la interfaz.

> **Actualización `5a05874` — CORREGIDO de facto:** las salas arrancan a los 15 s (`live_fill_seconds`) y, si solo hay un jugador real, se le devuelve la entrada al terminar.

### GCB-037 — `bindWallet` relanza el error · LOW · CONFIRMADO (estático)

`src/main.js:1058-1063`: con un error que no sea `daily_cap` hace `throw e` dentro del manejador de clic. Queda una promesa rechazada sin capturar y el botón sigue deshabilitado sin mensaje.

### GCB-038 — Versión de Node · LOW · CONFIRMADO (estático)

`package.json` declara `engines.node >=20`, pero `pnpm-lock.yaml` fija `@supabase/supabase-js@2.118.0` con `engines: {node: '>=22.0.0'}`. El README lo reconoce a medias.

### GCB-039 — Permisos de agente autoaprobados · LOW · CONFIRMADO (estático)

`.claude/settings.json:104-108` permite sin confirmación `git commit *`, `git push *` y `gh pr create *`. Los agentes pueden publicar en el remoto sin intervención humana (el `--force` sí pide confirmación).

### GCB-040 — Rendimiento del ranking y de la liquidación perezosa · LOW · CONFIRMADO (estático)

- **Archivos:**
  - `ranking_prestige.sql:51-66,69-102,105-149`
  - `async_tournaments.sql:179-194`
- **Evidencia:**
  - `get_ranking` calcula `_ranking_rows` (agregado sobre todas las entradas ganadoras) dos veces, y `_settle_ranking` otras dos por cada semana o mes sin cerrar.
  - No hay índice por `(position, tournament_id)` ni por `settled_at`.
  - `_settle_due` (que bloquea hasta 20 torneos) se ejecuta en cada `join_tournament` y cada `my_tournaments` de cualquier usuario.
- **Impacto:** crece linealmente con el histórico; hoy es aceptable.
- **Solución recomendada:** índices, una vista materializada por periodo y `pg_cron` para liquidar.

> **Actualización `5a05874` — EMPEORA:** cada jugador llama a `tournament_status` cada 4 s (1,5 s en la sala; `src/main.js:2022,2075`). Cada llamada ejecuta `_settle_tournament`, con su `for update` del torneo, y `_tournament_json`. `_settle_due`, en cada `join` y `party_ready`, evalúa `_tournament_live` para cada torneo abierto. Los grupos consultan además cada 3 s. La carga crece con los jugadores conectados, no con las partidas.

### GCB-041 — Liberación de WebGL · LOW · SOSPECHA (evidencia estática reforzada)

- **Archivo:** `src/game/GolfGame.js:413-427` (`dispose()`) y `src/game/GolfGame.js:430-434` (`#buildScene`).
- **Evidencia:** análisis estructural de `src/game/render/`. `course.js` (125 `new THREE.*Geometry|Material|Texture`), `environment.js` (88), `attractions.js` (63), `cyberpunkEnvironment.js` (40), `lushEnvironment.js` (12) y `portal.js` (8) **no llaman nunca a `dispose()`**. Solo `cyberpunkEnvironment.js` y `environment.js` cachean parte de sus texturas y materiales en `Map` de módulo. `GolfGame.dispose()` llama a `renderer.dispose()` pero no recorre la escena para liberar materiales y texturas ni llama a `forceContextLoss()`; `#buildScene` solo libera las geometrías de la escena anterior. Cada hoyo crea un `GolfGame` (y un contexto WebGL) nuevo, mientras que `skinInspector.js` sí fuerza la pérdida de contexto.
- **Riesgo:** acumulación de contextos y memoria de GPU hasta que actúe el recolector de basura. Los navegadores limitan los contextos activos (unos 16) y en móvil puede acabar en «context lost».
- **Pendiente:** perfilar en un dispositivo real (no se ha podido ejecutar el render).
- **Solución recomendada:** recorrer la escena liberando geometrías, materiales y texturas no cacheadas y llamar a `renderer.forceContextLoss()` en `dispose()`, o reutilizar un único renderer entre hoyos.

**Descartado en la misma pasada:** las `new THREE.Vector3` de `#frame` (`GolfGame.js:1304-1438`) solo se crean con eventos (portal, lava, agua, embocar), no en cada fotograma; su coste es despreciable.

### GCB-042 — IPN de NOWPayments · LOW · SOSPECHA

`supabase/functions/nowpayments-ipn/index.ts:38,49`:

- La firma se comprueba sobre `JSON.stringify(sortKeys(JSON.parse(raw)))`. Los números como `1.0` se re-serializan como `1`, lo que puede dar falsos «bad signature».
- Se compara `price_amount` (precio de la factura) y no `actually_paid` ni `outcome_amount`.
- La lógica final está en `credit_deposit`, que no está en el repo (GCB-005).

### GCB-043 — `?skinlab=1` en producción · LOW · CONFIRMADO (estático)

`src/main.js:2331-2337`: herramienta interna accesible por URL en producción. Sin impacto de seguridad directo.

### GCB-044 — Semilla de skins cliente/servidor · INFO

`save_progress_clamp.sql:8-12` lo documenta: md5 en el servidor y FNV-1a en el cliente. Una skin puede mostrar «✦ Patrón raro» antes de sincronizar y perderlo después.

### GCB-045 — CORS `*` · INFO

`submit-hole`, `kyc` y `crypto-deposit` responden con `Access-Control-Allow-Origin: *`. Usan bearer token, no cookies, así que no hay riesgo de CSRF. Se recomienda restringirlo al dominio propio.

### GCB-046 — El manifiesto se describe como plataforma de apuestas · MEDIUM · CONFIRMADO (estático)

- **Archivo:** `public/site.webmanifest:4`: `"description": "High-stakes luxury esports mini-golf wagering platform"`.
- **Evidencia:** todo el proyecto defiende un modelo de **habilidad, no de azar** (texto legal del lobby `src/main.js:270`; `constitution.md` S5.11, que exige «revisión legal del modelo de habilidad por país»). El manifiesto, que leen las tiendas de PWA y los buscadores, lo define como plataforma de **apuestas** de «alto riesgo», en inglés en una interfaz en español.
- **Impacto:** riesgo regulatorio y de reputación: en muchas jurisdicciones la calificación de «apuesta» cambia el régimen legal. Contradice el propio posicionamiento.
- **Solución recomendada:** reescribir la descripción en español y en línea con el modelo de habilidad (por ejemplo «Minigolf 3D multijugador de habilidad»), revisada por la parte legal.

### GCB-047 — Buscador de tiro óptimo en el repositorio · LOW · CONDICIONAL

- **Archivo:** `scripts/route-planner.mjs:1-5` («Busca el mínimo de golpes de un hoyo con la física real (búsqueda en haz)»).
- **Evidencia:** la herramienta usa la misma física determinista que valida el servidor. Con los hoyos de un torneo (`tournaments.courses`, que recibe el cliente), cualquiera puede calcular la secuencia de tiros mínima y enviarla con `submit-hole`.
- **Condición:** solo es un riesgo nuevo si el repositorio es público o se filtra; con física determinista, un atacante puede escribir lo mismo de todas formas. El propio `risk.js` asume este escenario.
- **Solución recomendada:** mantener el repositorio privado y no incluir el solucionador en el bundle; la defensa real es GCB-001, GCB-002 y señales del servidor (tiempos reales).

---

## Hallazgos nuevos en `5a05874`

### GCB-048 — Canal en tiempo real sin autorización: mensajes `done` falsificados descalifican a los rivales · CRITICAL · CONFIRMADO (estático)

- **Archivos:**
  - `src/match/LiveRoom.js:19` (`db.channel(`golf:${matchId}`, { config: { broadcast: { self: false } } })`, canal público sin `private: true` ni política de Realtime)
  - `src/match/LiveRoom.js:32-55` (`#valid` y `receiveDone`: el asiento `seat` lo declara el propio mensaje)
  - `src/main.js:2184-2185` (`live.room.onDone` → `noteRemoteSunk(final.sunkTick)`)
  - `src/game/GolfGame.js:368-376` (`#noteSunk` fija `firstSunkTick`)
  - `src/game/GolfGame.js:337-339` y `389-…` (`deadlineTick`, `#timeUp`)
- **Evidencia:** el cliente acepta cualquier difusión del tema `golf:<id>` cuyo `seat` sea el de otro jugador real. Un mensaje `{event:'done', payload:{seat: S, hole: h, sunk: true, sunkTick: 1}}` hace que `firstSunkTick = 1` en el cliente de cada víctima. Su `deadlineTick` pasa a `1 + 2400` y, a los 20 s de haber empezado el hoyo (o al instante, si ya iba por detrás), salta `#timeUp()`: el cliente marca `timedOut`, envía `end` a `submit-hole` y el servidor apunta el máximo de golpes del hoyo (`dq = true`).
- **Quién puede hacerlo:** cualquier participante de la partida, que conoce el id del torneo y los asientos, desde la consola del navegador con su propio cliente de Supabase. La clave pública basta para unirse a un canal de difusión público.
- **Escenario:** en una mesa de Diamante (8 × 25), un jugador envía en cada hoyo un `done` falso con el asiento de otro rival. Todos los demás quedan descalificados en todos los hoyos y él gana el premio (180).
- **Impacto:** manipulación directa del resultado y del dinero, sin herramientas especiales.
- **Solución recomendada:** canales privados de Realtime (`config: { private: true }`) con políticas que solo dejen escribir en `golf:<id>` a los participantes y con su propio asiento (o un emisor en el servidor). Sobre todo: **no dejar que un mensaje entre clientes arranque una descalificación**. El contador de un hoyo debe salir solo del servidor (ver GCB-002).

### GCB-049 — El canal emite los tiros exactos de los rivales: copiarlos garantiza su resultado · CRITICAL · CONFIRMADO (estático)

- **Archivos:**
  - `src/main.js:2218,2366` (`onShots: (shots) => live.room.sendShots(index, shots)`)
  - `src/match/LiveRoom.js:58-60`
  - `src/game/remoteBall.js` (repite los tiros recibidos con la física determinista)
- **Evidencia:** cada cliente difunde sus tiros `{tick, yaw, power}` según los hace, los mismos que luego envía a `submit-hole`. La física es determinista e igual en cliente y servidor (comprobado: `tests/determinism.test.js`, `tests/replay.test.js`; `remoteBall.js` se basa en ello). Por tanto, enviar a `submit-hole` exactamente la misma lista de tiros que un rival produce exactamente su número de golpes: `replayHole` no comprueba que los tiros sean propios ni únicos.
- **Escenario:** un jugador con el cliente modificado (o desde la consola) espera en cada hoyo a que termine el rival que mejor lo ha hecho, copia su lista de tiros y la envía como propia. Obtiene, hoyo a hoyo, el mejor resultado de la mesa: como mínimo empata con el mejor y, en general, gana a todos.
- **Agravantes:** la cola de un hoyo dura hasta `LIVE_HOLE_CAP_MS = 150000` ms esperando a los demás (`src/main.js:2025`). Junto con GCB-001, se puede reiniciar el propio hoyo hasta que llegue la lista del rival.
- **Solución recomendada:** no difundir los tiros hasta que el hoyo de todos esté cerrado en el servidor (difundir solo posiciones ya validadas o con retraso), y rechazar en el servidor listas de tiros idénticas a otra ya registrada en el mismo torneo y hoyo (señal de copia).

### GCB-050 — Latido de 45 s: una desconexión breve liquida la partida · HIGH · CONFIRMADO (ejecución)

- **Archivos:**
  - `supabase/migrations/20261103180000_live_matches.sql:26,34-38` (`live_idle_seconds = 45`, `_entry_pending`)
  - `supabase/migrations/20261103180000_live_matches.sql:323-331` (`tournament_status` liquida en cada llamada)
  - `src/main.js:2022,2068-2077` (latido con `setTimeout` cada 4 s)
- **Evidencia (ejecución, `audit/evidence/scenario_live.sql`, escenario C):** «slow» va ganando (2 golpes frente a 4 en el hoyo 1). Su último latido fue hace 50 s, y la llamada de estado de «quick» liquida la partida: a «slow» se le apuntan 8 + 8, queda con 18 frente a 12 y pierde la entrada.

  ```
   C | settled | quick | {4,4,4} | 12 | 1 | 9.00
   C | settled | slow  | {2,8,8} | 18 | 2 |    0
  ```
- **Escenario realista:** en el móvil, una llamada entrante, bloquear la pantalla o cambiar de app suspende el JavaScript; en escritorio, las pestañas en segundo plano frenan los `setTimeout`. Más de 45 s sin latido, con los demás ya terminados, y el jugador pierde la partida aunque fuera ganando, sin aviso y sin poder volver: `_record_timed_hole` responde `match_closed`.
- **Solución recomendada:** un margen mucho mayor (y distinto para «terminó» y «se fue»), avisar al jugador, permitir reconectar mientras quede plazo, y no liquidar por inactividad hasta un tiempo prudente después del último rival.

### GCB-051 — `course_max_strokes` por índice de hoyo y duplicado · MEDIUM · CONFIRMADO (estático)

- **Archivo:** `supabase/migrations/20261105120000_temple_online.sql:6-10` (`'{"15": 20, "16": 12}'`).
- **Evidencia:** el máximo de golpes de cada hoyo ya está en `src/game/courses.js` (`maxStrokes`, que usa `replayHole`) y se copia a mano en `app_config` indexado por posición en el array. Un reorden de hoyos, como el de GCB-011, o un hoyo nuevo con máximo propio desalinea en silencio la liquidación (`_course_max`) y la repetición (`replayHole`). Ningún test lo compara.
- **Solución recomendada:** identificador estable de hoyo (GCB-011) y un test que compare `course_max_strokes` con `COURSES[i].maxStrokes`, o que `submit-hole` guarde el máximo del hoyo junto al resultado.

### GCB-052 — `cleanShots` limita a 12 los tiros de un rival · LOW · CONFIRMADO (estático)

`src/game/remoteBall.js:18` (`list.length > 12` → `null`). En el Templo (hasta 20 golpes) y el Glaciar (12), un rival que pase de 12 tiros deja de verse en directo; `mergeShots` ignora sus listas. Es solo visual: el resultado oficial no cambia. **Solución recomendada:** usar el máximo del hoyo (20).

### GCB-053 — Tests sobre el texto del SQL que dan falsa seguridad · LOW · CONFIRMADO (estático)

`tests/party.test.js:37-55` lee `supabase/migrations/20261103150000_matchmaking_parties.sql` y comprueba cadenas con regex. El test «el matchmaking se serializa por mesa y **solo usa torneos vivos**» (línea 44) exige `and public._tournament_live(t.id)` en ese archivo, pero `20261103180000_live_matches.sql:227-237` **redefinió después** `_find_tournament` sin esa condición. El test pasa y la función efectiva no lo cumple. **Solución recomendada:** tests de comportamiento contra un Postgres con todas las migraciones (ver `TEST-AND-COVERAGE-REPORT.md`).

