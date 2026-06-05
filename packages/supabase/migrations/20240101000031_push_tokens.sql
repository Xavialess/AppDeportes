-- Migration 31: Expo push notification tokens
--
-- Stores one row per (user, device) so the notification Edge Functions can look
-- up every device a user is signed in on and fan a push message out to all of
-- them. The Expo push token is the unique key — the same physical device always
-- returns the same token, so re-registering on every app open is an idempotent
-- UPSERT rather than an insert.
--
-- Tokens are written exclusively by the authenticated mobile client (the player's
-- own device) and read exclusively by Edge Functions running with the service
-- role. RLS therefore only needs to let a user manage their own rows; the service
-- role bypasses RLS entirely.

CREATE TABLE public.push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The same Expo token can only belong to one user at a time. If a different
  -- user signs in on the same device, the UPSERT re-points the token to them.
  CONSTRAINT push_tokens_token_unique UNIQUE (token)
);

COMMENT ON TABLE public.push_tokens IS
  'Expo push notification tokens. One row per device. Written by the device owner, read by Edge Functions (service role).';

-- Fan-out lookup: "give me every token for these user IDs".
CREATE INDEX idx_push_tokens_user_id ON public.push_tokens(user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- A user can see, register, refresh, and delete only their own device tokens.
CREATE POLICY "push_tokens_select_self"
  ON public.push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert_self"
  ON public.push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_update_self"
  ON public.push_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete_self"
  ON public.push_tokens FOR DELETE
  USING (user_id = auth.uid());
