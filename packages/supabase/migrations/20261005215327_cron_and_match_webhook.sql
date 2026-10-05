-- Scheduled Edge Function calls + match-update webhook, environment-agnostic.
--
-- Project URL and service-role key are read from Supabase Vault at call time,
-- so nothing project-specific lives in this file. After applying, set them once:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_JWT eyJ...>',          'service_role_key');
--
-- To rotate: select vault.update_secret(id, '<new value>') from vault.secrets where name = '...';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: POST to an Edge Function using the vault-stored URL + service key.
-- Returns the pg_net request id, or NULL (with a warning) if not configured.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_edge_function(
  fn      text,
  payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  api_key  text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if base_url is null or api_key is null then
    raise warning 'invoke_edge_function(%): vault secrets project_url / service_role_key are not set', fn;
    return null;
  end if;

  return net.http_post(
    url     := base_url || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type',  'application/json'
    ),
    body    := payload
  );
end;
$$;

revoke all on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cron jobs (cron.schedule upserts by job name, so this is idempotent)
-- ---------------------------------------------------------------------------
select cron.schedule('auto-cancel-matches',   '* * * * *',    $$select public.invoke_edge_function('auto-cancel-matches')$$);
select cron.schedule('update-match-states',   '* * * * *',    $$select public.invoke_edge_function('update-match-states')$$);
select cron.schedule('match-reminders',       '* * * * *',    $$select public.invoke_edge_function('match-reminders')$$);
select cron.schedule('auto-confirm-matches',  '*/10 * * * *', $$select public.invoke_edge_function('auto-confirm-matches')$$);

-- ---------------------------------------------------------------------------
-- Webhook: notify-match-event on matches status change.
-- Replaces the dashboard "Database Webhook"; payload mirrors its shape.
-- The function only acts on status transitions, so we only fire on those.
-- Failures are swallowed with a warning so they can never block a match update.
-- ---------------------------------------------------------------------------
create or replace function public.notify_match_event_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.invoke_edge_function(
      'notify-match-event',
      jsonb_build_object(
        'type',       'UPDATE',
        'table',      'matches',
        'schema',     'public',
        'record',     to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  exception when others then
    raise warning 'notify_match_event_webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.notify_match_event_webhook() from public, anon, authenticated;

drop trigger if exists trg_notify_match_event on public.matches;
create trigger trg_notify_match_event
  after update on public.matches
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_match_event_webhook();
