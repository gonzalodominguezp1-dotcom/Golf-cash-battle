# Skins premium — Estado del trabajo y cómo continuar

> **REVERTIDO en `main` (commit 354c605).** El usuario pidió deshacer todo por un deterioro grave del rendimiento. `main` queda idéntico a `e4c4691`. Para recuperar el trabajo: `git revert 354c605`. Los commits originales siguen en el historial (372d0df…0cc7b4c). La rama `feature/smooth-144fps-performance` NO se tocó y aún contiene las skins y los arreglos de rendimiento.

Última actualización: 2026-10-25, con la auditoría de rendimiento en curso.

Documentos relacionados:
- `docs/skins-premium-plan.md`: diseño, paquetes P1–P12 y lista de verificación del revisor.
- `docs/skins-premium-review.md`: auditoría funcional y visual de Haiku (defectos D1–D9).
- `docs/skins-premium-perf.md`: informe de rendimiento. **Aún no existe**; lo escribe el agente de auditoría de rendimiento.

## Qué está hecho (commits en `main`, nada subido con push)

| Paquete | Commit | Resumen |
|---|---|---|
| P1 | 372d0df | Tiers (Común→Mítica), esquema de skins, 2 skins nuevas (event_horizon, midas_touch) |
| P2a | f3ba8e8 | Normal map de hoyuelos horneado (PNG, no WebP) |
| P7 | ba61566 | Sonidos procedurales por skin (`sfx.skin`) |
| P4 | 6a9601e | Inventario (float/seed/contadores) + migración SQL |
| P5 | a551b17 | Runtime de efectos: `SkinFX`, cinta, partículas, decals |
| P2 | 7c5fcb6 | Núcleo del material premium (`createSkinMaterial`, env de estudio) |
| P3a–h | 8cb177d, 21a40fd, 5aa948c, 9a6e7c1, 1060244, 10e07ac, a6ca7ee, c89fc9a | Un patrón de shader por skin estrella |
| P6 | adab8ab | Integración en `GolfGame.js` |
| Ajuste de acabado | e00f9dd | Entorno de estudio sin lavado; `finish` por skin |
| P11 | 0cd61a2 | Calidad adaptativa (`perfGovernor.js`, presets en `quality.js`) |
| (conexión) | 33a41db | Gobernador y segmentos de bola por calidad en `GolfGame.js` |
| P8 | 1c0d39f | Inspector 360° v2 + banco `?skinlab=1` |
| P9 | 3745be0 | Pantalla de skins con tarjetas por rareza |
| P10 | 97b9e70 | Animación de desbloqueo por rareza |
| Auditoría | (sin commit) | `docs/skins-premium-review.md` |
| Correcciones | 3dcb45d | Contador de embocadas, tope por guardado, validación servidor (migración nueva `20261027120000_save_progress_clamp.sql`) |
| Correcciones | baaf961 | Miniaturas nítidas (384 px) en el reveal |
| Correcciones | d6421d9 | Kintsugi/Dragón/Criónova/Holo/Damasco/Midas retocados, uSpeed 0..1, `sfx.set` por skin |
| Correcciones | 0cc7b4c | Rivales sin SkinFX y con material compartido barato; liberación de recursos por hoyo; pointer lock |

`pnpm test` 82/82 y `pnpm build` correcto en el último estado commiteado.

## Auditoría de rendimiento: terminada (informe en `docs/skins-premium-perf.md`)

- Causa del bajón: no el coste por frame (idéntico a la base en estado estable), sino tirones al compilar shaders (material premium 290–1020 ms en frío, doble compilación por compilar para el destino equivocado) y un gobernador que bajaba de nivel y provocaba más tirones (añadir/quitar una `PointLight` recompila todo). Además, fuga de contextos WebGL por hoyo.
- Arreglos aplicados en `GolfGame.js`, `skinFx.js`, `effects.js`, `perfGovernor.js`, `skinThumbs.js`, `main.js`, `quality.js`. Commits propios: 66ddb07, 22af037, 57b456d. El resto de ediciones quedó metido en commits 0e28936 y d6738f5 de otra sesión.
- **Ramas:** el trabajo está ahora en `feature/smooth-144fps-performance`, que contiene todos los commits de skins de `main` (hasta 0cc7b4c) más los de esa otra sesión. `main` NO tiene los arreglos de rendimiento. Decidir cómo integrar (merge/PR) con el usuario.
- Recomendaciones sin aplicar: menos celdas Voronoi en Media (Kintsugi, Supernova), precompilar la skin equipada en el lobby, un único renderer entre hoyos, miniaturas en calidad Baja, cachear texturas de cursos, medir en móvil real, tests del gobernador.

## (Histórico) En curso cuando se escribió el documento

**Auditoría de rendimiento** (agente Sonnet 5.5, esfuerzo alto). Mide la base `e4c4691` frente al HEAD con skin Común / Legendaria / Mítica, calidades Baja/Media/Alta, con 0 y 7 rivales. Debe escribir `docs/skins-premium-perf.md` y aplicar arreglos de bajo riesgo en commits `perf(...)`.

Cambios sin commitear en el árbol (probablemente de ese agente; **no confirmado**):
`src/game/GolfGame.js`, `render/effects.js`, `render/perfGovernor.js`, `render/skins/envStudio.js`, `skinFx.js`, `skinMaterial.js`.

Si el agente se interrumpe, antes de nada:
1. Ejecuta `git status` y `git diff` para ver qué dejó a medias.
2. Revisa si existe `docs/skins-premium-perf.md`.
3. Lanza `pnpm test` y `pnpm build`. Si pasan, revisa el diff y haz commit; si no, descarta o termina los cambios con cuidado.

## Pendiente / decisiones abiertas

- **SQL sin probar:** las dos migraciones (`20261026120000_skin_inventory.sql` y `20261027120000_save_progress_clamp.sql`) solo están revisadas a mano. No se han aplicado ni probado contra Postgres.
- **Rivales sin skin propia:** `players` no lleva el dato de skin, así que los rivales muestran la skin del jugador. Para que cada rival muestre la suya hay que enviar ese dato en la partida online (decisión pendiente del usuario).
- **Fugas anteriores:** las texturas de la escena crecen ~14 por hoyo; `compileAsync` lanza un `isReady` sin capturar si se recargan hoyos muy seguidos.
- **Reveal:** genera 12 imágenes de 384 px de golpe; puede dar un pequeño tirón. Trocear si pasa.
- **Visual sin comprobar:** calidad Baja, día/noche/neón en partida real, el reveal en una partida real, y los hoyuelos sobre metales con zoom. Prisma Holo queda algo recargada.
- **Servidores Vite ajenos** que pueden seguir escuchando en 5173, 5180, 5190, 5200: cerrar a mano.
- **Archivos temporales sin seguimiento** (`zz-perf-tmp*`, `zz-vite.config.js`, `zz-skbench.*`): borrar si aparecen y no están en ningún commit.
- **Opcional no hecho:** P12 (inspección en partida y marcador grabado).
- **Producto:** no vender cajas de pago con resultado aleatorio (ver recomendación en el plan).
- Nada subido con `git push`.

## Cómo reanudar

1. Lee este documento y `git log --oneline -15`.
2. Cierra la auditoría de rendimiento (ver arriba).
3. Con el usuario: decidir lo de la skin por rival, y repasar visualmente las skins en partida real.
4. Una última auditoría de Haiku sobre los commits nuevos y, si todo va bien, preparar el push.
