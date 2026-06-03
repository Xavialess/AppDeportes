# update-match-states — Schedule Setup

Runs every 1 minute via Supabase Cron (pg_cron). Advances match states
based on wall-clock time:

  confirmed → en_curso  (at kickoff time)
  en_curso  → jugado    (at end time)

Cannot be replaced by a row-level trigger — these transitions are
time-driven, not row-change driven.

## Cron job (Supabase Dashboard → Integrations → Cron Jobs)

| Field    | Value |
|----------|-------|
| Name     | `update-match-states` |
| Schedule | `* * * * *` |
| Method   | POST |
| URL      | `https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/update-match-states` |
| Header   | `Authorization: Bearer <SERVICE_ROLE_KEY>` |

Or via SQL (run in Supabase SQL Editor):

```sql
SELECT cron.schedule(
  'update-match-states',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/update-match-states',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

## Health check

```
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/update-match-states?health=1
→ { "status": "ok" }
```

## Verify cron is running

```sql
-- Recent run history
SELECT * FROM cron.job_run_details
  WHERE jobname = 'update-match-states'
  ORDER BY start_time DESC
  LIMIT 10;
```
