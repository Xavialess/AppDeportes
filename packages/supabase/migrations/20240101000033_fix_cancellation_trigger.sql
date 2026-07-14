-- Migration 0033: Fix handle_match_owner_cancellation trigger
--
-- Bug: the trigger was written in migration 0003 when fields had an owner_id
-- column. Migration 0016 removed fields.owner_id (ownership is now via
-- fields.club_id → clubs.owner_id), but the trigger function was never updated.
-- Result: every owner cancel attempt failed at runtime with
-- "column owner_id does not exist", rolling back the entire transaction.

CREATE OR REPLACE FUNCTION public.handle_match_owner_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_by IS NOT NULL THEN
    -- Ownership is now via fields → clubs (fields.owner_id removed in migration 0016)
    SELECT c.owner_id INTO v_owner_id
    FROM public.fields f
    JOIN public.clubs c ON c.id = f.club_id
    WHERE f.id = NEW.field_id;

    IF NEW.cancelled_by = v_owner_id THEN
      UPDATE public.owner_profiles
      SET cancellation_count = cancellation_count + 1
      WHERE user_id = v_owner_id;
    END IF;

    UPDATE public.matches
    SET enrolled_count_at_cancellation = (
      SELECT COUNT(*) FROM public.enrollments
      WHERE match_id = NEW.id AND status IN ('pending', 'confirmed')
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
