/*
 * Edge Function: mark-attendance
 *
 * Called by the field owner after a match takes place. Updates attendance on
 * each enrollment, marks the match as 'completed', and increments
 * `users.matches_played` for every player who attended.
 *
 * Business rules:
 *   - HTTP POST only
 *   - Caller must be authenticated and must own the field linked to the match
 *   - Match must be type='open' and status in ('confirmed', 'completed')
 *   - Idempotency: `users.matches_played` is only incremented when
 *     `enrollments.attended` was previously NULL or FALSE — prevents
 *     double-counting if the endpoint is called more than once
 *   - One enrollment failure does not abort the rest
 *   - matches_played is incremented via `increment_user_matches_played` RPC
 *     (SECURITY DEFINER, only callable by service role) — never incremented
 *     directly from client code
 *
 * Request body:
 *   {
 *     "match_id": "<uuid>",
 *     "attendances": [
 *       { "enrollment_id": "<uuid>", "attended": true | false },
 *       ...
 *     ]
 *   }
 *
 * Response (200):
 *   {
 *     "match_id": "<uuid>",
 *     "completed": true,
 *     "attended_count": <number>,
 *     "results": [ { "enrollment_id": "<uuid>", "action": "...", ... }, ... ]
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';
type MatchType = 'open' | 'reservation';

interface Match {
  id: string;
  type: MatchType;
  status: MatchStatus;
  field_id: string;
}

interface Field {
  owner_id: string;
}

interface AttendanceInput {
  enrollment_id: string;
  attended: boolean;
}

interface RequestBody {
  match_id: string;
  attendances: AttendanceInput[];
}

interface Enrollment {
  id: string;
  user_id: string;
  attended: boolean | null;
}

type EnrollmentResult =
  | { enrollment_id: string; action: 'updated'; user_id: string; matches_played_incremented: boolean }
  | { enrollment_id: string; action: 'skipped'; reason: string }
  | { enrollment_id: string; action: 'error'; error: string };

interface FunctionResponse {
  match_id: string;
  completed: boolean;
  attended_count: number;
  results: EnrollmentResult[];
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

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Core logic — process one enrollment
// ---------------------------------------------------------------------------

async function processEnrollment(
  supabase: ReturnType<typeof createClient>,
  matchId: string,
  input: AttendanceInput,
  currentEnrollments: Map<string, Enrollment>,
): Promise<EnrollmentResult> {
  const { enrollment_id: enrollmentId, attended } = input;

  try {
    const existing = currentEnrollments.get(enrollmentId);

    if (!existing) {
      const reason = 'enrollment not found or does not belong to this match';
      console.log(JSON.stringify({ event: 'enrollment_skipped', match_id: matchId, enrollment_id: enrollmentId, reason }));
      return { enrollment_id: enrollmentId, action: 'skipped', reason };
    }

    // Update the attended flag on the enrollment.
    const { error: updateErr } = await supabase
      .from('enrollments')
      .update({ attended })
      .eq('id', enrollmentId);

    if (updateErr) {
      throw new Error(`enrollment update: ${updateErr.message}`);
    }

    // Increment matches_played only if:
    //   1. The player actually attended, AND
    //   2. attended was previously NULL or FALSE (prevents double-counting on
    //      re-submission of the same attendance data)
    const previouslyAttended = existing.attended === true;
    const shouldIncrement = attended && !previouslyAttended;

    if (shouldIncrement) {
      // SECURITY DEFINER RPC — only callable by service role; handles the
      // atomic SQL `UPDATE ... SET matches_played = matches_played + 1`.
      const { error: rpcErr } = await supabase.rpc('increment_user_matches_played', {
        p_user_id: existing.user_id,
      });

      if (rpcErr) {
        // Log but do not throw — the attended flag is already persisted.
        // An operator can reconcile matches_played from the enrollments table.
        console.error(JSON.stringify({
          event: 'matches_played_increment_failed',
          match_id: matchId,
          enrollment_id: enrollmentId,
          user_id: existing.user_id,
          error: rpcErr.message,
        }));
      }
    }

    console.log(JSON.stringify({
      event: 'enrollment_updated',
      match_id: matchId,
      enrollment_id: enrollmentId,
      user_id: existing.user_id,
      attended,
      matches_played_incremented: shouldIncrement,
    }));

    return {
      enrollment_id: enrollmentId,
      action: 'updated',
      user_id: existing.user_id,
      matches_played_incremented: shouldIncrement,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error(JSON.stringify({ event: 'error', match_id: matchId, enrollment_id: enrollmentId, error: message }));
    return { enrollment_id: enrollmentId, action: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Health check.
  const url = new URL(req.url);
  if (url.searchParams.get('health') === '1') {
    return jsonResponse({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // -------------------------------------------------------------------------
  // Environment
  // -------------------------------------------------------------------------

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(JSON.stringify({ event: 'error', error: 'Missing required environment variables' }));
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  // -------------------------------------------------------------------------
  // Authentication — identify the caller from their JWT
  // -------------------------------------------------------------------------

  const callerToken = extractBearerToken(req);
  if (!callerToken) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  // Use the caller's JWT to resolve their identity.
  const callerSupabase = createClient(supabaseUrl, callerToken);
  const { data: { user }, error: authErr } = await callerSupabase.auth.getUser();

  if (authErr || !user) {
    console.error(JSON.stringify({ event: 'error', error: `auth: ${authErr?.message ?? 'no user'}` }));
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const callerId = user.id;

  // Service-role client for all subsequent DB operations (bypasses RLS).
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // -------------------------------------------------------------------------
  // Parse & validate request body
  // -------------------------------------------------------------------------

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { match_id: matchId, attendances } = body;

  if (!matchId || typeof matchId !== 'string') {
    return jsonResponse({ error: 'match_id is required' }, 400);
  }

  if (!Array.isArray(attendances) || attendances.length === 0) {
    return jsonResponse({ error: 'attendances must be a non-empty array' }, 400);
  }

  for (const item of attendances) {
    if (typeof item.enrollment_id !== 'string' || typeof item.attended !== 'boolean') {
      return jsonResponse({ error: 'Each attendance entry must have enrollment_id (string) and attended (boolean)' }, 400);
    }
  }

  // -------------------------------------------------------------------------
  // Fetch match and verify it is eligible
  // -------------------------------------------------------------------------

  const { data: matchData, error: matchErr } = await supabase
    .from('matches')
    .select('id, type, status, field_id')
    .eq('id', matchId)
    .single();

  if (matchErr || !matchData) {
    return jsonResponse({ error: 'Match not found' }, 404);
  }

  const match = matchData as Match;

  if (match.type !== 'open') {
    return jsonResponse({ error: 'Attendance can only be marked for open-type matches' }, 422);
  }

  if (match.status !== 'confirmed' && match.status !== 'completed') {
    return jsonResponse({
      error: `Match status must be 'confirmed' or 'completed' to mark attendance (current: ${match.status})`,
    }, 422);
  }

  // -------------------------------------------------------------------------
  // Authorization — verify the caller owns the field
  // -------------------------------------------------------------------------

  const { data: fieldData, error: fieldErr } = await supabase
    .from('fields')
    .select('owner_id')
    .eq('id', match.field_id)
    .single();

  if (fieldErr || !fieldData) {
    console.error(JSON.stringify({ event: 'error', match_id: matchId, error: 'field lookup failed' }));
    return jsonResponse({ error: 'Field not found' }, 404);
  }

  const field = fieldData as Field;

  if (field.owner_id !== callerId) {
    console.log(JSON.stringify({
      event: 'authorization_failed',
      match_id: matchId,
      caller_id: callerId,
      field_owner_id: field.owner_id,
    }));
    return jsonResponse({ error: 'Forbidden — you do not own this field' }, 403);
  }

  // -------------------------------------------------------------------------
  // Fetch current enrollment state for idempotency checks
  // -------------------------------------------------------------------------

  const enrollmentIds = attendances.map(a => a.enrollment_id);

  const { data: enrollmentRows, error: fetchEnrollErr } = await supabase
    .from('enrollments')
    .select('id, user_id, attended')
    .eq('match_id', matchId)
    .in('id', enrollmentIds);

  if (fetchEnrollErr) {
    console.error(JSON.stringify({ event: 'error', match_id: matchId, error: `fetch_enrollments: ${fetchEnrollErr.message}` }));
    return jsonResponse({ error: 'Failed to fetch enrollments' }, 500);
  }

  const enrollmentMap = new Map<string, Enrollment>(
    ((enrollmentRows ?? []) as Enrollment[]).map(e => [e.id, e]),
  );

  console.log(JSON.stringify({
    event: 'job_start',
    match_id: matchId,
    caller_id: callerId,
    attendance_inputs: attendances.length,
  }));

  // -------------------------------------------------------------------------
  // Process each attendance update independently
  // -------------------------------------------------------------------------

  const results = await Promise.all(
    attendances.map(input => processEnrollment(supabase, matchId, input, enrollmentMap)),
  );

  // -------------------------------------------------------------------------
  // Mark match as completed (idempotent — guard allows 'confirmed' or 'completed')
  // -------------------------------------------------------------------------

  const { error: completeErr } = await supabase
    .from('matches')
    .update({ status: 'completed' satisfies MatchStatus })
    .eq('id', matchId)
    .in('status', ['confirmed', 'completed'] satisfies MatchStatus[]);

  if (completeErr) {
    console.error(JSON.stringify({ event: 'error', match_id: matchId, error: `match_complete: ${completeErr.message}` }));
    return jsonResponse({ error: 'Failed to mark match as completed' }, 500);
  }

  // -------------------------------------------------------------------------
  // Summarize and respond
  // -------------------------------------------------------------------------

  const attendedCount = results.filter(
    r => r.action === 'updated' && r.matches_played_incremented,
  ).length;

  const response: FunctionResponse = {
    match_id: matchId,
    completed: true,
    attended_count: attendedCount,
    results,
  };

  console.log(JSON.stringify({
    event: 'job_complete',
    match_id: matchId,
    attended_count: attendedCount,
    total_processed: results.length,
    errors: results.filter(r => r.action === 'error').length,
  }));

  return jsonResponse(response);
});
