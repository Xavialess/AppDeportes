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

-- Update auto-cancel-matches: every 1 minute
SELECT cron.alter_job(
  jobid    := (SELECT jobid FROM cron.job WHERE jobname = 'auto-cancel-matches'),
  schedule := '* * * * *'
);

-- Update update-match-states: every 1 minute
SELECT cron.alter_job(
  jobid    := (SELECT jobid FROM cron.job WHERE jobname = 'update-match-states'),
  schedule := '* * * * *'
);

-- Demote auto-confirm-matches to every 10 minutes (safety net only)
-- It will be a no-op in practice since the trigger handles confirmations instantly.
SELECT cron.alter_job(
  jobid    := (SELECT jobid FROM cron.job WHERE jobname = 'auto-confirm-matches'),
  schedule := '*/10 * * * *'
);
