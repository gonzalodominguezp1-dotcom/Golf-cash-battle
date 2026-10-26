// Parte ligera (sin three.js) de las vistas previas de mapas: el catálogo de WebP
// pre-renderizados de /public/courses y la distancia tee-hoyo. coursePreview.js la reexporta.

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
  'El Molino del Prado': '/courses/course-19.webp',
  'Desempate': '/courses/tiebreak.webp',
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
