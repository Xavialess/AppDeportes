-- RPC: get_past_kickoff_open_matches
--
-- Returns open matches whose kickoff time has already passed.
-- Combines the date + start_time columns into a local timestamp and converts
-- to UTC using Ecuador's timezone (America/Guayaquil, UTC-5, no DST) before
-- comparing with now().
--
-- Used by the auto-cancel-matches Edge Function.

create or replace function public.get_past_kickoff_open_matches()
returns table(id uuid, min_players integer)
language sql
security definer
set search_path = public
as $$
  select id, min_players
  from matches
  where status = 'open'
    and (date || ' ' || start_time)::timestamp at time zone 'America/Guayaquil' < now();
$$;

grant execute on function public.get_past_kickoff_open_matches() to service_role;
