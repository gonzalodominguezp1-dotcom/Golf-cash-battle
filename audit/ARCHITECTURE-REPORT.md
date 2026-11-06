# Arquitectura real — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06 · primera pasada `386c815`; **reauditoría `5a05874`** (§7). Descrita a partir del código, no de la documentación (las discrepancias con la documentación se indican).

## 1. Stack y tamaño

| Capa | Tecnología | Evidencia |
|---|---|---|
| Frontend | JavaScript ES modules sin framework, DOM con plantillas `innerHTML` y Three.js 0.169 | `package.json`, `src/main.js` |
| Build | Vite 5.4.21, dos entradas (`index.html`, `admin.html`) | `vite.config.js` |
| Hosting | Vercel (CSP y cabeceras en `vercel.json`) | `vercel.json` |
| Backend | Supabase: Postgres (RPC `security definer`), Auth, 4 Edge Functions en Deno | `supabase/` |
| Pagos y KYC | NOWPayments (sandbox), Didit (opcional, con modo pruebas) | `supabase/functions/*` |
| CI | GitHub Actions: `pnpm test`, `build`, `pnpm audit --prod`, `deno check` | `.github/workflows/ci.yml` |
| Gestor de paquetes | pnpm 11.24.0 (`packageManager`), lockfile v9 | `package.json`, `pnpm-lock.yaml` |

Tamaño: 218 archivos versionados (31 imágenes), unas 36.500 líneas de texto. `src/` tiene 72 módulos JS (21.207 líneas; 25.062 líneas de texto contando el CSS); `main.js` (2.362), `style.css` (3.250) y `GolfGame.js` (1.557) concentran el 29 % de `src/`.

## 2. Mapa de módulos

```
index.html ─► src/main.js  (orquestador de toda la UI: 2.362 líneas, ~60 funciones)
               ├─ backend/index.js ─► backend/supabase.js ─► SupabaseWallet, TournamentService,
               │                                           AccountService/AuthService, SupabaseMatchService (muerto)
               │                    └─ (fallback) LocalWallet + MatchService (bots)
               ├─ game/GolfGame.js (import dinámico) ─► physics.js, bots.js, audio.js, render/* (20 + skins/*)
               ├─ progress/* (Progress, skins, inventory, prestige, avatar)
               ├─ ui/* (authScreen, skinReveal, skinInspector*, skinThumbs*)
               └─ match/MatchService.js (práctica local contra bots, settle en JS)
admin.html ─► src/admin/admin.js ─► RPC admin_*
supabase/functions/submit-hole ─► game/{physics,replay,courses}.js + antibot/risk.js  (copias de src/, sync:functions)
```

### Flujos principales

**Torneo de pago (online):**

1. `startMatch` → `TournamentService.join` → RPC `join_tournament`.
2. `start_round`.
3. Por cada hoyo, `GolfGame` local; al terminar, `submitHole` → Edge `submit-hole` → `replayHole` → `_record_signals`, `_risk_inputs` y `_set_risk` (antibots) → `_record_timed_hole` → `_settle_tournament`.
4. Hoyo de desempate (`hole = n`).
5. Consulta periódica de `tournament_status` cada 5 s hasta liquidar.

**Práctica:** siempre local (`practice = new MatchService(new LocalWallet())`, `main.js:27,1091`): bots simulados, saldo local y XP.

**Juego Libre:** local, sin puntuación.

**Progreso:** se calcula en el cliente (`Progress.recordMatch`) y se sube completo con `save_progress` en cada cambio; el servidor solo pone topes.

**Ranking:** sale de `tournament_entries` liquidadas (servidor), con nivel y marco calculados de la XP del cliente.

**Dinero:** solo `_apply_tx` cambia `wallets.balance`. La entrada se cobra en `join_tournament`, el premio se paga en `_settle_tournament` y el reembolso se hace en `leave_tournament` o al cancelar. Las recargas demo y los depósitos usan funciones que no están en el repo.

## 3. Problemas de arquitectura

### A-1 · El esquema base no forma parte del repositorio (HIGH, GCB-005)

Las migraciones empiezan con `alter table public.profiles…` e `insert into public.app_config…` sobre objetos inexistentes. El estado de la BD de producción es la única fuente de verdad. He validado que las 18 migraciones se aplican sobre un esquema base **simulado** (`audit/evidence/stub_baseline.sql`), pero ese esquema lo he inferido yo y no es el real.

### A-2 · `main.js` es un monolito de UI (MEDIUM, deuda técnica)

En un solo archivo de 2.362 líneas conviven navegación, lobby, skins, cuenta, amigos, wallet, KYC, matchmaking, HUD de juego, menú de ajustes, desempate, resultados, torneos, Juego Libre y arranque. Usa estado global mutable (`backend`, `wallet`, `matches`, `game`, `screen`, `avatar`, `accountTab`, `rankingTab`, `rewardsOpen`) y listeners globales sin ciclo de vida. Consecuencias directas: GCB-004, GCB-026 y la falta de tests de UI (no se puede importar en Node porque importa CSS y DOM al cargar).

### A-3 · Lógica de reparto duplicada en JS y SQL (MEDIUM)

`MatchService.settle` (JS, práctica) y `_settle_tournament` (SQL) implementan las mismas reglas por separado. Solo la versión JS tiene tests, y ambas comparten el defecto de redondeo (GCB-008).

### A-4 · Física compartida por copia (LOW, mitigado)

`scripts/sync-functions.mjs` copia 4 archivos a `supabase/functions/submit-hole/`. Está bien mitigado: `tests/replay.test.js:93` falla si las copias divergen. El riesgo que queda es desplegar la función y la migración en distinto orden; el orden está documentado en cada migración de hoyos, pero no lo comprueba nada automático.

### A-5 · Identificación de hoyos por índice (MEDIUM, GCB-011)

`tournaments.courses int[]` y `shot_signals.course` guardan índices del array `COURSES`. Cualquier reorden o borrado corrompe el histórico, como ya ocurrió en `20261030120000_fourteen_courses.sql`. Falta un identificador estable.

### A-6 · Cliente autoritativo en lo que debería decidir el servidor (CRITICAL/MEDIUM)

La constitución dice (S5.7): «El saldo y los golpes los decide el servidor». La arquitectura real lo cumple para el **número de golpes de un intento**, pero no para:

- qué intento cuenta (GCB-001);
- el tiempo (GCB-002, GCB-003);
- el progreso, la XP, el nivel y el marco (GCB-012).

### A-7 · Configuración repartida en tres sitios

Las reglas económicas están en `src/config.js` (cliente: `PLAYERS_PER_MATCH`, `TIERS`, `PLATFORM_COMMISSION`, `HOLE_TIME_LIMIT`), en `app_config` (servidor: `players_per_match`, `commission`, `max_strokes`, `hole_time_limit`…) y en `tiers` (servidor). Ningún mecanismo las sincroniza: el lobby anuncia premios con la configuración del cliente (GCB-016) mientras el servidor paga con la suya.

### A-8 · Código muerto y contratos rotos (LOW, GCB-033)

`SupabaseMatchService` llama a RPC que no están en el repo (`join_match`, `submit_hole`, `finish_match_tb`, `abandon_match`, `active_match`). `SupabaseWallet` implementa la interfaz `WalletService` con 3 métodos que solo lanzan error. `MatchService.recordHole` admite `botStrokesById` (golpes de los bots enviados por el cliente) en un contrato que el servidor ya no usa.

### A-9 · Degradación silenciosa (MEDIUM, GCB-017)

`createBackend()` convierte cualquier error de Supabase en «modo local» con otra wallet. No distingue «sin red» de «error del servidor» ni de «modo demo deliberado».

### A-10 · Peso de la capa visual

`src/game/render/` (20 archivos + `skins/` con 19) y `src/ui/skin*` suman 12.204 líneas, frente a 8.984 de toda la lógica de juego, dinero y cuentas (física, hoyos, `GolfGame`, wallet, torneos, cuenta, progreso, antibots, migraciones y Edge Functions juntos). No es un defecto en sí, pero contrasta con que el núcleo de integridad (GCB-001/002) esté sin resolver (ver `AI-SLOP-REPORT.md`, §3).

## 4. Dependencias

| Paquete | Versión fijada | Uso | Estado |
|---|---|---|---|
| `three` | 0.169.0 | Render 3D (se carga de forma diferida) | Sin CVE conocida |
| `@supabase/supabase-js` | 2.118.0 (cliente) / `@2` sin fijar (Deno) | Backend | Sin CVE conocida; versión de Deno no reproducible |
| `vite` (dev) | 5.4.21 | Build y servidor de desarrollo | 8 avisos (dev) |
| `esbuild` (transitiva) | 0.21.5 | Build | 1 aviso moderado |

No hay dependencias innecesarias en producción: solo dos.

## 5. Base de datos (lo visible)

| Tabla | PK y claves | Índices | RLS | Observaciones |
|---|---|---|---|---|
| `tournaments` | `id` | parcial `(tier_id, created_at) where open`; `(rematch_of, created_at) where open` | Activado, **sin políticas** (solo RPC) | `pot`, `commission`, `prize` como `numeric` sin escala |
| `tournament_entries` | `id`; `unique(tournament_id,user_id)`, `unique(tournament_id,seat)` | `(user_id, joined_at desc)` | `select` propio | `seat = -1 - seat` al salir (truco para liberar la plaza) |
| `tournament_holes` | `(entry_id, hole)` | — | Sin políticas | `shots jsonb` sin límite de tamaño (lo limita la función) |
| `shot_signals` | `(entry_id, hole)` | `(user_id, created_at desc)`, `(course)` | Sin políticas | FK `user_id … on delete cascade`, pero `entry_id` sin cascade |
| `player_risk`, `held_payouts`, `kyc_sessions` | — | Parciales y adecuados | `select` propio en `held_payouts` y `kyc_sessions` | — |
| `admins`, `admin_actions` | — | — | Sin políticas | — |
| `ranking_awards`, `ranking_closed` | Compuestas | — | Sin políticas | `ranking_awards.user_id` sin `on delete` |
| `friendships` | `(requester, addressee)` + índice único de pareja | `(addressee)` | Sin políticas | Correcto |

Observaciones de integridad:

- **Tipos y escalas:**
  - Los importes son `numeric` sin precisión fija (por ejemplo `entry_fee numeric`), sin `check (>= 0)` en `tournaments.entry_fee`, `pot` ni `prize`.
  - `held_payouts.amount` no tiene `check > 0`.
- **Borrado de usuarios:** `tournament_entries.user_id` y `tournament_holes.entry_id` no tienen `on delete cascade` mientras `shot_signals.user_id` sí. Borrar un usuario de `auth.users` fallará por la FK de `tournament_entries` (comportamiento correcto para conservar el histórico, pero sin estrategia de anonimización para el RGPD).
- **Concurrencia:** liquidación y registro de hoyo serializados por `for update` sobre `tournaments` (correcto); la inscripción no (GCB-009).
- **Transacciones:** cada RPC es una transacción. La Edge `submit-hole` hace 4 llamadas separadas (`_record_signals`, `_risk_inputs`, `_set_risk`, `_record_timed_hole`), así que se puede guardar la señal y luego fallar el registro (por ejemplo con `time_up`). Es menor y está aceptado por diseño.
- **`_level_of_xp`** se redefine dos veces (`ranking_prestige` → `xp_curve`). La versión vigente coincide con el cliente (verificado).
- **Migraciones con funciones copiadas:** `_tournament_json` (3 versiones), `_settle_tournament` (2), `save_progress` (3), `my_profile` (2) y `join_tournament` (2), redefinidas enteras con `create or replace`. Es normal en migraciones, pero hace difícil saber cuál es la versión vigente sin aplicarlas todas.

## 6. Arquitectura recomendada (resumen)

1. Esquema base versionado y entorno de staging (GCB-005, GCB-019).
2. Un servicio de torneo que haga de árbitro: `start_hole` o un tiro por llamada, tiempo del servidor y un solo intento (GCB-001, 002, 003).
3. Identificadores estables de hoyo (GCB-011).
4. Partir `main.js` en vistas con ciclo de vida `mount`/`unmount` (GCB-004, 026).
5. Configuración económica servida desde el servidor (`tiers` y `app_config`) en lugar de `src/config.js` (GCB-016).
6. XP calculada en el servidor (GCB-012).

## 7. Cambios de arquitectura en `5a05874`

### 7.1 De torneos asíncronos a partidas en vivo

```
lobby ─► join_tournament (candado por mesa) ─► sala de 15 s (starts_at) ─► start_round
      │                                             │
      │   latido tournament_status cada 4 s ◄───────┤  (last_seen; liquida si nadie queda pendiente)
      │                                             ▼
      │   por hoyo: GolfGame (live) ── tiros ──► LiveRoom (Realtime público golf:<id>) ──► rivales (RemoteBall)
      │                             └─ al acabar ─► submit-hole (repetición) ─► _record_timed_hole
      ▼
party_* (grupos de hasta 4 amigos) ─► party_ready ─► _party_queue ─► _enter_tournament para todos
```

- **Bots de relleno:** se generan en el cliente a partir del id de la partida (`liveRules.buildRoster` con `seededRng`), así que todos los móviles ven los mismos. No existen en la BD ni cobran; el bote es entrada × jugadores reales. Están bien etiquetados en la interfaz («BOT», «los bots no cuentan»).
- **Cierre:** `_settle_tournament` ya no espera a llenar la mesa ni a los 15 min. Cierra cuando no queda nadie «pendiente» (`_entry_pending`: sin terminar, en plazo y con latido de menos de 45 s). Quien nunca empezó se marcha con reembolso.
- **Máximo por hoyo:** `_course_max` y `_max_tail` leen `app_config.course_max_strokes` (GCB-051).

### 7.2 Problemas de arquitectura nuevos

| Ref. | Problema | Hallazgo |
|---|---|---|
| A-11 | **El canal entre clientes influye en la puntuación.** El contador de 20 s de cada cliente se alimenta de mensajes sin autenticar de otros clientes | GCB-048 |
| A-12 | **Difusión de información que da ventaja.** Los tiros en directo permiten copiar resultados con una física determinista | GCB-049 |
| A-13 | **Disponibilidad tratada como abandono.** El latido de 45 s decide resultados; no hay reconexión ni margen distinto para «se fue» y «perdió señal» | GCB-050 |
| A-14 | **El latido liquida.** Cada `tournament_status` (cada 4 s por jugador) bloquea el torneo con `for update` y ejecuta la liquidación completa: contención y carga crecen con los jugadores conectados | GCB-040 |
| A-15 | **`_settle_tournament` se ha redefinido 5 veces** en 5 migraciones (`hole_timer`, `matchmaking_parties`, `live_matches`, `temple_online` y la original) copiando la función entera. Cada copia arrastra el mismo redondeo (GCB-008). La versión vigente solo se conoce aplicando todas | GCB-008, GCB-022 |
| A-16 | **Configuración duplicada por índice** (`course_max_strokes` frente a `courses.js`) | GCB-051 |
| A-17 | **Desactivación «temporal» por migración.** Un cambio de seguridad reversible se hace redefiniendo `_paid_block`, sin interruptor en `app_config`, fecha de caducidad ni test que avise | GCB-006 |

### 7.3 Tamaño

`main.js` pasa de 2.362 a 2.816 líneas y `GolfGame.js` de 1.557 a 1.681. El monolito de interfaz (A-2) crece; los módulos nuevos de reglas (`liveRules`, `partyRules`) sí están separados y probados.
