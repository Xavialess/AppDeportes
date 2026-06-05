/*
 * Edge Function: match-reminders
 *
 * Sends a "your match starts in 1 hour" push to every active enrollee of each
 * confirmed match entering the 60-minute pre-kickoff window.
 *
 * Runs on a 1-minute cron, mirroring auto-cancel-matches and update-match-states.
 * Each match is reminded exactly once: get_matches_for_reminder (migration 32)
 * only returns matches whose reminder_sent_at IS NULL, and this function stamps
 * reminder_sent_at immediately after a successful send. The stamp is written even
 * if a match has zero enrollees, so an empty match is never re-scanned.
 *
 * Audience: all active enrollees — pending (in-person), payment_pending, and
 * confirmed. A pending in-person player is still expected to show up.
 *
 * Schedule — configure in Supabase Dashboard → Database → Cron Jobs:
 *
 *   select cron.schedule(
 *     'match-reminders',
 *     '* * * * *',
 *     $$
 *     select net.http_post(
 *       url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/match-reminders',
 *       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *     )
 *     $$
 *   );
 *
 * See also: SCHEDULE.md in this directory.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type AnySupabaseClient, buildMessages, getTokensForUsers, sendExpoPush } from '../_shared/push.ts';

type EnrollmentStatus = 'pending' | 'payment_pending' | 'confirmed' | 'cancelled' | 'refunded';

const ACTIVE_AUDIENCE: EnrollmentStatus[] = ['pending', 'payment_pending', 'confirmed'];

interface MatchResult {
  match_id: string;
  recipients: number;
  sent: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function remindMatch(
  supabase: AnySupabaseClient,
  matchId: string,
): Promise<MatchResult> {
  // Look up active enrollees.
  const { data: enrollData, error: enrollErr } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('match_id', matchId)
    .in('status', ACTIVE_AUDIENCE);

  if (enrollErr) throw new Error(`enrollment lookup: ${enrollErr.message}`);

  const userIds = [...new Set(((enrollData ?? []) as { user_id: string }[]).map((r) => r.user_id))];

  let sent = 0;
  if (userIds.length > 0) {
    const tokens = await getTokensForUsers(supabase, userIds);
    const messages = buildMessages(
      tokens,
      'Tu partido empieza pronto ⚽',
      'Falta 1 hora para tu partido. ¡Prepárate y llega a tiempo!',
      { type: 'match_reminder', match_id: matchId },
    );
    sent = await sendExpoPush(messages);
  }

  // Stamp regardless of recipient count so this match is not re-scanned next tick.
  const { error: stampErr } = await supabase
    .from('matches')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', matchId)
    .is('reminder_sent_at', null); // idempotency guard against concurrent ticks

  if (stampErr) throw new Error(`reminder stamp: ${stampErr.message}`);

  console.log(JSON.stringify({
    event: 'match_reminded',
    match_id: matchId,
    recipients: userIds.length,
    sent,
  }));

  return { match_id: matchId, recipients: userIds.length, sent };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get('health') === '1') {
    return jsonResponse({ status: 'ok' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc('get_matches_for_reminder');
  if (error) {
    console.error(JSON.stringify({ event: 'error', error: `fetch: ${error.message}` }));
    return jsonResponse({ error: error.message }, 500);
  }

  const matchIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
  console.log(JSON.stringify({ event: 'job_start', match_count: matchIds.length }));

  const results: MatchResult[] = [];
  const errors: string[] = [];

  // Sequential — keeps each match's send + stamp atomic in ordering and avoids
  // hammering the Expo endpoint. Reminder volume per minute is small.
  for (const matchId of matchIds) {
    try {
      results.push(await remindMatch(supabase, matchId));
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      console.error(JSON.stringify({ event: 'error', match_id: matchId, error: message }));
      errors.push(`${matchId}: ${message}`);
    }
  }

  const summary = {
    processed: matchIds.length,
    reminded: results.length,
    total_sent: results.reduce((acc, r) => acc + r.sent, 0),
    errors,
  };

  console.log(JSON.stringify({ event: 'job_complete', ...summary }));
  return jsonResponse(summary);
});
