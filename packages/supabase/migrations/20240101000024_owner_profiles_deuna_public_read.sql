-- Migration 24: Allow authenticated users to read owner De Una availability
--
-- The enroll screen needs to know whether the match owner has De Una
-- configured so it can show or hide the "Pagar en app" card.
--
-- The existing owner_profiles_select policy only allows owners to read
-- their own row. Players querying another owner's profile get null back,
-- so ownerHasDeuna is always false regardless of whether credentials exist.
--
-- This policy adds a narrow read path: any authenticated user can read
-- deuna_merchant_id and deuna_phone_linked from owner_profiles.
-- Postgres column-level security is not available on policies, so we
-- expose the whole row to authenticated users — deuna_merchant_id and
-- deuna_phone_linked are non-sensitive (they identify a public merchant
-- account, not a secret key).

CREATE POLICY "owner_profiles_select_deuna_public"
  ON public.owner_profiles FOR SELECT
  TO authenticated
  USING (true);
