-- =============================================================================
-- Migration: 0001 – Initial schema
-- AppDeportes — sports booking platform for Ecuador
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Custom Types (Enums) ─────────────────────────────────────────────────────

CREATE TYPE public.user_role AS ENUM ('player', 'owner', 'admin');
CREATE TYPE public.subscription_status AS ENUM ('active', 'inactive', 'trial', 'cancelled');
CREATE TYPE public.match_type AS ENUM ('open', 'reservation');
CREATE TYPE public.match_status AS ENUM ('open', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public.enrollment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refunded');
CREATE TYPE public.payment_method AS ENUM ('in_app', 'in_person');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'refunded', 'failed');

-- ─── countries ────────────────────────────────────────────────────────────────

CREATE TABLE public.countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            CHAR(2) NOT NULL,
  currency_code   CHAR(3) NOT NULL,
  currency_symbol TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT countries_code_unique UNIQUE (code)
);

COMMENT ON TABLE public.countries IS 'Admin-managed country list. Supports multi-country expansion (EC, CO, PE, ...).';

-- ─── cities ──────────────────────────────────────────────────────────────────

CREATE TABLE public.cities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cities_country_name_unique UNIQUE (country_id, name)
);

COMMENT ON TABLE public.cities IS 'Admin-managed city list per country. Toggle is_active to enable/disable a city.';

-- ─── sports ──────────────────────────────────────────────────────────────────

CREATE TABLE public.sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  icon       TEXT,
  formats    TEXT[] NOT NULL DEFAULT '{}',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sports_name_unique UNIQUE (name)
);

COMMENT ON TABLE public.sports IS 'Admin-managed sports. formats is an array of strings, e.g. [''5v5'', ''7v7'', ''11v11''].';

-- ─── city_sports ──────────────────────────────────────────────────────────────

CREATE TABLE public.city_sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  sport_id   UUID NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT city_sports_unique UNIQUE (city_id, sport_id)
);

COMMENT ON TABLE public.city_sports IS 'Controls which sports are available per city. Admin-managed.';

-- ─── plans ───────────────────────────────────────────────────────────────────

CREATE TABLE public.plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  price                 NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  max_matches_per_month INTEGER NOT NULL CHECK (max_matches_per_month > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plans_name_unique UNIQUE (name)
);

COMMENT ON TABLE public.plans IS 'Owner subscription plans. Tiers control max matches posted per month.';

-- ─── users ───────────────────────────────────────────────────────────────────
-- Extends auth.users. id is a FK to auth.users so Supabase Auth drives identity.
-- matches_played is a denormalized counter — only update via Edge Function on
-- match completion, never increment manually.

CREATE TABLE public.users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  avatar         TEXT,
  role           public.user_role NOT NULL DEFAULT 'player',
  is_pro         BOOLEAN NOT NULL DEFAULT false,
  matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Public user profiles. role can be player/owner/admin — a single user can hold both player and owner roles (UI adapts).';
COMMENT ON COLUMN public.users.matches_played IS 'Denormalized counter. Updated only by Edge Function on match completion.';

-- ─── owner_profiles ──────────────────────────────────────────────────────────

CREATE TABLE public.owner_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id             UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  subscription_status public.subscription_status NOT NULL DEFAULT 'inactive',
  cancellation_count  INTEGER NOT NULL DEFAULT 0 CHECK (cancellation_count >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.owner_profiles IS 'Extended profile for users with owner role. cancellation_count tracks owner-initiated cancellations for future penalty enforcement.';

-- ─── fields ──────────────────────────────────────────────────────────────────

CREATE TABLE public.fields (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  city_id    UUID NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  latitude   NUMERIC(9, 6) NOT NULL,
  longitude  NUMERIC(9, 6) NOT NULL,
  images     TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.fields IS 'Physical venues/canchas owned by owners.';

-- ─── matches ─────────────────────────────────────────────────────────────────

CREATE TABLE public.matches (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id                    UUID NOT NULL REFERENCES public.fields(id) ON DELETE RESTRICT,
  sport_id                    UUID NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  type                        public.match_type NOT NULL,
  status                      public.match_status NOT NULL DEFAULT 'open',
  date                        DATE NOT NULL,
  start_time                  TIME NOT NULL,
  end_time                    TIME NOT NULL,
  format                      TEXT NOT NULL,
  -- open match fields
  price_per_player            NUMERIC(10, 2) CHECK (price_per_player > 0),
  min_players                 INTEGER CHECK (min_players > 0),
  max_players                 INTEGER CHECK (max_players > 0),
  confirmation_deadline       TIMESTAMPTZ,
  -- reservation match fields
  total_price                 NUMERIC(10, 2) CHECK (total_price > 0),
  -- cancellation tracking
  cancelled_by                UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancellation_reason         TEXT,
  enrolled_count_at_cancellation INTEGER,
  -- visibility
  is_visible                  BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT matches_valid_time     CHECK (end_time > start_time),
  CONSTRAINT matches_valid_players  CHECK (
    min_players IS NULL OR max_players IS NULL OR min_players <= max_players
  ),
  CONSTRAINT matches_open_required  CHECK (
    type <> 'open' OR (
      price_per_player IS NOT NULL AND
      min_players IS NOT NULL AND
      max_players IS NOT NULL AND
      confirmation_deadline IS NOT NULL
    )
  ),
  CONSTRAINT matches_reservation_required CHECK (
    type <> 'reservation' OR total_price IS NOT NULL
  )
);

COMMENT ON TABLE public.matches IS 'Core match entity. type=open allows individual enrollment; type=reservation is a full-field booking.';
COMMENT ON COLUMN public.matches.enrolled_count_at_cancellation IS 'Snapshot of enrollment count taken when match is cancelled — used for audit/penalty logic.';

-- ─── enrollments ─────────────────────────────────────────────────────────────

CREATE TABLE public.enrollments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status     public.enrollment_status NOT NULL DEFAULT 'pending',
  attended   BOOLEAN,
  payment_id UUID,  -- FK added after payments; see ALTER TABLE below
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT enrollments_match_user_unique UNIQUE (match_id, user_id)
);

COMMENT ON TABLE public.enrollments IS 'Player enrollment in open matches. One row per player per match.';

-- ─── payments ────────────────────────────────────────────────────────────────

CREATE TABLE public.payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  enrollment_id           UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  amount                  NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  method                  public.payment_method NOT NULL,
  status                  public.payment_status NOT NULL DEFAULT 'pending',
  provider                TEXT,
  provider_transaction_id TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payments IS 'Payment records. provider and provider_transaction_id are provider-agnostic — supports Kushki, PayPhone, or any future provider.';

-- Add FK from enrollments.payment_id → payments.id (circular, so added last)
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;
