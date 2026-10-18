// Crea un depósito en cripto: guarda el depósito pendiente y pide a
// NOWPayments una factura. El saldo NO se toca aquí; lo acredita el webhook.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);
  const sandbox = Deno.env.get('NOWPAYMENTS_SANDBOX') !== 'false';
  const base = sandbox ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: 'not_authenticated' }, 401);

  const { amount, returnUrl } = await req.json().catch(() => ({}));
  const { data: cfg } = await admin.from('app_config').select('key,value').in('key', ['crypto_min_deposit', 'crypto_max_deposit']);
  const limit = (k: string) => Number(cfg?.find((c) => c.key === k)?.value);
  if (!Number.isFinite(amount) || amount < limit('crypto_min_deposit') || amount > limit('crypto_max_deposit')) {
    return json({ error: 'invalid_amount' }, 400);
  }

  const { data: dep, error } = await admin
    .from('deposits')
    .insert({ user_id: auth.user.id, amount, sandbox })
    .select('id')
    .single();
  if (error) return json({ error: 'db_error' }, 500);

  const back = typeof returnUrl === 'string' && /^https?:\/\//.test(returnUrl) ? returnUrl : undefined;
  const res = await fetch(`${base}/v1/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: 'usd',
      order_id: dep.id,
      order_description: `Golf Cash Battle · ${amount} créditos`,
      ipn_callback_url: `${url}/functions/v1/nowpayments-ipn`,
      success_url: back,
      cancel_url: back,
    }),
  });
  const invoice = await res.json().catch(() => null);
  if (!res.ok || !invoice?.invoice_url) {
    await admin.from('deposits').update({ status: 'failed', raw: invoice }).eq('id', dep.id);
    return json({ error: 'provider_error' }, 502);
  }
  await admin.from('deposits').update({ provider_invoice_id: String(invoice.id) }).eq('id', dep.id);
  return json({ depositId: dep.id, invoiceUrl: invoice.invoice_url, sandbox });
});
