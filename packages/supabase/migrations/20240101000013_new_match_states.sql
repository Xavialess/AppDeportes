-- Add en_curso and jugado to the match_status enum.
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot be used in the same transaction
-- as statements that reference the new values. This migration contains ONLY
-- the enum additions. The RPCs that reference these values live in the next
-- migration (20240101000014) which runs in a separate transaction.

ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'en_curso';
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'jugado';
