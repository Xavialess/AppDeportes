-- =============================================================================
-- Migration: 0009 – Fix circular RLS dependency between matches and enrollments
--
-- The original policies created an infinite recursion loop:
--   matches_select_visible → EXISTS on enrollments (triggers enrollments_select)
--   enrollments_select     → EXISTS on matches     (triggers matches_select_visible)
--
-- Fix: wrap the enrollment check inside a SECURITY DEFINER function that runs
-- as the postgres superuser, bypassing RLS on enrollments and breaking the cycle.
-- Also wrap the enrollment→matches ownership check the same way.
-- =============================================================================

-- ─── Helper: check if current user is enrolled in a match ────────────────────
-- SECURITY DEFINER runs as the function owner (postgres/superuser), bypassing
-- RLS on enrollments so the check does not trigger enrollments_select again.

CREATE OR REPLACE FUNCTION public.is_enrolled_in_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE match_id = p_match_id
      AND user_id   = auth.uid()
  );
$$;

-- ─── Helper: check if current user owns the field for a given match ──────────
-- Used in enrollments_select to avoid referencing matches through RLS.

CREATE OR REPLACE FUNCTION public.is_owner_of_match_field(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.matches m
    JOIN   public.fields  f ON f.id = m.field_id
    WHERE  m.id         = p_match_id
      AND  f.owner_id   = auth.uid()
  );
$$;

-- ─── Rebuild matches SELECT policy ───────────────────────────────────────────

DROP POLICY IF EXISTS "matches_select_visible" ON public.matches;

CREATE POLICY "matches_select_visible"
  ON public.matches FOR SELECT
  USING (
    -- Players see visible + open/confirmed matches
    (is_visible = true AND status IN ('open', 'confirmed')) OR
    -- Owners see all their own matches
    EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = matches.field_id AND f.owner_id = auth.uid()
    ) OR
    -- Players can still see matches they are enrolled in (e.g. after cancellation)
    -- Uses SECURITY DEFINER function to avoid circular RLS with enrollments_select
    public.is_enrolled_in_match(matches.id) OR
    public.is_admin()
  );

-- ─── Rebuild enrollments SELECT policy ───────────────────────────────────────

DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;

CREATE POLICY "enrollments_select"
  ON public.enrollments FOR SELECT
  USING (
    -- Own enrollments
    user_id = auth.uid() OR
    -- Owner sees enrollments for their matches
    -- Uses SECURITY DEFINER function to avoid circular RLS with matches_select_visible
    public.is_owner_of_match_field(match_id) OR
    public.is_admin()
  );
