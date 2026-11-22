# Informe de seguridad — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06 · primera pasada `386c815`; **reauditoría `5a05874`** (§5). Los IDs `GCB-xxx` remiten al detalle de `BUGS-AND-ISSUES.md`.

## 1. Superficie de ataque real

| Componente | Exposición | Autenticación | Notas |
|---|---|---|---|
| SPA (`index.html`, `src/main.js`) en Vercel | Pública | Supabase Auth (email+contraseña, PKCE) | CSP estricta en `vercel.json` |
| Panel de admin (`admin.html`) | Pública (`noindex`) | OTP por email + `_is_admin()` en el servidor | Ver 3.6 |
| RPC PostgREST (`security definer`) | `authenticated` | JWT de Supabase | 25+ funciones; ver 3.3 |
| Edge Function `submit-hole` | Pública | Bearer, comprobado con `auth.getUser` | Repite los tiros con la física compartida |
| Edge Function `kyc` (+ `/webhook`) | Pública (`verify_jwt` desactivado según el comentario) | Bearer / HMAC de Didit | Modo pruebas activo sin secrets |
| Edge Function `crypto-deposit` | Pública | Bearer | NOWPayments, sandbox por defecto |
| Edge Function `nowpayments-ipn` | Pública | HMAC-SHA512 | Llama a `credit_deposit`, que no está en el repo |
| Esquema base (`wallets`, `profiles`, RLS, triggers) | — | — | **No está en el repo: no auditable** (GCB-005) |

## 2. Resumen de vulnerabilidades y riesgos

| ID | Sev. | Categoría (OWASP 2021) | Título |
|---|---|---|---|
| GCB-001 | CRITICAL | A04 Diseño inseguro | Repetición ilimitada de hoyos en torneos de pago |
| GCB-002 | CRITICAL | A04 Diseño inseguro / A08 Integridad | Descalificación basada en un tiempo que declara el cliente |
| GCB-003 | HIGH | A08 Integridad | La pausa desincroniza cliente y servidor (validación con falsos rechazos) |
| GCB-005 | HIGH | A05 Configuración / A01 | RLS y políticas de las tablas de dinero fuera del repo, sin poder verificarlas |
| GCB-006 | HIGH | A07 Identificación y autenticación | KYC autodeclarado (modo pruebas sin interruptor) |
| GCB-007 | HIGH | A04 Diseño inseguro | Saldo demo gratuito mezclado con depósitos y premios |
| GCB-009 | MEDIUM | A04 (condición de carrera) | Doble inscripción concurrente |
| GCB-012 | MEDIUM | A08 Integridad | Progreso, nivel y marco autoritativos del cliente |
| GCB-013 | MEDIUM | A03/A04 Validación | Validación de importe que deja pasar todo si falta configuración |
| GCB-014 | MEDIUM | A04 | Antibots basado en señales que controla el cliente |
| GCB-015 | MEDIUM | A04 | Inflado del ranking con cuentas secundarias en mesas gratuitas |
| GCB-019 | MEDIUM | A05 Configuración | Desarrollo y vistas previas escriben en la BD de producción |
| GCB-023 | MEDIUM | A06 Componentes vulnerables | vite y esbuild (solo desarrollo) con `--host` |
| GCB-025 | LOW | A03 Inyección (XSS) | `innerHTML` sin escapar (defensa en profundidad) |
| GCB-029 | LOW | A01 Exposición de información | `first_ticks` filtra el rendimiento de los rivales |
| GCB-033 | LOW | A04 | RPC heredadas no versionadas que aceptan golpes del cliente |
| GCB-035 | LOW | A03 | Comodines de `ILIKE` sin escapar (sin inyección) |
| GCB-039 | LOW | A05 | `git push` autoaprobado para agentes |
| GCB-042 | LOW | A08 | Verificación del IPN mejorable (sospecha) |
| GCB-047 | LOW | A04 | Solucionador de tiro óptimo (`scripts/route-planner.mjs`) en el repo (condicional a que sea público) |
| GCB-045 | INFO | A05 | CORS `*` en las Edge Functions |

## 3. Análisis por área

### 3.1 Autenticación y sesiones · OK con salvedades

- **Correcto:**
  - PKCE (`src/backend/supabase.js:21`).
  - Mensajes de error que no revelan si un email tiene cuenta (`authRules.js:42-57`; `AuthService.signUp` responde igual si el email ya existe).
  - Cambio de contraseña que vuelve a pedir la actual (`AuthService.changePassword`).
  - `signOut({scope:'local'})`.
  - Recarga de la app al cambiar de usuario (`supabase.js:34-36`).
  - La pantalla de entrada usa solo `textContent` (`authScreen.js:5-17`).
- **Salvedades:**
  - La protección de fuerza bruta en el cliente (`retryDelayMs`) es solo cosmética. El límite real depende de la configuración de Supabase (CAPTCHA, rate limits), que no se puede verificar desde el repo (`supabase.md` lo documenta como pendiente: «activar CAPTCHA antes de abrir el registro»).
  - El admin entra con OTP (`signInWithOtp`, `shouldCreateUser:false`) sin PKCE explícito (`src/admin/admin.js:11`).

### 3.2 Autorización (IDOR/BOLA)

He revisado una por una las RPC de las migraciones:

| Función | Comprueba `auth.uid()` | Acceso a datos ajenos | Resultado |
|---|---|---|---|
| `join_tournament`, `start_round`, `leave_tournament`, `tournament_status`, `my_tournaments` | Sí | Solo entradas propias (`user_id = v_uid`) | OK |
| `_tournament_json` | Interna (revocada a `authenticated`) | Oculta las puntuaciones ajenas hasta terminar | OK, salvo `first_ticks` (GCB-029) |
| `my_profile`, `set_username`, `save_progress`, `set_avatar`, `set_frame` | Sí | Solo la fila propia | OK (pero GCB-012) |
| `add_friend`, `respond_friend`, `remove_friend`, `my_friends` | Sí | Por nombre público; las peticiones no exponen el avatar | OK. Permite enumerar nombres (`user_not_found`) y enviar peticiones sin límite |
| `get_ranking`, `my_ranking` | Sí | Nombres, nivel y marco públicos | OK |
| `admin_*` | `_require_admin()` (email en `admins`, confirmado y no anónimo) | Todo | OK. Cada cambio queda en `admin_actions` |
| `_record_timed_hole`, `_record_signals`, `_risk_inputs`, `_set_risk`, `_kyc_*`, `review_player` | Solo `service_role` | — | OK |
| `_level_of_xp`, `_frame_for`, `_ranking_rows`, `_settle_ranking` | Revocadas a `authenticated` | — | OK |

Todas las funciones `security definer` de las migraciones fijan `set search_path = ''` (S5.5 cumplida en lo que es visible). `_legacy_free_only` no es `security definer` pero también fija el `search_path`.

**No verificable:** las políticas RLS de `wallets`, `transactions`, `profiles`, `tiers` y `app_config` (GCB-005). Riesgo concreto: si `profiles` tuviera una política `UPDATE` del propio usuario, un jugador podría escribir `kyc_status='verified'`, `birthdate` e `identity_hash` y saltarse `_paid_block`; y si `app_config` fuera escribible, cambiar la comisión o el antibots. Hay que ejecutar ya `supabase/audit/auth_security_audit.sql` en producción y guardar el resultado.

### 3.3 Integridad del juego (antitrampas)

| Control | Implementación | Valoración |
|---|---|---|
| Golpes calculados en el servidor | `submit-hole` repite tiros `{tick,yaw,power}` cuantizados con física determinista (`dsin`/`dcos` polinómicos) | **Sólido**. Verificado: no hay `Math.sin`/`cos`/`hypot` en la física compartida, y `tests/replay.test.js` compara las copias |
| Un intento por hoyo | **No existe** | **CRITICAL** (GCB-001) |
| Contador de 20 s | Medido en ticks declarados por el cliente y aplicado de forma retroactiva al liquidar | **CRITICAL** (GCB-002) |
| Pausa | El cliente avanza ticks sin simular | **HIGH** (GCB-003) |
| Bots que calculan el tiro perfecto | `risk.js`: esperas, gesto y precisión | Débil: las señales las controla el cliente (GCB-014). El propio diseño lo asume («nada de esto es prueba») |
| Una identidad, una cuenta | Hash del documento | Ineficaz en modo pruebas (GCB-006) |
| Retención de premios en revisión | `_apply_tx` desvía a `held_payouts` | Correcto (lógica revisada) |

### 3.4 Dinero

- **Correcto:**
  - `_apply_tx` con `for update` sobre el wallet y control de saldo negativo (`insufficient_funds`).
  - Liquidación con `for update` del torneo.
  - `_settle_due` con `skip locked`.
  - Reembolso al abandonar antes de empezar.
- **Defectos:**
  - Redondeo que crea dinero (GCB-008).
  - Carrera en la inscripción (GCB-009).
  - Saldo demo mezclado con el real (GCB-007).
  - Recarga demo y acreditación de depósitos no auditables (GCB-005).
  - Validación de importes que deja pasar todo si falta configuración (GCB-013).
- `admin_resolve_payout` acredita sin `_apply_tx` (para no volver a retener), pero sin `for update` sobre `wallets`. El `update … set balance = balance + x` es atómico, así que no hay pérdida de actualizaciones.

### 3.5 XSS, CSP y cabeceras

- **CSP** (`vercel.json`):
  - `default-src 'self'; script-src 'self'`: sin `unsafe-inline` ni `unsafe-eval` para scripts.
  - `style-src 'unsafe-inline'`, necesario por los estilos en línea.
  - `object-src 'none'`, `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy` presentes.
  - Con esta CSP, un XSS por `innerHTML` no puede ejecutar scripts en línea ni externos; solo inyectar HTML y CSS.
  - Defecto: el host de Supabase está codificado en la CSP, así que si se cambia `VITE_SUPABASE_URL` sin tocar `vercel.json` la app deja de funcionar.
- **Sumideros `innerHTML`:**
  - `src/admin/admin.js` escapa todo con `esc()`.
  - `src/main.js` escapa nombres en ranking, amigos y cuenta, pero no en el historial (`t.note`), en la mesa de espera, el tablero y el desempate (GCB-025).
  - Los avatares en `src` están limitados a `data:image/(png|jpeg|webp);base64` por una restricción de la BD y por `isImageUrl`, así que no admiten SVG ni `javascript:`. Correcto.

### 3.6 Panel de administración

- **Correcto:** autorización en el servidor por email confirmado; acciones registradas; confirmación antes de liberar o anular.
- **Riesgo:** la seguridad de la lista de administradores depende de `Secure email change` (cambiar el email a uno de `admins`). Está documentado como configuración obligatoria del panel; no es verificable.
- **Mejora:** limitar `admin.html` por IP o exigir MFA (Supabase MFA) para administradores.

### 3.7 Edge Functions

| Función | Correcto | Riesgos |
|---|---|---|
| `submit-hole` | Usuario verificado con el token; tamaño de `shots` limitado; errores normalizados (`^[a-z_]+$`) | El antibots no bloquea el registro si falla (`console.error`) (por diseño); `end` opcional (GCB-002); tope fijo de 8 (GCB-030) |
| `kyc` | HMAC con comparación de tiempo constante y ventana de 300 s; solo guarda el hash del documento (S5.8) | Modo pruebas sin interruptor (GCB-006); `returnUrl` acepta cualquier `https?://` (la redirección la hace el proveedor; riesgo de redirección abierta bajo) |
| `crypto-deposit` | Factura creada en el servidor; saldo no tocado | Límites que dejan pasar todo (GCB-013); `returnUrl` libre (`success_url`/`cancel_url`); sin límite de frecuencia: se pueden crear filas `deposits` sin fin |
| `nowpayments-ipn` | HMAC-SHA512 con comparación constante; comprueba importe y moneda | GCB-042 (sospecha) |

### 3.8 Secretos

- **Árbol actual:** solo contiene la clave pública `sb_publishable_…` (permitida por S5.3).
- **Historial completo** (`git log --all -p`): buscados tokens JWT (`eyJhbGciOiJ…`), `sb_secret_`, `NOWPAYMENTS_*=`, `DIDIT_*=` y `sk_live/sk_test`. **0 coincidencias.**
- `.env*` está ignorado. `01-TOOLS/_TEMPLATE/.env.example` solo contiene marcadores.

### 3.9 Dependencias (CVE)

| Ámbito | Resultado | Fuente |
|---|---|---|
| Producción (`three@0.169.0`, `@supabase/supabase-js@2.118.0`) | **0 vulnerabilidades conocidas** | `pnpm audit --prod` ejecutado el 2026-11-06 |
| Desarrollo | **9**: 1 alta (GHSA-587h-7wmj-h5pm, vite/launch-editor, Windows), 7 moderadas (incl. GHSA-67mh-4wv8-2f99 esbuild y GHSA-4w7w-66w2-5vf9), 1 baja | `pnpm audit`, `audit/evidence/pnpm-audit-full.json` |
| Edge Functions (Deno, `npm:@supabase/supabase-js@2` **sin versión fija**) | **No auditado** (sin herramienta; Deno no está instalado). El rango `@2` toma la última 2.x en cada despliegue: despliegues no reproducibles | — |

### 3.10 Rate limiting y abuso

No hay limitación de frecuencia propia en ninguna RPC ni Edge Function: `save_progress`, `add_friend`, `crypto-deposit`, `join_tournament`/`leave_tournament` (bucle de inscribirse y salir, que crea torneos vacíos) y `submit-hole` (que ejecuta hasta 72.000 ticks de física por llamada, con coste de CPU en Deno). Dependen de los límites genéricos de Supabase.

## 4. Prioridades de seguridad

1. **P0:** GCB-001, GCB-002 (integridad de resultados) y GCB-005 (ejecutar `auth_security_audit.sql` en producción y versionar el esquema).
2. **P1:**
   - GCB-006: interruptor del modo pruebas de KYC.
   - GCB-007: separar saldos.
   - GCB-003.
   - GCB-009.
   - Fijar la versión de `npm:@supabase/supabase-js` en las Edge Functions.
3. **P2:**
   - GCB-013, GCB-014 y GCB-015.
   - Limitar la frecuencia de las RPC.
   - GCB-019: entorno de staging.
   - GCB-023.

Plan completo en `REMEDIATION-ROADMAP.md`.

## 5. Reauditoría sobre `5a05874`

### 5.1 Hallazgos nuevos o con más severidad

| ID | Sev. | Categoría (OWASP 2021) | Título |
|---|---|---|---|
| GCB-048 | **CRITICAL** | A01 Control de acceso / A08 Integridad | Canal Realtime público: un `done` falsificado descalifica a los rivales |
| GCB-049 | **CRITICAL** | A04 Diseño inseguro | Difusión de los tiros exactos: copiar al mejor rival garantiza su resultado |
| GCB-006 | **CRITICAL** (antes HIGH) | A07 / A01 | `_paid_block` ya no exige email confirmado, KYC ni edad. Ejecutado: una cuenta de 11 años sin confirmar paga y juega en Oro |
| GCB-050 | HIGH | A04 | 45 s sin latido liquidan la partida en contra del jugador |
| GCB-051 | MEDIUM | A04 | Máximo de golpes por índice de hoyo en `app_config` |

### 5.2 Tiempo real (Supabase Realtime) — área nueva

- `LiveRoom` se suscribe a `golf:<torneo>` como canal de **difusión pública** (`src/match/LiveRoom.js:19`): sin `private: true` ni políticas de Realtime en ninguna migración.
- **Autenticidad:** el emisor declara su `seat` en el cuerpo del mensaje; `#valid` solo comprueba que el asiento sea de otro jugador real. Cualquier cliente con la clave pública que conozca el id puede leer y escribir en el canal.
- **Confidencialidad:** el canal emite los tiros `{tick, yaw, power}` según se hacen, y con física determinista eso equivale a emitir la solución del hoyo (GCB-049).
- **Integridad:** un aviso `done` remoto arranca el contador de descalificación local (`main.js:2184-2185` → `GolfGame.noteRemoteSunk`). El resultado oficial se ve afectado porque el propio cliente de la víctima envía `end` a `submit-hole` (GCB-048).
- **Recomendación:** canales privados con políticas por participante y asiento; ningún efecto de puntuación a partir de mensajes entre clientes; tiros visibles solo cuando el hoyo esté cerrado en el servidor.

### 5.3 Autorización de las RPC nuevas

| Función | `auth.uid()` | Valoración |
|---|---|---|
| `my_party`, `party_invite`, `party_respond`, `party_leave`, `party_set_tier`, `party_ready` | Sí | OK. Invitar exige amistad aceptada; solo mesas de pago; el «Listo» de cada miembro es su consentimiento para el cobro. `_party_queue` comprueba saldo y `_paid_block` de todos antes de cobrar (pero `_paid_block` ya casi no bloquea: GCB-006) |
| `join_tournament` (redefinida) | Sí | Candado por mesa, pero la comprobación `active_match` va antes y no hay candado por usuario (GCB-009) |
| `tournament_status` (ahora también latido) | Sí | Solo actualiza `last_seen` de la propia entrada; liquida en cada llamada (GCB-040, GCB-050) |
| Internas nuevas (`_entry_pending`, `_tournament_live`, `_in_active_match`, `_new_tournament`, `_enter_tournament`, `_find_tournament`, `_course_max`, `_max_tail`, `_are_friends`, `_party_leave`, `_party_queue`) | — | Revocadas a `public`, `anon` y `authenticated`. Todas con `search_path = ''` |

Exposición de información: `_tournament_json` devuelve a cada jugador los golpes de los rivales en los hoyos que él ya jugó, y el campo `online` de cada uno (GCB-029). `my_party` incluye los avatares de los miembros (GCB-021).

### 5.4 Sin cambios

Autenticación, panel de admin, KYC con proveedor, webhooks, CSP, dependencias (mismo lockfile: 0 vulnerabilidades en producción, 9 en desarrollo) y secretos (no hay nuevos en el árbol).
