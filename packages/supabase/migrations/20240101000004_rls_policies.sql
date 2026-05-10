-- =============================================================================
-- Migration: 0004 – Row Level Security
--
-- Design principles:
-- • Every table in the public (exposed) schema has RLS enabled.
-- • Role checks use public.is_admin() / public.is_owner_or_admin() — SECURITY
--   DEFINER functions that read from our users table, NOT from user_metadata
--   (which is user-editable and unsafe per Supabase security guidelines).
-- • Admins can do everything. Owners manage their own resources. Players can
--   read public data and manage their own enrollments/payments.
-- =============================================================================

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

ALTER TABLE public.countries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_sports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fields        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments      ENABLE ROW LEVEL SECURITY;

-- ─── Grant table access to authenticated / anon roles ─────────────────────────
-- RLS controls which rows; these GRANTs control which tables are reachable via
-- the Data API. Anon can read public reference data; everything else requires auth.

GRANT SELECT ON public.countries   TO anon, authenticated;
GRANT SELECT ON public.cities      TO anon, authenticated;
GRANT SELECT ON public.sports      TO anon, authenticated;
GRANT SELECT ON public.city_sports TO anon, authenticated;
GRANT SELECT ON public.plans       TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.users          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fields         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matches        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enrollments    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments       TO authenticated;

-- Admin-only deletions (handled via service role in Edge Functions, but explicit
-- DELETE grants let admin role policies work if using Postgres roles in future)
GRANT DELETE ON public.fields    TO authenticated;
GRANT DELETE ON public.matches   TO authenticated;

-- ─── countries ────────────────────────────────────────────────────────────────

CREATE POLICY "countries_read_all"
  ON public.countries FOR SELECT
  USING (true);

CREATE POLICY "countries_admin_write"
  ON public.countries FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── cities ──────────────────────────────────────────────────────────────────

CREATE POLICY "cities_read_active"
  ON public.cities FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "cities_admin_write"
  ON public.cities FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── sports ──────────────────────────────────────────────────────────────────

CREATE POLICY "sports_read_active"
  ON public.sports FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "sports_admin_write"
  ON public.sports FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── city_sports ─────────────────────────────────────────────────────────────

CREATE POLICY "city_sports_read_active"
  ON public.city_sports FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "city_sports_admin_write"
  ON public.city_sports FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── plans ───────────────────────────────────────────────────────────────────

CREATE POLICY "plans_read_all"
  ON public.plans FOR SELECT
  USING (true);

CREATE POLICY "plans_admin_write"
  ON public.plans FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── users ───────────────────────────────────────────────────────────────────
-- Self-access for reads and profile updates. Admins can read all.
-- Role changes are only allowed via the service role (Edge Function / admin action).

CREATE POLICY "users_select_self"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_self"
  ON public.users FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (
    -- Prevent self-promotion: only admins can change role or is_pro
    (id = auth.uid() AND public.is_admin()) OR
    (id = auth.uid() AND
      -- Subquery to check role/is_pro are unchanged for non-admin self-updates
      NOT EXISTS (
        SELECT 1 FROM public.users current
        WHERE current.id = auth.uid()
          AND (
            (users.role IS DISTINCT FROM current.role AND NOT public.is_admin()) OR
            (users.is_pro IS DISTINCT FROM current.is_pro AND NOT public.is_admin())
          )
      )
    ) OR
    public.is_admin()
  );

-- ─── owner_profiles ──────────────────────────────────────────────────────────

CREATE POLICY "owner_profiles_select"
  ON public.owner_profiles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "owner_profiles_insert"
  ON public.owner_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "owner_profiles_update"
  ON public.owner_profiles FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ─── fields ──────────────────────────────────────────────────────────────────

CREATE POLICY "fields_select_all"
  ON public.fields FOR SELECT
  USING (true);

CREATE POLICY "fields_insert_owner"
  ON public.fields FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND public.is_owner_or_admin()
  );

CREATE POLICY "fields_update_owner"
  ON public.fields FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "fields_delete_admin"
  ON public.fields FOR DELETE
  USING (public.is_admin());

-- ─── matches ─────────────────────────────────────────────────────────────────

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
    -- Players can see matches they're enrolled in (regardless of visibility)
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
      WHERE f.id = matches.field_id AND f.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "matches_update_owner"
  ON public.matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = matches.field_id AND f.owner_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = matches.field_id AND f.owner_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "matches_delete_admin"
  ON public.matches FOR DELETE
  USING (public.is_admin());

-- ─── enrollments ─────────────────────────────────────────────────────────────

CREATE POLICY "enrollments_select"
  ON public.enrollments FOR SELECT
  USING (
    -- Own enrollments
    user_id = auth.uid() OR
    -- Owner sees enrollments for their matches
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      WHERE m.id = enrollments.match_id AND f.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );

CREATE POLICY "enrollments_insert_self"
  ON public.enrollments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    -- Match must be open and visible
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = enrollments.match_id
        AND m.status = 'open'
        AND m.is_visible = true
        AND m.type = 'open'
    )
  );

CREATE POLICY "enrollments_update"
  ON public.enrollments FOR UPDATE
  USING (
    -- Player can cancel own enrollment
    user_id = auth.uid() OR
    -- Owner can mark attendance / update status for their match's enrollments
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      WHERE m.id = enrollments.match_id AND f.owner_id = auth.uid()
    ) OR
    public.is_admin()
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      WHERE m.id = enrollments.match_id AND f.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );

-- ─── payments ────────────────────────────────────────────────────────────────

CREATE POLICY "payments_select"
  ON public.payments FOR SELECT
  USING (
    -- Player who made the payment
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = payments.enrollment_id AND e.user_id = auth.uid()
    ) OR
    -- Owner of the match
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.fields f ON f.id = m.field_id
      WHERE m.id = payments.match_id AND f.owner_id = auth.uid()
    ) OR
    public.is_admin()
  );

-- Payments are created by the system (Edge Function with service role).
-- No direct INSERT from the client — the Edge Function handles payment initiation.
CREATE POLICY "payments_insert_system_only"
  ON public.payments FOR INSERT
  WITH CHECK (public.is_admin());

-- Refunds and status updates go through Edge Functions (service role).
CREATE POLICY "payments_update_system_only"
  ON public.payments FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
