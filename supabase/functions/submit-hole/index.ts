// Recibe los golpes de un hoyo de torneo, los repite con la misma física del
// juego y guarda los golpes que salen. El cliente nunca dice cuántos golpes
// hizo: solo qué tiros soltó y en qué momento.
//
// Si el cliente se quedó sin tiempo (end: el paso en el que acabó el contador
// de 20 s), lo que no entre hasta ese paso queda descalificado con el máximo.
// También se guarda el paso en el que entró la bola: al cerrar el torneo, quien
// emboque más de 20 s después del más rápido queda descalificado en ese hoyo.
//
// Además guarda las señales del antibots (cuánto tarda en tirar, si arrastra
// el dedo) y recalcula la nota de riesgo del jugador antes de apuntar el hoyo.
//
// Las carpetas game/ y antibot/ son copias de src (pnpm run sync:functions).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { COURSES, TIEBREAK_COURSE } from './game/courses.js';
import { replayHole } from './game/replay.js';
import { assessRisk, holeSignals } from './antibot/risk.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null);
  const { tournament, hole, shots, aim, end } = body ?? {};
  if (typeof tournament !== 'string' || !Number.isInteger(hole) || hole < 0 || !Array.isArray(shots) || shots.length > 8 ||
      (end != null && !Number.isInteger(end))) {
    return json({ error: 'bad_request' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: 'not_authenticated' }, 401);

  const [{ data: t }, { data: cfg }] = await Promise.all([
    admin.from('tournaments').select('courses').eq('id', tournament).maybeSingle(),
    admin.from('app_config').select('value').eq('key', 'max_strokes').single(),
  ]);
  if (!t) return json({ error: 'match_not_found' }, 404);
  const courseIndex = hole < t.courses.length ? t.courses[hole] : -1;
  const course = hole < t.courses.length ? COURSES[courseIndex] : hole === t.courses.length ? TIEBREAK_COURSE : null;
  if (!course) return json({ error: 'wrong_hole' }, 400);

  const clean = shots.map((s: { tick: unknown; yaw: unknown; power: unknown }) => ({ tick: s?.tick, yaw: s?.yaw, power: s?.power }));
  const r = replayHole(course, clean, { maxStrokes: Number(cfg?.value ?? 8), endTick: course.noCup ? null : end ?? null });
  if (!r.ok) return json({ error: 'invalid_shots', reason: 'reason' in r ? r.reason : null }, 422);

  // el antibots no debe impedir apuntar el hoyo si falla
  try {
    await checkRisk(admin, auth.user.id, tournament, hole, courseIndex, r, Array.isArray(aim) ? aim.slice(0, 8) : []);
  } catch (e) {
    console.error('antibot', e);
  }

  const { data, error } = await admin.rpc('_record_timed_hole', {
    p_user: auth.user.id,
    p_t: tournament,
    p_hole: hole,
    p_shots: clean,
    p_strokes: r.strokes,
    p_distance: r.distance,
    p_sunk_tick: r.sunkTick ?? null,
    p_dq: !!r.timedOut,
  });
  if (error) return json({ error: /^[a-z_]+$/.test(error.message) ? error.message : 'db_error' }, 409);
  return json({ strokes: r.strokes, distance: r.distance, timed_out: !!r.timedOut, tournament: data });
});

// deno-lint-ignore no-explicit-any
async function checkRisk(admin: any, user: string, tournament: string, hole: number, course: number, replay: any, aim: unknown[]) {
  const sig = holeSignals(replay, aim);
  const rec = await admin.rpc('_record_signals', {
    p_user: user,
    p_t: tournament,
    p_hole: hole,
    p_course: course,
    p_strokes: replay.strokes,
    p_waits: sig.waits,
    p_drags: sig.drags,
    p_turns: sig.turns,
  });
  if (rec.error) throw rec.error;
  const { data: input, error } = await admin.rpc('_risk_inputs', { p_user: user });
  if (error) throw error;
  const holes = input.holes.map((h: { course: number; strokes: number; waits: number[]; drags: (number | null)[] }) => ({
    ...h,
    par: h.course >= 0 ? COURSES[h.course]?.par ?? 3 : 0,
  }));
  const risk = assessRisk(holes, input.baseline, input.rules ?? {});
  const set = await admin.rpc('_set_risk', { p_user: user, p_score: risk.score, p_flags: risk.flags, p_stats: risk.stats });
  if (set.error) throw set.error;
}
