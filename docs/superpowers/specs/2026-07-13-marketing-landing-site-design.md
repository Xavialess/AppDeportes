# Marketing landing site — design

**Date:** 2026-07-13
**Status:** Approved

## Problem

`cancha.` (apps/web) has no public-facing marketing presence. Visiting `/` immediately
`redirect()`s to `/dashboard`, which middleware then bounces to `/login` for anyone not
signed in as an owner/admin. There is no page that explains the product, and no way for
a visitor to contact the team. This design adds a real landing page, a "how it works" +
owner pitch, and a working contact page — general-audience (players and owners), matching
the existing dark/lime visual identity already established on the login page.

## Scope

In scope:
- `/` — marketing home page (hero, how it works, owner spotlight, closing CTA, footer)
- `/contacto` — contact page with a real working form
- Shared marketing nav + footer
- `contact_messages` table + Server Action to receive submissions
- GSAP-driven scroll/entrance animation

Out of scope (explicitly not building):
- Admin UI to view/manage contact messages (table is ready for one later)
- Player app store links (app isn't published yet — badges are styled coming-soon, not real links)
- Pricing/features/testimonials as standalone pages
- Email notifications on new contact message (no email API is wired into this project)
- Any new automated test framework (none exists in this repo today)

## Routing

New route group `apps/web/src/app/(marketing)/`:

```
app/
  (marketing)/
    layout.tsx        # MarketingNav + children + MarketingFooter
    page.tsx           # "/" — replaces current redirect('/dashboard')
    contacto/
      page.tsx          # "/contacto"
      ContactForm.tsx    # 'use client' form component
      actions.ts         # 'use server' contactAction
```

Route groups don't affect the URL, so `(marketing)/page.tsx` resolves to `/` and
`(marketing)/contacto/page.tsx` resolves to `/contacto`. This isolates the marketing
chrome (sticky nav + footer) from `/dashboard`, `/admin`, `/login`, `/signup`, none of
which should show it.

`apps/web/src/app/page.tsx` (the current unconditional `redirect('/dashboard')`) is
deleted — its content moves into `(marketing)/page.tsx` as the real landing page.
`middleware.ts` needs no changes: `/` and `/contacto` are already outside the
`isProtected` check (`isDashboard || isAdmin`).

## Visual identity

Reuses tokens already defined in `apps/web/src/styles/globals.css` — dark background
(`--color-bg: #0a0a0a`), electric lime accent (`--color-accent: #d4ff3a`), Space Grotesk
display font, Geist Mono. Reuses the existing `SportBackground` component (sport-tile
mosaic with per-sport court-line SVGs) already used on `/login`, extended with a
scroll-linked parallax on the hero instance.

## Home page (`/`) sections

1. **Hero** — "cancha." wordmark + animated headline/tagline, `SportBackground` behind
   it with parallax, two CTAs: "Soy jugador" (anchor-scrolls to the closing CTA band's
   app badges) and "Tengo una cancha" (→ `/signup`).
2. **How it works** — 3-4 step flow (Busca un partido → Únete → Juega), numbered cards,
   scroll-triggered stagger reveal. Written generically so it reads for players finding
   matches, without assuming they've downloaded anything yet.
3. **Owner spotlight** — pitches club/field management (post matches, manage
   reservations, track attendance), a compact 3-card plan teaser mirroring the real
   `plans` table (Básico $19.99/10 partidos, Estándar $39.99/30, Pro $69.99/100), CTA →
   `/signup`. Plan copy is illustrative marketing copy, not a live DB query — no need to
   hit Supabase from this page.
4. **Closing CTA band** — "Próximamente en App Store y Google Play" badges styled
   disabled/coming-soon (no real links yet), plus "¿Tienes preguntas?" → `/contacto`.
5. **Footer** (shared, in the marketing layout) — brand mark, nav links, `/contacto`
   link, copyright.

## Contact page (`/contacto`)

- Header reusing `SportBackground` (small variant) for visual continuity with home/login.
- Form fields: `name`, `email`, `contact_type` (select: jugador / propietario / otro),
  `message`. Plus a hidden honeypot field (`company` or similar, visually hidden, must
  stay empty) — silently reject the submission if it's filled, no user-facing error.
- Submission flow follows the same pattern as `apps/web/src/app/signup/actions.ts`:
  `useActionState` in a client component, `'use server'` action returning
  `{ status: 'idle' | 'error' | 'success', message? }`.
- Validation via Zod schema (name non-empty, valid email, message non-empty, capped
  length e.g. 2000 chars, contact_type in the allowed enum).
- Rate limiting: before inserting, the action queries `contact_messages` for rows with
  the same email in the last 10 minutes; if 3 or more exist, return an error
  ("Ya recibimos tu mensaje, te responderemos pronto.") without inserting again.

## Backend: `contact_messages` table

New migration in `packages/supabase/migrations/`:

```sql
create type contact_type as enum ('player', 'owner', 'other');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  contact_type contact_type not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
-- No policies: anon/authenticated have zero access. All reads/writes go through
-- the service role only (Server Action for insert; a future admin page for reads).
```

This mirrors the existing `payments` table pattern noted in CLAUDE.md ("no direct
client INSERT/UPDATE — all payment operations go through Edge Functions with service
role"). The contact Server Action uses `createAdminClient()` from
`apps/web/src/lib/supabase/admin.ts` to insert, same as other service-role usages in
this codebase.

`packages/supabase/src/database.types.ts` gets regenerated
(`pnpm --filter @appdeportes/supabase db:types`) after the migration is applied, so the
Server Action has a typed insert.

## Animation

- Add `gsap` to `apps/web/package.dependencies` (core + ScrollTrigger).
- Dynamically imported in client components (`await import('gsap')`,
  `await import('gsap/ScrollTrigger')`) rather than a static top-level import, per the
  project's performance rules on deferring heavy libraries.
- `gsap.matchMedia()` used to define a `(prefers-reduced-motion: no-preference)` context
  for all entrance/scroll animations, with a no-op/instant-appear fallback for the
  reduced-motion case.
- Only `transform` and `opacity` are animated (compositor-friendly, per performance
  rules) — no animating `width`/`top`/`margin`/etc.
- Effects: hero entrance timeline (headline/tagline/CTA stagger), per-section
  ScrollTrigger-based fade-up + stagger for cards/steps as they enter the viewport, and
  a subtle scroll-linked parallax on the hero's `SportBackground` layer.

## New components

Organized by feature under `apps/web/src/components/marketing/`, matching this
project's existing "many small files" convention:

```
components/marketing/
  nav/MarketingNav.tsx + marketing-nav.module.css
  footer/MarketingFooter.tsx + marketing-footer.module.css
  hero/Hero.tsx + hero.module.css
  how-it-works/HowItWorks.tsx + how-it-works.module.css
  owner-spotlight/OwnerSpotlight.tsx + owner-spotlight.module.css
  cta-band/CtaBand.tsx + cta-band.module.css
hooks/
  useScrollReveal.ts   # thin GSAP ScrollTrigger wrapper, respects matchMedia
```

`SportBackground` is reused as-is (and lightly extended with an optional parallax prop)
rather than duplicated.

## Error handling

- Contact form: Zod validation errors and the rate-limit rejection both surface as a
  user-friendly inline error via the existing `status: 'error'` action-state pattern —
  no raw Supabase/Postgres error text ever reaches the client.
- Insert failures (DB down, etc.) are caught, logged server-side, and return a generic
  "Algo salió mal, intenta de nuevo" message — consistent with the project's error
  handling conventions.

## Testing / verification

No automated test framework exists in this repo (`apps/web`) today, and this change
doesn't introduce one. Verification is manual, per the project's web testing rules
priority order:
- Visual check at 320 / 768 / 1024 / 1440 for hero, nav, footer, contact form.
- Keyboard navigation through nav links and the contact form.
- `prefers-reduced-motion` verified (animations should not play; content still appears).
- Contact form happy path (submission succeeds, success state shown) and error paths
  (invalid email, empty message, honeypot filled, rate limit hit).
- Confirm `/dashboard` and `/admin` still redirect unauthenticated users to `/login`
  (middleware untouched, but worth confirming nothing broke).
