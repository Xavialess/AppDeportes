-- =============================================================================
-- Migration: 0005 – Seed data
-- Reference data for Ecuador launch. Safe to re-run (ON CONFLICT DO NOTHING).
-- =============================================================================

-- ─── Countries ───────────────────────────────────────────────────────────────

INSERT INTO public.countries (id, name, code, currency_code, currency_symbol, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ecuador',  'EC', 'USD', '$',  true),
  ('00000000-0000-0000-0000-000000000002', 'Colombia', 'CO', 'COP', '$',  false),
  ('00000000-0000-0000-0000-000000000003', 'Perú',     'PE', 'PEN', 'S/', false)
ON CONFLICT (code) DO NOTHING;

-- ─── Cities ──────────────────────────────────────────────────────────────────

INSERT INTO public.cities (id, country_id, name, is_active)
VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Quito',      true),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Guayaquil',  true)
ON CONFLICT (country_id, name) DO NOTHING;

-- ─── Sports ──────────────────────────────────────────────────────────────────

INSERT INTO public.sports (id, name, icon, formats, is_active)
VALUES
  ('00000000-0000-0000-0002-000000000001', 'Fútbol',     '⚽', ARRAY['5v5', '7v7', '11v11'], true),
  ('00000000-0000-0000-0002-000000000002', 'Padel',      '🎾', ARRAY['2v2'],                true),
  ('00000000-0000-0000-0002-000000000003', 'Pickleball', '🏓', ARRAY['2v2', '4v4'],         true)
ON CONFLICT (name) DO NOTHING;

-- ─── City-Sport availability (Ecuador cities × all 3 sports) ─────────────────

INSERT INTO public.city_sports (city_id, sport_id, is_active)
SELECT c.id, s.id, true
FROM public.cities c
CROSS JOIN public.sports s
WHERE c.country_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (city_id, sport_id) DO NOTHING;

-- ─── Subscription plans ──────────────────────────────────────────────────────

INSERT INTO public.plans (id, name, price, max_matches_per_month)
VALUES
  ('00000000-0000-0000-0003-000000000001', 'Básico',    19.99,  10),
  ('00000000-0000-0000-0003-000000000002', 'Estándar',  39.99,  30),
  ('00000000-0000-0000-0003-000000000003', 'Pro',       69.99, 100)
ON CONFLICT (name) DO NOTHING;
