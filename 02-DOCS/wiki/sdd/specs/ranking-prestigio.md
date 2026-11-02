# Spec: Ranking de victorias, prestigio por nivel y desafíos ligados

Estado: draft · Rama: `la-chaqueta-bionica`

## Problema
Hoy el jugador solo compite en cada mesa. No hay forma de compararse con el resto ni un objetivo de largo plazo ligado al nivel, y los desafíos para ganar bolas (skins) solo miden estadísticas propias.

## Objetivos
1. Ranking de victorias en mesas online: **semanal, mensual e histórico**.
2. Prestigio por nivel: marcos de perfil en los niveles **25, 50, 75, 100, 125 y 150**.
3. Nuevos desafíos que dan bolas por **conseguir prestigios** y por **entrar en el ranking**.

## Decisiones ya tomadas
- Cuentan solo las **mesas online** (`tournament_entries.position = 1` con `finished_at`). Práctica y partidas locales no cuentan. Lo calcula el servidor, no el cliente.
- Premios de ranking = desafíos por top N, reclamables al cerrar el periodo.
- Marco **único por tramo**: 6 marcos; se desbloquean todos los alcanzados y el jugador **elige** cuál luce.

## Alcance
### Ranking
- Pantalla "Ranking" con pestañas Semanal / Mensual / Histórico, top 50 y la posición del jugador aunque quede fuera.
- Periodos en UTC: semana lunes–domingo, mes natural.
- Desempate: más victorias, luego menos tiempo hasta la última victoria del periodo (la que primero la alcanzó), luego nombre.
- Cada fila: posición, nombre, marco de prestigio, nivel, victorias.
- Solo cuentas con nombre de usuario; los invitados sin nombre no aparecen.

### Prestigio
- Tramos: 25, 50, 75, 100, 125, 150 (`levelOf(xp).level`).
- Marco visual en el avatar del perfil (`avatar big`), y reutilizado en filas del ranking.
- Se guarda `framePick` en el progreso; si el elegido no está desbloqueado, se usa el más alto alcanzado.
- Subir a un tramo muestra aviso al terminar la partida, junto al de subida de nivel.

### Desafíos nuevos
- Por prestigio: alcanzar nivel 25, 50, 75, 100 (stat `level`).
- Por ranking: top 10 semanal, nº 1 semanal, top 10 mensual, nº 1 mensual, top 100 histórico.
- Cada uno desbloquea una bola nueva (`unlock: { challenge }`), como los actuales.
- Los logros de ranking se **conceden en el servidor al cerrar el periodo** y quedan como contadores permanentes (`weeklyTop10`, `weeklyWins1`, `monthlyTop10`, `monthlyWins1`, `histTop100`); no se retiran después.

## Fuera de alcance
- Premios en dinero por ranking.
- Ranking por partidas de Práctica, ranking de amigos, regiones.
- Marcos animados por encima del nivel 150.
- Diseño final de las bolas nuevas (se usan skins existentes sin dueño de desafío o placeholders hasta que haya arte).

## Criterios de aceptación
1. Con victorias repartidas en fechas distintas, semanal/mensual/histórico devuelven listas distintas y correctas, y los límites de periodo respetan UTC.
2. Las victorias en Práctica no cambian el ranking.
3. Un cliente con `progress` manipulado no puede alterar su posición (el ranking sale solo de `tournament_entries`).
4. A nivel 24 no hay marco; al subir a 25 se desbloquea y puede elegirse; a 150 existen los 6.
5. Elegir un marco se conserva al cambiar de móvil (se sincroniza con `save_progress`).
6. Al cerrar la semana, el top 10 recibe el contador y el desafío correspondiente queda completo y la bola desbloqueada; repetir el cierre no suma dos veces.
7. Tests de unidad de prestigio y desafíos; tests SQL/RPC del ranking y del cierre idempotente.

## Riesgos
- **Cierre de periodo**: necesita un disparador (pg_cron o llamada lazy al abrir el ranking). Propuesta: cierre perezoso e idempotente dentro de la RPC, sin infraestructura nueva.
- **`save_progress` limita contadores** a +20 por guardado (`20261027120000_save_progress_clamp.sql`); los contadores de ranking los pone el servidor, no el cliente, así que hay que excluirlos de esa validación.
- El worktree tiene cambios sin commit de autenticación en `AccountService.js` y `supabase.js`, que esta función también tocará.
