/*
 * Edge Function: deuna-webhook
 *
 * Receives payment confirmation webhooks from De Una and:
 *   1. Verifies HMAC-SHA256 signature using DEUNA_WEBHOOK_SECRET
 *   2. Looks up the payment row by provider_transaction_id
 *   3. Calls confirm_enrollment_from_webhook() RPC (atomic, FOR UPDATE locked)
 *   4. Updates payments.status to 'completed' or 'refund_required'
 *   5. Returns 200 in all handled cases (De Una retries on non-2xx)
 *
 * Response is always 200 except:
 *   401 — invalid signature
 *   404 — payment not found (De Una sent a paymentId we don't know)
 *   500 — unexpected DB error
 *
 * Idempotency: if payments.status is already 'completed', we skip the RPC
 * and return 200 immediately.
 *
 * Deployment env vars:
 *   DEUNA_WEBHOOK_SECRET      HMAC secret from De Una Negocios dashboard
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeunaWebhookDeps {
  supabase: any;
  verifySignature: (payload: string, signature: string, secret: string) => Promise<boolean>;
  webhookSecret: string;
}

type RpcResult = 'confirmed' | 'overfull' | 'cancelled';

const COMPLETED_EVENTS = new Set(['payment.completed', 'payment.success']);
const FAILED_EVENTS    = new Set(['payment.failed', 'payment.expired']);

// ---------------------------------------------------------------------------
// Core handler (exported for testing)
// ---------------------------------------------------------------------------

export async function handleDeunaWebhook(
  body: Record<string, unknown>,
  signature: string,
  deps: DeunaWebhookDeps,
): Promise<Response> {
  const { supabase, verifySignature, webhookSecret } = deps;

  // ── 1. Verify HMAC signature ─────────────────────────────────────────────
  const rawBody = JSON.stringify(body);
  const valid = await verifySignature(rawBody, signature, webhookSecret);
  if (!valid) {
    return json({ error: 'invalid_signature' }, 401);
  }

  // ── 2. Route by event type ───────────────────────────────────────────────
  const event = body.event as string;
  const isCompletion = COMPLETED_EVENTS.has(event);
  const isFailure    = FAILED_EVENTS.has(event);

  if (!isCompletion && !isFailure) {
    return json({ ok: true, ignored: true }, 200);
  }

  const paymentId = body.paymentId as string;
  if (!paymentId) {
    return json({ error: 'missing_paymentId' }, 400);
  }

  // ── 3. Look up payment row ───────────────────────────────────────────────
  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('id, enrollment_id, match_id, status')
    .eq('provider_transaction_id', paymentId)
    .single();

  if (paymentErr || !payment) {
    return json({ error: 'payment_not_found' }, 404);
  }

  // ── 4. Idempotency guard ─────────────────────────────────────────────────
  if (payment.status === 'completed') {
    return json({ ok: true, already_processed: true }, 200);
  }

  // ── 5a. Failed / expired path ────────────────────────────────────────────
  if (isFailure) {
    await supabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('id', payment.id);

    // Cancel the enrollment — De Una failure means the player did not pay.
    // They must re-enroll to try again. This frees the slot immediately for
    // other players. In-person flow is separate and unaffected.
    await supabase
      .from('enrollments')
      .update({ status: 'cancelled' })
      .eq('id', payment.enrollment_id);

    return json({ ok: true, slot_freed: true }, 200);
  }

  // ── 5b. Call atomic RPC (completion path) ────────────────────────────────
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    'confirm_enrollment_from_webhook',
    { p_enrollment_id: payment.enrollment_id, p_match_id: payment.match_id },
  );

  if (rpcErr) {
    return json({ error: 'rpc_error' }, 500);
  }

  const result = rpcResult as RpcResult;
  const refundRequired = result === 'overfull' || result === 'cancelled';

  // ── 6. Update payment status ─────────────────────────────────────────────
  await supabase
    .from('payments')
    .update({ status: refundRequired ? 'refund_required' : 'completed' })
    .eq('id', payment.id);

  return json({ ok: true, ...(refundRequired ? { refund_required: true } : {}) }, 200);
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 signature verification
// ---------------------------------------------------------------------------

async function verifyDeunaSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = hexToBytes(signature);
    return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Deno HTTP entry point
// ---------------------------------------------------------------------------

if (import.meta.main) Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const signature = req.headers.get('x-deuna-signature') ?? '';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  return handleDeunaWebhook(body, signature, {
    supabase,
    verifySignature: verifyDeunaSignature,
    webhookSecret: Deno.env.get('DEUNA_WEBHOOK_SECRET') ?? '',
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
