-- =============================================================================
-- Migration: 0021 – Co-enrollment visibility
--
-- Allows players to:
--   1. Read other enrollments for matches they are enrolled in
--      (so the app can show "X players enrolled")
--   2. Read the user profiles of those co-enrolled players
--      (so the app can show names and avatars)
--
-- Both use SECURITY DEFINER functions to avoid circular RLS references.
-- =============================================================================

-- ─── Helper: is user p_user_id co-enrolled with the current user? ─────────────
-- Checks whether p_user_id has an active enrollment in any match where
-- auth.uid() is also actively enrolled.
-- SECURITY DEFINER bypasses enrollments RLS — safe, no circular reference.

CREATE OR REPLACE FUNCTION public.is_co_enrolled_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.enrollments e1
    JOIN   public.enrollments e2
           ON  e2.match_id = e1.match_id
           AND e2.user_id  = auth.uid()
           AND e2.status   NOT IN ('cancelled', 'refunded')
    WHERE  e1.user_id = p_user_id
      AND  e1.status  NOT IN ('cancelled', 'refunded')
      AND  e1.user_id != auth.uid()
  );
$$;

-- ─── Update enrollments SELECT: players can see co-enrollees ─────────────────
-- Rebuild to add the co-enrollment case using is_enrolled_in_match()
-- (already SECURITY DEFINER from migration 0009).

DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;

CREATE POLICY "enrollments_select"
  ON public.enrollments FOR SELECT
  USING (
    -- Own enrollments
    user_id = auth.uid() OR
    -- Owner sees all enrollments for their matches
    public.is_owner_of_match_field(match_id) OR
    -- Players can see other active enrollments for matches they're in
    public.is_enrolled_in_match(match_id) OR
    public.is_admin()
  );

-- ─── Users SELECT: players can see co-enrolled players' profiles ─────────────

CREATE POLICY "users_select_co_enrolled"
  ON public.users FOR SELECT
  USING (
    public.is_co_enrolled_with(users.id)
  );
