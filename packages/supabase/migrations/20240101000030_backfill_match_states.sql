-- Migration 30: One-time backfill of stale match states
--
-- pg_cron was not enabled during the initial deployment so auto-cancel-matches
-- and update-match-states never ran. This migration performs the same
-- transitions those cron jobs would have applied, bringing the DB into
-- the correct state.
--
-- Runs inside a single transaction — all-or-nothing.
-- Safe to re-run: every UPDATE is guarded by the status it expects to find.
--
-- Order matters:
--   1. Confirm open matches that hit min_players (before cancelling stragglers)
--   2. Cancel open matches past deadline with insufficient players
--   3. Cancel open matches past kickoff
--   4. Advance confirmed matches past kickoff → en_curso
--   5. Advance confirmed/en_curso matches past end_time → jugado

-- ── 1. Confirm open matches that reached min_players before deadline ─────────

WITH eligible AS (
  SELECT m.id
  FROM public.matches m
  WHERE m.status = 'open'
    AND m.type = 'open'
    AND m.confirmation_deadline > now()  -- deadline not yet passed
    AND m.min_players IS NOT NULL
    AND (
      SELECT COUNT(*) FROM public.enrollments e
      WHERE e.match_id = m.id
        AND e.status IN ('pending', 'confirmed', 'payment_pending')
    ) >= m.min_players
)
UPDATE public.matches
  SET status = 'confirmed'
  WHERE id IN (SELECT id FROM eligible);

-- Bulk-confirm pending (in-person) enrollments on newly confirmed matches
UPDATE public.enrollments
  SET status = 'confirmed'
  WHERE status = 'pending'
    AND match_id IN (
      SELECT id FROM public.matches WHERE status = 'confirmed'
    );

-- ── 2. Cancel open matches past deadline with insufficient players ───────────

WITH to_cancel AS (
  SELECT m.id
  FROM public.matches m
  WHERE m.status = 'open'
    AND m.type = 'open'
    AND m.confirmation_deadline < now()
    AND (
      SELECT COUNT(*) FROM public.enrollments e
      WHERE e.match_id = m.id
        AND e.status IN ('pending', 'confirmed', 'payment_pending')
    ) < COALESCE(m.min_players, 0)
)
UPDATE public.matches
  SET status = 'cancelled',
      cancellation_reason = 'Mínimo de jugadores no alcanzado antes del plazo'
  WHERE id IN (SELECT id FROM to_cancel);

-- Refund active enrollments on matches just cancelled
UPDATE public.enrollments
  SET status = 'refunded'
  WHERE status IN ('pending', 'confirmed', 'payment_pending')
    AND match_id IN (
      SELECT id FROM public.matches
      WHERE status = 'cancelled'
        AND cancellation_reason = 'Mínimo de jugadores no alcanzado antes del plazo'
    );

-- ── 3. Cancel open matches past kickoff (never confirmed) ────────────────────

WITH past_kickoff_open AS (
  SELECT id FROM public.matches
  WHERE status = 'open'
    AND (date || ' ' || start_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now()
)
UPDATE public.matches
  SET status = 'cancelled',
      cancellation_reason = 'Partido no iniciado — hora de inicio superada'
  WHERE id IN (SELECT id FROM past_kickoff_open);

UPDATE public.enrollments
  SET status = 'refunded'
  WHERE status IN ('pending', 'confirmed', 'payment_pending')
    AND match_id IN (
      SELECT id FROM public.matches
      WHERE status = 'cancelled'
        AND cancellation_reason = 'Partido no iniciado — hora de inicio superada'
    );

-- ── 4. Advance confirmed matches past kickoff → en_curso ─────────────────────

UPDATE public.matches
  SET status = 'en_curso'
  WHERE status = 'confirmed'
    AND (date || ' ' || start_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now();

-- ── 5. Advance en_curso matches past end_time → jugado ───────────────────────

UPDATE public.matches
  SET status = 'jugado'
  WHERE status = 'en_curso'
    AND end_time IS NOT NULL
    AND (date || ' ' || end_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now();

-- Also catch confirmed matches that somehow skipped en_curso (end_time already passed)
UPDATE public.matches
  SET status = 'jugado'
  WHERE status = 'confirmed'
    AND end_time IS NOT NULL
    AND (date || ' ' || end_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now();
