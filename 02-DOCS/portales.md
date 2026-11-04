# Versión para portales de juegos (CrazyGames, Poki)

Build aparte del juego, gratis y con anuncios del portal. No cambia nada del juego normal
(Vercel/main): todo va detrás de `VITE_PORTAL`, que solo ponen estas builds.

## Qué cambia en la build de portal

- Sin dinero: sin mesas de pago, sin wallet/saldo, sin cuenta ni ranking online.
- Todo local en el navegador (`VITE_BACKEND=local`): partida rápida contra 7 bots y Juego Libre. Skins y nivel se guardan en el navegador.
- SDK del portal (`src/portal.js`): aviso de carga, `gameplayStart`/`gameplayStop` en cada hoyo, anuncio *midgame* al pulsar Revancha o Salir tras una partida (el portal decide la frecuencia), audio silenciado durante el anuncio.
- Si el SDK no carga (adblock, otro dominio) el juego funciona igual, sin anuncios.
- Rutas relativas (`base: './'`) y sin panel admin.

## Compilar

```
pnpm install
pnpm build:crazygames   # -> dist-crazygames/ y crazygames.portal.zip
pnpm build:poki         # -> dist-poki/ y poki.portal.zip
```

Probar en local con anuncios de prueba: `npx vite preview --outDir dist-crazygames` y abrir en `localhost`.

## Subir a CrazyGames

1. Cuenta en https://developer.crazygames.com y "Submit game" (HTML5).
2. Subir `crazygames.portal.zip` (index.html en la raíz). Orientación: vertical y horizontal.
3. Probar en su Preview/QA tool y enviar. Empieza en *Basic Launch* (sin anuncios, miden retención); si funciona pasa a *Full Launch* con anuncios (50% de ingresos).
