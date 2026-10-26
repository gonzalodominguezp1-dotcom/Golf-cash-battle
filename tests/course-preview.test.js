import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';
import { getCoursePreview, getCourseDistance, preloadCoursePreviews } from '../src/game/render/coursePreview.js';

test('cálculo de distancia tee-hoyo para todos los mapas', () => {
  // Hoyo 1: La Recta (tee [0, 11.5], cup [0, -11] => 22.5m)
  const d1 = getCourseDistance(COURSES[0]);
  assert.equal(d1, 22.5);

  // Desempate: tee [0, 9], cup [0, -6] => 15m
  const dtb = getCourseDistance(TIEBREAK_COURSE);
  assert.equal(dtb, 15);

  // Verificar que todos los hoyos tienen distancias positivas y coherentes
  for (let i = 0; i < COURSES.length; i++) {
    const dist = getCourseDistance(COURSES[i]);
    assert.ok(typeof dist === 'number' && dist >= 4 && dist < 35, `distancia de hoyo ${i + 1} debe ser coherente: ${dist}m`);
  }
});

test('getCoursePreview maneja entradas nulas o indefinidas sin fallar', () => {
  assert.equal(getCoursePreview(null), '');
  assert.equal(getCoursePreview(undefined), '');
  assert.equal(getCourseDistance(null), 0);
  assert.equal(getCourseDistance({}), 0);
});

test('preloadCoursePreviews ejecuta sin errores en entornos seguros', () => {
  assert.doesNotThrow(() => {
    preloadCoursePreviews(null);
    preloadCoursePreviews([]);
    preloadCoursePreviews(COURSES);
  });
});

test('getCoursePreview devuelve rutas estáticas WebP para los 20 hoyos y el desempate (0 ms)', () => {
  for (let i = 0; i < COURSES.length; i++) {
    const preview = getCoursePreview(COURSES[i]);
    assert.equal(preview, `/courses/course-${i + 1}.webp`, `El hoyo ${i + 1} (${COURSES[i].name}) debe usar /courses/course-${i + 1}.webp`);
  }

  const tbPreview = getCoursePreview(TIEBREAK_COURSE);
  assert.equal(tbPreview, '/courses/tiebreak.webp', 'El desempate debe usar /courses/tiebreak.webp');
});

