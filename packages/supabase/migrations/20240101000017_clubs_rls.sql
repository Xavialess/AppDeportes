-- =============================================================================
-- Migration: 0017 – RLS policies for clubs + updated ownership checks
--
-- After migration 0016:
--   • fields no longer has owner_id — ownership is via field.club_id → club.owner_id
--   • clubs gets its own RLS policies
--   • matches, enrollments, payments policies are updated to use the
--     fields → clubs join instead of the old fields.owner_id direct check
-- =============================================================================

-- ─── CLUBS — grant + policies ─────────────────────────────────────────────────

GRANT SELECT ON public.clubs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.clubs TO authenticated;

CREATE POLICY "clubs_select_public"
  ON public.clubs FOR SELECT
  USING (is_active = true OR owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "clubs_insert_owner"
  ON public.clubs FOR INSERT
  WITH CHECK (
    public.is_owner_or_admin() AND owner_id = auth.uid()
  );

CREATE POLICY "clubs_update_owner"
  ON public.clubs FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "clubs_delete_admin"
  ON public.clubs FOR DELETE
  USING (public.is_admin());

-- ─── FIELDS — drop old ownership policies and create new ones ─────────────────

DROP POLICY IF EXISTS "fields_insert_owner" ON public.fields;
DROP POLICY IF EXISTS "fields_update_owner" ON public.fields;
DROP POLICY IF EXISTS "fields_delete_admin" ON public.fields;

-- Ownership is now: field → club → owner
CREATE POLICY "fields_insert_owner"
  ON public.fields FOR INSERT
  WITH CHECK (
    public.is_owner_or_admin() AND
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "fields_update_owner"
  ON public.fields FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "fields_delete_owner"
  ON public.fields FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  );

-- ─── MATCHES — drop old policies and recreate with clubs join ─────────────────

DROP POLICY IF EXISTS "matches_select_visible"  ON public.matches;
DROP POLICY IF EXISTS "matches_insert_owner"    ON public.matches;
DROP POLICY IF EXISTS "matches_update_owner"    ON public.matches;
DROP POLICY IF EXISTS "matches_delete_admin"    ON public.matches;

CREATE POLICY "matches_select_visible"
  ON public.matches FOR SELECT
  USING (
    (is_visible = true AND status IN ('open', 'confirmed')) OR
    EXISTS (
      SELECT 1 FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id = matches.field_id AND c.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.match_id = matches.id AND e.user_id = auth.uid()
    ) OR
    public.is_admin()
  );

CREATE POLICY "matches_insert_owner"
  ON public.matches FOR INSERT
  WITH CHECK (
    public.is_owner_or_admin() AND
    EXISTS (
      SELECT 1 FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id = matches.field_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "matches_update_owner"
  ON public.matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id = matches.field_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id = matches.field_id AND c.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "matches_delete_admin"
  ON public.matches FOR DELETE
  USING (public.is_admin());

-- ─── ENROLLMENTS — drop old policies and recreate with clubs join ─────────────

DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update" ON public.enrollments;
-- enrollments_insert_self has no ownership check — keep as-is (no drop needed)

CREATE POLICY "enrollments_select"
  ON public.enrollments FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      JOIN public.clubs c  ON c.id = f.club_id
      WHERE m.id = enrollments.match_id AND c.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );

CREATE POLICY "enrollments_update"
  ON public.enrollments FOR UPDATE
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      JOIN public.clubs c  ON c.id = f.club_id
      WHERE m.id = enrollments.match_id AND c.owner_id = auth.uid()
    ) OR
    public.is_admin()
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      JOIN public.clubs c  ON c.id = f.club_id
      WHERE m.id = enrollments.match_id AND c.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );

-- ─── PAYMENTS — drop old policy and recreate with clubs join ──────────────────

DROP POLICY IF EXISTS "payments_select" ON public.payments;

CREATE POLICY "payments_select"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = payments.enrollment_id AND e.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      JOIN public.clubs c  ON c.id = f.club_id
      WHERE m.id = payments.match_id AND c.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );
