-- Migration 22: De Una payment integration
--
-- Changes:
--   1. owner_profiles: add deuna_merchant_id and deuna_phone_linked columns
--   2. payments: add partial unique index to prevent concurrent payment intents
--      per enrollment (allows retries after failure)
--   3. payments: add index on provider_transaction_id for webhook lookup performance
--   4. confirm_enrollment_from_webhook(): new SECURITY DEFINER RPC called by the
--      deuna-webhook Edge Function. Runs inside a single transaction with FOR UPDATE
--      locking to prevent over-enrollment races.
--
-- NOTE: Migration 23 (enrollment_status 'payment_pending') MUST be applied after
-- this migration and BEFORE deploying the create-deuna-payment Edge Function.
-- Per SQLSTATE 55P04, ALTER TYPE ... ADD VALUE cannot be used in the same
-- migration as statements that reference the new value.

-- ─── owner_profiles: De Una Negocios credentials ─────────────────────────────

ALTER TABLE public.owner_profiles
  ADD COLUMN IF NOT EXISTS deuna_merchant_id  TEXT,
  ADD COLUMN IF NOT EXISTS deuna_phone_linked TEXT;

COMMENT ON COLUMN public.owner_profiles.deuna_merchant_id IS
  'De Una Negocios merchant identifier. Required to accept De Una payments on matches.';
COMMENT ON COLUMN public.owner_profiles.deuna_phone_linked IS
  'Phone number registered with the owner''s De Una Negocios account.';

-- ─── payments: partial unique index (prevents duplicate in-flight intents) ────

-- Allows multiple rows per enrollment_id only when status = 'failed'.
-- A second payment attempt after failure creates a new row normally.
-- A second attempt while one is pending/completed hits this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS payments_enrollment_active_idx
  ON public.payments(enrollment_id)
  WHERE status NOT IN ('failed') AND enrollment_id IS NOT NULL;

-- ─── payments: index for webhook lookup ──────────────────────────────────────

-- deuna-webhook looks up payments by provider_transaction_id on every webhook.
-- Without this index, each webhook call is a full table scan.
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON public.payments(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- ─── confirm_enrollment_from_webhook() ───────────────────────────────────────
--
-- Called by deuna-webhook Edge Function (service role) after HMAC verification.
-- Performs atomic check-and-confirm inside a single transaction using FOR UPDATE
-- to prevent the following race condition:
--
--   Two webhooks arrive simultaneously for the last available slot.
--   Both check confirmed_count, both see count < max_players, both confirm.
--   Match ends up with max_players + 1 confirmed enrollments.
--
-- By locking the match row and re-counting under the lock, only one webhook
-- can confirm per slot.
--
-- Returns one of:
--   'confirmed'          — enrollment confirmed, match auto-confirmed if threshold met
--   'cancelled'          — enrollment was already cancelled; caller triggers refund
--   'overfull'           — match is full; caller triggers refund
--
-- State machine:
--
--   webhook arrives
--       │
--       ▼
--   LOCK match row (FOR UPDATE)
--       │
--       ├─ enrollment.status = 'cancelled' ──► return 'cancelled'
--       │
--       ├─ confirmed_count >= max_players ──► return 'overfull'
--       │
--       ▼
--   UPDATE enrollment SET status = 'confirmed'
--       │
--       ├─ new count >= min_players AND match.status = 'open'
--       │   └─► UPDATE match SET status = 'confirmed'
--       │
--       └─► return 'confirmed'

CREATE OR REPLACE FUNCTION public.confirm_enrollment_from_webhook(
  p_enrollment_id UUID,
  p_match_id      UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment    public.enrollments%ROWTYPE;
  v_match         public.matches%ROWTYPE;
  v_confirmed_cnt INTEGER;
BEGIN
  -- Lock the match row for the duration of this transaction.
  -- This serialises concurrent webhook calls for the same match.
  SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

  -- Read current enrollment status (inside the locked transaction)
  SELECT * INTO v_enrollment
    FROM public.enrollments
    WHERE id = p_enrollment_id;

  -- Guard: player withdrew after paying
  IF v_enrollment.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;

  -- Guard: match is already full (race — another webhook confirmed the last slot)
  SELECT COUNT(*) INTO v_confirmed_cnt
    FROM public.enrollments
    WHERE match_id = p_match_id
      AND status = 'confirmed';

  IF v_match.max_players IS NOT NULL AND v_confirmed_cnt >= v_match.max_players THEN
    RETURN 'overfull';
  END IF;

  -- Confirm the enrollment
  UPDATE public.enrollments
    SET status = 'confirmed'
    WHERE id = p_enrollment_id;

  -- Re-count after confirmation
  SELECT COUNT(*) INTO v_confirmed_cnt
    FROM public.enrollments
    WHERE match_id = p_match_id
      AND status = 'confirmed';

  -- Auto-confirm match if min_players threshold reached
  IF v_match.min_players IS NOT NULL
     AND v_confirmed_cnt >= v_match.min_players
     AND v_match.status = 'open'
  THEN
    UPDATE public.matches
      SET status = 'confirmed'
      WHERE id = p_match_id;
  END IF;

  RETURN 'confirmed';
END;
$$;

COMMENT ON FUNCTION public.confirm_enrollment_from_webhook(UUID, UUID) IS
  'Atomically confirms an enrollment from a De Una payment webhook. '
  'Acquires a row-level lock on the match to prevent concurrent over-enrollment. '
  'Returns: confirmed | cancelled | overfull. '
  'Called by deuna-webhook Edge Function with service role.';
