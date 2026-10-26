// Cronómetro de Latón (ideas_skins/_plan/spec-skins.md, skin 4): bola de latón cepillado con 6 ventanas
// hexagonales de cristal (una por cara de un cubo proyectado a la esfera) tras las que giran engranajes y
// dos agujas. Solo se evalúa UNA ventana por fragmento. +X es la ventana frontal de las miniaturas.
//   uGearPh (propio): giro acumulado de los engranajes, 0,4 rad/s + hasta 3 rad/s con la velocidad.
//   Con «reducir movimiento» dt = 0 y todo queda parado (el minutero usa uTime, fijo en 1,2).
//   El minutero avanza a saltos de 1 Hz (el «tic»); la horaria va continua y lenta.
// Baja no ejecuta shader (material estándar + canvas `clockwork`); se define igualmente por contrato.
export default {
  glsl: /* glsl */ `
// «radio» hexagonal (vértices en el eje X): la ventana mide 0.5
float skHex(vec2 q) {
  q = abs(q);
  return max(q.y, q.x * 0.8660254 + q.y * 0.5);
}

// engranaje: cuerpo con dientes, cubo central y radios (0..1)
float skGear(vec2 g, float teeth, float rot, float rb) {
  float r = length(g);
  float th = atan(g.y, g.x + 1e-4) - rot;
  float edge = rb + 0.028 * smoothstep(-0.3, 0.3, cos(teeth * th));
  float body = 1.0 - smoothstep(edge - 0.008, edge + 0.008, r);
  float hub = smoothstep(0.04, 0.05, r);
  float cut = smoothstep(rb * 0.45, rb * 0.5, r) * (1.0 - smoothstep(rb * 0.72, rb * 0.77, r));
  float spoke = smoothstep(0.82, 0.92, cos(3.0 * th));
  return body * hub * (1.0 - cut * (1.0 - spoke));
}

// aguja desde el centro; ang medido desde las 12 en sentido horario
float skHand(vec2 q, float ang, float len, float w) {
  vec2 d = vec2(sin(ang), cos(ang));
  float al = dot(q, d);
  float pe = abs(dot(q, vec2(d.y, -d.x)));
  return smoothstep(w, w * 0.4, pe) * smoothstep(-0.02, 0.0, al) * (1.0 - smoothstep(len - 0.01, len, al));
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  vec3 ap = abs(p);
  float rimv = 1.0 - clamp(normalize(p.x * vObjX + p.y * vObjY + p.z * vObjZ).z, 0.0, 1.0);

  // cara dominante del cubo: coordenadas gnomónicas q (derecha, arriba) vistas desde fuera
  vec2 q;
  float s;
  float fid;
  if (ap.x >= ap.y && ap.x >= ap.z) {
    s = p.x < 0.0 ? -1.0 : 1.0;
    q = vec2(-p.z * s, p.y) / ap.x;
    fid = 0.5 + 0.5 * s;
  } else if (ap.y >= ap.z) {
    s = p.y < 0.0 ? -1.0 : 1.0;
    q = vec2(-p.x * s, p.z) / ap.y;
    fid = 2.5 + 0.5 * s;
  } else {
    s = p.z < 0.0 ? -1.0 : 1.0;
    q = vec2(p.x * s, p.y) / ap.z;
    fid = 4.5 + 0.5 * s;
  }

  float d = skHex(q) - 0.5;
  float win = 1.0 - smoothstep(-0.01, 0.01, d);
  float frame = (1.0 - win) * (1.0 - smoothstep(0.075, 0.09, d));

  // cuerpo de latón cepillado
  float brush = sk_noise3(p * vec3(40.0, 2.0, 2.0));
  vec3 col = uPalBase * (0.94 + 0.12 * brush);
  sk_dRough = 0.06 * (brush - 0.5) * (1.0 - win);

  #if SK_SEAMS > 0
  // juntas de chapa: donde dos componentes dominantes casi coinciden
  float a1 = max(ap.x, max(ap.y, ap.z));
  float a3 = min(ap.x, min(ap.y, ap.z));
  float a2 = ap.x + ap.y + ap.z - a1 - a3;
  col = mix(col, uPalSecondary, smoothstep(0.014, 0.004, a1 - a2) * 0.85 * (1.0 - win) * (1.0 - frame));
  #endif

  // marco de cobre
  col = mix(col, uPalAccent, frame);

  #if SK_RIVETS > 0
  // remaches en los seis vértices del marco
  vec2 aq = abs(q);
  float rv = min(length(aq - vec2(0.624, 0.0)), length(aq - vec2(0.312, 0.54)));
  float rivet = (1.0 - smoothstep(0.026, 0.034, rv)) * frame;
  col = mix(col, uPalGlow, rivet * 0.85);
  #endif

  // ventana: cristal oscuro con el mecanismo detrás
  if (win > 0.0) {
    float rot = uGearPh + uSeed + fid * 1.7;
    vec3 mech = uPalSecondary;
    float gm = 0.0;
    vec3 em = uPalGlow * (0.12 * (1.0 - smoothstep(0.0, 0.7, length(q))));

    #if SK_GEARS > 1
    float gb = skGear(q - vec2(-0.11, 0.21), 7.0, -rot * 1.4286 + 0.45, 0.12);
    mech = mix(mech, uPalAccent, gb);
    gm = gb;
    #endif
    float ga = skGear(q - vec2(0.1, -0.08), 10.0, rot, 0.2);
    mech = mix(mech, uPalBase * (0.85 + 0.3 * smoothstep(0.1, 0.22, length(q - vec2(0.1, -0.08)))), ga);
    gm = max(gm, ga);

    // agujas: la horaria continua y lenta; el minutero a saltos de 1 Hz
    float tick = floor(uTime) + smoothstep(0.0, 1.0, min(fract(uTime) * 8.0, 1.0));
    float hands = max(skHand(q, tick * 0.10472 + uSeed, 0.38, 0.014), skHand(q, uTime * 0.0087 + uSeed * 0.7, 0.25, 0.02));
    hands = max(hands, 1.0 - smoothstep(0.025, 0.035, length(q)));
    mech = mix(mech, uPalGlow, hands);
    em += uPalGlow * hands * 0.5;

    col = mix(col, mech, win);
    sk_emis += em * win;
    sk_dRough += -0.2 * win * (1.0 - gm);
    sk_dMetal = -0.6 * win * (1.0 - gm);
  }

  diffuse.rgb = col;

  // tono cobre del barniz en el borde
  sk_emis += uPalAccent * pow(rimv, 3.0) * 0.1;
}
`,
  uniforms: { uGearPh: { value: 0 } },
  update(u, t, dt, ctx) {
    u.uGearPh.value += Math.min(dt, 0.1) * (0.4 + (ctx?.speed ?? 0) * 3);
  },
  quality: {
    low: { gears: 1, rivets: 0, seams: 0 },
    medium: { gears: 1, rivets: 0, seams: 0 },
    high: { gears: 2, rivets: 1, seams: 1 },
  },
};
