/*
 * Edge Function: update-match-states
 *
 * Advances match statuses automatically based on real-world time:
 *
 *   confirmed  → en_curso   when kickoff time (date + start_time) is reached
 *   en_curso   → jugado     when end time (date + end_time) is reached
 *
 * Runs on the same 5-minute schedule as auto-cancel-matches.
 * Neither transition touches enrollments or payments.
 *
 * Schedule — configure in Supabase Dashboard → Database → pg_cron:
 *
 *   select cron.schedule(
 *     'update-match-states',
 *     '* /5 * * * *',
 *     $$
 *     select net.http_post(
 *       url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/update-match-states',
 *       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *     )
 *     $$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function bulkTransition(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
  fromStatus: MatchStatus,
  toStatus: MatchStatus,
): Promise<{ updated: number; errors: string[] }> {
  if (ids.length === 0) return { updated: 0, errors: [] };

  const errors: string[] = [];
  let updated = 0;

  // Batch update — idempotent via .eq('status', fromStatus) guard.
  const { error, count } = await supabase
    .from('matches')
    .update({ status: toStatus satisfies MatchStatus })
    .in('id', ids)
    .eq('status', fromStatus satisfies MatchStatus)
    .select('id', { count: 'exact', head: true });

  if (error) {
    const msg = `transition ${fromStatus}→${toStatus}: ${error.message}`;
    console.error(JSON.stringify({ event: 'error', error: msg }));
    errors.push(msg);
  } else {
    updated = count ?? 0;
    console.log(JSON.stringify({ event: 'transition', from: fromStatus, to: toStatus, updated }));
  }

  return { updated, errors };
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

  // Fetch both batches in parallel.
  const [kickoffRes, finishedRes] = await Promise.all([
    supabase.rpc('get_kickoff_confirmed_matches'),
    supabase.rpc('get_finished_in_progress_matches'),
  ]);

  if (kickoffRes.error) {
    return jsonResponse({ error: `fetch kickoff: ${kickoffRes.error.message}` }, 500);
  }
  if (finishedRes.error) {
    return jsonResponse({ error: `fetch finished: ${finishedRes.error.message}` }, 500);
  }

  const kickoffIds = ((kickoffRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const finishedIds = ((finishedRes.data ?? []) as { id: string }[]).map((r) => r.id);

  console.log(JSON.stringify({
    event: 'job_start',
    kickoff_count: kickoffIds.length,
    finished_count: finishedIds.length,
  }));

  const [kickoffResult, finishedResult] = await Promise.all([
    bulkTransition(supabase, kickoffIds, 'confirmed', 'en_curso'),
    bulkTransition(supabase, finishedIds, 'en_curso', 'jugado'),
  ]);

  const summary = {
    confirmed_to_en_curso: kickoffResult.updated,
    en_curso_to_jugado: finishedResult.updated,
    errors: [...kickoffResult.errors, ...finishedResult.errors],
  };

  console.log(JSON.stringify({ event: 'job_complete', ...summary }));

  return jsonResponse(summary);
});
