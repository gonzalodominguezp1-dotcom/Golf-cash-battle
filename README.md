# Golf Cash Battle

Minigolf 3D para móvil (navegador) con partidas de 8 jugadores y entry fee: el que menos golpes hace se lleva el bote menos la comisión de la plataforma.

## Qué hay en este prototipo

- **Juego 3D** con Three.js y cámara en tercera persona detrás de la bola. Desliza a los lados para apuntar y hacia abajo para cargar la potencia; "Ver hoyo" muestra el recorrido entero.
- **5 hoyos** con su ambiente (pradera, playa, atardecer, nieve y cañón): setas rebotadoras, arena, aspa giratoria, aceleradores y bloques móviles. Cada partida juega 3, los mismos para todos.
- **Rivales en el campo**: los otros 7 juegan el mismo hoyo a la vez, con la misma física, y su resultado es el que hacen ahí. Clasificación en vivo arriba. En producción serán jugadores reales.
- **Sonidos** generados en el navegador (madera, hoyo, campanas, ambiente), con botón para silenciar.
- **Wallet** de créditos demo (100 de bienvenida, recargas demo, historial de movimientos). Sin dinero real.
- **Partidas** Práctica (gratis), Bronce 1, Plata 5, Oro 10 y Diamante 25. Bote = entrada × 8; premio = bote − 10%. Empates reparten el premio.

Las reglas económicas están en `src/config.js`.

## Desarrollo

```bash
npm install
npm run dev      # abre la URL "Network" desde el móvil en la misma wifi
npm test         # reparto del bote y wallet
npm run build
```

## Backend (Supabase)

Proyecto `golf-cash-battle` (`oyawgvqbmvtmlnyqwgdf`). Cada jugador entra con una cuenta anónima y recibe 100 créditos demo.

- Tablas: `wallets`, `transactions`, `matches`, `match_players`, `tiers`, `app_config`. RLS: cada usuario solo lee lo suyo y nadie escribe directamente.
- El saldo solo cambia dentro de funciones del servidor: `join_match` (cobra la entrada y elige los hoyos), `submit_hole`, `finish_match` (reparte el bote y la comisión), `abandon_match` (devuelve la entrada si no se ha jugado), `demo_deposit`.
- Requisito: en el panel de Supabase, Authentication → Sign In / Providers → activar *Allow anonymous sign-ins*.
- `VITE_BACKEND=local` usa la demo en el navegador (la vista previa). Si Supabase no responde, la app pasa sola a modo local.
- Depósitos cripto con NOWPayments (Edge Functions `crypto-deposit` y `nowpayments-ipn`, tabla `deposits`). El saldo solo sube cuando llega el aviso firmado con estado `finished`, una vez por depósito. Secrets: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` y `NOWPAYMENTS_SANDBOX` (por defecto pruebas). URL del IPN: `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/nowpayments-ipn`.
- Publicación: `.github/workflows/pages.yml` publica en GitHub Pages al hacer push a `main` (Settings → Pages → Source: GitHub Actions).

## Estructura

- `src/game/` física (sin Three.js, reutilizable en servidor), hoyos, ambientaciones (`themes.js`), sonidos y render 3D (`render/`)
- `src/wallet/` interfaz `WalletService`, `LocalWallet` (demo local) y `SupabaseWallet`
- `src/backend/` elige backend y conecta con Supabase
- `src/match/` matchmaking, puntuación y reparto del bote (`MatchService` local, `SupabaseMatchService` en servidor)

## Pendiente para dinero real

- Multijugador real y validación de los golpes en servidor (la física ya es determinista y está separada del render).
- Pasarela de pagos, KYC/edad y revisión legal del modelo de habilidad por país.
