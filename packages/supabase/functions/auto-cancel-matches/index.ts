/*
 * Edge Function: auto-cancel-matches
 *
 * Cancels open matches that did not reach their minimum player count by the
 * confirmation deadline and marks all active enrollments as refunded.
 *
 * Business rules:
 *   - Only targets matches where type='open', status='open', confirmation_deadline < NOW()
 *   - Cancels if enrolled_count < min_players
 *   - System cancellation: cancelled_by remains NULL — owner penalty counter NOT incremented
 *   - Refunds are mocked (payment provider TBD); payment IDs are logged for audit
 *
 * Schedule — configure once in Supabase Dashboard → Database → pg_cron:
 *
 *   select cron.schedule(
 *     'auto-cancel-matches',
 *     '* /5 * * * *',
 *     $$
 *     select net.http_post(
 *       url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches',
 *       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *     )
 *     $$
 *   );
 *
 * See also: SCHEDULE.md in this directory.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';
type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';

interface EligibleMatch {
  id: string;
  min_players: number | null;
}

interface Enrollment {
  id: string;
  payment_id: string | null;
}

type MatchResult =
  | { match_id: string; action: 'cancelled'; enrolled_count: number; refunds_queued: number }
  | { match_id: string; action: 'skipped'; reason: string }
  | { match_id: string; action: 'error'; error: string };

interface JobSummary {
  processed: number;
  cancelled: number;
  skipped: number;
  errors: number;
  results: MatchResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function processMatch(
  supabase: ReturnType<typeof createClient>,
  match: EligibleMatch,
): Promise<MatchResult> {
  const { id: matchId, min_players: minPlayers } = match;

  try {
    // Fetch active enrollments. We do this inside per-match processing so one
    // bad match cannot abort the entire batch.
    const { data: enrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id, payment_id')
      .eq('match_id', matchId)
      .in('status', ['pending', 'confirmed'] satisfies EnrollmentStatus[]);

    if (enrollErr) {
      throw new Error(`enrollment fetch: ${enrollErr.message}`);
    }

    const enrolledCount = enrollments?.length ?? 0;

    if (enrolledCount >= (minPlayers ?? 0)) {
      // Min players reached — do NOT cancel. APPD-24 handles auto-confirm.
      const result: MatchResult = {
        match_id: matchId,
        action: 'skipped',
        reason: `enrolled_count (${enrolledCount}) >= min_players (${minPlayers})`,
      };
      console.log(JSON.stringify({ event: 'match_skipped', match_id: matchId, enrolled_count: enrolledCount, min_players: minPlayers }));
      return result;
    }

    // Idempotent update: guard with .eq('status', 'open') so a concurrent run
    // that already cancelled this match produces a no-op instead of an error.
    const { error: cancelErr } = await supabase
      .from('matches')
      .update({
        status: 'cancelled' satisfies MatchStatus,
        cancellation_reason: 'Mínimo de jugadores no alcanzado antes del plazo',
        enrolled_count_at_cancellation: enrolledCount,
        // cancelled_by intentionally omitted — NULL means system cancellation.
        // DB trigger only increments owner cancellation_count when cancelled_by IS NOT NULL.
      })
      .eq('id', matchId)
      .eq('status', 'open' satisfies MatchStatus); // idempotency guard

    if (cancelErr) {
      throw new Error(`match update: ${cancelErr.message}`);
    }

    // Mark enrollments as refunded — also idempotent (in() filters only active rows).
    const { error: refundErr } = await supabase
      .from('enrollments')
      .update({ status: 'refunded' satisfies EnrollmentStatus })
      .eq('match_id', matchId)
      .in('status', ['pending', 'confirmed'] satisfies EnrollmentStatus[]);

    if (refundErr) {
      throw new Error(`enrollment refund: ${refundErr.message}`);
    }

    // Mock refund — log payment IDs for the payment provider (to be wired in APPD-2x).
    const activeEnrollments = (enrollments ?? []) as Enrollment[];
    for (const enrollment of activeEnrollments) {
      if (enrollment.payment_id) {
        console.log(JSON.stringify({
          event: 'refund_queued',
          match_id: matchId,
          enrollment_id: enrollment.id,
          payment_id: enrollment.payment_id,
          note: 'refund would be triggered for payment_id: ' + enrollment.payment_id,
        }));
      }
    }

    console.log(JSON.stringify({
      event: 'match_cancelled',
      match_id: matchId,
      enrolled_count: enrolledCount,
      min_players: minPlayers,
      refunds_queued: activeEnrollments.filter(e => e.payment_id).length,
    }));

    return {
      match_id: matchId,
      action: 'cancelled',
      enrolled_count: enrolledCount,
      refunds_queued: activeEnrollments.filter(e => e.payment_id).length,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error(JSON.stringify({ event: 'error', match_id: matchId, error: message }));
    return { match_id: matchId, action: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Health check — useful for cron pings and uptime monitors.
  const url = new URL(req.url);
  if (url.searchParams.get('health') === '1') {
    return jsonResponse({ status: 'ok' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(JSON.stringify({ event: 'error', error: 'Missing required environment variables' }));
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch all matches past their deadline that are still open.
  const { data: matches, error: fetchError } = await supabase
    .from('matches')
    .select('id, min_players')
    .eq('type', 'open')
    .eq('status', 'open')
    .lt('confirmation_deadline', new Date().toISOString());

  if (fetchError) {
    console.error(JSON.stringify({ event: 'error', error: `fetch_matches: ${fetchError.message}` }));
    return jsonResponse({ error: fetchError.message }, 500);
  }

  const eligibleMatches = (matches ?? []) as EligibleMatch[];
  console.log(JSON.stringify({ event: 'job_start', eligible_count: eligibleMatches.length }));

  // Process matches independently — one failure does not abort the rest.
  const results = await Promise.all(
    eligibleMatches.map(match => processMatch(supabase, match)),
  );

  const summary: JobSummary = {
    processed: results.length,
    cancelled: results.filter(r => r.action === 'cancelled').length,
    skipped: results.filter(r => r.action === 'skipped').length,
    errors: results.filter(r => r.action === 'error').length,
    results,
  };

  console.log(JSON.stringify({ event: 'job_complete', ...summary, results: undefined }));

  return jsonResponse(summary);
});
