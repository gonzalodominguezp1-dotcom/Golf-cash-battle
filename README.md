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

## Estructura

- `src/game/` física (sin Three.js, reutilizable en servidor), hoyos, ambientaciones (`themes.js`), sonidos y render 3D (`render/`)
- `src/wallet/` interfaz `WalletService` + `LocalWallet` (demo). Para Supabase basta con implementar la misma interfaz.
- `src/match/` matchmaking, puntuación y reparto del bote

## Pendiente para dinero real

- Backend en Supabase: wallets, transacciones y partidas en la base de datos, cobro y pago solo desde el servidor.
- Multijugador real y validación de los golpes en servidor (la física ya es determinista y está separada del render).
- Pasarela de pagos, KYC/edad y revisión legal del modelo de habilidad por país.
