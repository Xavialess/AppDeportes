# auto-cancel-matches — Schedule Setup

Runs every 1 minute via Supabase Cron (pg_cron). Cancels matches in two cases:

  1. Deadline passed with fewer players than min_players → cancelled
  2. Kickoff time passed and match is still open → cancelled

Cannot be replaced by a row-level trigger — these transitions are
time-driven, not row-change driven.

## Cron job (Supabase Dashboard → Integrations → Cron Jobs)

| Field    | Value |
|----------|-------|
| Name     | `auto-cancel-matches` |
| Schedule | `* * * * *` |
| Method   | POST |
| URL      | `https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches` |
| Header   | `Authorization: Bearer <SERVICE_ROLE_KEY>` |

Or via SQL (run in Supabase SQL Editor):

```sql
SELECT cron.schedule(
  'auto-cancel-matches',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches',
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
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches?health=1
→ { "status": "ok" }
```

## Verify cron is running

```sql
SELECT * FROM cron.job_run_details
  WHERE jobname = 'auto-cancel-matches'
  ORDER BY start_time DESC
  LIMIT 10;
```

## Remove the schedule

```sql
SELECT cron.unschedule('auto-cancel-matches');
```
