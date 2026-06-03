-- Migration 28: Reduce cron interval from 5 minutes to 1 minute
--
-- auto-cancel-matches and update-match-states are inherently time-driven
-- (they act when the clock crosses a threshold) so they cannot be replaced
-- by row-level triggers. Reducing the polling interval from */5 to * cuts
-- the maximum state-transition lag from ~5 minutes to ~1 minute.
--
-- auto-confirm-matches cron is now superseded by the trigger in migration 27
-- and can be disabled. It is left registered but with a longer interval as a
-- safety net in case the trigger misfires.
--
-- Run via: supabase db push (or apply in Supabase SQL editor)

-- Update schedules only if pg_cron extension and the jobs exist.
-- Jobs registered manually in the Supabase dashboard (not via SQL) may not
-- appear in cron.job. If missing, update the schedule in the dashboard manually:
--   auto-cancel-matches  → * * * * *
--   update-match-states  → * * * * *
--   auto-confirm-matches → */10 * * * * (safety net — trigger handles this now)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron'
  ) THEN
    UPDATE cron.job SET schedule = '* * * * *'    WHERE jobname = 'auto-cancel-matches';
    UPDATE cron.job SET schedule = '* * * * *'    WHERE jobname = 'update-match-states';
    UPDATE cron.job SET schedule = '*/10 * * * *' WHERE jobname = 'auto-confirm-matches';
  END IF;
END $$;
