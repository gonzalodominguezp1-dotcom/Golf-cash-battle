// Salida de una partida hacia el hub: primero se libera todo lo de la partida (sonido del final, sala en vivo,
// renderer, guard de «atrás», sondeos) y solo después se navega. El orden importa: stopLive antes del repintado.
export function createGoHome({ leaveFinale, stopLive, releasePlay, go }) {
  return function goHome() {
    leaveFinale();
    stopLive();
    releasePlay();
    go('home');
  };
}
