/**
 * Tests for create-deuna-payment Edge Function
 *
 * Run: deno test --allow-env packages/supabase/functions/create-deuna-payment/create-deuna-payment.test.ts
 *
 * All Supabase calls are mocked — no database or network required.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleCreateDeunaPayment, type CreateDeunaPaymentDeps } from './index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ENROLLMENT_ID = 'enrollment-uuid-001';
const VALID_MATCH_ID      = 'match-uuid-001';
const VALID_PLAYER_ID     = 'player-uuid-001';
const VALID_OWNER_ID      = 'owner-uuid-001';

/** Build a minimal mock deps object, overriding only what a test needs. */
function makeDeps(overrides: Partial<CreateDeunaPaymentDeps> = {}): CreateDeunaPaymentDeps {
  return {
    supabase: makeHappySupabase(),
    deunaApi: makeHappyDeunaApi(),
    authUserId: VALID_PLAYER_ID,
    ...overrides,
  };
}

/** Supabase mock that returns valid happy-path data for all queries. */
function makeHappySupabase() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          single: () => {
            if (table === 'enrollments') {
              return Promise.resolve({
                data: {
                  id: VALID_ENROLLMENT_ID,
                  match_id: VALID_MATCH_ID,
                  user_id: VALID_PLAYER_ID,
                  status: 'pending',
                },
                error: null,
              });
            }
            if (table === 'matches') {
              return Promise.resolve({
                data: {
                  id: VALID_MATCH_ID,
                  status: 'open',
                  price_per_player: 5.00,
                  max_players: 10,
                  fields: {
                    clubs: {
                      owner_profiles: {
                        user_id: VALID_OWNER_ID,
                        deuna_merchant_id: 'merchant-123',
                        deuna_phone_linked: '+593991234567',
                      },
                    },
                  },
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: { message: 'not found' } });
          },
        }),
        // for checking existing completed payments
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { id: 'payment-uuid-001' },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

/** De Una API mock that returns a successful payment intent. */
function makeHappyDeunaApi() {
  return {
    createPaymentIntent: (_params: unknown) =>
      Promise.resolve({
        ok: true,
        paymentId: 'deuna-intent-001',
        qrBase64: 'base64encodedqrimage==',
        paymentUrl: 'deuna://pay/deuna-intent-001',
        expiresAt: '2026-06-02T18:00:00Z',
      }),
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

Deno.test('returns QR data on successful payment intent creation', async () => {
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, makeDeps());

  assertEquals(result.status, 200);
  const body = await result.json();
  assertExists(body.qr_base64);
  assertExists(body.payment_url);
  assertExists(body.payment_intent_id);
  assertExists(body.expires_at);
  assertEquals(body.payment_intent_id, 'deuna-intent-001');
});

// ---------------------------------------------------------------------------
// Auth failures
// ---------------------------------------------------------------------------

Deno.test('returns 403 when caller is not the enrolled player', async () => {
  const deps = makeDeps({ authUserId: 'different-player-uuid' });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 403);
});

// ---------------------------------------------------------------------------
// Enrollment validation
// ---------------------------------------------------------------------------

Deno.test('returns 404 when enrollment not found', async () => {
  const deps = makeDeps({
    supabase: {
      ...makeHappySupabase(),
      from: (table: string) => ({
        ...makeHappySupabase().from(table),
        select: () => ({
          eq: () => ({
            single: () =>
              table === 'enrollments'
                ? Promise.resolve({ data: null, error: { message: 'not found', code: 'PGRST116' } })
                : makeHappySupabase().from(table).select().eq('', '').single(),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    } as any,
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 404);
});

Deno.test('returns 400 when enrollment is cancelled', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithEnrollmentStatus('cancelled'),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'enrollment_not_active');
});

Deno.test('returns 400 when enrollment is already confirmed (already paid)', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithEnrollmentStatus('confirmed'),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'already_paid');
});

// ---------------------------------------------------------------------------
// Match validation
// ---------------------------------------------------------------------------

Deno.test('returns 400 when match is not enrollable (jugado)', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithMatchStatus('jugado'),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'match_not_enrollable');
});

Deno.test('returns 400 when match is cancelled', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithMatchStatus('cancelled'),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'match_not_enrollable');
});

Deno.test('returns 400 when match price_per_player is null', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithMatchPrice(null),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'no_price_set');
});

// ---------------------------------------------------------------------------
// Owner credential validation
// ---------------------------------------------------------------------------

Deno.test('returns 400 when owner has no deuna_merchant_id', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithOwnerCredentials(null, '+593991234567'),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'owner_deuna_not_configured');
});

Deno.test('returns 400 when owner has no deuna_phone_linked', async () => {
  const deps = makeDeps({
    supabase: makeSupabaseWithOwnerCredentials('merchant-123', null),
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 400);
  const body = await result.json();
  assertEquals(body.error, 'owner_deuna_not_configured');
});

// ---------------------------------------------------------------------------
// De Una API failures
// ---------------------------------------------------------------------------

Deno.test('returns 503 when De Una API returns an error', async () => {
  const deps = makeDeps({
    deunaApi: {
      createPaymentIntent: () =>
        Promise.resolve({ ok: false, error: 'upstream_error' }),
    },
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 503);
  const body = await result.json();
  assertEquals(body.error, 'deuna_api_error');
});

Deno.test('returns 503 when De Una API throws (network error)', async () => {
  const deps = makeDeps({
    deunaApi: {
      createPaymentIntent: () => Promise.reject(new Error('fetch failed')),
    },
  });
  const result = await handleCreateDeunaPayment(VALID_ENROLLMENT_ID, deps);
  assertEquals(result.status, 503);
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSupabaseWithEnrollmentStatus(status: string) {
  const base = makeHappySupabase();
  return {
    ...base,
    from: (table: string) => {
      const baseTable = base.from(table);
      if (table !== 'enrollments') return baseTable;
      return {
        ...baseTable,
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: VALID_ENROLLMENT_ID,
                  match_id: VALID_MATCH_ID,
                  user_id: VALID_PLAYER_ID,
                  status,
                },
                error: null,
              }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      };
    },
  } as any;
}

function makeSupabaseWithMatchStatus(status: string) {
  const base = makeHappySupabase();
  return {
    ...base,
    from: (table: string) => {
      const baseTable = base.from(table);
      if (table !== 'matches') return baseTable;
      return {
        ...baseTable,
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: VALID_MATCH_ID,
                  status,
                  price_per_player: 5.00,
                  max_players: 10,
                  fields: {
                    clubs: {
                      owner_profiles: {
                        user_id: VALID_OWNER_ID,
                        deuna_merchant_id: 'merchant-123',
                        deuna_phone_linked: '+593991234567',
                      },
                    },
                  },
                },
                error: null,
              }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      };
    },
  } as any;
}

function makeSupabaseWithMatchPrice(price: number | null) {
  const base = makeHappySupabase();
  return {
    ...base,
    from: (table: string) => {
      const baseTable = base.from(table);
      if (table !== 'matches') return baseTable;
      return {
        ...baseTable,
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: VALID_MATCH_ID,
                  status: 'open',
                  price_per_player: price,
                  max_players: 10,
                  fields: {
                    clubs: {
                      owner_profiles: {
                        user_id: VALID_OWNER_ID,
                        deuna_merchant_id: 'merchant-123',
                        deuna_phone_linked: '+593991234567',
                      },
                    },
                  },
                },
                error: null,
              }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      };
    },
  } as any;
}

function makeSupabaseWithOwnerCredentials(
  merchantId: string | null,
  phone: string | null,
) {
  const base = makeHappySupabase();
  return {
    ...base,
    from: (table: string) => {
      const baseTable = base.from(table);
      if (table !== 'matches') return baseTable;
      return {
        ...baseTable,
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: VALID_MATCH_ID,
                  status: 'open',
                  price_per_player: 5.00,
                  max_players: 10,
                  fields: {
                    clubs: {
                      owner_profiles: {
                        user_id: VALID_OWNER_ID,
                        deuna_merchant_id: merchantId,
                        deuna_phone_linked: phone,
                      },
                    },
                  },
                },
                error: null,
              }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      };
    },
  } as any;
}
