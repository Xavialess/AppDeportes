-- =============================================================================
-- Migration: 0002 – Indexes
-- =============================================================================

-- cities
CREATE INDEX idx_cities_country_id   ON public.cities(country_id);
CREATE INDEX idx_cities_is_active    ON public.cities(is_active) WHERE is_active = true;

-- city_sports
CREATE INDEX idx_city_sports_city_id   ON public.city_sports(city_id);
CREATE INDEX idx_city_sports_sport_id  ON public.city_sports(sport_id);
CREATE INDEX idx_city_sports_active    ON public.city_sports(city_id, sport_id) WHERE is_active = true;

-- sports
CREATE INDEX idx_sports_is_active ON public.sports(is_active) WHERE is_active = true;

-- users
CREATE INDEX idx_users_role  ON public.users(role);

-- owner_profiles
CREATE INDEX idx_owner_profiles_user_id   ON public.owner_profiles(user_id);
CREATE INDEX idx_owner_profiles_plan_id   ON public.owner_profiles(plan_id);
CREATE INDEX idx_owner_profiles_status    ON public.owner_profiles(subscription_status);

-- fields
CREATE INDEX idx_fields_owner_id  ON public.fields(owner_id);
CREATE INDEX idx_fields_city_id   ON public.fields(city_id);

-- matches — queried heavily by players browsing and owners managing
CREATE INDEX idx_matches_field_id       ON public.matches(field_id);
CREATE INDEX idx_matches_sport_id       ON public.matches(sport_id);
CREATE INDEX idx_matches_status         ON public.matches(status);
CREATE INDEX idx_matches_date           ON public.matches(date);
CREATE INDEX idx_matches_type           ON public.matches(type);
CREATE INDEX idx_matches_is_visible     ON public.matches(is_visible) WHERE is_visible = true;
CREATE INDEX idx_matches_deadline       ON public.matches(confirmation_deadline) WHERE status = 'open';
-- composite for the main player browse query: active, visible, upcoming by sport
CREATE INDEX idx_matches_browse ON public.matches(sport_id, date, status, is_visible)
  WHERE status = 'open' AND is_visible = true;

-- enrollments
CREATE INDEX idx_enrollments_match_id   ON public.enrollments(match_id);
CREATE INDEX idx_enrollments_user_id    ON public.enrollments(user_id);
CREATE INDEX idx_enrollments_status     ON public.enrollments(status);
-- for counting confirmed enrollments per match efficiently
CREATE INDEX idx_enrollments_match_confirmed ON public.enrollments(match_id)
  WHERE status IN ('pending', 'confirmed');

-- payments
CREATE INDEX idx_payments_match_id       ON public.payments(match_id);
CREATE INDEX idx_payments_enrollment_id  ON public.payments(enrollment_id);
CREATE INDEX idx_payments_status         ON public.payments(status);
