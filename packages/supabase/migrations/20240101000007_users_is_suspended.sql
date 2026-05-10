-- Add is_suspended column to users table for admin suspend/unsuspend functionality
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_suspended IS 'Admin-set flag. Suspended users cannot log in or enroll in matches.';
