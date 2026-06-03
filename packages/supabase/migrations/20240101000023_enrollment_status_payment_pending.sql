-- Migration 23: Add 'payment_pending' to enrollment_status enum
--
-- MUST be applied AFTER migration 22 and BEFORE deploying create-deuna-payment.
--
-- Per SQLSTATE 55P04, ALTER TYPE ... ADD VALUE cannot be in the same migration
-- as any statement that references the new value. See migrations 13 + 14 for
-- the established pattern in this codebase.
--
-- New status meaning:
--   'payment_pending' — enrollment created, De Una payment intent generated,
--                       waiting for De Una webhook confirmation.
--                       The slot is held but NOT confirmed until payment lands.

ALTER TYPE public.enrollment_status ADD VALUE IF NOT EXISTS 'payment_pending';

COMMENT ON TYPE public.enrollment_status IS
  'pending: enrolled, no payment initiated | '
  'payment_pending: De Una payment intent created, awaiting webhook | '
  'confirmed: payment confirmed or in-person enrollment accepted | '
  'cancelled: player withdrew or system cancelled | '
  'refunded: payment reversed';
