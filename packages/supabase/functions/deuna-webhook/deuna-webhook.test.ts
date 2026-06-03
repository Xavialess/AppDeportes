/**
 * Tests for deuna-webhook Edge Function
 *
 * Run: cd packages/supabase/functions && deno test --allow-env deuna-webhook/deuna-webhook.test.ts
 *
 * All Supabase RPC calls and HMAC verification are mocked — no DB or network needed.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleDeunaWebhook, type DeunaWebhookDeps } from './index.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PAYMENT_ID     = 'deuna-intent-001';
const VALID_ENROLLMENT_ID  = 'enrollment-uuid-001';
const VALID_MATCH_ID       = 'match-uuid-001';
const VALID_SIGNATURE      = 'valid-hmac-signature';
const VALID_SECRET         = 'test-webhook-secret';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    event:      'payment.completed',
    paymentId:  VALID_PAYMENT_ID,
    status:     'COMPLETED',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DeunaWebhookDeps> = {}): DeunaWebhookDeps {
  return {
    supabase:           makeHappySupabase(),
    verifySignature:    () => Promise.resolve(true),
    webhookSecret:      VALID_SECRET,
    ...overrides,
  };
}

function makeHappySupabase() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => {
            if (table === 'payments') {
              return Promise.resolve({
                data: {
                  id:            'payment-row-001',
                  enrollment_id: VALID_ENROLLMENT_ID,
                  match_id:      VALID_MATCH_ID,
                  status:        'pending',
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: { message: 'not found' } });
          },
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
    rpc: (_fn: string, _params: unknown) =>
      Promise.resolve({ data: 'confirmed', error: null }),
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

Deno.test('returns 200 and confirms enrollment on payment.completed', async () => {
  const result = await handleDeunaWebhook(
    makeBody(),
    VALID_SIGNATURE,
    makeDeps(),
  );
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
});

Deno.test('accepts payment.success as an alias for payment.completed', async () => {
  const result = await handleDeunaWebhook(
    makeBody({ event: 'payment.success' }),
    VALID_SIGNATURE,
    makeDeps(),
  );
  assertEquals(result.status, 200);
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

Deno.test('returns 401 when signature verification fails', async () => {
  const deps = makeDeps({ verifySignature: () => Promise.resolve(false) });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 401);
  const body = await result.json();
  assertEquals(body.error, 'invalid_signature');
});

// ---------------------------------------------------------------------------
// Ignored event types
// ---------------------------------------------------------------------------

Deno.test('returns 200 (ignored) for unrecognised event types', async () => {
  const result = await handleDeunaWebhook(
    makeBody({ event: 'payment.refunded' }),
    VALID_SIGNATURE,
    makeDeps(),
  );
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.ignored, true);
});

// ---------------------------------------------------------------------------
// Failed / expired path
// ---------------------------------------------------------------------------

Deno.test('returns 200 with retryable=true on payment.failed', async () => {
  const result = await handleDeunaWebhook(
    makeBody({ event: 'payment.failed' }),
    VALID_SIGNATURE,
    makeDeps(),
  );
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.retryable, true);
});

Deno.test('returns 200 with retryable=true on payment.expired', async () => {
  const result = await handleDeunaWebhook(
    makeBody({ event: 'payment.expired' }),
    VALID_SIGNATURE,
    makeDeps(),
  );
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.retryable, true);
});

// ---------------------------------------------------------------------------
// Payment lookup failures
// ---------------------------------------------------------------------------

Deno.test('returns 404 when payment not found for paymentId', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'not found', code: 'PGRST116' } }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    } as any,
  });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 404);
  const body = await result.json();
  assertEquals(body.error, 'payment_not_found');
});

// ---------------------------------------------------------------------------
// RPC results
// ---------------------------------------------------------------------------

Deno.test('returns 200 when RPC returns overfull (triggers payment update to refund)', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      rpc: () => Promise.resolve({ data: 'overfull', error: null }),
    } as any,
  });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.refund_required, true);
});

Deno.test('returns 200 when RPC returns cancelled (player withdrew, refund needed)', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      rpc: () => Promise.resolve({ data: 'cancelled', error: null }),
    } as any,
  });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.refund_required, true);
});

// ---------------------------------------------------------------------------
// RPC failure
// ---------------------------------------------------------------------------

Deno.test('returns 500 when RPC call fails with a DB error', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      rpc: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
    } as any,
  });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 500);
  const body = await result.json();
  assertEquals(body.error, 'rpc_error');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

Deno.test('returns 200 (already processed) when payment is already confirmed', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => {
              if (table === 'payments') {
                return Promise.resolve({
                  data: {
                    id:            'payment-row-001',
                    enrollment_id: VALID_ENROLLMENT_ID,
                    match_id:      VALID_MATCH_ID,
                    status:        'completed',
                  },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: { message: 'not found' } });
            },
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    } as any,
  });
  const result = await handleDeunaWebhook(makeBody(), VALID_SIGNATURE, deps);
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.ok, true);
  assertEquals(body.already_processed, true);
});
