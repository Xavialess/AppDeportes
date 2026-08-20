# AppDeportes — Project Context for Claude Code

> **Living document.** Update at the end of every session where something significant is built or decided.
> Last updated: 2026-08-19 (UI/UX audit + performance/animation/design implementation)

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
| Payments | De Una (deuna.ec) — QR-based P2P payments. cancha. never holds funds. Needs DEUNA_MASTER_TOKEN + DEUNA_WEBHOOK_SECRET from De Una developer portal. |
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
| `clubs` | Complejos/venues owned by owners. Has `owner_id`, `city_id`, `name`, `address`, `images`. One owner can have multiple clubs in different locations. |
| `fields` | Individual canchas within a club. Has `club_id` (FK → clubs), `city_id` (denormalized for query filtering), `name`, `images`. **No `owner_id`** — ownership is always via `fields.club_id → clubs.owner_id`. |
| `matches` | Core entity. `type`: `open` (individual enrollment) or `reservation` (full field). `status`: see Match Lifecycle below. |
| `enrollments` | Player enrollment in open matches. `payment_method`: `'in_person'` or `'in_app'`. Partial unique index (active statuses only) allows re-enrollment after cancellation. |
| `payments` | Provider-agnostic payment records. `provider` and `provider_transaction_id` are plain text strings. Partial unique index prevents duplicate in-flight intents per enrollment. |

### Key constraints to remember
- `matches.type = 'open'` requires: `price_per_player`, `min_players`, `max_players`, `confirmation_deadline`
- `matches.type = 'reservation'` requires: `total_price`
- `enrollments` has a circular FK with `payments` (intentional — added via ALTER TABLE after both tables are created)
- **Never use `fields.owner_id`** — it was removed in migration 16. Ownership is always `fields.club_id → clubs.owner_id`
- `fields.city_id` is kept denormalized (matches `clubs.city_id`) for efficient city-based match filtering
- `enrollments.payment_method` separates in-person (`pending` resting state) from De Una (`in_app`, cancelled on payment failure)
- `owner_profiles.deuna_merchant_id` + `deuna_phone_linked` required for De Una payments on that owner's matches

---

## Match Lifecycle

### Status state machine
```
open ──► confirmed ──► en_curso ──► jugado
  │          │
  └──────────┴──► cancelled
```

| Status | Meaning | Who/what sets it |
|---|---|---|
| `open` | Accepting enrollments | Owner posts |
| `confirmed` | Min players met, slot locked | Postgres trigger `trg_auto_confirm_match_on_enrollment` (instant) |
| `en_curso` | Kick-off time reached | `update-match-states` cron (every 1 min) + client virtual state |
| `jugado` | Match finished (end time passed or owner marks attendance) | `update-match-states` cron (every 1 min) + client virtual state |
| `cancelled` | Match cancelled | Owner manually, or `auto-cancel-matches` |
| `completed` | Legacy alias for `jugado` — kept in enum for backwards compat, never assigned to new matches |

### Enrollment rules
- Players can enroll when `status IN ('open', 'confirmed', 'en_curso')` AND `enrolled_count < max_players` AND kickoff hasn't passed (except `en_curso`)
- Players **cannot** enroll in `jugado`, `cancelled`, `completed` matches
- RLS enforces this at DB level (migration 15)

### Open Match flow
```
Owner posts → status=open, is_visible=true
Players enroll (in_person → pending, in_app → pending → payment_pending → confirmed)
Each enrollment triggers instant check:
  enrolled_count >= min_players AND deadline not passed → confirmed (trigger, instant)
Deadline passes with enrolled_count < min_players → cancelled (cron, ≤1 min)
Withdrawal from confirmed match:
  count drops to 0 AND deadline passed → cancelled (trigger)
  count < min AND deadline not passed → reverts to open (trigger)
  count < min AND deadline passed AND count > 0 → stays confirmed (owner handles)
De Una payment failed/expired → enrollment cancelled (slot freed immediately)
Zombie payment_pending > 25 min → enrollment cancelled (cron cleanup)
At kick-off time → status=en_curso (cron ≤1 min + instant client virtual state)
At end time → status=jugado (cron ≤1 min + instant client virtual state)
Owner marks attendance → mark-attendance Edge Function → increments users.matches_played
```

### Full Reservation flow
```
Owner posts → type=reservation, total_price set
One payer books entire field → single payment
Cancellation window TBD — schema supports it via payments.status + cancellation_reason
```

---

## Auto-State-Change Infrastructure

### Postgres triggers (instant, no lag)
| Trigger | What it does |
|---|---|
| `trg_auto_confirm_match_on_enrollment` | Fires on every enrollment INSERT/UPDATE. Confirms match instantly when active count ≥ min_players and deadline not passed. Bulk-confirms pending (in-person) enrollments. |
| `trg_reevaluate_match_on_enrollment_change` | Fires when an active enrollment becomes inactive (cancelled/refunded/pending). Re-evaluates confirmed matches: reverts to open (deadline not passed), cancels (count=0 + deadline passed), or leaves confirmed (owner handles). |

### Cron jobs via pg_cron (every 1 minute)
| Function | Schedule | What it does |
|---|---|---|
| `auto-cancel-matches` | `* * * * *` | Cancels `open` matches past deadline with `< min_players`. Cancels `open` matches past kickoff. Resets zombie `payment_pending` enrollments (>25 min) to `cancelled`. |
| `update-match-states` | `* * * * *` | Advances `confirmed → en_curso` at kickoff, `en_curso → jugado` at end time. |
| `auto-confirm-matches` | `*/10 * * * *` | Safety net only — replaced by trigger. No-op in normal operation. |

### Client virtual state (instant display)
`getEffectiveStatus()` in match detail screen computes `en_curso`/`jugado` from wall-clock time without waiting for the cron. Players see the correct state at exactly kickoff/end time.

- System cancellations: `cancelled_by = NULL` (owner penalty counter NOT incremented)
- Owner cancellations: `cancelled_by = owner_id` (penalty counter incremented via trigger)
- **De Una payment failure**: enrollment → `cancelled` (not pending). Player must re-enroll to retry.
- **In-person flow**: enrollment stays `pending` until owner marks attendance. Separated by `enrollments.payment_method`.

---

## RLS Design

- All public schema tables have RLS enabled
- `anon` role: read access to `countries`, `cities`, `sports`, `city_sports`, `plans` only
- `authenticated` role: access gated by row-level policies
- Payments: **no direct client INSERT/UPDATE** — all payment operations go through Edge Functions with service role
- Views bypass RLS — no views created yet; if added, use `security_invoker = true` (Postgres 15+)

### Circular RLS fix (critical)
`matches_select_visible` and `enrollments_select` used to cross-reference each other causing infinite recursion (`42P17`). Fixed in migration 9 and kept in 19:
- `is_enrolled_in_match(match_id)` — SECURITY DEFINER, used in `matches_select_visible` to check enrollment without triggering `enrollments_select`
- `is_owner_of_match_field(match_id)` — SECURITY DEFINER, used in `enrollments_select` to check ownership without triggering `matches_select_visible`. Joins through `fields → clubs` (updated in migration 19).
- **Never replace these with direct subqueries** in those two policies — it will re-introduce the recursion.

### Ownership chain
All field/match ownership checks go: `fields.club_id → clubs.owner_id = auth.uid()`. The helper `is_owner_of_match_field()` is the canonical way to do this in RLS policies.

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
- **Admin role assignment**: the `handle_new_user` trigger never assigns `admin` role — promote via SQL: `UPDATE public.users SET role = 'admin' WHERE email = '...'` using service role. No UI for this in V1.
- **Mobile route groups and URL conflicts**: Expo Router strips group prefixes from URLs. `(owner)/match/[id]` and `match/[id]` both resolve to `/match/[id]` and will conflict. Owner match detail lives at `(owner)/my-match/[id]` → URL `/my-match/[id]` to avoid this. Owner field detail lives at `(owner)/my-field/[id]` → URL `/my-field/[id]`. Never add a folder inside a route group if a top-level folder with the same name already exists.
- **Owner hidden screens**: In `(owner)/_layout.tsx`, screens that are navigation targets but NOT tab items must be explicitly listed with `href: null` — `post-match`, `my-match`, `my-field`, `club`. Forgetting one causes it to appear as a visible tab.
- **Mobile field image uploads**: use the authenticated supabase client directly (no admin client) — RLS on `field-images` bucket allows owners to insert/delete under their own field IDs (ownership verified via `fields → clubs`). Storage path format: `{field_id}/{timestamp}-{random}.{ext}`.
- **Mobile SessionGate**: `apps/mobile/app/_layout.tsx`. Uses a `hasRouted` ref so `router.replace()` only fires once on initial load — subsequent session token refreshes do NOT re-route the user. If you need to force re-routing after a role change, reset `hasRouted.current = false` before navigating.
- **Owner mobile structure**: "Complejos" tab (`(owner)/fields.tsx`) shows clubs list → tap → `(owner)/club/[id].tsx` shows fields within a club → tap → `(owner)/my-field/[id].tsx` for image management.
- **Match detail enrollment check**: `useEffect` in `match/[id].tsx` depends on `[id, user?.id]` — both must be in the dep array so the enrollment check re-runs when the session loads after the match data.
- **Player listing filters**: Explore shows selected day only (mandatory). Defaults to today. No deselect — a day is always active.
- **Match detail virtual state**: `getEffectiveStatus()` computes effective status from wall clock. Use this for display; DB status for business logic writes.
- **De Una payment flow**: `enroll.tsx` inserts enrollment → navigates to `/payment/deuna`. QR screen calls `create-deuna-payment` Edge Function. Webhook at `/functions/v1/deuna-webhook` confirms enrollment. Failed payment → enrollment `cancelled` (not pending). Player re-enrolls to retry.
- **De Una credential gate**: owner must have `owner_profiles.deuna_merchant_id` set for De Una card to appear in enroll screen. Checked via 3-step query: match → field.club_id → club.owner_id → owner_profiles. PostgREST cannot auto-infer clubs→owner_profiles join (no direct FK).
- **enrollment.payment_method**: `'in_person'` (pending at rest, confirmed at attendance) vs `'in_app'` (cancelled on payment failure, slot freed immediately). Always pass on enrollment insert.
- **Enrollment unique constraint**: partial index `enrollments_match_user_active_idx` — only blocks duplicate active enrollments. Cancelled/refunded rows allow re-enrollment.
- **pg_cron auth**: cron jobs call Edge Functions via `net.http_post`. Must include `Authorization: Bearer <service_role_JWT>` header (starts with `eyJ`). `sb_secret_...` format is NOT a valid JWT — use the actual service role key from Settings → API.
- **`ALTER TYPE ... ADD VALUE`**: must be in a separate migration from any statements that USE the new enum value. Postgres SQLSTATE 55P04 otherwise. See migrations 13 + 14 for the split pattern.

---

## What's NOT Built Yet (V1 scope remaining)

- **De Una credentials** (business task, not code) — Register cancha. as Marketplace Partner on De Una developer portal. Get `DEUNA_MASTER_TOKEN`, `DEUNA_API_URL`, `DEUNA_WEBHOOK_SECRET`. Set as Supabase Edge Function secrets. Register webhook URL in De Una portal. Without this, payment flow is built but non-functional.
- **De Una refund API** — When match is cancelled with paid enrollments, refund call is a stub (`// TODO: trigger De Una refund`). Needs De Una credentials + refund endpoint confirmed.
- **Push notifications** — No real-time alerts for match confirmation, cancellation, payment confirmation. Players must check app manually.
- **Club creation on mobile** — Currently web-only via `/dashboard/clubs/new`
- **Field creation on mobile** — Currently web-only via `/dashboard/fields/new`
- **Player Pro subscription flow** — `users.is_pro` column exists but no purchase flow
- **Admin manual refund tooling** — Refunds page is a stub
- ~~Payment integration~~ ✓ De Una QR payments built (pending credentials)
- ~~Supabase Storage setup~~ ✓ Done
- ~~Match state automation~~ ✓ Done (triggers + 1-min crons + client virtual state)
- ~~Clubs/Complejos structure~~ ✓ Done

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

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

---

## Session Log

| Date | What was done |
|---|---|
| 2026-08-19 | **Mobile UI/UX audit + full implementation (perf, motion, loader, visual design)**: 4 parallel subagent audits (data loading, animation/transitions, loading indicator, visual design) → prioritized report → all 3 phases implemented. **Perf**: `match/[id].tsx` `loadMatch()` parallelized via `Promise.all` (was 5 sequential queries) + dropped a redundant Storage round-trip by selecting `fields.images` directly. `(owner)/index.tsx` collapsed the `clubs → fields → matches` 3-step ownership chain into one `fields!inner(...clubs!inner(owner_id))` query and killed a duplicate mount-time fetch (`useEffect` + `useFocusEffect` both firing). Removed the duplicate role lookup on login (`login.tsx` no longer queries `users.role` — `SessionGate` owns that exclusively). 6 screens (`my-matches`, `(tabs)/profile`, `(owner)/fields`, `(owner)/club/[id]`, `(owner)/my-field/[id]`, `(owner)/index`) now use a `hasDataRef` guard so `useFocusEffect` only shows a full loading state on first load, not on every refocus. Fixed a silently-swallowed avatar-upload error (`(tabs)/profile.tsx`). **Motion**: added `animation: 'slide_from_right', animationDuration: 220` to the 5 nested Stack layouts that lacked it (only the root Stack had it before). New `hooks/useReducedMotion.ts` (`AccessibilityInfo.isReduceMotionEnabled` + change listener) wired into the splash and `CanchaLoader`. Splash entrance trimmed from a fixed ~1.45s to ~900ms and **decoupled from navigation** — a `MIN_DISPLAY_MS = 400` timer now gates `router.replace`, not the decorative animation, so a fast session resolve isn't held hostage by branding. New `components/FadeIn.tsx` (native-driven opacity-on-mount) wraps resolved list content in 5 list screens so skeleton→content isn't a hard cut. **Loading indicator**: new `components/CanchaLoader.tsx` — a small rotated court tile (reusing the splash's per-sport gradients, now extracted to `lib/sportTiles.tsx`) with a lime edge-sweep animation, in `full`/`inline`/`button` variants. Replaced all 39 `ActivityIndicator` usages across 15 files (full-screen → `variant="full"`, inline/button → `variant="button"`). `SkeletonCard` rolled out to owner list screens (`fields`, `club/[id]`, `(owner)/index`) that previously fell back to a bare spinner; it also now imports `theme.ts` instead of hardcoding matching values. **Visual design**: fixed a real cross-surface bug — match status colors had drifted (e.g. `en_curso` was amber on owner screens, orange on the player detail screen); added a single `matchStatus` map to `theme.ts`, imported everywhere. Extended `theme.ts` with a typography scale, `radius.xs`, `shadow.floating`/`shadow.subtle`, `accentSecondary`, and `deunaBrand` tokens; swept the FAB shadow, the payment QR card shadow, and 4 hardcoded De Una brand-teal literals onto them. Replaced 8 files' worth of Unicode glyph icons (✎ ✓ ✕) with `@expo/vector-icons` `Ionicons` for consistent cross-platform rendering; also fixed a pre-existing low-contrast bug where disabled CTA button text was near-black on a dark-gray background. Installed `@expo-google-fonts/archivo` and load `Archivo_800ExtraBold` via `useFonts()` in `app/_layout.tsx` (gated behind the native splash so there's no FOUT); applied only to the 12 title/wordmark-class styles (`theme.fonts.display`), never body text. `tsc --noEmit` clean throughout — zero new type errors. |
| 2026-06-05 | **Animated splash screen (multi-sport)**: Replaced the soccer-only static splash with a fully animated React Native splash in `app/index.tsx`. Background: 6-sport field tile mosaic (fútbol, pádel, tenis, básquet, vóley, natación) in a rotated -8deg grid, each tile with sport-tinted gradient + court line markings as Views. Center: "cancha." wordmark + tracked tagline staggered in. Auto-navigates after animation completes using ref-based coordination (avoids stale-closure freeze). `_layout.tsx` SessionGate updated: skips auto-routing when `segments.length === 0` (splash owns its own session check + navigation). `onLayout` used to call `SplashScreen.hideAsync()` — eliminates black flash between native splash and animated splash. `app.json` splash `backgroundColor` updated `#0d2a1e` → `#0a0a0a`. Native `splash.png` (soccer field) still baked into dev binary — will clear on next EAS build. No new libraries added. |
| 2026-06-04 | **Match state machine, cron infrastructure, enrollment fixes, UX**: Migrations 24–30. Migration 24: owner_profiles public read for De Una gate. Migration 25: partial unique index on enrollments (allows re-enrollment after cancellation). Migration 26: trigger re-evaluates confirmed match on withdrawal (revert to open / cancel based on count + deadline). Migration 27: instant auto-confirm trigger replaces 5-min cron. Migration 28: cron intervals reduced to 1 min. Migration 29: payment_method column on enrollments (in_person/in_app). Migration 30: backfill stale match states (pg_cron was never enabled). Webhook: De Una payment failure now cancels enrollment (not revert to pending). Zombie cron: same change. Match detail: getEffectiveStatus() virtual state for instant en_curso/jugado display + new orange/grey badges. Explore: mandatory day selection, defaults to today, no deselect. Deadline validation fix: compares against kickoff datetime not date-only (timezone bug). pg_cron fixed: was never enabled, cron jobs had invalid JWT auth. All 5 Edge Functions deployed. |
| 2026-06-03 | **De Una payment integration (complete)**: Migrations 22+23. Edge Functions `create-deuna-payment` (12 tests) and `deuna-webhook` (11 tests, added failed/expired path resetting enrollment to pending). Mobile: `enroll.tsx` in_app enabled with credential gate (De Una card hidden if owner has no merchant ID), navigation to `/payment/deuna`. New `app/payment/deuna.tsx` QR screen with AppState listener, 5s polling, "Abrir De Una" deep link, "Verificar pago" button at 10s, countdown timer. Old `match/[id]/payment.tsx` removed. T7: mobile owner profile De Una Negocios section (merchant ID + phone, Activo badge); web `/dashboard/settings` + `DeunaSettingsForm` client component + nav item. T8: `auto-cancel-matches` zombie cleanup (payment_pending → pending after 25 min); also fixed to include payment_pending in match-cancellation refund sweep. `database.types.ts` updated: clubs table, fields schema (club_id), match_status (en_curso/jugado), enrollment_status (payment_pending). Mobile now 0 TS errors (added `types/env.d.ts` for process.env, fixed post-match.tsx insert cast). |
| 2026-05-09 | Initial scaffold: Turborepo monorepo, all packages, Expo Router mobile app, Next.js 14 web app, complete Supabase schema (5 migrations: schema + indexes + functions/triggers + RLS + seed), CLAUDE.md |
| 2026-05-09 | Upgraded web app to Next.js 15 + React 19. Replaced `@supabase/auth-helpers-nextjs` with `@supabase/ssr`. Split Supabase client into `client.ts` / `server.ts` / `admin.ts`. Added session-refresh middleware. `next.config.ts` (TypeScript). Turbopack dev enabled. |
| 2026-05-09 | APPD-24: `auto-confirm-matches` Edge Function (open matches hit min players before deadline → confirmed). `mark-attendance` Edge Function (owner marks players attended, triggers `increment_user_matches_played` RPC). Migration `20240101000006_attendance_rpc.sql`. |
| 2026-05-09 | APPD-13/14/15: Mobile player screens — match listing with sport filter chips (batched enrollment counts, no N+1), match detail with adaptive enroll CTA, enrollment flow (in-person live, in-app stub with "Próximamente"). |
| 2026-05-09 | APPD-17/18: Mobile owner screens — quick post form (carousel pickers, open/reservation toggle, success redirect), match detail with attendance toggle per player, "Completar partido" action. Fixed: `enrolled_count` is not a DB column — derived from enrollments join. |
| 2026-05-09 | APPD-20/21: Web owner dashboard — NavLink with active-state, match list with plan usage bar, match detail + inline cancel Server Action, new match form with Server Action (validates, checks plan limit, verifies field ownership). |
| 2026-05-09 | Fixed Metro + pnpm monorepo: added `metro.config.js` with `watchFolders`, `nodeModulesPaths`, `unstable_enableSymlinks`, `extraNodeModules` proxy. Added `@babel/runtime` as direct dep. Fixed `database.types.ts` (CLI banner was prepended/appended to file). Fixed `i18n` TS2742 with explicit return type + `compatibilityJSON: 'v3'`. |
| 2026-05-09 | EAS iOS: aligned `react-native` to **0.74.5** and `react-native-safe-area-context` to **4.10.5** (Expo SDK 51 `bundledNativeModules`). Prebuild was passing `privacy_file_aggregation_enabled` to `use_react_native!`, which **0.74.0** does not support — caused `unknown keyword: :privacy_file_aggregation_enabled` in `pod install`. |
| 2026-05-10 | Admin panel built: `/admin/users` (list, suspend/reactivate) and `/admin/owners` (plan + subscription status). Fixed: `plans` table has `price` not `price_monthly`; `is_suspended` must be explicitly selected. Admin role assigned manually via SQL (trigger doesn't set it). |
| 2026-05-10 | Fixed mobile owner match detail crash: `matches` table has no `owner_id` column — ownership is `matches.field_id → fields.owner_id`. Removed from select and interface. |
| 2026-05-10 | Fixed mobile SessionGate re-routing: added `hasRouted` ref so `router.replace()` only fires once on initial load, not on every token refresh or session state change. |
| 2026-05-10 | Fixed mobile route conflict: `(owner)/match/[id]` and `match/[id]` both resolved to `/match/[id]` in Expo Router, causing players to see owner UI. Renamed owner match detail to `(owner)/my-match/[id]` → URL `/my-match/[id]`. Updated owner index navigation accordingly. Owner cancel/hide match on mobile (APPD-19) was already implemented in the owner detail screen. |
| 2026-05-10 | Admin plans CRUD (`/admin/plans`) and owner plan assignment (`/admin/owners` — dropdown + toggle). Fixed Server Actions to re-verify admin role independently (layout check alone doesn't gate POST endpoints). Fixed `toggleSubscription` to read DB state instead of trusting form field. Fixed `getSession()` → `getUser()` in mobile match cancel. |
| 2026-05-10 | Supabase Storage: migration `20240101000010_storage_buckets.sql` creates `avatars` + `field-images` buckets with RLS policies scoped by user/owner. Mobile: avatar upload via `expo-image-picker` in both player and owner profile screens (initials fallback, edit badge overlay). Mobile match listing shows field cover image when available. Web: `/dashboard/fields/[id]` field detail page with image grid, Server Action upload, and per-image delete. Fields list now links to detail page. Fixed: `assignPlan` Server Action resets `subscription_status → inactive` when plan removed (ghost-active state bug). Fixed: mobile player profile was selecting `avatar_url` (non-existent column) causing silent query error + simultaneous error + fallback data render; renamed to `avatar`. |
| 2026-05-11 | 34 Jira tickets (APPD-32 to APPD-65) from mobile + web visual audits. Implemented ~20 polish tickets in parallel batches: safe area insets, RefreshControl Android color, price formatting util, match card visual hierarchy (accent sport pill, accent price), web CSS dedup, next/font migration, select styling, clickable match rows, dashboard real stats cards, mobile hamburger nav, loading skeletons + error boundaries + branded 404, field cards with active match counts, upgrade nudge banner at 80% plan limit, cancel match confirmation dialog, SVG sport icon in empty state, sport name accent pill on match cards, Open Graph metadata, enrollment status color badges, avatar edit badge enlarged, match detail flat header (no redundant card), skeleton loading screens (SkeletonCard component with staggered shimmer), improved empty states (visual pitch icon illustrations), tab bar icons via Ionicons, sport emoji on filter chips + match card pills, slide_from_right screen transitions. |
| 2026-05-14 | Fixed `my-match` appearing as a visible tab in owner mode (was missing from `hiddenScreen` list in `(owner)/_layout.tsx`). Added "Canchas" tab to owner mode with two new screens: `(owner)/fields.tsx` (field list with cover image + photo count) and `(owner)/my-field/[id].tsx` (image grid with add/delete — multi-select from gallery, uploads directly via authenticated client to `field-images` bucket, "Portada" badge on cover image). |
| 2026-06-02 | **Match states**: Added `en_curso` and `jugado` to `match_status` enum. New `update-match-states` Edge Function auto-advances `confirmed → en_curso → jugado` on 5-min cron. `auto-cancel-matches` extended to also cancel `open` matches past kick-off. All status labels/colors updated across mobile + web. `completed` kept as legacy alias for `jugado`. Enum additions must be in a separate migration from code that uses them (SQLSTATE 55P04 — see migrations 13 + 14). |
| 2026-06-02 | **Clubs/Complejos structure**: Introduced `clubs` table between owners and fields (`Owner → Club → Field → Match`). `fields.owner_id`, `.address`, `.latitude`, `.longitude` removed — ownership now via `club_id → clubs.owner_id`. 9 migrations (16–21) covering schema change, data migration, RLS rebuild, storage policy update, circular RLS fix, owner/co-player visibility. Owner mobile tab renamed "Complejos"; clubs listing + club detail screen added. Web `/dashboard/clubs` added. All queries that referenced `fields.owner_id` or `fields.address` updated to join through clubs. |
| 2026-06-02 | **RLS circular fix**: Migration 17 re-introduced the `matches ↔ enrollments` circular recursion fixed in migration 9. Migration 19 rebuilds the two SECURITY DEFINER helpers (`is_owner_of_match_field`, `is_enrolled_in_match`) and re-applies the policies correctly. `is_owner_of_match_field` now joins through `fields → clubs`. |
| 2026-06-02 | **Enrollment UX**: Player withdrawal from matches (confirmation dialog, stub reimbursement message). Co-enrolled players shown on match detail (names + initials avatars, migration 21 adds RLS for co-player visibility). Match detail `useEffect` depends on `[id, user?.id]` to handle late session load. Explore listing hides past dates (`date >= today`) and shows `open/confirmed/en_curso`. Mis partidos sorted most recent first. Past matches are view-only (no enroll/withdraw). `LLENO` badge on full match cards. |
