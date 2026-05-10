# auto-confirm-matches — Schedule Setup

This Edge Function should run every 5 minutes to confirm open matches that have
reached their minimum player count before the confirmation deadline.

## Option A — pg_cron via Supabase Dashboard (recommended)

1. Open Supabase Dashboard → **Database** → **Extensions**
2. Enable the `pg_net` and `pg_cron` extensions if not already active
3. Open the **SQL Editor** and run:

```sql
select cron.schedule(
  'auto-confirm-matches',      -- job name (must be unique)
  '*/5 * * * *',               -- every 5 minutes
  $$
  select net.http_post(
    url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-confirm-matches',
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

1. Open Supabase Dashboard → **Edge Functions** → **auto-confirm-matches**
2. Click **"Schedule"** or **"Add cron trigger"**
3. Set the schedule to `*/5 * * * *`

## Scheduling note

Both `auto-confirm-matches` and `auto-cancel-matches` run on the same 5-minute
cadence. They target complementary conditions and are safe to run concurrently:

| Function | Condition | Action |
|---|---|---|
| `auto-confirm-matches` | `deadline > NOW()` AND `enrolled >= min` | → `confirmed` |
| `auto-cancel-matches` | `deadline < NOW()` AND `enrolled < min` | → `cancelled` |

Idempotency guards (`.eq('status', 'open')`) on both update queries ensure that
concurrent executions produce no-ops rather than conflicting writes.

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
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-confirm-matches?health=1
Authorization: Bearer <ANON_KEY>

→ { "status": "ok" }
```

## Remove the schedule

```sql
select cron.unschedule('auto-confirm-matches');
```
