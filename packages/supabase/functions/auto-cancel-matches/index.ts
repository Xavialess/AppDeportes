import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Edge Function: auto-cancel-matches
// Triggered by pg_cron (or Supabase scheduled trigger) to auto-cancel open matches
// where confirmation_deadline has passed and enrolled_count < min_players.
// Also initiates refunds for all pending/confirmed enrollments.
//
// Schedule: every 5 minutes via Supabase cron or external scheduler.

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find matches eligible for auto-cancellation
  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id,
      min_players,
      field_id,
      fields!inner(owner_id)
    `)
    .eq('type', 'open')
    .eq('status', 'open')
    .lt('confirmation_deadline', new Date().toISOString());

  if (error) {
    console.error('Failed to fetch matches:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results = [];

  for (const match of matches ?? []) {
    const { count: enrolledCount } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', match.id)
      .in('status', ['pending', 'confirmed']);

    if ((enrolledCount ?? 0) < (match.min_players ?? 0)) {
      // Auto-cancel: no cancelled_by set (system cancellation)
      await supabase
        .from('matches')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Mínimo de jugadores no alcanzado antes del plazo',
          enrolled_count_at_cancellation: enrolledCount,
        })
        .eq('id', match.id);

      // Mark all active enrollments as refunded
      // In production: trigger actual payment provider refund here
      await supabase
        .from('enrollments')
        .update({ status: 'refunded' })
        .eq('match_id', match.id)
        .in('status', ['pending', 'confirmed']);

      results.push({ match_id: match.id, action: 'cancelled', refunded: enrolledCount });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
