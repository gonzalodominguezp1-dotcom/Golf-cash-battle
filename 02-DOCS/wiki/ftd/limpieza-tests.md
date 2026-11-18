---
author: Chakets
branch: limpieza-tests-main
status: in-progress
---

# Limpieza de tests (origin/main)

## Intent
Quitar de la suite de tests lo obsoleto, lo que apunta a código superado y lo duplicado, sin perder cobertura real.

## Scope
Solo `tests/*.test.js` y, si hace falta, esta ficha. Sin cambios en `src/` ni en `supabase/`.
Fuera de alcance (decisión pendiente del usuario): tests de migraciones legacy de datos (`settings`, `inventory`), tests que leen código fuente, verificación temporal de cuenta, y el commit local `e6ad549` de `limpieza-tests` (sin subir), que ya unifica skins y paridad servidor.

## Checklist
- [x] `party.test.js` lee la última definición vigente de cada función, no la migración superada. Prueba: `node --test tests/party.test.js` → 7/7.
- [x] Quitar el test «ya no existe» de `play-lifecycle` (el goHome sigue cubierto por su primer test). Prueba: suite completa.
- [x] `screen-settings`: quitar la comprobación de `showSettings` y de la entrada legacy; queda el guard de «desafío». Prueba: suite completa.
- [x] `screen-friends`: quitar las aserciones «ya no monta el panel» y «ya no arranca el sondeo». Prueba: suite completa.
- [x] `splash-weight`: quitar el test de ciclo < 333 ms, cubierto por el de < 0,5 s, que es más estricto. Prueba: suite completa.
- [x] Suite completa en verde: 738 pass, 0 fail (base 740, se quitaron 2 tests).
- [ ] Commit y push a `origin/main`, y verificación en el remoto. Pendiente.
- No hecho aquí (ya cubierto por el commit local `e6ad549` de `limpieza-tests`, sin subir): fusión de paridad servidor en `determinism`/`replay` y unificación de `skins-new`/`skins-schema`.

## Evidence
- Base en `origin/main` ee30a8a: `node --test tests/*.test.js` → 740 pass, 0 fail (tras `pnpm install --frozen-lockfile`).
- `party.test.js` tras el cambio: 7 pass, 0 fail.

## Next
Quitar los tests de «ya no existe» y el duplicado AC33, luego suite completa, commit y push.
