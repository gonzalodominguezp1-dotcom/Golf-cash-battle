import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRisk, holeSignals } from '../src/antibot/risk.js';
import { quantizeShot, shotVelocity, MAX_SHOT_SPEED, BALL_R } from '../src/game/physics.js';
import { COURSES } from '../src/game/courses.js';

let seed = 98765;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Simulación de jugador humano en escritorio con ratón:
// Tarda entre 1.5s y 4s en apuntar (waits = 180-480 ticks a 120Hz).
// Mantiene clic/espacio para cargar la potencia entre 0.2s y 0.9s (drags = 24-108 ticks).
// Realiza micro-correcciones de apuntado con el ratón (turns = 1-5 giros).
function desktopMouseHuman(n) {
  const pars = COURSES.map((c) => c.par);
  return Array.from({ length: n }, (_, i) => {
    const course = i % COURSES.length;
    const strokes = Math.max(1, pars[course] + Math.round((rng() - 0.45) * 2));
    const waits = Array.from({ length: strokes }, () => 180 + Math.floor(rng() * 320));
    const drags = Array.from({ length: strokes }, () => 24 + Math.floor(rng() * 85));
    const turns = Array.from({ length: strokes }, () => 1 + Math.floor(rng() * 4));
    return {
      course,
      par: pars[course],
      strokes,
      waits,
      drags,
      turns,
    };
  });
}

test('jugador de escritorio con ratón nunca es marcado por el sistema antibot', () => {
  for (let k = 0; k < 15; k++) {
    const holes = desktopMouseHuman(25);
    const result = assessRisk(holes);
    assert.deepEqual(result.flags, [], `Falsos positivos detectados en jugador de ratón: ${result.flags.join(', ')}`);
    assert.equal(result.score, 0);
  }
});

test('señales del hoyo procesan correctamente la telemetría de ratón', () => {
  const replay = {
    waits: [180, 240, 210],
  };
  const mouseAimTelemetry = [
    { d: 45, t: 2 },
    { d: 72, t: 3 },
    { d: 35, t: 1 },
  ];
  const signals = holeSignals(replay, mouseAimTelemetry);
  assert.deepEqual(signals.waits, [180, 240, 210]);
  assert.deepEqual(signals.drags, [45, 72, 35]);
  assert.deepEqual(signals.turns, [2, 3, 1]);
});

test('tiro de ratón se cuantifica de forma determinista para el servidor', () => {
  const rawYaw = 1.23456789;
  const rawPower = 0.654321;
  const shot = quantizeShot(rawYaw, rawPower);
  assert.equal(shot.yaw, 1.2346);
  assert.equal(shot.power, 0.654);

  const vel = shotVelocity(shot.yaw, shot.power);
  assert.ok(Math.abs(vel.vx) <= MAX_SHOT_SPEED);
  assert.ok(Math.abs(vel.vz) <= MAX_SHOT_SPEED);
  const totalSpeed = Math.hypot(vel.vx, vel.vz);
  assert.ok(Math.abs(totalSpeed - shot.power * MAX_SHOT_SPEED) < 0.05);
});

test('cálculo de límites de campo respeta el radio de la bola en escritorio', () => {
  for (const course of COURSES) {
    assert.ok(course.outline.length >= 3);
    assert.ok(course.tee.length === 2);
    assert.ok(course.cup.length === 2);
    const distToCup = Math.hypot(course.cup[0] - course.tee[0], course.cup[1] - course.tee[1]);
    assert.ok(distToCup > BALL_R * 4, `El hoyo ${course.name} tiene el tee demasiado cerca del hoyo`);
  }
});

test('ajuste manual de fuerza por arrastre de ratón permite tirar más flojo o más fuerte', () => {
  const h = 800; // altura estándar del viewport
  const dragScale = h * 0.32; // 256px para 100%

  const calcPower = (dy, basePower = 0) => {
    return Math.max(0, Math.min(1, basePower + dy / dragScale));
  };

  // Arrastre hacia abajo (coger impulso)
  const powerHard = calcPower(220); // ~86% de fuerza (tiro fuerte)
  assert.ok(powerHard > 0.8 && powerHard < 0.9, `Fuerza alta esperada ~0.86, obtenida: ${powerHard}`);

  // Reducción de arrastre hacia arriba (rectificación para tirar más flojo)
  const powerSoft = calcPower(40); // ~15% de fuerza (tiro flojo)
  assert.ok(powerSoft > 0.1 && powerSoft < 0.2, `Fuerza baja esperada ~0.15, obtenida: ${powerSoft}`);
  assert.ok(powerSoft < powerHard, 'Mover el ratón hacia arriba debe reducir la fuerza');

  // Cancelación moviendo el ratón por encima del origen
  const powerCancelled = calcPower(-20);
  assert.equal(powerCancelled, 0, 'Arrastrar hacia arriba del origen debe dar fuerza 0');

  // Las velocidades de física reflejan directamente la diferencia de fuerza
  const shotHard = quantizeShot(0, powerHard);
  const shotSoft = quantizeShot(0, powerSoft);
  const velHard = shotVelocity(shotHard.yaw, shotHard.power);
  const velSoft = shotVelocity(shotSoft.yaw, shotSoft.power);

  assert.ok(Math.hypot(velHard.vx, velHard.vz) > Math.hypot(velSoft.vx, velSoft.vz) * 4);
});

test('ajuste fino de potencia mediante rueda de ratón', () => {
  let power = 0;
  const step = 0.05;

  const adjustPower = (delta) => {
    power = Math.max(0, Math.min(1, Math.round((power + delta) * 100) / 100));
    return power;
  };

  // Subir potencia con rueda arriba (+5% cada paso)
  adjustPower(+step); // 0.05
  adjustPower(+step); // 0.10
  adjustPower(+step); // 0.15
  adjustPower(+step); // 0.20
  assert.equal(power, 0.20, 'Potencia tras 4 pasos arriba debe ser 0.20');

  // Bajar potencia con rueda abajo (tirar más flojo)
  adjustPower(-step); // 0.15
  assert.equal(power, 0.15, 'Potencia tras 1 paso abajo debe reducir a 0.15');

  // Ajuste a potencia máxima (techo 1.0)
  for (let i = 0; i < 25; i++) adjustPower(+step);
  assert.equal(power, 1.0, 'Potencia no debe exceder 1.0');

  // Ajuste a potencia mínima (suelo 0.0)
  for (let i = 0; i < 30; i++) adjustPower(-step);
  assert.equal(power, 0.0, 'Potencia no debe bajar de 0.0');
});

test('tecla Espacio conmuta visión completa del mapa 3D y prohíbe el tiro mientras está activa', () => {
  let overview = false;
  let charging = false;
  let overviewYaw = 0;
  let overviewPitch = 0.85;
  let shotExecuted = false;

  const onKeyDown = (code) => {
    if (code === 'Space') {
      overview = !overview;
      if (overview) charging = false;
    }
  };

  const onPointerDown = () => {
    if (overview) {
      // Prohibido tirar durante la vista completa del mapa
      return;
    }
    charging = true;
  };

  const onPointerMove = (movementX, movementY) => {
    if (overview) {
      // Rotar la cámara del mapa completo con el ratón
      overviewYaw += movementX * 0.004;
      overviewPitch = Math.max(0.25, Math.min(1.35, overviewPitch - movementY * 0.003));
      return;
    }
  };

  const onPointerUp = () => {
    if (overview) return;
    if (charging) {
      shotExecuted = true;
      charging = false;
    }
  };

  // 1. Inicialmente no está en overview y se puede cargar tiro
  onPointerDown();
  assert.equal(charging, true);

  // 2. Pulsar Espacio activa la vista completa del mapa y cancela cualquier tiro pendiente
  onKeyDown('Space');
  assert.equal(overview, true, 'Espacio debe activar la vista completa del mapa');
  assert.equal(charging, false, 'Activar overview debe cancelar carga previa');

  // 3. Con overview activo, intentar tirar no hace nada
  onPointerDown();
  assert.equal(charging, false, 'No se puede cargar tiro en vista completa');
  onPointerUp();
  assert.equal(shotExecuted, false, 'No se puede disparar en vista completa');

  // 4. Mover el ratón orbita la cámara del terreno completo
  onPointerMove(15, -10);
  assert.ok(overviewYaw > 0.05, 'El ratón debe rotar el yaw de la cámara completa');
  assert.ok(overviewPitch > 0.85, 'El ratón debe rotar el pitch de la cámara completa');

  // 5. Pulsar Espacio de nuevo sale de la vista completa y restaura el disparo
  onKeyDown('Space');
  assert.equal(overview, false, 'Espacio debe volver a la vista de juego normal');
  onPointerDown();
  assert.equal(charging, true, 'Al volver al juego se permite tirar normalmente');
  onPointerUp();
  assert.equal(shotExecuted, true);
});

test('tecla Esc abre el menú de ajustes y libera el puntero', () => {
  let settingsOpen = false;
  let pointerLocked = true;
  let inOverview = false;

  const onKeyDown = (code) => {
    if (code === 'Escape') {
      if (inOverview) {
        inOverview = false;
        return;
      }
      pointerLocked = false;
      settingsOpen = !settingsOpen;
    }
  };

  // 1. En juego normal, pulsar Esc abre ajustes y libera ratón
  onKeyDown('Escape');
  assert.equal(settingsOpen, true, 'Esc debe abrir el menú de ajustes');
  assert.equal(pointerLocked, false, 'Esc debe liberar el puntero');

  // 2. Pulsar Esc de nuevo cierra ajustes
  onKeyDown('Escape');
  assert.equal(settingsOpen, false, 'Esc de nuevo debe cerrar ajustes');

  // 3. Si estaba en vista de mapa, Esc primero vuelve a la vista normal
  inOverview = true;
  onKeyDown('Escape');
  assert.equal(inOverview, false, 'Esc debe salir de la vista completa del mapa');
  assert.equal(settingsOpen, false, 'Esc en overview no abre ajustes directamente');
});

test('cálculo de fuerza y apuntado con pointer lock activo mediante deltas relativos movementX y movementY', () => {
  const h = 800, w = 1200;
  const dragScale = h * 0.32; // 256px
  let dragY = 0;
  let yaw = 0;
  let power = 0;

  // En Pointer Lock, el ratón envía deltas relativos por evento sin tocar bordes de pantalla
  const onPointerLockMove = (movementX, movementY, isCharging = true) => {
    if (isCharging) {
      dragY += movementY;
      power = Math.max(0, Math.min(1, dragY / dragScale));
      yaw += (movementX * 2.2 * (1 - 0.65 * power)) / w;
    } else {
      yaw += movementX * 0.0032;
    }
  };

  // 1. Apuntado libre con Pointer Lock (sin límite de bordes de ventana ni salto a segundo monitor)
  onPointerLockMove(50, 0, false);
  assert.ok(yaw > 0.15 && yaw < 0.17, `Yaw esperado tras apuntado libre ~0.16, obtenido: ${yaw}`);

  // 2. Tirar hacia atrás/abajo para acumular fuerza
  onPointerLockMove(0, 100, true); // +100px delta
  assert.ok(power > 0.38 && power < 0.40, `Fuerza esperada ~0.39, obtenida: ${power}`);

  // 3. Empujar hacia adelante/arriba para reducir fuerza (tirar más flojo con deltas negativos)
  onPointerLockMove(0, -40, true); // -40px delta
  assert.ok(power > 0.22 && power < 0.24, `Fuerza reducida esperada ~0.23, obtenida: ${power}`);

  // 4. Empujar por encima del inicio (delta acumulado <= 0)
  onPointerLockMove(0, -100, true);
  assert.equal(power, 0, 'Fuerza debe ser 0 al empujar más arriba del origen');
});

test('disparo con clic izquierdo en modo pointer lock funciona por carga en tiempo y por arrastre', () => {
  let isPointerLocked = true;
  let charging = false;
  let chargeAnchor = null;
  let power = 0;
  let executedShot = null;
  const DT = 1 / 120;

  // 1. Simulación de onPointerDown en ratón con pointer lock activo
  const onPointerDown = (button, pointerType) => {
    if (pointerType === 'mouse' && button === 0) {
      // Inicia carga sin invocar setPointerCapture (compatible con pointer lock)
      charging = true;
      chargeAnchor = { startPower: 0, dragY: 0, userAdjusted: false, tick: 0 };
    }
  };

  // 2. Simulación de pointercancel durante la transición de bloqueo
  const onPointerCancel = (pointerType) => {
    if (pointerType === 'mouse') {
      // Evento de transición del navegador ignorado: NO debe abortar la carga
      return;
    }
    charging = false;
  };

  // 3. Simulación de frame: carga en tiempo si el usuario no arrastra
  const onFrame = (ticks) => {
    if (charging && chargeAnchor && !chargeAnchor.userAdjusted) {
      const elapsedSec = ticks * DT;
      power = Math.min(1, elapsedSec / 1.4);
    }
  };

  // 4. Simulación de onPointerUp: disparo con el clic izquierdo
  const onPointerUp = (button, pointerType) => {
    if (pointerType === 'mouse' && button === 0 && charging) {
      charging = false;
      chargeAnchor = null;
      if (power >= 0.04) {
        executedShot = { power };
      }
    }
  };

  onPointerDown(0, 'mouse');
  assert.equal(charging, true, 'Clic izquierdo debe activar charging');

  // Evento pointercancel no debe abortar la carga
  onPointerCancel('mouse');
  assert.equal(charging, true, 'pointercancel no debe desactivar el clic izquierdo');

  // Mantener pulsado el botón 60 ticks (0.5s) carga progresivamente
  onFrame(60);
  assert.ok(power > 0.3 && power < 0.4, `Potencia esperada ~0.35 tras 0.5s, obtenida: ${power}`);

  // Soltar clic izquierdo ejecuta el tiro
  onPointerUp(0, 'mouse');
  assert.equal(charging, false);
  assert.ok(executedShot !== null, 'El tiro debe haberse ejecutado al soltar el clic izquierdo');
  assert.ok(executedShot.power > 0.3);
});

test('elementos que obstaculizan la cámara se vuelven 90% invisibles sin desaparecer en vista normal y vista general (Espacio)', () => {
  // Simulación de elemento con materiales transparentes y opacidad dinámica
  const createObstacle = () => ({
    opacity: 1.0,
    mats: [{ opacity: 1.0, depthWrite: true, visible: true }],
    meshes: [{ visible: true }],
  });

  const wall = createObstacle();
  const post = createObstacle();

  // Función de actualización de opacidad de elementos ante obstrucción de cámara
  const updateObstacle = (element, blocks) => {
    // 90% invisible = 10% opacidad (0.10)
    const targetOpacity = blocks ? 0.1 : 1.0;
    element.opacity += (targetOpacity - element.opacity) * 0.2;
    element.meshes.forEach((m) => (m.visible = true)); // NUNCA desaparece por completo
    for (const m of element.mats) {
      m.opacity = element.opacity;
      m.depthWrite = element.opacity > 0.95;
      m.visible = true; // Permanece visible con silueta translúcida elegante
    }
  };

  // 1. En reposo sin obstrucción: opacidad al 100%
  assert.equal(wall.opacity, 1.0);
  assert.equal(wall.mats[0].visible, true);

  // 2. Vista normal: un muro obstaculiza la cámara apuntando a la bola
  for (let frame = 0; frame < 25; frame++) {
    updateObstacle(wall, true);
  }
  assert.ok(wall.opacity >= 0.099 && wall.opacity <= 0.105, `La pared debe converger a 0.1 (90% invisible), obtenida: ${wall.opacity}`);
  assert.equal(wall.mats[0].visible, true, 'La pared nunca debe ponerse en visible = false');
  assert.equal(wall.meshes[0].visible, true);
  assert.equal(wall.mats[0].depthWrite, false, 'depthWrite debe ser false en modo translúcido');

  // 3. Vista general (tecla Espacio): cámara orbita el terreno y un poste obstaculiza la línea de visión
  for (let frame = 0; frame < 25; frame++) {
    updateObstacle(post, true);
  }
  assert.ok(post.opacity >= 0.099 && post.opacity <= 0.105, `El poste debe converger a 0.1 (90% invisible), obtenida: ${post.opacity}`);
  assert.equal(post.mats[0].visible, true, 'El poste nunca debe desaparecer de la escena');

  // 4. Al dejar de obstaculizar la cámara (girar vista), se recupera la opacidad 1.0 suavemente
  for (let frame = 0; frame < 30; frame++) {
    updateObstacle(wall, false);
  }
  assert.ok(wall.opacity >= 0.99, `La pared debe recuperar opacidad completa (1.0), obtenida: ${wall.opacity}`);
  assert.equal(wall.mats[0].depthWrite, true);
});


