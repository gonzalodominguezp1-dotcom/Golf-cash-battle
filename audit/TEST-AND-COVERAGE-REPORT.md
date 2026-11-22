# Pruebas y cobertura — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06 · primera pasada `386c815`; **reauditoría `5a05874`** (§8). Todo lo indicado como «ejecutado» se ha ejecutado en esta sesión; lo que no se pudo ejecutar se indica con su motivo. No se ha instalado ninguna dependencia ni modificado el lockfile.

## 1. Entorno

| Elemento | Valor |
|---|---|
| Node | v22.23.4 |
| pnpm | 11.24.0 |
| `node_modules` | **No existe** (no se instaló, por la restricción de la auditoría) |
| Deno | No instalado |
| Postgres | 16 (binarios del sistema; instancia desechable en el scratchpad, fuera del repo) |
| Lint / formateo | **No configurado en el proyecto** (no hay ESLint, Prettier ni Biome) |
| Typecheck | No hay TypeScript en el frontend; las Edge Functions se comprueban con `deno check` en CI |

## 2. Comprobaciones ejecutadas

| Comprobación | Comando | Resultado | Evidencia |
|---|---|---|---|
| Tests unitarios | `node --test tests/*.test.js` (equivale a `pnpm test`) | **137 OK, 4 KO** de 141 resultados de primer nivel; 80,4 s | `audit/evidence/test-run-2026-11-06.txt` |
| Cobertura | `node --test --experimental-test-coverage tests/*.test.js` | Ver §4 | — |
| Auditoría de dependencias (prod) | `pnpm audit --prod` | **0 vulnerabilidades** | salida en consola |
| Auditoría de dependencias (todas) | `pnpm audit --json` | **9** (1 alta, 7 moderadas, 1 baja), todas en devDependencies | `audit/evidence/pnpm-audit-full.json` |
| Aplicación de migraciones | `psql -1 -f` de las 18 migraciones en orden sobre `stub_baseline.sql` | **18/18 aplicadas sin error** | `audit/evidence/stub_baseline.sql` |
| Escenario: reparto con empate | `scenario_rounding.sql` | **Defecto reproducido** (6,32 pagados sobre un premio de 6,30) | `audit/evidence/scenario_rounding.sql` |
| Escenario: descalificación retroactiva | `scenario_dq.sql` | **Defecto reproducido** (gana quien da 9 golpes frente a 8) | `audit/evidence/scenario_dq.sql` |
| Escenario: inscripción concurrente | `race_join.sh` | **Defecto reproducido** (2 inscripciones y doble cobro; ventana ampliada con `pg_sleep`) | `audit/evidence/race_join.sh` |
| Escenario: primer `save_progress` | SQL en línea | **Defecto reproducido** (XP 1e15 aceptada, nivel 9.999.991, `set_frame('p150')` OK) | descrito en GCB-012 |
| Igualdad de la curva de XP cliente/servidor | Node frente a la fórmula SQL | **0 discrepancias** en 81.000 valores; además coinciden 10.000, 123.456, 1e7 y 2e9 | — |
| Desincronización por pausa | `pause_desync2.mjs` (física real) | **87/440** tiros divergen en hoyos con obstáculos móviles | `audit/evidence/pause_desync2.mjs` |

### No ejecutado

| Comprobación | Motivo |
|---|---|
| `pnpm run build` (Vite) | Haría falta `pnpm install` (prohibido instalar dependencias). **Build no verificado.** |
| `deno check supabase/functions/*/*.ts` | Deno no está instalado y `npx deno@2` lo descargaría (prohibido). **Edge Functions sin comprobar tipos en esta sesión.** |
| Tests de las 4 suites que dependen de `three` | Falta `node_modules/three`. Contienen 30 casos (4 + 5 + 5 + 16) que no se han ejecutado. |
| Lint | No hay linter configurado. |
| Pruebas E2E o de navegador | El proyecto no tiene ninguna. |
| Tests contra la BD real o el esquema base real | El esquema base no está en el repo (GCB-005); solo se ha probado sobre un esquema simulado. |
| Estado del CI en GitHub | No se ha consultado la API de Actions; no se afirma nada sobre las ejecuciones remotas. |

## 3. Detalle de los tests

| Suite | Casos | Resultado | Qué prueba de verdad |
|---|---|---|---|
| antibot | 10 | ✅ 10 | `assessRisk` y `holeSignals` con entradas sintéticas |
| auth-rules | 7 | ✅ 7 | Reglas puras de email y contraseña y mapeo de errores |
| avatar | 7 | ✅ 7 | `AvatarStore`, `toWire`/`fromWire` y validación de data URL |
| course-preview | 4 | ❌ (no carga `three`) | — |
| courses | 30 | ✅ 30 | Geometría de los hoyos y que cada hoyo se puede completar con la física |
| cyberpunk-rain | 5 | ❌ (no carga `three`) | Incluye lecturas del código fuente con `readFileSync` |
| desktop-controls | 14 | ✅ 14 | **9 de 14 son tautológicos** (ver §5) |
| determinism | 4 | ✅ 4 | Igualdad cliente/servidor de `replayHole` en todos los hoyos |
| economy | 6 | ✅ 6 | `settle()` en JS y `LocalWallet` (solo la práctica local) |
| freeplay | 5 | ✅ 5 | Datos del Juego Libre |
| friends | 3 | ✅ 3 | `cleanFriendName` y mensajes |
| hole-timer | 4 | ✅ 4 | `replayHole` con `endTick` |
| inventory | 8 | ✅ 8 | Instancias, saneado y contadores |
| loop-blocks-ball | 5 | ❌ (no carga `three`) | — |
| prestige | 7 | ✅ 7 | Marcos por nivel |
| progress | 12 | ✅ 12 | `Progress` (XP, desbloqueos, `attach`) |
| replay | 5 | ✅ 5 | Repetición del servidor, rechazo de tiros inválidos y **copias sincronizadas** |
| skin-fx-rules | 16 | ❌ (no carga `three`) | Varios casos comprueban **texto del código fuente** con regex (`readFileSync`) |
| skins-new | 8 | ✅ 8 | Esquema de las skins nuevas |
| skins-schema | 7 | ✅ 7 | Esquema del catálogo de skins |

Total: **167 casos** declarados (`grep test(`); **137 ejecutados con éxito**, **30 sin ejecutar** por el entorno y **0 fallos de lógica observados**.

## 4. Cobertura real

Cobertura que da Node (`--experimental-test-coverage`), **solo sobre los archivos que algún test carga**: 97,44 % de líneas, 93,12 % de ramas y 94,74 % de funciones. Esa cifra **engaña**:

- Los módulos que ningún test importa no aparecen en el informe, y suman **17.756 de las 21.207 líneas JS de `src/` (83,8 %)**.
- Sin `three`, los tests cargan **3.451 líneas (16,2 %)** de `src/`. Con `three` instalado (CI) se sumarían `course.js`, `coursePreview.js`, `skinFx.js`, `quality.js` y `cyberpunk*.js`.

| Módulo | Líneas | Cobertura |
|---|---|---|
| `src/main.js` (toda la UI y los flujos) | 2.362 | **0 %** |
| `src/game/GolfGame.js` (bucle, entrada, tiempo, pausa) | 1.557 | **0 %** |
| `src/match/TournamentService.js` | 134 | **0 %** |
| `src/wallet/SupabaseWallet.js`, `src/account/*Service.js`, `src/backend/*` | ~350 | **0 %** |
| `src/admin/admin.js` | 427 | **0 %** |
| `supabase/migrations/*.sql` (todo el dinero) | 1.921 | **0 %** automatizado (la auditoría ha ejecutado 3 escenarios a mano) |
| `supabase/functions/*/index.ts` (submit-hole, kyc, crypto-deposit, ipn) | ~330 | **0 %** |
| `physics.js`, `replay.js`, `courses.js`, `risk.js` | ~1.570 | 97–100 % de líneas |
| `Progress.js`, `inventory.js`, `avatar.js`, `skins.js`, `prestige.js` | ~610 | 90–100 % |

**Conclusión:** la física y el progreso están bien probados. **Todo lo que mueve dinero, decide ganadores o controla el acceso tiene cobertura cero.** Los defectos CRITICAL y HIGH (GCB-001 a GCB-004) están justo en esas zonas.

## 5. Calidad de los tests

1. **Tests tautológicos.** 9 de los 14 casos de `tests/desktop-controls.test.js` (líneas 111-481) definen dentro del propio test funciones `onKeyDown`, `onPointerDown`, etc., que *imitan* `GolfGame` y comprueban esas copias. No ejecutan código del producto: si `GolfGame.js` se rompiera, seguirían pasando. Ejemplos: «tecla Espacio conmuta visión completa…» (línea 140) y «elementos que obstaculizan la cámara se vuelven 90% invisibles…» (línea 338). **Falsos positivos de cobertura funcional.**
2. **Tests sobre el texto del código fuente.** `skin-fx-rules.test.js:52-86` y `cyberpunk-rain.test.js:89` comprueban con regex que el código contiene ciertas cadenas (por ejemplo `/handle\.update\(1\.2,/`). Se rompen con un refactor inocuo y no detectan errores de comportamiento.
3. **Economía probada en el sitio equivocado.** `economy.test.js` valida `settle()` en JS, que solo usa la práctica contra bots. El reparto real (`_settle_tournament`) no tiene test, y comparte con `settle()` el defecto de redondeo (GCB-008); el test de empate usa 2 ganadores sobre 72 (división exacta), así que no lo detecta.
4. **Faltan los casos límite que más importan:**
   - n ganadores con premio no divisible (GCB-008);
   - tiro en el tick límite (GCB-010);
   - pausa durante el rodaje (GCB-003);
   - inscripción concurrente (GCB-009);
   - primer `save_progress` (GCB-012);
   - reanudar un hoyo empezado (GCB-001).
5. **Mocks:** no se abusa de ellos. `LocalWallet(null)` usa memoria; no hay mocks de Supabase porque no hay tests de los servicios que lo usan.
6. **Lo bueno:**
   - `determinism.test.js` y `replay.test.js` son tests de propiedad valiosos (todos los hoyos, varias semillas, cliente frente a servidor).
   - `replay.test.js:89-95` impide que las copias de `submit-hole` diverjan.

## 6. CI

`.github/workflows/ci.yml` ejecuta `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run build`, `pnpm audit --prod` y `deno check`. No ejecuta tests de BD, de Edge Functions ni E2E. No audita las dependencias de desarrollo ni las de Deno (reconocido en la constitución D8.4 y §8), y no ejecuta la comprobación de autoría de `scripts/verify.sh` (K3.5). **No se ha comprobado el estado de las ejecuciones en GitHub.**

## 7. Recomendaciones (ver `REMEDIATION-ROADMAP.md`)

1. Postgres de pruebas en CI (servicio `postgres:16`) con el esquema base versionado (GCB-005) y tests SQL (pgTAP o `node --test` con `pg`) para `join_tournament`, `_settle_tournament`, `leave_tournament`, `save_progress`, `_apply_tx` y `review_player`, incluyendo la invariante `sum(payout) + commission = pot`.
2. Tests de las Edge Functions con `deno test` (firma IPN, modo pruebas de KYC, validación de importes).
3. Sustituir los 9 tests tautológicos por tests de `GolfGame` sin render (separar la entrada y el bucle de Three.js) o E2E con Playwright.
4. Tests de propiedad para pausa y repetición, y para el borde del tick límite.
5. Cobertura con un umbral sobre **todos** los archivos de `src/` (por ejemplo `c8 --all`), no solo los importados.

## 8. Reauditoría sobre `5a05874`

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `node --test tests/*.test.js` | **159 OK, 4 KO** de 163 resultados de primer nivel (76,6 s). Los 4 KO son las mismas suites sin `three` | `audit/evidence/test-run-5a05874.txt` |
| Determinismo | Sin funciones trascendentes en `physics.js`, `courses.js`, `replay.js` ni `risk.js`; las 4 copias de `submit-hole` son idénticas (`diff`) | — |
| Migraciones | **23/23** aplicadas sin error en Postgres 16 sobre `stub_baseline.sql` | — |
| Escenarios en vivo | A: redondeo (6,32 sobre 6,30) · B: descalificación por tick (gana 9 frente a 8) · C: latido de 45 s (pierde quien iba ganando) | `audit/evidence/scenario_live.sql` |
| Carrera de inscripción | Reproducida en la misma mesa (100 → 90) y **entre mesas** (100 → 85) | `audit/evidence/race_join.sh` + variante descrita en GCB-009 |
| Cuenta de menor sin confirmar | `_paid_block = NULL`; entra en Oro y paga 10 | descrito en GCB-006 |
| Pausa | 87/440 tiros divergen (sin cambios) | `audit/evidence/pause_desync2.mjs` |
| Build, `deno check`, suites con `three` | **No ejecutados** (mismo motivo: no se pueden instalar dependencias) | — |

**Tests nuevos:**

| Suite | Casos | Valoración |
|---|---|---|
| `live.test.js` | 6 | Buenos: prueban `RemoteBall`, `cleanShots`/`mergeShots`, `buildRoster`, `humanLeaders` y `liveStandings` con los módulos reales. **No** prueban la autenticidad de los mensajes (GCB-048) ni la copia de tiros (GCB-049) |
| `party.test.js` | 7 | 4 de reglas puras (bien). **3 leen el texto de `20261103150000_matchmaking_parties.sql` con regex**, y uno («solo usa torneos vivos») pasa aunque `live_matches.sql` redefinió después la función sin esa condición (GCB-053) |
| `icons.test.js` | 4 | Correctos (catálogo de iconos) |
| `resolution-governor.test.js` | 5 | Correctos (gobernador de resolución) |

**Siguen sin cobertura:** las 23 migraciones (todo el dinero, ahora también la liquidación en vivo y los grupos), `LiveRoom` (red), el flujo en vivo de `main.js` y las Edge Functions. Los defectos nuevos GCB-048, GCB-049 y GCB-050 están precisamente ahí.
