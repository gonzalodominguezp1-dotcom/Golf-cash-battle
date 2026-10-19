// Webhook de NOWPayments. Comprueba la firma HMAC-SHA512 y, si el pago está
// terminado y cuadra con el depósito, acredita el saldo (una sola vez).
import { createClient } from 'npm:@supabase/supabase-js@2';

// NOWPayments firma el JSON con las claves ordenadas
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
      : v;

async function hmac512(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('NOWPAYMENTS_IPN_SECRET');
  if (!secret) return new Response('not configured', { status: 503 });

  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const expected = await hmac512(secret, JSON.stringify(sortKeys(body)));
  if (!safeEqual(expected, (req.headers.get('x-nowpayments-sig') ?? '').toLowerCase())) {
    return new Response('bad signature', { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const depositId = String(body.order_id ?? '');
  const { data: dep } = await admin.from('deposits').select('id,amount').eq('id', depositId).maybeSingle();
  if (!dep) return new Response('unknown order', { status: 404 });

  let status = String(body.payment_status ?? 'unknown');
  // si el importe de la factura no cuadra no se acredita
  if (Number(body.price_amount) !== Number(dep.amount) || String(body.price_currency).toLowerCase() !== 'usd') {
    status = 'mismatch';
  }
  const { data, error } = await admin.rpc('credit_deposit', {
    p_deposit: dep.id,
    p_payment_id: String(body.payment_id ?? ''),
    p_status: status,
    p_raw: body,
  });
  if (error) return new Response('db error', { status: 500 });
  return new Response(String(data), { status: 200 });
});
