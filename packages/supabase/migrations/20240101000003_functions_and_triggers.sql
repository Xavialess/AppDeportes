-- =============================================================================
-- Migration: 0003 – Functions and Triggers
-- =============================================================================

-- ─── Helper: role-check functions ─────────────────────────────────────────────
-- IMPORTANT: These are SECURITY DEFINER so they can bypass RLS on the users
-- table when called from within other RLS policies. They live in the public
-- schema but are kept minimal and read-only.
-- Per Supabase guidance, role is stored in our users table (not user_metadata,
-- which is user-editable) and authoritative for all RLS decisions.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- ─── Trigger: auto-create user profile on auth sign-up ───────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── Trigger: increment owner cancellation_count on manual cancel ─────────────
-- Fires when a match transitions to cancelled and cancelled_by is set to the
-- field owner (distinguishes owner-initiated from auto-cancellation by system).

CREATE OR REPLACE FUNCTION public.handle_match_owner_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Only care about transitions to 'cancelled' where cancelled_by is set
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_by IS NOT NULL THEN
    -- Identify the field owner
    SELECT owner_id INTO v_owner_id FROM public.fields WHERE id = NEW.field_id;

    -- Only increment if the cancellation was owner-initiated (not admin/system)
    IF NEW.cancelled_by = v_owner_id THEN
      UPDATE public.owner_profiles
      SET cancellation_count = cancellation_count + 1
      WHERE user_id = v_owner_id;
    END IF;

    -- Snapshot enrollment count at time of cancellation
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

CREATE OR REPLACE TRIGGER on_match_cancelled
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_match_owner_cancellation();

-- ─── Function: get active enrollment count for a match ───────────────────────
-- Used by Edge Functions and as a helper to avoid N+1 queries.

CREATE OR REPLACE FUNCTION public.get_match_enrollment_count(p_match_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.enrollments
  WHERE match_id = p_match_id AND status IN ('pending', 'confirmed');
$$;
