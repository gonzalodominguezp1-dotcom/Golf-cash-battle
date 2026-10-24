import * as THREE from 'three';
import { courseBounds } from './environment.js';
import { buildCourse } from './course.js';
import { BALL_R, CUP_R } from '../physics.js';
import { THEMES } from '../themes.js';
import { groundHeight, hasRelief } from './terrain.js';

/**
 * Caché en memoria para las imágenes de vista previa de los mapas.
 * Clave: `${course.name}@${width}x${height}`
 */
const previewCache = new Map();

let sharedRenderer = null;

function getSharedRenderer(width, height) {
  if (typeof document === 'undefined') return null;
  if (!sharedRenderer) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      sharedRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      sharedRenderer.toneMappingExposure = 1.15;
      sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (err) {
      console.warn('WebGL no disponible para vista previa 3D de mapa:', err);
      return null;
    }
  }
  return sharedRenderer;
}

/**
 * Genera una vista previa en 2D Canvas de alta resolución como fallback
 * si WebGL no está disponible o en entornos sin GPU.
 */
function generate2DFallback(course, width = 480, height = 270) {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bounds = courseBounds(course);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const spanX = Math.max(bounds.maxX - bounds.minX, 4);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 4);

  const scale = Math.min((width * 0.78) / spanX, (height * 0.78) / spanZ);
  const toX = (x) => width / 2 + (x - cx) * scale;
  const toY = (z) => height / 2 + (z - cz) * scale;

  // Fondo sutil con degradado radial
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width / 2);
  bgGrad.addColorStop(0, '#162235');
  bgGrad.addColorStop(1, '#0c111a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Trazado de pista (outline)
  if (course.outline && course.outline.length > 2) {
    ctx.beginPath();
    course.outline.forEach(([x, z], i) => {
      const px = toX(x), py = toY(z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = '#225533';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
  }

  // Obstáculos de arena
  if (course.sand) {
    ctx.fillStyle = '#c9a861';
    for (const s of course.sand) {
      const sx = toX(s.x - s.w / 2), sy = toY(s.z - s.d / 2);
      ctx.fillRect(sx, sy, s.w * scale, s.d * scale);
    }
  }

  // Setas rebotadoras
  if (course.bumpers) {
    for (const b of course.bumpers) {
      ctx.beginPath();
      ctx.arc(toX(b.x), toY(b.z), Math.max(4, b.r * scale), 0, Math.PI * 2);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Tee (salida)
  ctx.beginPath();
  ctx.arc(toX(course.tee[0]), toY(course.tee[1]), 7, 0, Math.PI * 2);
  ctx.fillStyle = '#00f076';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hoyo (meta)
  ctx.beginPath();
  ctx.arc(toX(course.cup[0]), toY(course.cup[1]), 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL('image/webp', 0.9);
}

/**
 * Calcula la distancia óptima de la cámara para que toda la pista y sus
 * elementos verticales quepan perfectamente en el viewport.
 */
function fitCameraToCourse(camera, center, dir, bounds) {
  const corners = [];
  const pad = 0.35;
  const minY = -0.4, maxY = 3.2; // abarca loopings y molinos
  for (const x of [bounds.minX - pad, bounds.maxX + pad]) {
    for (const z of [bounds.minZ - pad, bounds.maxZ + pad]) {
      for (const y of [minY, maxY]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }

  let lo = 4, hi = 140;
  const v = new THREE.Vector3();
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    camera.position.copy(center).addScaledVector(dir, mid);
    camera.lookAt(center);
    camera.updateMatrixWorld();

    let fits = true;
    for (const c of corners) {
      v.copy(c).project(camera);
      // Mantener dentro de un margen seguro del 91% en horizontal y vertical
      if (v.z >= 1 || Math.abs(v.x) > 0.91 || Math.abs(v.y) > 0.91) {
        fits = false;
        break;
      }
    }
    if (fits) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Catálogo de imágenes estáticas 3D pre-renderizadas en formato WebP para carga instantánea (0 ms).
 * Cada asset se sirve directamente desde /public/courses/.
 */
export const STATIC_COURSE_PREVIEWS = {
  'La Recta': '/courses/course-1.webp',
  'El Codo': '/courses/course-2.webp',
  'Zigzag': '/courses/course-3.webp',
  'Turbo': '/courses/course-4.webp',
  'Bloques': '/courses/course-5.webp',
  'La Colina': '/courses/course-6.webp',
  'El Portal': '/courses/course-7.webp',
  'Molinos': '/courses/course-8.webp',
  'El Volcán': '/courses/course-9.webp',
  'La Herradura': '/courses/course-10.webp',
  'Looping Neón': '/courses/course-11.webp',
  'Doble Looping': '/courses/course-12.webp',
  'Molino Neón': '/courses/course-13.webp',
  'Tubos Neón': '/courses/course-14.webp',
  'El Molino': '/courses/course-15.webp',
  'Molinos de Noche': '/courses/course-16.webp',
  'Las Tuberías': '/courses/course-17.webp',
  'Looping Nocturno': '/courses/course-18.webp',
  'Desempate': '/courses/tiebreak.webp',
};

/**
 * Renderiza o devuelve la vista previa estática de un hoyo/mapa.
 * Si existe asset estático pre-renderizado, lo devuelve al instante (0 ms) sin usar Three.js.
 * Si se solicita dinámicamente o no existe asset, renderiza con WebGL y caché en memoria.
 *
 * @param {object} course Definición del hoyo (de COURSES o TIEBREAK_COURSE)
 * @param {object} options Opciones de tamaño, formato y forzado dinámico
 * @returns {string} URL de la imagen estática o data URL (WebP)
 */
export function getCoursePreview(course, { width = 480, height = 270, format = 'image/webp', quality = 0.92, forceDynamic = false } = {}) {
  if (!course) return '';

  // Usar imagen estática pre-renderizada si está disponible para apertura instantánea (0 ms)
  if (!forceDynamic) {
    if (course.previewUrl) return course.previewUrl;
    if (STATIC_COURSE_PREVIEWS[course.name]) {
      return STATIC_COURSE_PREVIEWS[course.name];
    }
  }

  const cacheKey = `${course.name}@${width}x${height}`;
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey);
  }

  const renderer = getSharedRenderer(width, height);
  if (!renderer) {
    const fallback = generate2DFallback(course, width, height);
    if (fallback) previewCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    const theme = THEMES[course.theme] ?? THEMES.meadow;
    const isNeon = !!theme.neon;

    // --- Iluminación adaptada al tema ---
    const hemiLight = new THREE.HemisphereLight(
      theme.sunColor || 0xffffff,
      theme.groundMid || 0x223344,
      1.35
    );
    scene.add(hemiLight);

    const sunDir = theme.sunDir ? new THREE.Vector3(...theme.sunDir).normalize() : new THREE.Vector3(0.5, 0.85, 0.4).normalize();
    const sun = new THREE.DirectionalLight(theme.sunColor || 0xffffff, 2.4);
    sun.position.copy(sunDir).multiplyScalar(25);
    scene.add(sun);

    // Contraluz / rim light para destacar bordes y neones
    const rimColor = theme.rim ? theme.rim[0] : (isNeon ? 0x00e5ff : 0x4fd8ff);
    const rim = new THREE.DirectionalLight(rimColor, isNeon ? 2.6 : 1.2);
    rim.position.set(-sun.position.x * 0.8, 14, -sun.position.z * 0.8);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(theme.rim ? theme.rim[1] : 0xff9a5c, 0.9);
    fill.position.set(0, 8, -18);
    scene.add(fill);

    // --- Construir la pista 3D real ---
    buildCourse(scene, course, theme);

    // --- Marcador de Salida (Tee) con bola blanca ---
    const [tx, tz] = course.tee;
    const ty = groundHeight(course, tx, tz);

    const teeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.65, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f076, side: THREE.DoubleSide })
    );
    teeRing.rotation.x = -Math.PI / 2;
    teeRing.position.set(tx, ty + 0.015, tz);
    scene.add(teeRing);

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 2.0, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 })
    );
    ballMesh.position.set(tx, ty + BALL_R * 2.0, tz);
    scene.add(ballMesh);

    // --- Marcador de Meta / Hoyo ---
    const [hx, hz] = course.cup;
    const hy = groundHeight(course, hx, hz);
    const cupRing = new THREE.Mesh(
      new THREE.RingGeometry(CUP_R * 1.3, CUP_R * 2.1, 32),
      new THREE.MeshBasicMaterial({ color: course.noCup ? 0xf59e0b : 0x38bdf8, side: THREE.DoubleSide })
    );
    cupRing.rotation.x = -Math.PI / 2;
    cupRing.position.set(hx, hy + 0.015, hz);
    scene.add(cupRing);

    // --- Encuadre de Cámara Isométrica Diorama ---
    const bounds = courseBounds(course);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const center = new THREE.Vector3(cx, 0.4, cz);

    // Ángulo isométrico elevado que mira desde detrás del Tee hacia el Hoyo
    const aspect = width / height;
    const fov = 36;
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 350);

    const yaw = -0.32; // ligera rotación diagonal (~-18.3°)
    const pitch = 0.94; // elevación isométrica (~53.8°)
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).normalize();

    const dist = fitCameraToCourse(camera, center, dir, bounds);
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);
    camera.updateMatrixWorld();

    // Renderizar
    renderer.clear();
    renderer.render(scene, camera);

    const dataUrl = renderer.domElement.toDataURL(format, quality);
    previewCache.set(cacheKey, dataUrl);

    // Liberar geometrías y materiales temporales para no saturar memoria GPU
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
        else obj.material.dispose?.();
      }
    });

    return dataUrl;
  } catch (err) {
    console.warn(`Error al renderizar vista previa de "${course.name}":`, err);
    const fallback = generate2DFallback(course, width, height);
    if (fallback) previewCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Precarga de forma progresiva las vistas previas de una lista de mapas
 * sin bloquear el hilo principal.
 *
 * @param {Array} courses Lista de cursos a precargar
 * @param {Function} onProgress Callback invocado cada vez que un mapa está listo (courseIndex, dataUrl)
 */
export function preloadCoursePreviews(courses, onProgress = null) {
  if (!Array.isArray(courses) || typeof window === 'undefined') return;

  let index = 0;
  function processNext() {
    if (index >= courses.length) return;
    const item = courses[index];
    const course = item.course || item;
    const id = item.id !== undefined ? item.id : index;

    try {
      const url = getCoursePreview(course);
      onProgress?.(id, url);
    } catch {}

    index++;
    if (index < courses.length) {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(processNext, { timeout: 60 });
      } else {
        setTimeout(processNext, 16);
      }
    }
  }

  processNext();
}

/**
 * Calcula la distancia aproximada de tiro recto en metros entre el Tee y el Hoyo.
 *
 * @param {object} course Definición del mapa
 * @returns {number} Distancia en metros redondeada a un decimal
 */
export function getCourseDistance(course) {
  if (!course || !course.tee || !course.cup) return 0;
  const dx = course.cup[0] - course.tee[0];
  const dz = course.cup[1] - course.tee[1];
  return Math.round(Math.hypot(dx, dz) * 10) / 10;
}
