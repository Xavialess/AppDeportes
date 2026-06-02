-- RPCs for the new match state transitions introduced in migration 20240101000013.
-- Must be a separate migration from the ALTER TYPE statements (Postgres SQLSTATE 55P04).

-- ─── RPC: get_kickoff_confirmed_matches ────────────────────────────────────
-- Returns confirmed matches whose kickoff time has passed → should move to en_curso.

CREATE OR REPLACE FUNCTION public.get_kickoff_confirmed_matches()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM matches
  WHERE status = 'confirmed'
    AND (date || ' ' || start_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now();
$$;

GRANT EXECUTE ON FUNCTION public.get_kickoff_confirmed_matches() TO service_role;

-- ─── RPC: get_finished_in_progress_matches ─────────────────────────────────
-- Returns en_curso matches whose end time has passed → should move to jugado.

CREATE OR REPLACE FUNCTION public.get_finished_in_progress_matches()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM matches
  WHERE status = 'en_curso'
    AND (date || ' ' || end_time)::timestamp AT TIME ZONE 'America/Guayaquil' < now();
$$;

GRANT EXECUTE ON FUNCTION public.get_finished_in_progress_matches() TO service_role;
