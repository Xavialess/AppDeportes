-- =============================================================================
-- Migration: 0016 – Clubs (Complejos)
--
-- Introduces a clubs table between owners and fields:
--   Owner → Club (Complejo) → Field (Cancha) → Match
--
-- Key design decisions:
--   • fields.city_id is KEPT (denormalized) for efficient city-based filtering
--   • fields.owner_id, address, latitude, longitude are removed — ownership
--     is now derived via fields.club_id → clubs.owner_id
--   • Dev data is migrated: one club is created per distinct owner, then all
--     fields for that owner are linked to it
--
-- Safe to re-run: all statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- =============================================================================

-- ─── Create clubs table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clubs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  city_id     uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  address     text NOT NULL DEFAULT '',
  latitude    numeric(9, 6),
  longitude   numeric(9, 6),
  description text,
  images      text[]    NOT NULL DEFAULT '{}',
  is_active   boolean   NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- ─── Add club_id to fields (nullable initially for migration) ─────────────────

ALTER TABLE public.fields
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE RESTRICT;

-- ─── Migrate existing data (idempotent) ──────────────────────────────────────
-- For each distinct owner that doesn't have a club yet, create one club using
-- their first field's data, then link all their fields to it.

DO $$
DECLARE
  r RECORD;
  new_club_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (owner_id)
      owner_id,
      city_id,
      name    AS field_name,
      address AS field_address,
      latitude,
      longitude
    FROM public.fields
    WHERE owner_id IS NOT NULL
    ORDER BY owner_id, created_at ASC
  LOOP
    -- Skip owners who already have a club (safe for re-runs)
    IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE owner_id = r.owner_id) THEN
      INSERT INTO public.clubs (owner_id, city_id, name, address, latitude, longitude)
      VALUES (
        r.owner_id,
        r.city_id,
        r.field_name,
        COALESCE(r.field_address, ''),
        r.latitude,
        r.longitude
      )
      RETURNING id INTO new_club_id;
    ELSE
      SELECT id INTO new_club_id FROM public.clubs WHERE owner_id = r.owner_id LIMIT 1;
    END IF;

    -- Assign fields that still have no club_id
    UPDATE public.fields
    SET club_id = new_club_id
    WHERE owner_id = r.owner_id
      AND club_id IS NULL;
  END LOOP;
END $$;

-- ─── Make club_id NOT NULL after data migration ───────────────────────────────

ALTER TABLE public.fields
  ALTER COLUMN club_id SET NOT NULL;

-- ─── Drop dependent policies BEFORE dropping the columns ─────────────────────
-- All policies referencing fields.owner_id must be removed first.
-- Migration 0017 recreates them using the new fields → clubs ownership chain.

DROP POLICY IF EXISTS "fields_insert_owner"       ON public.fields;
DROP POLICY IF EXISTS "fields_update_owner"       ON public.fields;
DROP POLICY IF EXISTS "fields_delete_admin"       ON public.fields;
DROP POLICY IF EXISTS "matches_select_visible"    ON public.matches;
DROP POLICY IF EXISTS "matches_insert_owner"      ON public.matches;
DROP POLICY IF EXISTS "matches_update_owner"      ON public.matches;
DROP POLICY IF EXISTS "matches_delete_owner"      ON public.matches;
DROP POLICY IF EXISTS "enrollments_select"        ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update"        ON public.enrollments;
DROP POLICY IF EXISTS "payments_select"           ON public.payments;
DROP POLICY IF EXISTS "field_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "field_images_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "field_images_owner_delete" ON storage.objects;

-- ─── Drop old columns from fields ────────────────────────────────────────────

ALTER TABLE public.fields
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clubs_owner_id ON public.clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_city_id  ON public.clubs(city_id);
CREATE INDEX IF NOT EXISTS idx_fields_club_id ON public.fields(club_id);
