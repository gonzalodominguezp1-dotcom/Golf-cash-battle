---
author: la-chaqueta-bionica
branch: la-chaqueta-bionica
status: done
---

# Wallet dentro de la cuenta + avatar y marcos

## Intent
El wallet deja de ser una pantalla aparte: vive en Cuenta (pestañas Perfil | Wallet). El jugador elige icono de perfil o sube una imagen propia (máx. 2,5 MB) y los marcos de prestigio pasan a ser ornamentados (estilo Wild Rift).

## Scope
- `src/main.js`: pestañas en Cuenta, `walletPane`/`bindWallet`, editor de avatar, `avatarHtml`; menú sin Wallet (atajos: 4 Ranking, 5 Cuenta). El saldo de la barra y "saldo insuficiente" abren Cuenta > Wallet.
- `src/progress/avatar.js`: iconos, validación (png/jpeg/webp, 2,5 MB), almacén por cuenta en localStorage, recorte a 256 px.
- `src/style.css`: marcos `.pf-p25…p150` (aro facetado, corona, alas, gema, aura animada).
- Fuera de alcance: el avatar solo se guarda en este dispositivo; en el ranking solo se ve el propio (los demás muestran inicial). Sincronizarlo exige columna + Storage en Supabase.

## Checklist
- [x] Wallet dentro de Cuenta, sin entrada propia en el menú
- [x] Icono de perfil elegible
- [x] Imagen propia con límite de 2,5 MB
- [x] Seis marcos con ornamentación creciente

## Evidence
- `npm test`: 158 pasan (incluye `tests/avatar.test.js`: límite, tipos, aislamiento por cuenta, rechazo de urls no imagen).
- `vite build` correcto.
- Los seis marcos y sus tamaños se vieron renderizados en el navegador (página de prueba, ya borrada).
- No verificado: la pantalla Cuenta con sesión real (requiere Supabase).

## Next
Decidir si el avatar se sincroniza con el servidor (migración + bucket) para verse en el ranking de otros.
