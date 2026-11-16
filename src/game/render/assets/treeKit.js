import * as THREE from 'three';

// Piezas comunes de los árboles del estilo liso (pino, palmera, arbustos...).
// Copiadas de la técnica que fijó el árbol redondo (assets/roundTree.js, paso 1 de
// 02-DOCS/wiki/ftd/assets-entorno-1a1.md); roundTree.js aún lleva sus propias copias.
// - nivel de calidad a partir de nombre, preset del laboratorio, lod o número;
// - luz de borde a contraluz en el Lambert (un pow por píxel);
// - constructor de triángulos sueltos con color, normal y atributos de viento;
// - tubo por transporte paralelo para troncos y ramas.

export const TAU = Math.PI * 2;
export const LEVELS = ['low', 'medium', 'high'];

export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (rng, [a, b]) => lerp(a, b, rng());
export const smooth = (e0, e1, x) => THREE.MathUtils.smoothstep(x, e0, e1);

/** Calidad como nombre ('low'...), preset del laboratorio ({ level }), lod (0/1/2) o número. */
export function treeLevel(q) {
  if (typeof q === 'string') return LEVELS.includes(q) ? q : 'medium';
  if (typeof q === 'number' && Number.isFinite(q)) return LEVELS[Math.max(0, Math.min(2, Math.round(q)))];
  if (q && typeof q === 'object') {
    if (LEVELS.includes(q.level)) return q.level;
    if (Number.isFinite(q.lod)) return LEVELS[Math.max(0, Math.min(2, Math.round(q.lod)))];
  }
  return 'medium';
}

/**
 * Luz de borde a contraluz: el borde se enciende con el color del sol teñido por el
 * material (como si la luz lo atravesara), más cuando el sol está detrás.
 * unflip: en materiales de dos caras la normal no se da la vuelta por detrás.
 */
export function withRim(material, strength, unflip = false) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.call(material);
  const rim = [
    '#if NUM_DIR_LIGHTS > 0',
    '{',
    '  float gcbRim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);',
    '  float gcbBack = saturate(-dot(directionalLights[0].direction, geometryViewDir));',
    `  outgoingLight += diffuseColor.rgb * directionalLights[0].color * gcbRim * (0.3 + 0.7 * gcbBack) * ${strength.toFixed(3)};`,
    '}',
    '#endif',
  ].join('\n');
  material.onBeforeCompile = function (sh, renderer) {
    prev?.call(this, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `${rim}\n#include <opaque_fragment>`);
    if (unflip) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif',
      );
    }
  };
  material.customProgramCacheKey = () => `rim:${strength}:${unflip ? 1 : 0}|${prevKey}`;
  return material;
}

/** Lambert liso con el color en el vértice (la paleta va en la geometría: un material para todos). */
export const vertexLambert = (extra = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, ...extra });

const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _fn = new THREE.Vector3();

/**
 * Triángulos sueltos (sin índice) con posición, normal, color y viento.
 * p0: fase del conjunto (windPhase.x). count: solo cuenta triángulos (el ajuste al
 * presupuesto prueba varias veces sin calcular color ni normales).
 */
export class TriBuilder {
  constructor(p0, count = false) {
    this.p0 = p0;
    this.count = count;
    this.n = 0;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.sway = [];
    this.ph = [];
    this.fl = [];
  }
  vert(p, n, c, phase, flutter) {
    this.n++;
    if (this.count) return;
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.sway.push(Math.max(0, p.y));
    this.ph.push(this.p0, phase);
    this.fl.push(flutter);
  }
  /**
   * Un triángulo de vértices { p, n, c, w } con fase de pieza `phase`. El orden se
   * elige para que la cara visible mire hacia `facing` (si no, hacia donde miran sus
   * normales): el material es de una cara.
   */
  tri(a, b, c, phase, facing = null) {
    if (this.count) {
      this.n += 3;
      return;
    }
    _ab.subVectors(b.p, a.p);
    _ac.subVectors(c.p, a.p);
    _fn.crossVectors(_ab, _ac);
    const f = facing ?? _ab.copy(a.n).add(b.n).add(c.n);
    const flip = _fn.dot(f) < 0;
    for (const v of flip ? [a, c, b] : [a, b, c]) this.vert(v.p, v.n, v.c, phase, v.w ?? 0);
  }
  get tris() {
    return this.n / 3;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('windPhase', new THREE.Float32BufferAttribute(this.ph, 2));
    g.setAttribute('windFlutter', new THREE.Float32BufferAttribute(this.fl, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Tubo a lo largo de una curva { at(t), tangent(t, out) } (tronco o rama): radial lados,
 * rings tramos, radius(t) en metros, shade(p, t) → Color (o null al contar),
 * hidden(tri) → true si el triángulo no se ve (dentro de la copa). Marco por
 * transporte paralelo: los anillos no se retuercen.
 */
export function tube(b, curve, radius, radial, rings, shade, hidden = () => false) {
  const ringsPts = [];
  let n = null;
  const T = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = curve.at(t);
    curve.tangent(t, T);
    if (!n) {
      const ref = Math.abs(T.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      n = new THREE.Vector3().crossVectors(T, ref).normalize();
    } else n.addScaledVector(T, -n.dot(T)).normalize();
    const bn = new THREE.Vector3().crossVectors(T, n);
    const r = radius(t);
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
      const p = c.clone().addScaledVector(d, r);
      ring.push({ p, n: d, c: shade(p, t), w: 0 });
    }
    ringsPts.push(ring);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = ringsPts[i][k], bb = ringsPts[i][(k + 1) % radial], c = ringsPts[i + 1][k], d = ringsPts[i + 1][(k + 1) % radial];
      for (const tri of [[a, bb, c], [bb, d, c]]) {
        if (hidden(tri)) continue;
        b.tri(tri[0], tri[1], tri[2], b.p0);
      }
    }
  }
}
