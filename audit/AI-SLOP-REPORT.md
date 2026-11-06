# Informe de AI slop — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06 · primera pasada `386c815`; **reauditoría `5a05874`** (§4).

## 0. Criterio y advertencia sobre el origen

«AI slop» se usa aquí en sentido técnico: código, texto o interfaz que **aparenta** una funcionalidad o garantía que no existe, más placeholders, datos inventados, integraciones a medias, validaciones de adorno, redundancia y sobreingeniería. Se clasifica así:

| Etiqueta | Significado |
|---|---|
| **CONFIRMADO** | El código o texto afirma o aparenta algo que se ha comprobado falso o vacío. |
| **PROBABLE** | Muy probablemente un adorno o una implementación a medias, pero con un uso parcial legítimo. |
| **DEUDA TÉCNICA** | No es falso, pero es redundante, está duplicado o sobra. |
| **SOSPECHOSO** | Indicio sin comprobar. |

**Origen.** Hay un dato objetivo del historial: 88 commits de todas las ramas (68 de los 158 de esta rama) tienen como autor «Claude» (`git log --format=%an`). No se atribuye ningún hallazgo concreto a una IA: el patrón también puede ser humano, y la autoría de un commit no dice qué líneas escribió cada uno. Los hallazgos se valoran por lo que hacen, no por quién los escribió.

## 1. Hallazgos

| ID | Clase | Archivo:líneas | Qué aparenta | Realidad verificada |
|---|---|---|---|---|
| SLOP-01 | **CONFIRMADO** | `src/main.js:289` | «Premio Garantizado» con `prizeFor(tier)` (8 jugadores) | El servidor paga entrada × inscritos × 0,9. Con 7 jugadores el premio real fue 6,30 frente a 7,20 anunciado (ejecución, GCB-016) |
| SLOP-02 | **CONFIRMADO** | `src/main.js:984-998` | Tarjeta «DIAMOND VIP», «TITULAR GOLF CASH PRO» y número `•••• •••• •••• NNNN` | Texto fijo para todos los jugadores; el número es `abs(round(saldo·100)) % 9000 + 1000`: un dato inventado derivado del saldo con aspecto de tarjeta real |
| SLOP-03 | **CONFIRMADO** | `src/main.js:261`, `README.md` («Clasificación en vivo», «los otros 7 juegan el mismo hoyo a la vez»), `02-DOCS/wiki/juego/reglas-y-economia.md` | Partidas en directo | Los torneos son asíncronos con puntuaciones ocultas (`_tournament_json`); en la práctica los rivales son bots locales. La etiqueta «EN VIVO» es decorativa |
| SLOP-04 | **CONFIRMADO** | `src/game/GolfGame.js:802,1053`; `src/antibot/risk.js:19-23` | Antibots que detecta «tiros sin gesto del dedo» | El cliente oficial fuerza `d >= 8` (umbral 4) y `d >= 12` con ratón: la señal `no_gesture` nunca salta con el cliente oficial y un bot la falsifica enviando números. Validación de adorno frente al adversario al que va dirigida (GCB-014) |
| SLOP-05 | **CONFIRMADO** | `src/main.js:883,897` | «solo se guarda en este dispositivo» | El avatar se sube al servidor (`set_avatar`) y lo ven los amigos (GCB-032) |
| SLOP-06 | **CONFIRMADO** | `src/match/SupabaseMatchService.js` (86 líneas), `src/wallet/SupabaseWallet.js:54-65` | Servicio de partidas en Supabase con el mismo contrato que el local | Nunca se usa en modo Supabase (`main.js:1091`) y llama a 5 RPC que no existen en el repo; 3 métodos de la wallet solo lanzan error para cumplir la interfaz (GCB-033) |
| SLOP-07 | **CONFIRMADO** | `supabase/migrations/20261027120000_save_progress_clamp.sql:17`, `20261102120000_ranking_prestige.sql:10`, `20261103130000_avatar_friends.sql:7` | Migraciones listas para producción | Avisan literalmente «SQL no probado contra Postgres». La auditoría las ha aplicado sobre un esquema base simulado: la sintaxis es válida, pero la lógica de dinero no tiene ni un test (GCB-022) |
| SLOP-08 | **CONFIRMADO** | `src/backend/index.js:12-19`, `src/main.js:284,1090` | «Jugar Torneo», «Torneo Esports» | Con cualquier error de Supabase, los «torneos de pago» pasan en silencio a ser contra 7 bots con saldo local (GCB-017) |
| SLOP-09 | **CONFIRMADO** | `01-TOOLS/_TEMPLATE/test_connection.sh:25-30` | «Smoke-test of the connection» | Llamada comentada con `TODO`; imprime «OK — credentials valid.» sin comprobar nada. Atenuante: es una plantilla |
| SLOP-10 | **CONFIRMADO** | `src/main.js:1797` | «El servidor repite cada golpe para que nadie pueda hacer trampas» | Cierto para el número de golpes de un intento, falso como garantía: se pueden repetir hoyos sin límite y manipular el tiempo (GCB-001, GCB-002) |
| SLOP-11 | **PROBABLE** | `src/account/authRules.js:80-84` (`retryDelayMs`) | Freno ante la fuerza bruta | Solo en el cliente; se esquiva recargando o con la API. El propio comentario lo admite («el límite real lo pone Supabase») |
| SLOP-12 | **PROBABLE** | `supabase/functions/kyc/index.ts:62-84` | «Verificar identidad» | En modo pruebas, cualquier fecha y cualquier documento valen; la interfaz lo etiqueta como «pruebas», pero da acceso real a las mesas de pago (GCB-006) |
| SLOP-13 | **PROBABLE** | `src/main.js:1000-1009` | «Premios Ganados» y «Torneos Jugados» | Se calculan sobre los últimos 100 movimientos del historial, no sobre el total; «Torneos Jugados» cuenta entradas sin restar los reembolsos |
| SLOP-14 | **DEUDA TÉCNICA** | `MatchService.settle` (JS) y `_settle_tournament` (SQL) | — | Dos implementaciones de las mismas reglas con el mismo defecto de redondeo (GCB-008) |
| SLOP-15 | **DEUDA TÉCNICA** | Migraciones | — | `save_progress` (3 copias completas, unas 100 líneas cada una), `_tournament_json` (3), `_settle_tournament` (2) y `my_profile` (2) redefinidas enteras |
| SLOP-16 | **DEUDA TÉCNICA** | `src/main.js` | — | 21 bloques `catch {}` o `.catch(() => {})` vacíos, 2 de ellos en operaciones de dinero (`leave`, GCB-018). En total hay 54 en `src/`; la mayoría protegen `localStorage` y son legítimos |
| SLOP-17 | **DEUDA TÉCNICA** | `src/main.js` (2.362 líneas) | — | Monolito con estado global y listeners sin ciclo de vida (GCB-004, GCB-026) |
| SLOP-18 | **DEUDA TÉCNICA** | `src/game/render/**`, `src/ui/skin*` (12.204 líneas) | — | Sistema de skins muy elaborado (13 shaders a medida, inspector 3D, reveal con efectos, caché IndexedDB de miniaturas, gobernador de rendimiento) frente a 8.984 líneas de lógica de juego y dinero con defectos CRITICAL sin resolver. Prioridades invertidas, no código falso: los 13 patrones de `PATTERN_IDS` tienen implementación real (no son stubs) |
| SLOP-19 | **DEUDA TÉCNICA** | `src/main.js:2331-2337`, `1085-1101` | — | Herramientas de desarrollo (`?skinlab=1`, `#hoyoN-empate`) publicadas en producción (GCB-028, GCB-043) |
| SLOP-20 | **SOSPECHOSO** | `README.md`, `02-DOCS/wiki/backend/supabase.md` | Documentación con tablas y funciones | Lista funciones (`join_match`, `finish_match`, `demo_deposit`) y tablas (`match_players`) que no aparecen en el repo; no se sabe si siguen desplegadas (GCB-005) |
| SLOP-21 | **SOSPECHOSO** | `src/game/GolfGame.js:413-427` | `dispose()` completo | No libera materiales ni texturas de la escena final ni fuerza la pérdida de contexto (GCB-041); sin medir |
| SLOP-22 | **CONFIRMADO** | `public/site.webmanifest:4` | «High-stakes luxury esports mini-golf wagering platform» | Texto de marketing en inglés y genérico que define el producto como **apuestas**, en contra del modelo de habilidad que defiende el proyecto (GCB-046) |

## 2. Lo que **no** es slop (comprobado)

Para no inflar el informe, se dejan constancia de estas implementaciones reales y correctas:

- **Física determinista:** `dsin`/`dcos` polinómicos y solo `+ - * /` y `Math.sqrt` en `physics.js`; los hoyos y la repetición no usan funciones trascendentes. Hay tests que comparan cliente y servidor (`tests/determinism.test.js`, `tests/replay.test.js`).
- **Repetición en el servidor (`replayHole`):** valida ticks crecientes, cuantización exacta, «no golpear con la bola en movimiento», tiros tras embocar e intentos sin terminar.
- **Webhooks:** HMAC con comparación de tiempo constante y ventana temporal (Didit); HMAC-SHA512 (NOWPayments).
- **Funciones `security definer`:** todas con `search_path = ''` y permisos revocados o concedidos explícitamente.
- **Pantalla de entrada:** solo `textContent`; mensajes que no revelan si un email existe.
- **Panel de admin:** escapa todo y registra las acciones.
- **Curva de XP:** el cliente y el servidor coinciden (0 discrepancias en 81.000 valores).
- **Shaders de skins:** 13 de 13 implementados (no son stubs vacíos).

## 3. Conclusión

El slop **confirmado** se concentra en la **capa de presentación del valor**: promesas de premio, «en vivo», «sin trampas», «verificado», tarjeta VIP. Ahí la interfaz y la documentación dicen más de lo que el sistema garantiza. En un producto de dinero ese es el tipo de slop más dañino, porque crea expectativas legales y de confianza. El núcleo técnico (física, repetición, firmas) es mayoritariamente sólido; las debilidades graves son de **diseño** (GCB-001/002), no de código de relleno.

## 4. Reauditoría sobre `5a05874`

| ID | Estado | Comentario |
|---|---|---|
| SLOP-01 «Premio Garantizado» | **Sigue** (`src/main.js:362`) | Y en vivo el bote real es entrada × jugadores reales, normalmente menos de 8 |
| SLOP-02 Tarjeta VIP ficticia | Sigue | — |
| SLOP-03 «EN VIVO», «clasificación en vivo» | **Resuelto** en el producto (las partidas son en vivo), pero el README aún dice 14 hoyos | — |
| SLOP-04 Señal de gesto de adorno | Sigue | — |
| SLOP-05 Texto del avatar | Sigue (`src/main.js:1154`) | — |
| SLOP-06 `SupabaseMatchService` muerto | Sigue | — |
| SLOP-07 Migraciones «no probadas» | Sigue | Las 5 nuevas tampoco tienen tests de comportamiento; aplicadas en esta auditoría sin errores |
| SLOP-08 Caída a local | Sigue | — |
| SLOP-10 «el servidor repite cada golpe para que nadie pueda hacer trampas» | **Reformulado, mismo problema** | La frase desaparece, pero el texto legal del lobby (`main.js:343`) sigue presentando la repetición en el servidor como garantía («el servidor repite cada golpe para validarlo»). En vivo hay dos trampas nuevas (GCB-048, GCB-049) |
| SLOP-22 «wagering platform» | Sigue | — |

**Nuevos:**

| ID | Clase | Archivo:líneas | Qué aparenta | Realidad verificada |
|---|---|---|---|---|
| SLOP-23 | **CONFIRMADO** | `tests/party.test.js:37-55` | Tests que garantizan «el matchmaking solo usa torneos vivos» | Leen el texto de una migración con regex; la función efectiva la redefinió después otra migración sin esa condición y el test sigue en verde (GCB-053) |
| SLOP-24 | **PROBABLE** | `supabase/migrations/20261106120000_temp_disable_account_verification.sql` | «TEMPORAL: desactiva la fase de verificación de cuenta» | Desactivación sin interruptor, fecha ni test, mientras la interfaz sigue mostrando los textos de verificación de edad e identidad (GCB-006) |
| SLOP-25 | **DEUDA TÉCNICA** | Migraciones `matchmaking_parties`, `live_matches` y `temple_online` | — | `_settle_tournament` copiada entera 3 veces más (5 en total), con el mismo defecto de redondeo |

Lo nuevo **no** es slop: los bots de relleno están etiquetados con claridad y no cobran; las reglas en vivo (`liveRules.js`) y los grupos (`partyRules.js`) están separadas y tienen tests reales (`live.test.js` 6/6 sin tautologías).
