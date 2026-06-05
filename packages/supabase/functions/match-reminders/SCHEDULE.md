# match-reminders — Schedule Setup

Runs every 1 minute via Supabase Cron (pg_cron). Sends a "your match starts in
1 hour" push to every **active enrollee** (pending / payment_pending / confirmed)
of each `confirmed` match entering the 60-minute pre-kickoff window.

Each match is reminded exactly once — `matches.reminder_sent_at` (migration 32)
is stamped after the send, and `get_matches_for_reminder()` only returns matches
where it is NULL.

## Cron job (Supabase Dashboard → Integrations → Cron Jobs)

| Field    | Value |
|----------|-------|
| Name     | `match-reminders` |
| Schedule | `* * * * *` |
| Method   | POST |
| URL      | `https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/match-reminders` |
| Header   | `Authorization: Bearer <SERVICE_ROLE_KEY>` |

Or via SQL (run in Supabase SQL Editor):

```sql
SELECT cron.schedule(
  'match-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/match-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

> The `Authorization` header must be the **service role JWT** (starts with `eyJ`),
> not the `sb_secret_...` key — see the pg_cron auth note in CLAUDE.md.

## Health check

```
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/match-reminders?health=1
→ { "status": "ok" }
```
