-- =============================================================================
-- Migration: 0019 – Fix circular RLS after clubs migration
--
-- Migration 0017 rebuilt matches_select_visible and enrollments_select with
-- direct cross-table subqueries, re-introducing the circular dependency that
-- migration 0009 already solved. It also left is_owner_of_match_field pointing
-- at the now-removed fields.owner_id column.
--
-- Fix:
--   1. Update is_owner_of_match_field to join through clubs instead of owner_id
--   2. Rebuild matches_select_visible using is_enrolled_in_match() SECURITY DEFINER
--   3. Rebuild enrollments_select using is_owner_of_match_field() SECURITY DEFINER
-- =============================================================================

-- ─── Update helper: ownership now via fields → clubs ─────────────────────────

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
    JOIN   public.clubs   c ON c.id = f.club_id
    WHERE  m.id       = p_match_id
      AND  c.owner_id = auth.uid()
  );
$$;

-- ─── Rebuild matches SELECT — use SECURITY DEFINER to break the cycle ─────────

DROP POLICY IF EXISTS "matches_select_visible" ON public.matches;

CREATE POLICY "matches_select_visible"
  ON public.matches FOR SELECT
  USING (
    -- Players see all visible open/confirmed/en_curso matches
    (is_visible = true AND status IN ('open', 'confirmed', 'en_curso')) OR
    -- Owners see all matches for their clubs' fields
    EXISTS (
      SELECT 1 FROM public.fields f
      JOIN   public.clubs c ON c.id = f.club_id
      WHERE  f.id = matches.field_id AND c.owner_id = auth.uid()
    ) OR
    -- Players can see matches they are enrolled in (e.g. after status change)
    -- SECURITY DEFINER bypasses enrollments RLS — breaks the circular reference
    public.is_enrolled_in_match(matches.id) OR
    public.is_admin()
  );

-- ─── Rebuild enrollments SELECT — use SECURITY DEFINER to break the cycle ────

DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;

CREATE POLICY "enrollments_select"
  ON public.enrollments FOR SELECT
  USING (
    user_id = auth.uid() OR
    -- SECURITY DEFINER bypasses matches RLS — breaks the circular reference
    public.is_owner_of_match_field(match_id) OR
    public.is_admin()
  );
