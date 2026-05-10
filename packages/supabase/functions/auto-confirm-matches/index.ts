/*
 * Edge Function: auto-confirm-matches
 *
 * Confirms open matches that have reached their minimum player count BEFORE
 * the confirmation deadline passes.
 *
 * Business rules:
 *   - Only targets matches where type='open', status='open',
 *     confirmation_deadline > NOW() (deadline has NOT yet passed)
 *   - Confirms if active enrollment count (pending | confirmed) >= min_players
 *   - Idempotent: uses .eq('status', 'open') guard on the update so concurrent
 *     runs produce a no-op for already-confirmed matches
 *   - Runs on a schedule every 5 minutes (see SCHEDULE.md)
 *
 * Companion functions:
 *   - auto-cancel-matches  — handles the deadline-expired, under-filled case
 *   - mark-attendance      — called by owner post-match to mark attended players
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

type MatchResult =
  | { match_id: string; action: 'confirmed'; enrolled_count: number }
  | { match_id: string; action: 'skipped'; reason: string }
  | { match_id: string; action: 'error'; error: string };

interface JobSummary {
  processed: number;
  confirmed: number;
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
    // Count active enrollments for this match. Processed per-match so one
    // failure cannot abort the entire batch.
    const { data: enrollments, error: enrollErr } = await supabase
      .from('enrollments')
      .select('id')
      .eq('match_id', matchId)
      .in('status', ['pending', 'confirmed'] satisfies EnrollmentStatus[]);

    if (enrollErr) {
      throw new Error(`enrollment fetch: ${enrollErr.message}`);
    }

    const enrolledCount = enrollments?.length ?? 0;
    const threshold = minPlayers ?? 0;

    if (enrolledCount < threshold) {
      const result: MatchResult = {
        match_id: matchId,
        action: 'skipped',
        reason: `enrolled_count (${enrolledCount}) < min_players (${threshold})`,
      };
      console.log(JSON.stringify({
        event: 'match_skipped',
        match_id: matchId,
        enrolled_count: enrolledCount,
        min_players: threshold,
      }));
      return result;
    }

    // Idempotent update: guard with .eq('status', 'open') so a concurrent run
    // or a race with auto-cancel produces a no-op instead of an error.
    const { error: confirmErr } = await supabase
      .from('matches')
      .update({ status: 'confirmed' satisfies MatchStatus })
      .eq('id', matchId)
      .eq('status', 'open' satisfies MatchStatus); // idempotency guard

    if (confirmErr) {
      throw new Error(`match update: ${confirmErr.message}`);
    }

    // Also confirm all pending enrollments so players see a confirmed status.
    const { error: enrollUpdateErr } = await supabase
      .from('enrollments')
      .update({ status: 'confirmed' satisfies EnrollmentStatus })
      .eq('match_id', matchId)
      .eq('status', 'pending' satisfies EnrollmentStatus); // idempotency guard

    if (enrollUpdateErr) {
      throw new Error(`enrollment confirm: ${enrollUpdateErr.message}`);
    }

    console.log(JSON.stringify({
      event: 'match_confirmed',
      match_id: matchId,
      enrolled_count: enrolledCount,
      min_players: threshold,
    }));

    return {
      match_id: matchId,
      action: 'confirmed',
      enrolled_count: enrolledCount,
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

  // Fetch all open matches whose deadline has NOT yet passed.
  // (Deadline-expired matches are handled by auto-cancel-matches.)
  const { data: matches, error: fetchError } = await supabase
    .from('matches')
    .select('id, min_players')
    .eq('type', 'open')
    .eq('status', 'open')
    .gt('confirmation_deadline', new Date().toISOString());

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
    confirmed: results.filter(r => r.action === 'confirmed').length,
    skipped: results.filter(r => r.action === 'skipped').length,
    errors: results.filter(r => r.action === 'error').length,
    results,
  };

  console.log(JSON.stringify({ event: 'job_complete', ...summary, results: undefined }));

  return jsonResponse(summary);
});
