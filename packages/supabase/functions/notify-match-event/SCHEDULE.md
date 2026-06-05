# notify-match-event — Database Webhook Setup

This function is **not** a cron job. It is invoked by a Supabase **Database
Webhook** that fires on every UPDATE of `public.matches`. It sends push
notifications when a match transitions to `confirmed` or `cancelled`, to every
enrollee of that match.

A webhook (rather than wiring each code path) is used deliberately: a match
reaches `confirmed` via the auto-confirm trigger and `cancelled` via owner
cancel, auto-cancel-deadline, and auto-cancel-kickoff. Listening to the row
UPDATE catches all paths with one function and never drifts.

The function ignores any UPDATE that does not cross into confirmed/cancelled,
so it is safe to fire on all matches updates.

## Database Webhook (Supabase Dashboard → Database → Webhooks)

| Field      | Value |
|------------|-------|
| Name       | `notify-match-event` |
| Table      | `public.matches` |
| Events     | `UPDATE` |
| Type       | HTTP Request |
| Method     | `POST` |
| URL        | `https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/notify-match-event` |
| HTTP Header| `Authorization: Bearer <SERVICE_ROLE_KEY>` |

The webhook delivers `{ type, table, record, old_record }`. The function compares
`old_record.status` to `record.status` to detect the transition.

> Use the **service role JWT** (starts with `eyJ`) in the Authorization header.

## Recipients

| Transition            | Audience |
|-----------------------|----------|
| `* → confirmed`       | enrollments in `pending`, `payment_pending`, `confirmed` |
| `* → cancelled`       | enrollments in `pending`, `payment_pending`, `confirmed`, `refunded`, `cancelled` (the cancellation flips slots to refunded in the same operation, so the wider set is intentional) |

## Health check

```
GET https://xnasvbtyvxwmkhkgidnj.supabase.co/functions/v1/notify-match-event?health=1
→ { "status": "ok" }
```
