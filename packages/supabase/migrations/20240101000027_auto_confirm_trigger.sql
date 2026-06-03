-- Migration 27: Replace auto-confirm-matches cron with an instant Postgres trigger
--
-- Previously: a cron ran every 5 minutes, scanned all open matches, and confirmed
-- any that had reached min_players. This introduced up to 5 minutes of lag between
-- a player enrolling and the match flipping to 'confirmed'.
--
-- Now: a trigger fires immediately after every enrollment INSERT or status UPDATE.
-- If the new enrollment pushes the active count to >= min_players on an open match
-- whose deadline has not passed, the match is confirmed instantly.
--
-- Replicates the cron's exact behaviour:
--   1. Counts pending + confirmed + payment_pending enrollments
--   2. Confirms the match (idempotent: guarded by .eq('status','open'))
--   3. Bulk-confirms all 'pending' enrollments (in-person players get confirmed
--      slot once the match is locked in)
--
-- Race safety: SELECT ... FOR UPDATE on the match row serialises concurrent
-- enrollments arriving in the same instant.
--
-- The auto-confirm-matches Edge Function can remain deployed as a fallback
-- but its cron job can be disabled once this trigger is verified in production.

CREATE OR REPLACE FUNCTION public.auto_confirm_match_on_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match         public.matches%ROWTYPE;
  v_active_count  INTEGER;
BEGIN
  -- Only act when an enrollment becomes active
  IF NEW.status NOT IN ('pending', 'confirmed', 'payment_pending') THEN
    RETURN NEW;
  END IF;

  -- Lock the match row to serialise concurrent enrollment inserts
  SELECT * INTO v_match
    FROM public.matches
    WHERE id = NEW.match_id
    FOR UPDATE;

  -- Only evaluate open matches with a min_players threshold
  IF v_match.status != 'open' THEN
    RETURN NEW;
  END IF;
  IF v_match.min_players IS NULL THEN
    RETURN NEW;
  END IF;
  -- Don't confirm if deadline has already passed
  -- (auto-cancel-matches handles the expired case)
  IF v_match.confirmation_deadline IS NOT NULL
     AND v_match.confirmation_deadline < NOW() THEN
    RETURN NEW;
  END IF;

  -- Count all active enrollment slots
  SELECT COUNT(*) INTO v_active_count
    FROM public.enrollments
    WHERE match_id = NEW.match_id
      AND status IN ('pending', 'confirmed', 'payment_pending');

  IF v_active_count < v_match.min_players THEN
    RETURN NEW;
  END IF;

  -- Threshold reached — confirm the match
  UPDATE public.matches
    SET status = 'confirmed'
    WHERE id = NEW.match_id
      AND status = 'open'; -- idempotency guard

  -- Bulk-confirm in-person (pending) enrollments so players see confirmed status.
  -- payment_pending enrollments stay in their state until the webhook arrives.
  UPDATE public.enrollments
    SET status = 'confirmed'
    WHERE match_id = NEW.match_id
      AND status = 'pending';

  RETURN NEW;
END;
$$;

-- Fires on new enrollment OR status change that makes an enrollment active
CREATE TRIGGER trg_auto_confirm_match_on_enrollment
  AFTER INSERT OR UPDATE OF status ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_match_on_enrollment();

COMMENT ON FUNCTION public.auto_confirm_match_on_enrollment() IS
  'Instantly confirms an open match when active enrollment count reaches '
  'min_players. Replaces the auto-confirm-matches cron job (5-min lag → instant). '
  'Bulk-confirms pending (in-person) enrollments when the match locks in.';
