-- Migration: attendance_rpc
--
-- Adds a SECURITY DEFINER RPC function used exclusively by the
-- mark-attendance Edge Function to atomically increment the denormalized
-- `users.matches_played` counter.
--
-- The function is SECURITY DEFINER so it runs as the owning role (postgres)
-- and bypasses RLS, matching the intent that only server-side code
-- (Edge Functions using the service role) may update this counter.
--
-- Direct client updates to `users.matches_played` remain blocked by RLS.

CREATE OR REPLACE FUNCTION public.increment_user_matches_played(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET matches_played = matches_played + 1
  WHERE id = p_user_id;
$$;

COMMENT ON FUNCTION public.increment_user_matches_played(UUID) IS
  'Atomically increments users.matches_played by 1. '
  'Called exclusively by the mark-attendance Edge Function. '
  'SECURITY DEFINER — must never be exposed to anonymous or player roles.';

-- Revoke execute from public and authenticated; only service role (via Edge
-- Functions) should call this.
REVOKE EXECUTE ON FUNCTION public.increment_user_matches_played(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_user_matches_played(UUID) FROM authenticated;
