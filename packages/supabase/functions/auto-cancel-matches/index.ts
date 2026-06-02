/*
 * Edge Function: auto-cancel-matches
 *
 * Cancels open matches in two cases:
 *
 *   1. Deadline-based: type='open', status='open', confirmation_deadline < NOW(),
 *      enrolled_count < min_players. These never reached the minimum before their
 *      deadline and can no longer be confirmed.
 *
 *   2. Kickoff-based: status='open', kickoff datetime (date + start_time in
 *      America/Guayaquil) < NOW(). The match start time has passed and it was
 *      never confirmed, so it cannot be played.
 *
 * Both cases cancel the match, mark active enrollments as refunded, and log
 * payment IDs for the payment provider (TBD).
 *
 * Business rules:
 *   - System cancellation: cancelled_by remains NULL — owner penalty counter NOT incremented
 *   - Kickoff-based cancellations skip the min_players check (time has passed regardless)
 *   - Idempotent: concurrent runs are safe (update guarded by .eq('status', 'open'))
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

type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';
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
  | { match_id: string; action: 'cancelled'; reason: string; enrolled_count: number; refunds_queued: number }
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
  cancellationReason: string,
  skipMinPlayersCheck = false,
): Promise<MatchResult> {
  const { id: matchId, min_players: minPlayers } = match;

  try {
    const { data: enrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id, payment_id')
      .eq('match_id', matchId)
      .in('status', ['pending', 'confirmed'] satisfies EnrollmentStatus[]);

    if (enrollErr) {
      throw new Error(`enrollment fetch: ${enrollErr.message}`);
    }

    const enrolledCount = enrollments?.length ?? 0;

    if (!skipMinPlayersCheck && enrolledCount >= (minPlayers ?? 0)) {
      const result: MatchResult = {
        match_id: matchId,
        action: 'skipped',
        reason: `enrolled_count (${enrolledCount}) >= min_players (${minPlayers})`,
      };
      console.log(JSON.stringify({ event: 'match_skipped', match_id: matchId, enrolled_count: enrolledCount, min_players: minPlayers }));
      return result;
    }

    // Idempotency guard: if already cancelled by a concurrent run, this is a no-op.
    const { error: cancelErr } = await supabase
      .from('matches')
      .update({
        status: 'cancelled' satisfies MatchStatus,
        cancellation_reason: cancellationReason,
        enrolled_count_at_cancellation: enrolledCount,
        // cancelled_by intentionally omitted — NULL = system cancellation.
      })
      .eq('id', matchId)
      .eq('status', 'open' satisfies MatchStatus);

    if (cancelErr) {
      throw new Error(`match update: ${cancelErr.message}`);
    }

    const { error: refundErr } = await supabase
      .from('enrollments')
      .update({ status: 'refunded' satisfies EnrollmentStatus })
      .eq('match_id', matchId)
      .in('status', ['pending', 'confirmed'] satisfies EnrollmentStatus[]);

    if (refundErr) {
      throw new Error(`enrollment refund: ${refundErr.message}`);
    }

    const activeEnrollments = (enrollments ?? []) as Enrollment[];
    for (const enrollment of activeEnrollments) {
      if (enrollment.payment_id) {
        console.log(JSON.stringify({
          event: 'refund_queued',
          match_id: matchId,
          enrollment_id: enrollment.id,
          payment_id: enrollment.payment_id,
        }));
      }
    }

    console.log(JSON.stringify({
      event: 'match_cancelled',
      match_id: matchId,
      cancellation_reason: cancellationReason,
      enrolled_count: enrolledCount,
      refunds_queued: activeEnrollments.filter(e => e.payment_id).length,
    }));

    return {
      match_id: matchId,
      action: 'cancelled',
      reason: cancellationReason,
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

  // ── Batch 1: past-deadline matches ──────────────────────────────────────
  const { data: deadlineData, error: deadlineErr } = await supabase
    .from('matches')
    .select('id, min_players')
    .eq('type', 'open')
    .eq('status', 'open')
    .lt('confirmation_deadline', new Date().toISOString());

  if (deadlineErr) {
    console.error(JSON.stringify({ event: 'error', error: `fetch_deadline: ${deadlineErr.message}` }));
    return jsonResponse({ error: deadlineErr.message }, 500);
  }

  // ── Batch 2: past-kickoff matches ────────────────────────────────────────
  // Uses an RPC that compares date+start_time at America/Guayaquil against now().
  const { data: kickoffData, error: kickoffErr } = await supabase
    .rpc('get_past_kickoff_open_matches');

  if (kickoffErr) {
    console.error(JSON.stringify({ event: 'error', error: `fetch_kickoff: ${kickoffErr.message}` }));
    return jsonResponse({ error: kickoffErr.message }, 500);
  }

  // Deduplicate: a match may appear in both batches (deadline passed AND kickoff
  // passed). Process each match once; kickoff batch covers the remainder.
  const deadlineMatches = (deadlineData ?? []) as EligibleMatch[];
  const deadlineIds = new Set(deadlineMatches.map((m) => m.id));
  const kickoffMatches = ((kickoffData ?? []) as EligibleMatch[]).filter(
    (m) => !deadlineIds.has(m.id),
  );

  console.log(JSON.stringify({
    event: 'job_start',
    deadline_count: deadlineMatches.length,
    kickoff_count: kickoffMatches.length,
  }));

  const [deadlineResults, kickoffResults] = await Promise.all([
    Promise.all(
      deadlineMatches.map((m) =>
        processMatch(supabase, m, 'Mínimo de jugadores no alcanzado antes del plazo')
      ),
    ),
    Promise.all(
      kickoffMatches.map((m) =>
        processMatch(supabase, m, 'Partido no iniciado — hora de inicio superada', true)
      ),
    ),
  ]);

  const results = [...deadlineResults, ...kickoffResults];

  const summary: JobSummary = {
    processed: results.length,
    cancelled: results.filter((r) => r.action === 'cancelled').length,
    skipped: results.filter((r) => r.action === 'skipped').length,
    errors: results.filter((r) => r.action === 'error').length,
    results,
  };

  console.log(JSON.stringify({ event: 'job_complete', ...summary, results: undefined }));

  return jsonResponse(summary);
});
