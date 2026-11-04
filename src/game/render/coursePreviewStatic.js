// Parte ligera (sin three.js) de las vistas previas de mapas: el catálogo de WebP
// pre-renderizados de /public/courses y la distancia tee-hoyo. coursePreview.js la reexporta.

/**
 * Catálogo de imágenes estáticas 3D pre-renderizadas en formato WebP para carga instantánea (0 ms).
 * Cada asset se sirve directamente desde /public/courses/.
 */
// rutas relativas en las builds de portal (base './'); en Node (tests) no hay import.meta.env
const BASE = import.meta.env?.BASE_URL ?? '/';

export const STATIC_COURSE_PREVIEWS = {
  'Zigzag': BASE + 'courses/course-1.webp',
  'Turbo': BASE + 'courses/course-2.webp',
  'Bloques': BASE + 'courses/course-3.webp',
  'El Portal': BASE + 'courses/course-4.webp',
  'Molinos': BASE + 'courses/course-5.webp',
  'La Herradura': BASE + 'courses/course-6.webp',
  'Looping Neón': BASE + 'courses/course-7.webp',
  'Doble Looping': BASE + 'courses/course-8.webp',
  'Tubos Neón': BASE + 'courses/course-9.webp',
  'Molinos de Noche': BASE + 'courses/course-10.webp',
  'Las Tuberías': BASE + 'courses/course-11.webp',
  'Dentro del Volcán': BASE + 'courses/course-12.webp',
  'El Molino del Prado': BASE + 'courses/course-13.webp',
  'El Abismo': BASE + 'courses/course-14.webp',
  'Cyberpunk2078': BASE + 'courses/course-15.webp',
  'El Templo de la Selva': BASE + 'courses/course-16.webp',
  'El Glaciar': BASE + 'courses/course-17.webp',
  'Desempate': BASE + 'courses/tiebreak.webp',
};

/** URL de la imagen estática de un mapa, o null si no tiene (hay que renderizarla con coursePreview.js). */
export function staticCoursePreview(course) {
  if (!course) return null;
  return course.previewUrl || STATIC_COURSE_PREVIEWS[course.name] || null;
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
