# auto-confirm-matches — No cron needed

This Edge Function is **not scheduled via cron**. Match confirmation is now
handled instantly by a Postgres trigger (migration 27: `trg_auto_confirm_match_on_enrollment`).

The trigger fires on every enrollment insert/update and confirms the match
immediately when active enrollment count reaches `min_players` — zero lag.

## Why the function still exists

Kept as a **safety net** only. If the trigger ever fails silently (e.g. a bug
in the trigger function), this Edge Function can be called manually or
temporarily scheduled to recover. Do not add a cron job for it under normal
operation.

## Manual invocation (recovery only)

```bash
curl -X POST https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-confirm-matches \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## Health check

```
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/auto-confirm-matches?health=1
→ { "status": "ok" }
```
