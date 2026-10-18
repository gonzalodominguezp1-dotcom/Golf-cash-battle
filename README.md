# Golf Cash Battle

Minigolf 3D para móvil (navegador) con partidas de 8 jugadores y entry fee: el que menos golpes hace se lleva el bote menos la comisión de la plataforma.

## Qué hay en este prototipo

- **Juego 3D** con Three.js: 3 hoyos (La Recta, El Codo, Zigzag) con obstáculos, arena y un aspa giratoria. Se apunta arrastrando hacia atrás y soltando.
- **Wallet** de créditos demo (100 de bienvenida, recargas demo, historial de movimientos). Sin dinero real.
- **Partidas** Práctica (gratis), Bronce 1, Plata 5, Oro 10 y Diamante 25. Bote = entrada × 8; premio = bote − 10%. Empates reparten el premio.
- Rivales simulados para poder probar solo. En producción serán jugadores reales.

Las reglas económicas están en `src/config.js`.

## Desarrollo

```bash
npm install
npm run dev      # abre la URL "Network" desde el móvil en la misma wifi
npm test         # reparto del bote y wallet
npm run build
```

## Estructura

- `src/game/` física (sin Three.js, reutilizable en servidor), hoyos y render 3D
- `src/wallet/` interfaz `WalletService` + `LocalWallet` (demo). Para Supabase basta con implementar la misma interfaz.
- `src/match/` matchmaking, puntuación y reparto del bote

## Pendiente para dinero real

- Backend en Supabase: wallets, transacciones y partidas en la base de datos, cobro y pago solo desde el servidor.
- Multijugador real y validación de los golpes en servidor (la física ya es determinista y está separada del render).
- Pasarela de pagos, KYC/edad y revisión legal del modelo de habilidad por país.
