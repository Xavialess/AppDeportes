-- Migration 32: 1-hour pre-match reminder support
--
-- Adds a dedupe stamp and a lookup RPC for the `match-reminders` cron Edge
-- Function. The cron runs every minute; without a guard it would re-notify the
-- same match on every tick during the reminder window. `reminder_sent_at` makes
-- the send fire exactly once: the RPC only returns matches where it is NULL, and
-- the Edge Function stamps it immediately after sending.

ALTER TABLE public.matches
  ADD COLUMN reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.matches.reminder_sent_at IS
  'Set by the match-reminders Edge Function when the 1h pre-match push is sent. NULL = not yet reminded. Prevents duplicate reminders across cron ticks.';

-- RPC: get_matches_for_reminder
--
-- Returns confirmed matches whose kickoff is within the next 60 minutes and that
-- have not been reminded yet. Reuses the same date+start_time → America/Guayaquil
-- → UTC conversion as get_past_kickoff_open_matches (migration 12) so the wall
-- clock matches everywhere in the system.
--
-- Lower bound now() excludes matches whose kickoff has already passed (those are
-- handled by update-match-states moving them to en_curso). Upper bound is a
-- 60-minute horizon — a match enters the window ~60 min before kickoff and the
-- first cron tick inside the window sends the single reminder.

CREATE OR REPLACE FUNCTION public.get_matches_for_reminder()
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM matches
  WHERE status = 'confirmed'
    AND reminder_sent_at IS NULL
    AND (date || ' ' || start_time)::timestamp AT TIME ZONE 'America/Guayaquil'
        BETWEEN now() AND now() + INTERVAL '60 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.get_matches_for_reminder() TO service_role;
