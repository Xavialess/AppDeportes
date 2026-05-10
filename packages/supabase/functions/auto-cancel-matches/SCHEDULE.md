# auto-cancel-matches — Schedule Setup

This Edge Function must run every 5 minutes to cancel open matches that did not
reach their minimum player count before the confirmation deadline.

## Option A — pg_cron via Supabase Dashboard (recommended)

1. Open Supabase Dashboard → **Database** → **Extensions**
2. Enable the `pg_net` and `pg_cron` extensions if not already active
3. Open the **SQL Editor** and run:

```sql
select cron.schedule(
  'auto-cancel-matches',       -- job name (must be unique)
  '*/5 * * * *',               -- every 5 minutes
  $$
  select net.http_post(
    url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

> Store the service role key as a Postgres setting or use a Vault secret rather
> than hardcoding it. The key shown above is a placeholder.

## Option B — Supabase Edge Function cron (Dashboard UI)

1. Open Supabase Dashboard → **Edge Functions** → **auto-cancel-matches**
2. Click **"Schedule"** or **"Add cron trigger"**
3. Set the schedule to `*/5 * * * *`

## Verify the job

```sql
-- List all pg_cron jobs
select * from cron.job;

-- Check recent run history
select * from cron.job_run_details order by start_time desc limit 20;
```

## Health check

The function accepts `?health=1` for uptime monitoring without triggering the job:

```
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-cancel-matches?health=1
Authorization: Bearer <ANON_KEY>

→ { "status": "ok" }
```

## Remove the schedule

```sql
select cron.unschedule('auto-cancel-matches');
```
