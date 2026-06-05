/*
 * Edge Function: notify-match-event
 *
 * Sends push notifications when a match transitions to `confirmed` or
 * `cancelled`. Invoked by a Supabase Database Webhook on UPDATE of
 * public.matches — NOT by a cron and NOT by the app directly.
 *
 * Why a webhook instead of hooking each code path:
 *   A match reaches `confirmed` via the auto-confirm trigger (migration 27) and
 *   `cancelled` via three different paths (owner manual cancel, auto-cancel
 *   deadline, auto-cancel kickoff). Listening to the row UPDATE itself catches
 *   every path with one piece of code and never drifts when a path is added.
 *
 * The webhook fires on every matches UPDATE, so this function first checks that
 * the status actually crossed into confirmed/cancelled (old != new). Any other
 * update (visibility toggle, reminder stamp, etc.) is a no-op.
 *
 * Database Webhook setup — Supabase Dashboard → Database → Webhooks:
 *   Table:  public.matches
 *   Events: UPDATE
 *   Type:   HTTP Request → POST
 *   URL:    https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/notify-match-event
 *   Header: Authorization: Bearer <SERVICE_ROLE_KEY>
 *   See SCHEDULE.md in this directory.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type AnySupabaseClient, buildMessages, getTokensForUsers, sendExpoPush } from '../_shared/push.ts';

type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';
type EnrollmentStatus = 'pending' | 'payment_pending' | 'confirmed' | 'cancelled' | 'refunded';

interface MatchRecord {
  id: string;
  status: MatchStatus;
  date: string;
  start_time: string;
}

// Supabase Database Webhook payload shape for an UPDATE event.
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: MatchRecord | null;
  old_record: MatchRecord | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// For "cancelled" we want everyone who held a slot, including those whose
// enrollment was just flipped to refunded/cancelled by the same cancellation.
// For "confirmed" we want everyone currently holding an active slot.
const CONFIRMED_AUDIENCE: EnrollmentStatus[] = ['pending', 'payment_pending', 'confirmed'];
const CANCELLED_AUDIENCE: EnrollmentStatus[] = [
  'pending', 'payment_pending', 'confirmed', 'refunded', 'cancelled',
];

async function enrolledUserIds(
  supabase: AnySupabaseClient,
  matchId: string,
  statuses: EnrollmentStatus[],
): Promise<string[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('match_id', matchId)
    .in('status', statuses);

  if (error) throw new Error(`enrollment lookup: ${error.message}`);

  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  return [...new Set(ids)];
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

  let payload: WebhookPayload;
  try {
    payload = await req.json() as WebhookPayload;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const record = payload.record;
  const oldRecord = payload.old_record;

  // Only matches UPDATEs carry the status transition we care about.
  if (payload.type !== 'UPDATE' || !record || !oldRecord) {
    return jsonResponse({ skipped: 'not a matches update' });
  }

  const transitionedTo = (target: MatchStatus): boolean =>
    record.status === target && oldRecord.status !== target;

  let event: 'confirmed' | 'cancelled' | null = null;
  if (transitionedTo('confirmed')) event = 'confirmed';
  else if (transitionedTo('cancelled')) event = 'cancelled';

  if (!event) {
    return jsonResponse({ skipped: `no notifiable transition (${oldRecord.status} → ${record.status})` });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const audience = event === 'confirmed' ? CONFIRMED_AUDIENCE : CANCELLED_AUDIENCE;
    const userIds = await enrolledUserIds(supabase, record.id, audience);

    if (userIds.length === 0) {
      return jsonResponse({ event, match_id: record.id, recipients: 0, sent: 0 });
    }

    const tokens = await getTokensForUsers(supabase, userIds);

    const copy = event === 'confirmed'
      ? { title: '¡Partido confirmado! 🎉', body: 'Tu partido alcanzó el mínimo de jugadores. ¡Nos vemos en la cancha!' }
      : { title: 'Partido cancelado', body: 'Lamentablemente tu partido fue cancelado. Toca para ver los detalles.' };

    const messages = buildMessages(tokens, copy.title, copy.body, {
      type: `match_${event}`,
      match_id: record.id,
    });

    const sent = await sendExpoPush(messages);

    console.log(JSON.stringify({
      event: `match_${event}_notified`,
      match_id: record.id,
      recipients: userIds.length,
      tokens: tokens.length,
      sent,
    }));

    return jsonResponse({ event, match_id: record.id, recipients: userIds.length, sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: 'error', match_id: record.id, error: message }));
    return jsonResponse({ error: message }, 500);
  }
});
