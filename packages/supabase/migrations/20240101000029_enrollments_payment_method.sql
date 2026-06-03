-- Migration 29: Add payment_method to enrollments
--
-- Keeps in-person and De Una (in_app) flows explicitly separate at the data
-- level. When in-person is eventually removed, all 'in_person' enrollment
-- rows can be identified and handled cleanly without guessing intent from
-- enrollment status alone.
--
-- Default is 'in_person' so existing rows remain correct (all enrollments
-- before De Una integration were in-person).

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'in_person'
  CHECK (payment_method IN ('in_person', 'in_app'));

COMMENT ON COLUMN public.enrollments.payment_method IS
  'in_person: player pays at the field | '
  'in_app: player pays via De Una QR. '
  'Used to separate the two flows and to identify in_person rows '
  'when that feature is eventually removed.';
