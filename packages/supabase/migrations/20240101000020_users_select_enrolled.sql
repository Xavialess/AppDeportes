-- =============================================================================
-- Migration: 0020 – Allow owners to read enrolled players' profiles
--
-- The existing users_select_self policy only allows reading your own row.
-- When an owner loads their match enrollment list and embeds users(name, email),
-- every player row comes back null because their user records are blocked.
--
-- Fix: add a policy permitting an owner to read the user rows of players who
-- are actively enrolled in any match belonging to their clubs.
-- No circular RLS: this subquery joins enrollments → matches → fields → clubs,
-- none of which have policies that reference the users table.
-- =============================================================================

CREATE POLICY "users_select_enrolled_in_owner_match"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.enrollments e
      JOIN   public.matches m  ON m.id  = e.match_id
      JOIN   public.fields  f  ON f.id  = m.field_id
      JOIN   public.clubs   c  ON c.id  = f.club_id
      WHERE  e.user_id     = users.id
        AND  c.owner_id    = auth.uid()
        AND  e.status NOT IN ('cancelled', 'refunded')
    )
  );
