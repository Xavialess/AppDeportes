/*
 * Edge Function: create-deuna-payment
 *
 * Creates a De Una payment intent for a player's match enrollment.
 * Called by the mobile app after an enrollment row is inserted.
 *
 * Auth: Supabase user JWT (player). Service-role is NOT used here —
 * the player must be authenticated so we can verify they own the enrollment.
 *
 * Money flow:
 *   Player → De Una → Owner (Banco Pichincha account)
 *   cancha. never holds the money — we are a technical pass-through.
 *
 * Request:  POST /functions/v1/create-deuna-payment
 *           Body: { enrollment_id: string }
 *
 * Response: 200 { qr_base64, payment_url, payment_intent_id, expires_at }
 *           400 { error: string }   — validation failure
 *           401 { error: string }   — missing auth
 *           403 { error: string }   — wrong player
 *           404 { error: string }   — enrollment not found
 *           503 { error: string }   — De Una API unavailable
 *
 * Deployment order:
 *   1. Apply migration 22
 *   2. Apply migration 23 (payment_pending enum)
 *   3. Set env vars: DEUNA_MASTER_TOKEN, DEUNA_API_URL, SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY
 *   4. supabase functions deploy create-deuna-payment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnrollmentStatus =
  | 'pending'
  | 'payment_pending'
  | 'confirmed'
  | 'cancelled'
  | 'refunded';

type MatchStatus =
  | 'open'
  | 'confirmed'
  | 'en_curso'
  | 'jugado'
  | 'completed'
  | 'cancelled';

const ENROLLABLE_STATUSES: MatchStatus[] = ['open', 'confirmed', 'en_curso'];

/** Shape of the De Una API response for a payment intent. */
interface DeunaPaymentIntentResponse {
  ok: boolean;
  paymentId?: string;
  qrBase64?: string;
  paymentUrl?: string;
  expiresAt?: string;
  error?: string;
}

/** Dependency injection interface — enables unit testing without a real DB. */
export interface CreateDeunaPaymentDeps {
  supabase: any;
  deunaApi: {
    createPaymentIntent: (params: {
      merchantId: string;
      amount: number;
      currency: 'USD';
      callbackUrl: string;
      reference: string;
      description: string;
    }) => Promise<DeunaPaymentIntentResponse>;
  };
  authUserId: string;
}

// ---------------------------------------------------------------------------
// Core handler (exported for testing)
// ---------------------------------------------------------------------------

/**
 * handleCreateDeunaPayment
 *
 * Pure business logic — takes an enrollment_id and resolved dependencies.
 * Returns a standard Response so the Deno HTTP handler can return it directly.
 */
export async function handleCreateDeunaPayment(
  enrollmentId: string,
  deps: CreateDeunaPaymentDeps,
): Promise<Response> {
  const { supabase, deunaApi, authUserId } = deps;

  // ── 1. Fetch enrollment ─────────────────────────────────────────────────
  const { data: enrollment, error: enrollErr } = await supabase
    .from('enrollments')
    .select('id, match_id, user_id, status')
    .eq('id', enrollmentId)
    .single();

  if (enrollErr || !enrollment) {
    return json({ error: 'enrollment_not_found' }, 404);
  }

  // ── 2. Verify caller owns the enrollment ────────────────────────────────
  if (enrollment.user_id !== authUserId) {
    return json({ error: 'forbidden' }, 403);
  }

  // ── 3. Validate enrollment status ───────────────────────────────────────
  const activeStatuses: EnrollmentStatus[] = ['pending', 'payment_pending'];
  if (!activeStatuses.includes(enrollment.status)) {
    if (enrollment.status === 'confirmed') {
      return json({ error: 'already_paid' }, 400);
    }
    return json({ error: 'enrollment_not_active' }, 400);
  }

  // ── 4. Fetch match + owner credentials (single join) ────────────────────
  //
  // Ownership chain: match → field → club → owner_profiles.deuna_merchant_id
  // per CLAUDE.md: "Never use fields.owner_id — ownership is via club_id → clubs.owner_id"
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select(`
      id,
      status,
      price_per_player,
      max_players,
      fields (
        clubs (
          owner_profiles (
            user_id,
            deuna_merchant_id,
            deuna_phone_linked
          )
        )
      )
    `)
    .eq('id', enrollment.match_id)
    .single();

  if (matchErr || !match) {
    return json({ error: 'match_not_found' }, 404);
  }

  // ── 5. Validate match is still enrollable ───────────────────────────────
  if (!ENROLLABLE_STATUSES.includes(match.status as MatchStatus)) {
    return json({ error: 'match_not_enrollable' }, 400);
  }

  // ── 6. Validate price ───────────────────────────────────────────────────
  if (match.price_per_player == null) {
    return json({ error: 'no_price_set' }, 400);
  }

  // ── 7. Validate owner De Una credentials ────────────────────────────────
  const ownerProfile = match.fields?.clubs?.owner_profiles;
  if (!ownerProfile?.deuna_merchant_id || !ownerProfile?.deuna_phone_linked) {
    return json({ error: 'owner_deuna_not_configured' }, 400);
  }

  // ── 8. Call De Una API ──────────────────────────────────────────────────
  //
  // DEUNA_API_URL and DEUNA_MASTER_TOKEN come from Supabase Edge Function secrets.
  // In tests, the deunaApi dep is mocked so this block never executes.
  let deunaResponse: DeunaPaymentIntentResponse;
  try {
    deunaResponse = await deunaApi.createPaymentIntent({
      merchantId: ownerProfile.deuna_merchant_id,
      amount: match.price_per_player,
      currency: 'USD',
      callbackUrl: `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/deuna-webhook`,
      reference: enrollmentId,
      description: `cancha. — partido ${enrollment.match_id}`,
    });
  } catch (_err) {
    return json({ error: 'deuna_api_error' }, 503);
  }

  if (!deunaResponse.ok) {
    return json({ error: 'deuna_api_error' }, 503);
  }

  // ── 9. Insert payment row ───────────────────────────────────────────────
  //
  // match_id and method are NOT NULL in the payments table.
  // player_id does NOT exist in payments — ownership is via enrollment.
  const { error: paymentErr } = await supabase
    .from('payments')
    .insert({
      match_id:               enrollment.match_id,
      enrollment_id:          enrollmentId,
      amount:                 match.price_per_player,
      method:                 'in_app',
      provider:               'deuna',
      provider_transaction_id: deunaResponse.paymentId,
      status:                 'pending',
    })
    .select()
    .single();

  if (paymentErr) {
    // Unique constraint violation — concurrent payment attempt
    if (paymentErr.code === '23505') {
      return json({ error: 'payment_already_in_progress' }, 409);
    }
    return json({ error: 'db_error' }, 500);
  }

  // ── 10. Update enrollment to payment_pending ────────────────────────────
  await supabase
    .from('enrollments')
    .update({ status: 'payment_pending' })
    .eq('id', enrollmentId);

  // ── 11. Return QR data to mobile ────────────────────────────────────────
  return json({
    qr_base64:          deunaResponse.qrBase64,
    payment_url:        deunaResponse.paymentUrl,
    payment_intent_id:  deunaResponse.paymentId,
    expires_at:         deunaResponse.expiresAt,
  }, 200);
}

// ---------------------------------------------------------------------------
// Deno HTTP entry point
// ---------------------------------------------------------------------------

if (import.meta.main) Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // ── Auth: extract user from JWT ─────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'missing_auth' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // Use anon key + user JWT to respect RLS and identify caller
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'invalid_auth' }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let enrollmentId: string;
  try {
    const body = await req.json();
    enrollmentId = body.enrollment_id;
    if (!enrollmentId) throw new Error('missing enrollment_id');
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  // ── Build De Una API adapter ────────────────────────────────────────────
  const deunaApiUrl   = Deno.env.get('DEUNA_API_URL') ?? 'https://deuna.ec';
  const deunaToken    = Deno.env.get('DEUNA_MASTER_TOKEN') ?? '';

  const deunaApi = {
    createPaymentIntent: async (params: Parameters<CreateDeunaPaymentDeps['deunaApi']['createPaymentIntent']>[0]) => {
      const res = await fetch(`${deunaApiUrl}/payments/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deunaToken}`,
        },
        body: JSON.stringify({
          merchantId:  params.merchantId,
          amount:      params.amount,
          currency:    params.currency,
          callbackUrl: params.callbackUrl,
          reference:   params.reference,
          description: params.description,
        }),
      });

      if (!res.ok) {
        return { ok: false, error: `deuna_${res.status}` };
      }

      // TODO: update field names once De Una developer portal confirms exact API shape
      const data = await res.json();
      return {
        ok:        true,
        paymentId: data.paymentId ?? data.id,
        qrBase64:  data.qrBase64 ?? data.qr_base64 ?? data.qr,
        paymentUrl: data.paymentUrl ?? data.payment_url,
        expiresAt:  data.expiresAt ?? data.expires_at,
      };
    },
  };

  // Use service role for DB writes (payment insert bypasses RLS)
  const supabaseService = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  return handleCreateDeunaPayment(enrollmentId, {
    supabase: supabaseService,
    deunaApi,
    authUserId: user.id,
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
