-- Migration 26: Re-evaluate confirmed match state when an enrollment becomes inactive
--
-- Gaps covered:
--   #4  Withdrawal from confirmed, count < min, before deadline  → revert to open
--   #5  Withdrawal from confirmed, count < min, after deadline   → leave confirmed (owner handles)
--   #7  De Una payment fails, drops confirmed count < min        → same logic
--   #8a All players withdraw, before deadline                    → revert to open
--   #8b All players withdraw, after deadline                     → cancel match
--
-- Decision table (fires when confirmed enrollment count drops below min_players):
--
--   count == 0  AND deadline passed   → cancel match + refund remaining
--   count < min AND deadline NOT yet  → revert match to open (more players can join)
--   count < min AND deadline passed   → do nothing (leave confirmed, owner deals with it)
--   count >= min                      → do nothing
--
-- Trigger fires AFTER UPDATE on enrollments when status changes FROM an active
-- state (confirmed, payment_pending) TO an inactive state (cancelled, refunded, pending).

CREATE OR REPLACE FUNCTION public.reevaluate_match_on_enrollment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match         public.matches%ROWTYPE;
  v_confirmed_cnt INTEGER;
  v_deadline_past BOOLEAN;
BEGIN
  -- Only act when an active enrollment slot is being freed
  IF NEW.status NOT IN ('cancelled', 'refunded', 'pending') THEN
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('confirmed', 'payment_pending') THEN
    RETURN NEW;
  END IF;

  -- Fetch the match
  SELECT * INTO v_match FROM public.matches WHERE id = NEW.match_id;

  -- Only re-evaluate matches that are currently confirmed
  IF v_match.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- No min_players set — nothing to re-evaluate
  IF v_match.min_players IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count confirmed enrollments after this change
  SELECT COUNT(*) INTO v_confirmed_cnt
    FROM public.enrollments
    WHERE match_id = NEW.match_id
      AND status = 'confirmed';

  -- Still above minimum — no action needed
  IF v_confirmed_cnt >= v_match.min_players THEN
    RETURN NEW;
  END IF;

  -- Below minimum — determine deadline status
  v_deadline_past := v_match.confirmation_deadline IS NOT NULL
    AND v_match.confirmation_deadline < NOW();

  IF v_confirmed_cnt = 0 AND v_deadline_past THEN
    -- Match is empty and deadline has passed → cancel
    UPDATE public.matches
      SET status = 'cancelled',
          cancellation_reason = 'Todos los jugadores se retiraron del partido'
      WHERE id = NEW.match_id;

    -- Refund any remaining non-cancelled enrollments (edge case: payment_pending rows)
    UPDATE public.enrollments
      SET status = 'refunded'
      WHERE match_id = NEW.match_id
        AND id != NEW.id
        AND status NOT IN ('cancelled', 'refunded');

  ELSIF NOT v_deadline_past THEN
    -- Deadline not yet passed → revert to open so more players can join
    UPDATE public.matches
      SET status = 'open'
      WHERE id = NEW.match_id;

  -- ELSE: count < min, deadline passed, count > 0 → leave confirmed, owner handles it

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reevaluate_match_on_enrollment_change
  AFTER UPDATE OF status ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.reevaluate_match_on_enrollment_change();

COMMENT ON FUNCTION public.reevaluate_match_on_enrollment_change() IS
  'Fires after an enrollment status change frees a confirmed slot. '
  'Reverts confirmed match to open (deadline not passed) or cancels it '
  '(count=0 and deadline passed). Leaves match confirmed if count is below '
  'min but > 0 and deadline has passed — owner handles that case.';
