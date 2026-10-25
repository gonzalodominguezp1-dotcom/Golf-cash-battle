// P3d — Dragón Carmesí (docs/skins-premium-plan.md, b.4): escamas voronoi abombadas con normal,
// brillo de brasa en las juntas que late (respiración de 4 s), escamas que se erizan al acelerar y
// un «ojo» con pupila rasgada que se abre cuando la bola lleva > 3 s parada.
// Calidad: baja (sin shader, no se usa), media (escamas + normal + ojo), alta (más densidad + micrograno).

const STILL_AFTER = 3.0; // s parada antes de abrir el ojo
const STILL_SPEED = 0.02; // (uSpeed 0..1) por debajo de esta velocidad cuenta como parada

const glsl = /* glsl */ `
// Voronoi propio: devuelve d1 (a la semilla), d2-d1 (a la arista), id y el vector hacia el centro de la escama.
void dr_voronoi(vec3 p, out float d1o, out float edge, out float id, out vec3 toC) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec3 best = vec3(0.0);
  float bid = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = sk_hash3(ip + g);
        vec3 r = g + 0.5 + 0.45 * (o - 0.5) - fp;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; best = r; bid = o.x; }
        else if (d < d2) { d2 = d; }
      }
  d1o = sqrt(d1);
  edge = sqrt(d2) - d1o;
  id = bid;
  toC = best;
}

void skinPattern(vec3 p, inout vec4 diffuse) {
  const vec3 OBSIDIAN = vec3(0.010, 0.0012, 0.003);
  const vec3 EMBER = vec3(1.0, 0.36, 0.03);
  float breath = 0.5 + 0.5 * sin(uTime * 1.5707963); // ciclo de 4 s
  float live = clamp(uSpeed, 0.0, 1.0);               // uSpeed llega en 0..1

  // Escamas alargadas en el eje del objeto (filas escalonadas): se estira Y y se desplaza cada fila
  vec3 q = vec3(p.x, p.y * 0.78, p.z) * SK_SCALE_F + vec3(uSeed * 0.731, uSeed * 0.377, uSeed * 0.529);
  float d1, edge, id;
  vec3 toC;
  dr_voronoi(q, d1, edge, id, toC);

  // Abombada: 1 en el centro, 0 en la junta. «Cola» de la escama = dirección hacia abajo (-Y del objeto)
  float dome = 1.0 - smoothstep(0.0, 0.6, d1);
  float groove = 1.0 - smoothstep(0.0, 0.07, edge);
  vec3 down = normalize(vec3(0.0, -1.0, 0.0) - p * (-p.y));
  vec3 tangC = -toC - dot(-toC, p) * p;                      // desde el centro hacia el borde (tangente)
  float tl = length(tangC);
  float facing = tl > 1e-4 ? dot(tangC / tl, down) : 0.0;     // +1 en el borde inferior (punta), -1 en la raíz
  float edgeNear = smoothstep(0.18, 0.55, d1);
  float tip = max(facing, 0.0) * edgeNear;                    // punta: asoma por encima de la fila de abajo
  float root = max(-facing, 0.0) * edgeNear;                  // raíz: tapada por la fila de arriba

  // Color: gradiente carmesí raíz oscura -> punta viva; varía por escama
  vec3 crim = mix(vec3(0.16, 0.004, 0.02), vec3(0.62, 0.02, 0.06), id);
  vec3 col = mix(OBSIDIAN * 1.5, crim, 0.35 + 0.65 * dome);
  col = mix(col, crim * 1.4 + uPalAccent * 0.2, tip * 0.8);       // punta brillante
  col = mix(col, OBSIDIAN * 0.35, clamp(root * 0.85 + groove, 0.0, 1.0));

#if SK_FINE == 1
  // micrograno de cada escama (alta)
  float g = sk_noise3(p * 90.0 + id * 13.0);
  col *= 0.8 + 0.4 * g;
  sk_dRough += (g - 0.5) * 0.08;
#endif
  diffuse.rgb = col;

  // Material: escama metálica y pulida, junta áspera y oscura
  sk_dMetal += 0.4 * dome + 0.2 * tip - 0.2 * groove;
  sk_dRough += 0.14 * groove + 0.1 * root - 0.05 * dome - 0.05 * tip;

  // Brasa: sólo en las juntas finas, latiendo; más viva con velocidad / impacto; el desgaste la apaga.
  // Algunas escamas (id alto) respiran más fuerte: se lee como piel viva, no como lava.
  float vein = step(0.62, id) * (0.5 + 0.5 * sin(uTime * 1.9 + id * 40.0));
  float emberAmt = (0.18 + 0.38 * breath + 0.35 * vein) * (0.7 + 0.8 * live) * (1.0 - 0.6 * uWear);
  float flicker = 0.7 + 0.3 * sk_noise3(q * 2.3 + vec3(uTime * 0.6, 0.0, -uTime * 0.4));
  sk_emis += EMBER * groove * emberAmt * flicker * 1.1;
  sk_emis += EMBER * root * 0.12 * emberAmt;                 // resplandor bajo la escama de arriba
  sk_emis += uPalAccent * tip * 0.05;
  sk_emis += EMBER * groove * uImpact * 2.5;

#if SK_NRM == 1
  // Normal: cada escama es una placa abombada con la punta alzada; se «eriza» al acelerar
  float k = (1.1 + 1.0 * live) * (SK_Q == 2 ? 1.0 : 0.85);
  sk_nPert += tangC * k * (1.0 - groove);
  sk_nPert += down * (tip * 0.55 + 0.1) * (0.6 + 0.6 * live);   // la punta se levanta y recoge la luz
  sk_nPert -= tangC * groove * 0.5;                              // la junta se hunde
#endif

#if SK_EYE == 1
  // Ojo idle: pupila rasgada en una escama; su posición depende de la semilla
  if (uEye > 0.01) {
    float a = uSeed * 2.399;
    vec3 E = normalize(vec3(sin(a) * 0.55, 0.32, cos(a) * 0.8 + 0.2));
    float facing = dot(p, E);
    if (facing > 0.8) {
      vec3 T = normalize(cross(E, vec3(0.0, 1.0, 0.0)));
      vec3 B = cross(E, T);
      vec3 d = p - E;
      float ex = dot(d, T) / 0.15;
      float ey = dot(d, B) / (0.075 * max(uEye, 0.02));
      float r2 = ex * ex + ey * ey;
      if (r2 < 1.35) {
        float lid = smoothstep(1.35, 0.95, r2);       // párpado oscuro alrededor
        float ball = smoothstep(1.0, 0.8, r2);        // globo
        float slit = 1.0 - smoothstep(0.1, 0.2, abs(ex) + 0.35 * abs(ey)); // pupila vertical
        vec3 iris = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.08), 1.0 - sqrt(r2));
        diffuse.rgb = mix(diffuse.rgb, OBSIDIAN, lid * uEye);
        diffuse.rgb = mix(diffuse.rgb, iris * 0.5, ball * uEye);
        diffuse.rgb = mix(diffuse.rgb, vec3(0.0), slit * ball * uEye);
        sk_emis += iris * ball * (1.0 - slit) * uEye * (1.1 + 0.5 * breath);
        sk_nPert *= 1.0 - ball * uEye;
        sk_dRough -= 0.12 * ball * uEye;
      }
    }
  }
#endif
}
`;

export default {
  glsl,
  uniforms: {
    uEye: { value: 0 }, // apertura del ojo 0..1
    uStillT: { value: 0 }, // segundos parada
  },
  update(u, t, dt, ctx) {
    const step = Math.min(dt || 0, 0.1);
    if ((ctx?.speed ?? 0) < STILL_SPEED) u.uStillT.value += step;
    else u.uStillT.value = 0;
    const target = u.uStillT.value > STILL_AFTER ? 1 : 0;
    const rate = target > u.uEye.value ? 1.6 : 6; // se abre despacio, se cierra rápido
    u.uEye.value += (target - u.uEye.value) * Math.min(1, step * rate);
    if (Math.abs(target - u.uEye.value) < 0.002) u.uEye.value = target;
  },
  quality: {
    low: { scale: 4, nrm: 0, eye: 0, fine: 0 },
    medium: { scale: 4.5, nrm: 1, eye: 1, fine: 0 },
    high: { scale: 5.5, nrm: 1, eye: 1, fine: 1 },
  },
};
