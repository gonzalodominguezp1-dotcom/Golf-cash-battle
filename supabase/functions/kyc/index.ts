// Verificación de edad e identidad.
//
//   POST /kyc            { action: 'start', returnUrl }  → abre la verificación
//   POST /kyc            { action: 'stub', birthdate, document }  → solo modo pruebas
//   POST /kyc/webhook    aviso firmado del proveedor con el resultado
//
// Con DIDIT_API_KEY y DIDIT_WORKFLOW_ID usa Didit (foto del documento + selfie).
// Sin ellos funciona en modo pruebas: el jugador escribe su fecha de nacimiento
// y un número de documento y se da por verificado. Sirve para probar el flujo
// mientras no haya dinero real; antes de eso hay que poner las claves de Didit.
//
// No se guarda el número de documento: solo un hash para que una misma persona
// no pueda tener dos cuentas verificadas.
//
// verify_jwt está desactivado porque el proveedor llama al webhook sin sesión;
// las demás acciones comprueban el usuario aquí.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { didit, identityHash, type KycProvider } from './providers.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const provider: KycProvider | null = didit();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (new URL(req.url).pathname.endsWith('/webhook')) return webhook(req);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: 'not_authenticated' }, 401);
  // primero cuenta con email confirmado: así la verificación queda ligada a algo recuperable
  if (user.is_anonymous || !user.email || !user.email_confirmed_at) return json({ error: 'account_required' }, 403);

  const { data: profile } = await admin.from('profiles').select('kyc_status').eq('id', user.id).single();
  if (profile?.kyc_status === 'verified') return json({ status: 'verified' });

  const body = await req.json().catch(() => ({}));

  if (body.action === 'start') {
    if (!provider) return json({ mode: 'stub' });
    const back = typeof body.returnUrl === 'string' && /^https?:\/\//.test(body.returnUrl) ? body.returnUrl : undefined;
    try {
      const s = await provider.start(user.id, back);
      const { error } = await admin.rpc('_kyc_open', { p_user: user.id, p_provider: provider.name, p_ref: s.ref });
      if (error) throw error;
      return json({ mode: provider.name, url: s.url });
    } catch (e) {
      console.error('kyc start', e);
      return json({ error: 'provider_error' }, 502);
    }
  }

  if (body.action === 'stub') {
    if (provider) return json({ error: 'stub_disabled' }, 403);
    const birthdate = typeof body.birthdate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthdate) ? body.birthdate : null;
    const doc = typeof body.document === 'string' ? body.document.trim() : '';
    if (!birthdate || Number.isNaN(Date.parse(birthdate)) || doc.length < 5 || doc.length > 32) {
      return json({ error: 'bad_request' }, 400);
    }
    const ref = crypto.randomUUID();
    const open = await admin.rpc('_kyc_open', { p_user: user.id, p_provider: 'stub', p_ref: ref });
    if (open.error) return json({ error: 'db_error' }, 500);
    const { data: status, error } = await admin.rpc('_kyc_result', {
      p_provider: 'stub',
      p_ref: ref,
      p_status: 'verified',
      p_birthdate: birthdate,
      p_identity_hash: await identityHash('stub', doc),
      p_raw: { mode: 'stub' },
    });
    if (error) return json({ error: 'db_error' }, 500);
    return json({ status });
  }

  return json({ error: 'bad_request' }, 400);
});

async function webhook(req: Request) {
  if (!provider) return json({ error: 'not_configured' }, 503);
  const raw = await req.text();
  const result = await provider.parseWebhook(raw, req.headers);
  if (!result) return json({ error: 'bad_signature' }, 401);
  // estados intermedios (en curso, en revisión manual…): se espera al final
  if (result.status === 'pending') return json({ ok: true });
  const { error } = await admin.rpc('_kyc_result', {
    p_provider: provider.name,
    p_ref: result.ref,
    p_status: result.status,
    p_birthdate: result.birthdate,
    p_identity_hash: result.identity,
    p_raw: result.raw,
  });
  if (error) {
    // una sesión que no es nuestra no se reintenta
    if (error.message === 'session_not_found') return json({ ok: false });
    return json({ error: 'db_error' }, 500);
  }
  return json({ ok: true });
}
