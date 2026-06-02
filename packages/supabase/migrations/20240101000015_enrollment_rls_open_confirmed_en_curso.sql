-- Allow enrollment in open, confirmed, and en_curso matches (not jugado or cancelled).
-- The max_players capacity check is enforced at the application layer.

DROP POLICY IF EXISTS "enrollments_insert_self" ON public.enrollments;

CREATE POLICY "enrollments_insert_self"
  ON public.enrollments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = enrollments.match_id
        AND m.status IN ('open', 'confirmed', 'en_curso')
        AND m.is_visible = true
        AND m.type = 'open'
    )
  );
