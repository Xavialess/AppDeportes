-- Migration 25: Replace hard UNIQUE(match_id, user_id) on enrollments with
-- a partial unique index that excludes inactive statuses.
--
-- The hard constraint was blocking two legitimate cases:
--   1. Re-enrollment after withdrawal (status = 'cancelled')
--   2. Re-enrollment after refund (status = 'refunded')
--
-- With the partial index, a new INSERT only conflicts if there is already
-- an active enrollment (pending, payment_pending, or confirmed) for that
-- player in that match. Cancelled and refunded rows are ignored.

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_match_user_unique;

CREATE UNIQUE INDEX IF NOT EXISTS enrollments_match_user_active_idx
  ON public.enrollments(match_id, user_id)
  WHERE status NOT IN ('cancelled', 'refunded');
