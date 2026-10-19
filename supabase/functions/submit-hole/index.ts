// Recibe los golpes de un hoyo de torneo, los repite con la misma física del
// juego y guarda los golpes que salen. El cliente nunca dice cuántos golpes
// hizo: solo qué tiros soltó y en qué momento.
//
// La carpeta game/ es una copia de src/game (npm run sync:functions).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { COURSES, TIEBREAK_COURSE } from './game/courses.js';
import { replayHole } from './game/replay.js';

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
  const { tournament, hole, shots } = body ?? {};
  if (typeof tournament !== 'string' || !Number.isInteger(hole) || hole < 0 || !Array.isArray(shots) || shots.length > 8) {
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
  const course = hole < t.courses.length ? COURSES[t.courses[hole]] : hole === t.courses.length ? TIEBREAK_COURSE : null;
  if (!course) return json({ error: 'wrong_hole' }, 400);

  const clean = shots.map((s: { tick: unknown; yaw: unknown; power: unknown }) => ({ tick: s?.tick, yaw: s?.yaw, power: s?.power }));
  const r = replayHole(course, clean, { maxStrokes: Number(cfg?.value ?? 8) });
  if (!r.ok) return json({ error: 'invalid_shots', reason: r.reason }, 422);

  const { data, error } = await admin.rpc('_record_hole', {
    p_user: auth.user.id,
    p_t: tournament,
    p_hole: hole,
    p_shots: clean,
    p_strokes: r.strokes,
    p_distance: r.distance,
  });
  if (error) return json({ error: /^[a-z_]+$/.test(error.message) ? error.message : 'db_error' }, 409);
  return json({ strokes: r.strokes, distance: r.distance, tournament: data });
});
