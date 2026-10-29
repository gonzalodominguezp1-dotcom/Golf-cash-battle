---
name: cyberpunk2078-rediseno
status: draft
supersedes: 02-DOCS/wiki/sdd/specs/cyberpunk2078.md
---

# Spec: hoyo 15 «Cyberpunk2078», rediseño

## Por qué se rehace

La primera versión no convence a la persona que la juega:

- El looping no tiene sentido donde está: no se entiende por qué la bola va allí.
- El portal se puede coger o saltar sin que importe: no aporta nada.
- Los muros no tienen una lógica de recorrido clara.
- El entorno no tiene carácter cyberpunk: falta contraste, color y efectos.

Se pide un mapa más complejo **sin aumentar el número de golpes** para meter la bola, con coherencia de diseño y un entorno cyberpunk que integre el mapa.

## Decisiones cerradas

1. **Alcance.** Solo el hoyo 15. Los demás hoyos neón no cambian (ni su aspecto ni su entorno).
2. **Interactividad.** Visual reactiva y obstáculos con primitivas existentes. Los efectos reaccionan a la bola, pero **no alimentan la simulación**: la física y la sincronía de servidor no cambian.
3. **Portal obligatorio.** El portal es el único acceso al looping. No se puede saltar.

## Concepto de juego

Par 4 sin cambio. La complejidad está en las rutas, no en los golpes.

- **Ruta A (espectacular):** del tee, la bola entra en el portal de acceso. El portal la deposita en la zona de lanzamiento del looping. Con el boost previo, el looping se completa y la bola sale hacia la cup.
- **Ruta B (segura):** rodeo por el lado opuesto. Pasa entre un bloque móvil y un molino, rebota en dos bumpers y llega a la cup por el carril lateral.
- Ambas rutas deben tener un coste de golpes esperado parecido (ver criterios). La ruta A exige más precisión; la B exige más tiempo y timing.

La disposición exacta (coordenadas de muros, portal, boost, looping, bloque móvil, molino y bumpers) se fija en el plan con simulación y vista cenital, como en la versión anterior.

## Entorno cyberpunk

Ciudad y plataforma integradas en la misma escena:

- **Ciudad:** edificios altos con ventanas emisivas, letreros verticales y cables. Se construyen con primitivas de Three.js de solo render, sin física.
- **Atmósfera:** cielo oscuro violeta, niebla magenta a media distancia y chispas suspendidas. Reutiliza el sistema de cielo y niebla de `buildEnvironment`.
- **Contraste:** superficie casi negra con líneas magenta (`#ff007f`) y cian (`#00f0ff`). Cup, bandera y chevrons de boost en amarillo (`#ffd23f`) para que se lean de un vistazo.
- **Integración:** la plataforma flota sobre la ciudad. Los bordes de la plataforma tienen luz de neón y cables que bajan hacia la ciudad.

## Efectos reactivos (solo visuales)

- Las bandas de neón del suelo se encienden y se apagan al paso de la bola, con un retardo corto.
- Los chevrons del boost pulsan hacia la dirección del impulso.
- El portal gira y emite un anillo al recibir la bola.
- Estela de luz tras la bola mientras viaja a más de cierta velocidad.
- Los bumpers emiten un destello al golpearlos.

Los efectos se calculan en el cliente a partir del estado de la bola. Ninguno cambia el estado de la simulación.

## Obstáculos (primitivas existentes)

- **Bloque móvil** (`movers`) en la ruta B, con ritmo que deja pasar la bola en ventanas.
- **Molino** (`windmills`) en la ruta B, junto a los bumpers.
- **Bumpers** circulares en la ruta B, con destello.

No se añade ninguna primitiva nueva de física.

## Criterios de aceptación

- Par 4. Tee y cup válidos: fuera de lava y de pendiente (`courses.test.js:13-34`).
- **Portal obligatorio:** ningún golpe directo a la boca del looping entra. Solo entra la bola que pasa por el portal de acceso (test nuevo).
- **Looping:** con el boost, la bola de la ruta A completa el looping con margen medido.
- **Ruta B:** existe al menos un golpe que llega a la cup sin tocar el portal ni el looping.
- **Coste parecido:** la mediana de golpes de la ruta A y de la B difiere como máximo en 1 golpe.
- **Bots:** al menos 9 de 12 terminan con menos de 8 golpes; media ≤ 6,5 (`courses.test.js:57-71`).
- **Sin cambios fuera del hoyo:** `LOOP_LANE`, `LOOP_LANE_HALF` y los hoyos existentes no cambian.
- **Determinismo:** los efectos visuales no modifican el estado de la simulación. `pnpm test` verde (123 + tests nuevos).
- `pnpm sync:functions`: copias de servidor idénticas.
- Vista previa regenerada con `pnpm previews:capture "Cyberpunk2078"`, con el entorno nuevo.
- Migración `course_count = 15` sin cambios; no se aplica nada en Supabase.

## Riesgos

- **Portal obligatorio + bots:** los bots pueden no encontrar la ruta A. Hay que medir antes de fijar la disposición.
- **Rendimiento:** la ciudad y los efectos suman draw calls. Se usan los niveles de calidad existentes (`quality()`), y el hoyo debe funcionar en el nivel bajo.
- **Legibilidad:** demasiados neones pueden tapar la bola. Hay que probar contraste en la vista cenital y en partida.

## Preguntas abiertas

- ¿Apruebas el concepto de dos rutas (A espectacular, B segura) con portal obligatorio?
- ¿Apruebas la disposición como principio, con coordenadas definitivas en el plan?
