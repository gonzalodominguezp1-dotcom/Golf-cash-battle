// Proveedores de verificación de identidad. Cambiar de proveedor (Veriff,
// Sumsub…) es escribir otro objeto con esta misma forma.

export type KycResult = {
  ref: string; // id de la sesión en el proveedor
  status: 'verified' | 'rejected' | 'pending';
  birthdate: string | null; // AAAA-MM-DD
  identity: string | null; // hash del documento
  raw: Record<string, unknown>; // lo justo para auditar, sin datos del documento
};

export type KycProvider = {
  name: string;
  start(userId: string, returnUrl?: string): Promise<{ ref: string; url: string }>;
  /** null si la firma no es válida. */
  parseWebhook(raw: string, headers: Headers): Promise<KycResult | null>;
};

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function identityHash(...parts: string[]) {
  const norm = parts.map((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, '')).join(':');
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`golf-kyc:${norm}`)));
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Didit (didit.me): documento + selfie + prueba de vida. Necesita DIDIT_API_KEY,
 * DIDIT_WORKFLOW_ID y DIDIT_WEBHOOK_SECRET; el webhook se configura en su
 * consola apuntando a <SUPABASE_URL>/functions/v1/kyc/webhook.
 * Con una aplicación sandbox de Didit no se cobra nada.
 */
export function didit(): KycProvider | null {
  const apiKey = Deno.env.get('DIDIT_API_KEY');
  const workflow = Deno.env.get('DIDIT_WORKFLOW_ID');
  const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET');
  if (!apiKey || !workflow || !secret) return null;
  const api = Deno.env.get('DIDIT_API_URL') ?? 'https://verification.didit.me/v3/session/';

  return {
    name: 'didit',

    async start(userId, returnUrl) {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflow, vendor_data: userId, callback: returnUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.session_id || !data?.url) throw new Error(`didit ${res.status}`);
      return { ref: String(data.session_id), url: String(data.url) };
    },

    async parseWebhook(raw, headers) {
      const sig = headers.get('x-signature') ?? '';
      const ts = Number(headers.get('x-timestamp'));
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return null;
      if (!sameText(sig.toLowerCase(), await hmac(secret, raw))) return null;
      const body = JSON.parse(raw);
      const status = body.status === 'Approved' ? 'verified' : body.status === 'Declined' ? 'rejected' : 'pending';
      const d = body.decision ?? {};
      const id = d.id_verifications?.[0] ?? d.id_verification ?? {};
      const doc = id.document_number ?? id.personal_number ?? null;
      const country = id.issuing_state ?? id.issuing_country ?? id.nationality ?? '';
      return {
        ref: String(body.session_id),
        status,
        birthdate: typeof id.date_of_birth === 'string' ? id.date_of_birth.slice(0, 10) : null,
        identity: doc ? await identityHash('didit', String(country), String(doc)) : null,
        raw: { status: body.status, environment: body.environment ?? null, webhook_type: body.webhook_type ?? null },
      };
    },
  };
}
