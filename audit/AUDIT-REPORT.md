# Auditoría forense — Golf Cash Battle

| | |
|---|---|
| **Repositorio** | `gonzalodominguezp1-dotcom/Golf-cash-battle` |
| **Rama** | `la-chaqueta-bionica` |
| **Pasadas** | 1.ª sobre `386c815`; **2.ª (vigente) sobre `5a05874`**, tras actualizar la rama en local con avance rápido hasta `main` a petición del usuario. **Sin push**: el remoto `origin/la-chaqueta-bionica` sigue en `386c815` |
| **Fecha** | 2026-11-06 |
| **Tipo** | Solo lectura del código. No se ha modificado código, dependencias, configuración ni bases de datos del proyecto. Solo se ha creado `audit/` |
| **Entregables** | Este informe, `BUGS-AND-ISSUES.md`, `SECURITY-REPORT.md`, `ARCHITECTURE-REPORT.md`, `AI-SLOP-REPORT.md`, `TEST-AND-COVERAGE-REPORT.md`, `AUDIT-COVERAGE.md`, `REMEDIATION-ROADMAP.md` y `evidence/` |

## 1. Diagnóstico ejecutivo

Golf Cash Battle es un minigolf 3D para navegador con mesas de pago, bote y comisión sobre Supabase. Desde `5a05874` las mesas son **partidas en vivo**: todos empiezan a la vez, los huecos los ocupan bots que no cobran, y cada jugador ve las bolas de los demás por un canal en tiempo real. También hay **grupos de amigos** que entran juntos.

**Lo sólido sigue siéndolo:**

- física determinista repetida en el servidor (verificada otra vez: sin funciones trascendentes y copias sincronizadas);
- funciones `security definer` con `search_path` fijado;
- webhooks firmados y buena autenticación.

**La integridad de los resultados de pago no es fiable, y el modo en vivo añade dos vías nuevas de trampa muy sencillas:**

1. **Cualquier participante puede descalificar a los demás** enviando por el canal en tiempo real (público, sin autorización) un aviso falso de «he embocado». El cliente de cada víctima arranca su contador de 20 s y se autodescalifica con el máximo de golpes (GCB-048, CRITICAL).
2. **El canal emite los tiros exactos de cada rival.** Con física determinista, reenviar esa lista da exactamente el mismo resultado, así que un tramposo copia hoyo a hoyo al mejor (GCB-049, CRITICAL).
3. **Repetir un hoyo sigue siendo posible** recargando la app (GCB-001, CRITICAL; salir desde el menú ya penaliza).
4. **La descalificación por tiempo sigue usando ticks declarados por el cliente.** Reejecutado: gana quien da 9 golpes frente a 8 (GCB-002, CRITICAL).
5. **La verificación de cuenta está desactivada** («temporal»). Reejecutado: una cuenta **sin email confirmado y con 11 años** entra en una mesa de Oro y paga (GCB-006, sube a CRITICAL).
6. **Una desconexión de 45 s** (bloquear la pantalla, una llamada) liquida la partida y hace perder a quien iba ganando (GCB-050, HIGH; reejecutado).

Siguen sin resolver la pausa que desincroniza la física (GCB-003), el listener «R» huérfano (GCB-004), el esquema base fuera del repo (GCB-005), el saldo demo mezclado con el real (GCB-007), el redondeo que crea dinero (GCB-008) y la doble inscripción concurrente (GCB-009, que ahora también ocurre entre mesas distintas).

**Veredicto:** apto como prototipo jugable. **No apto** para mesas con valor real, ni siquiera con créditos comprables, y **menos que en la pasada anterior**: hay más vías de trampa y la verificación de cuenta está desactivada. Hay que cerrar los P0 de `REMEDIATION-ROADMAP.md` antes de abrir las mesas de pago.

## 2. Cifras

| Indicador | Valor |
|---|---|
| Código auditado | `5a05874`: 51 archivos cambiados respecto a `386c815` (+4.157 / −505); 23 migraciones; 4 módulos nuevos de partidas en vivo y grupos |
| Hallazgos registrados | **53**: 47 de la primera pasada + **6 nuevos** |
| Corregidos en `5a05874` | 3 (GCB-030; GCB-024 y GCB-036 en lo esencial) |
| **Abiertos** | **50**: **5 CRITICAL**, **5 HIGH**, **18 MEDIUM**, **20 LOW**, **2 INFO** |
| Empeoran | GCB-006 (verificación desactivada), GCB-040 (carga del latido) y GCB-029 (más información visible) |
| Confirmados por ejecución en `5a05874` | GCB-002, 003, 006, 008, 009, 050 y aplicación de las 23 migraciones |
| Tests | **159/163** OK; 4 suites sin ejecutar por falta de `three` (las mismas); 0 fallos de lógica |
| Tests nuevos | `live` (6), `party` (7, **3 leen texto SQL** y uno da una garantía falsa: GCB-053), `icons` (4), `resolution-governor` (5) |
| CVE en producción / desarrollo | 0 / 9 (sin cambios en dependencias) |

## 3. Hallazgos principales (abiertos)

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| GCB-048 | CRITICAL | Canal en tiempo real sin autorización: un `done` falso descalifica a los rivales | **Nuevo** · confirmado (traza) |
| GCB-049 | CRITICAL | El canal emite los tiros exactos: copiar al mejor rival garantiza su resultado | **Nuevo** · confirmado (traza) |
| GCB-001 | CRITICAL | Repetir hoyos recargando la app | Sigue (parcial) |
| GCB-002 | CRITICAL | Descalificación por ticks del cliente; gana quien da más golpes | Sigue · reejecutado |
| GCB-006 | CRITICAL | Verificación desactivada: menores y cuentas sin confirmar juegan con dinero | **Empeora** · ejecutado |
| GCB-050 | HIGH | 45 s sin latido = partida perdida aunque vayas ganando | **Nuevo** · ejecutado |
| GCB-003 | HIGH | La pausa desincroniza cliente y servidor (87/440 tiros) | Sigue · reejecutado |
| GCB-004 | HIGH | Listener «R» huérfano | Sigue |
| GCB-005 | HIGH | Esquema base fuera del repo | Sigue |
| GCB-007 | HIGH | Saldo demo, depósitos y premios mezclados | Sigue |
| GCB-008 | MEDIUM | El reparto con empate paga más que el premio | Sigue · reejecutado |
| GCB-009 | MEDIUM | Doble inscripción concurrente (también entre mesas y con grupos) | Sigue · reejecutado |

Lista completa en `BUGS-AND-ISSUES.md`, con la columna «Estado en `5a05874`».

## 4. Valoración por dominio

| Dominio | Valoración | Cambio |
|---|---|---|
| Física y repetición | 🟢 Sólido | = |
| Integridad de partidas de pago | 🔴 Crítico | ⬇ (GCB-048, 049, 050) |
| Dinero (SQL visible) | 🟠 Mejorable | = (redondeo y carrera siguen) |
| Autenticación | 🟢 Bien | = |
| Autorización y acceso a mesas de pago | 🔴 Crítico | ⬇ (verificación desactivada) |
| Tiempo real (Realtime) | 🔴 Sin control de acceso | Nuevo |
| KYC y antibots | 🔴 Débil o desactivado | ⬇ |
| Frontend | 🟠 Mejorable | = (`main.js` pasa de 2.362 a unas 2.800 líneas) |
| Base de datos | 🟠 Mejorable | = (`_settle_tournament` redefinida 5 veces; IDs de hoyo por índice) |
| Tests | 🔴 Insuficiente | ≈ (algún test de lógica en vivo; el dinero en SQL sigue sin pruebas) |
| Rendimiento | 🟡 Aceptable | ⬇ (latido cada 4 s que liquida) |
| Documentación | 🟠 Desalineada | ≈ («en vivo» ya es cierto; el número de hoyos no) |

## 5. Metodología de la reauditoría

1. `git fetch` de `main`, `la-chaqueta-bionica` y `la-yuinta-mangante`. La rama `la-chaqueta-bionica` se actualizó **en local** con `git merge --ff-only origin/main` (el usuario eligió rama y «solo en local»). Sin push.
2. Lectura completa de lo nuevo con impacto en dinero o resultados: las 5 migraciones, `LiveRoom.js`, `liveRules.js`, `partyRules.js`, `PartyService.js`, el diff de `TournamentService.js` y `submit-hole`, el flujo en vivo de `main.js` (líneas 2013-2420) y las partes de `GolfGame.js` sobre tiempo, pausa y avisos remotos.
3. Revisión, uno por uno, de los 47 hallazgos sobre el código nuevo (búsquedas y lectura).
4. **Ejecución:** tests (`node --test`); comprobación de determinismo y de copias sincronizadas; **Postgres 16 desechable con las 23 migraciones**, con 3 escenarios de dinero en vivo (`evidence/scenario_live.sql`), la carrera (`race_join.sh`, misma mesa y entre mesas) y la cuenta de menor sin confirmar; y la simulación de pausa.

## 6. Limitaciones

- Siguen sin poder ejecutarse sin instalar dependencias: `vite build`, `deno check` y los 30 casos de test que usan `three`.
- GCB-048 y GCB-049 están confirmados por traza de código. No se han reproducido contra un Supabase Realtime real (no hay acceso al proyecto); la parte del servidor (`replayHole` acepta la lista copiada) es determinista y está cubierta por los tests de repetición.
- El esquema base sigue fuera del repo; los escenarios SQL usan `evidence/stub_baseline.sql`.
- Los módulos visuales nuevos (`flora.js`, `icons.js`, `resolutionGovernor.js`, cambios de `environment.js`) solo se han revisado con barrido de sumideros y análisis estructural.
- La rama actualizada **no está subida**: `origin/la-chaqueta-bionica` sigue en `386c815`, y ni la actualización ni `audit/` existen en GitHub hasta que se haga push.

## 7. Siguientes pasos

Ver `REMEDIATION-ROADMAP.md`.

- **P0:**
  - canal Realtime privado y sin efecto sobre el contador (GCB-048);
  - no difundir tiros hasta cerrar el hoyo (GCB-049);
  - un intento por hoyo con tiempo del servidor (GCB-001, 002);
  - **retirar `temp_disable_account_verification`** antes de abrir mesas con valor (GCB-006);
  - esquema base versionado (GCB-005).
- **P1:** latido tolerante con reconexión (GCB-050), pausa (003), listener R (004), saldos separados (007), carrera (009) y redondeo (008).
