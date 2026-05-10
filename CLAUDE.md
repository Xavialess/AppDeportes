# AppDeportes — Project Context for Claude Code

> **Living document.** Update at the end of every session where something significant is built or decided.
> Last updated: 2026-05-09 (Next.js 15 upgrade)

---

## What This Is

A sports booking app for Ecuador, similar to GoodRec. Players find and join open matches near them; field owners post matches and manage reservations. Launching in Quito and Guayaquil. Schema supports multi-country expansion (Colombia, Peru) without code changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Mobile | React Native + Expo (SDK 51) + Expo Router |
| Web | Next.js 15 (App Router) + React 19 |
| Database / Auth / Realtime | Supabase (Postgres 15) |
| Server logic | Supabase Edge Functions (Deno) |
| Payments | TBD — Kushki or PayPhone (Ecuador). Data model is provider-agnostic. |
| i18n | i18next + react-i18next. Spanish default. English file exists but is empty. |
| Language | TypeScript throughout |

---

## Monorepo Structure

```
apps/
  mobile/          Expo app — players and owners (role-based UI)
  web/             Next.js — owner dashboard + admin panel
packages/
  types/           Shared TypeScript domain types
  utils/           Shared utility functions (date, currency, validation)
  supabase/        Supabase client factory, database types, migrations, Edge Functions
  i18n/            Shared translation files (es.json, en.json)
```

All packages use `@appdeportes/` namespace. Internal dependencies use `workspace:*`.

---

## User Roles

Three roles on the same `users` table: `player`, `owner`, `admin`.

- A user can hold both `player` and `owner` roles simultaneously — the UI adapts.
- Role is stored in `public.users.role` (not `user_metadata` — that's user-editable and unsafe).
- Role changes are performed server-side via service role only.
- RLS uses `public.is_admin()` and `public.is_owner_or_admin()` SECURITY DEFINER functions.

---

## Database Schema (tables in `public`)

| Table | Purpose |
|---|---|
| `countries` | Admin-managed. Supports EC/CO/PE + future. Has `currency_code` per country. |
| `cities` | Admin-managed. `is_active` toggles availability without code changes. |
| `sports` | Admin-managed. `formats` is `TEXT[]` (e.g. `['5v5','7v7']`). `is_active` toggles per sport. |
| `city_sports` | Admin-managed join table. Controls which sports are active per city. |
| `plans` | Owner subscription tiers. Limits `max_matches_per_month`. |
| `users` | Public profile extending `auth.users`. `matches_played` is a **denormalized counter** — only updated by Edge Function on match completion, never manually. |
| `owner_profiles` | Extended profile for owners. `cancellation_count` tracks owner-initiated cancellations for future penalty system. |
| `fields` | Physical venues/canchas. Owned by owner users. |
| `matches` | Core entity. `type`: `open` (individual enrollment) or `reservation` (full field). `status`: `open → confirmed → completed` or `cancelled`. |
| `enrollments` | Player enrollment in open matches. One row per player per match. |
| `payments` | Provider-agnostic payment records. `provider` and `provider_transaction_id` are plain text strings. |

### Key constraints to remember
- `matches.type = 'open'` requires: `price_per_player`, `min_players`, `max_players`, `confirmation_deadline`
- `matches.type = 'reservation'` requires: `total_price`
- `enrollments` has a circular FK with `payments` (intentional — added via ALTER TABLE after both tables are created)

---

## Match Lifecycle

### Open Match
```
Owner posts → status=open, is_visible=true
Players enroll + pay → enrollments.status=pending
Before deadline:
  enrolled_count >= min_players → auto-confirm (status=confirmed, slot locked)
  enrolled_count < min_players → auto-cancel (status=cancelled, all refunds triggered)
Owner can manually cancel before deadline → cancellation_count++, all refunds
After match date → owner marks attendance → Edge Function increments users.matches_played
```

### Full Reservation
```
Owner posts → type=reservation, total_price set
One payer books entire field → single payment
Cancellation window TBD — schema supports it via payments.status + cancellation_reason
```

---

## Auto-Cancellation Logic

- Edge Function: `packages/supabase/functions/auto-cancel-matches/index.ts`
- Runs every ~5 minutes via Supabase scheduled invocation
- Finds `type=open, status=open` matches where `confirmation_deadline < now()`
- If `enrolled_count < min_players`: cancels match, marks enrollments as `refunded`
- System cancellations: `cancelled_by = NULL` (owner penalty counter NOT incremented)
- Owner cancellations: `cancelled_by = owner_id` (penalty counter incremented via trigger)

---

## RLS Design

- All public schema tables have RLS enabled
- `anon` role: read access to `countries`, `cities`, `sports`, `city_sports`, `plans` only
- `authenticated` role: access gated by row-level policies
- Payments: **no direct client INSERT/UPDATE** — all payment operations go through Edge Functions with service role
- Views bypass RLS — no views created yet; if added, use `security_invoker = true` (Postgres 15+)

---

## Monetization Model

- **Owners**: monthly subscription (Básico $19.99/10 matches, Estándar $39.99/30, Pro $69.99/100)
- **Players**: free with ads; `users.is_pro = true` removes ads and unlocks future features
- No per-transaction commission — owners keep 100% of player payments

---

## i18n Rules

- Spanish (`es`) is the default and only fully implemented language
- `en.json` exists but stays empty until explicitly needed
- UI strings only — user-generated content (match titles, field names) is NOT translated in v1
- Both mobile and web share translation files from `@appdeportes/i18n`

---

## Environment Variables

### Mobile (`apps/mobile/.env`)
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

### Web (`apps/web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   ← never expose to browser, server-side only
```

---

## Mobile Dev Setup

- **Metro config**: `apps/mobile/metro.config.js` is required for pnpm monorepo symlink resolution. Sets `watchFolders`, `nodeModulesPaths`, `unstable_enableSymlinks`, and an `extraNodeModules` proxy.
- **`@babel/runtime`** must be a direct dependency of `@appdeportes/mobile` — pnpm won't hoist it automatically and Metro won't find it otherwise.
- **Run mobile from the main repo**, not from a git worktree — Metro's relative path resolution breaks inside worktrees.
- **Supabase email confirmation**: disabled in dev to avoid the free-tier rate limit (3 emails/hour). Re-enable before production.

---

## Key Conventions

- **Package naming**: `@appdeportes/<name>`
- **Supabase client on mobile**: always create via `createSupabaseClient()` from `@appdeportes/supabase`
- **Supabase client on web**: use the split helpers in `apps/web/src/lib/supabase/`:
  - `client.ts` → `createClient()` — Client Components only (`'use client'`)
  - `server.ts` → `createClient()` — Server Components, Server Actions, Route Handlers (async, reads cookies)
  - `admin.ts` → `createAdminClient()` — service role, bypasses RLS; server-side only, never in the browser
- **`cookies()` is async in Next.js 15**: always `await cookies()` — calling it synchronously is a type error
- **`params` / `searchParams` are async in Next.js 15**: pages receive them as `Promise<{...}>` — destructure with `await`
- **`fetch` caching**: default changed to `no-store` in Next.js 15 — add `cache: 'force-cache'` explicitly when you want caching
- **`next.config.ts`**: TypeScript config is native in Next.js 15 — no `.js` fallback in this repo
- **Turbopack**: `next dev --turbopack` is the dev command (stable in v15)
- **Service role**: only use in Edge Functions and Next.js Server Actions/Route Handlers — never in Client Components or mobile app
- **DB types**: `packages/supabase/src/database.types.ts` is auto-generated via `pnpm --filter @appdeportes/supabase db:types` after schema changes
- **migrations**: created with `supabase migration new <name>` — never invent filenames
- **`matches_played`**: never increment manually — Edge Function only
- **Role checks in RLS**: always use `public.is_admin()` / `public.is_owner_or_admin()` — never read from `user_metadata`

---

## What's NOT Built Yet (V1 scope remaining)

- Payment integration (provider TBD: Kushki or PayPhone)
- Admin panel (full CRUD for reference data, user management, manual refunds)
- Push notifications
- Player Pro subscription flow
- Supabase Storage setup (field images, avatars)
- Player upcoming matches screen (APPD-16)
- Owner cancel/hide match on mobile (APPD-19)

---

## What's Explicitly Out of V1

- Social features (follow, friend, ratings)
- Leaderboards
- Match reviews
- Multi-language content translation
- Per-match commission model
- Conflict management between match types on the same slot

---

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

**Setup (first time):** `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup`
To update: run `/gstack-upgrade`.

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

---

## Session Log

| Date | What was done |
|---|---|
| 2026-05-09 | Initial scaffold: Turborepo monorepo, all packages, Expo Router mobile app, Next.js 14 web app, complete Supabase schema (5 migrations: schema + indexes + functions/triggers + RLS + seed), CLAUDE.md |
| 2026-05-09 | Upgraded web app to Next.js 15 + React 19. Replaced `@supabase/auth-helpers-nextjs` with `@supabase/ssr`. Split Supabase client into `client.ts` / `server.ts` / `admin.ts`. Added session-refresh middleware. `next.config.ts` (TypeScript). Turbopack dev enabled. |
| 2026-05-09 | APPD-24: `auto-confirm-matches` Edge Function (open matches hit min players before deadline → confirmed). `mark-attendance` Edge Function (owner marks players attended, triggers `increment_user_matches_played` RPC). Migration `20240101000006_attendance_rpc.sql`. |
| 2026-05-09 | APPD-13/14/15: Mobile player screens — match listing with sport filter chips (batched enrollment counts, no N+1), match detail with adaptive enroll CTA, enrollment flow (in-person live, in-app stub with "Próximamente"). |
| 2026-05-09 | APPD-17/18: Mobile owner screens — quick post form (carousel pickers, open/reservation toggle, success redirect), match detail with attendance toggle per player, "Completar partido" action. Fixed: `enrolled_count` is not a DB column — derived from enrollments join. |
| 2026-05-09 | APPD-20/21: Web owner dashboard — NavLink with active-state, match list with plan usage bar, match detail + inline cancel Server Action, new match form with Server Action (validates, checks plan limit, verifies field ownership). |
| 2026-05-09 | Fixed Metro + pnpm monorepo: added `metro.config.js` with `watchFolders`, `nodeModulesPaths`, `unstable_enableSymlinks`, `extraNodeModules` proxy. Added `@babel/runtime` as direct dep. Fixed `database.types.ts` (CLI banner was prepended/appended to file). Fixed `i18n` TS2742 with explicit return type + `compatibilityJSON: 'v3'`. |
