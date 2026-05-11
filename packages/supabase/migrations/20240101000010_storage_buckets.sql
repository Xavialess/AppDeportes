-- Create public storage buckets for avatars and field images.
-- Files are stored under user-scoped paths so RLS can enforce ownership.
-- avatars:      avatars/{user_id}/avatar.{ext}   (upserted on every update)
-- field-images: field-images/{field_id}/{ts}-{filename}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',      'avatars',      true, 2097152,  ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('field-images', 'field-images', true, 5242880,  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── avatars policies ────────────────────────────────────────────────────────

CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── field-images policies ───────────────────────────────────────────────────

CREATE POLICY "field_images_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'field-images');

CREATE POLICY "field_images_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.owner_id = auth.uid()
        AND f.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "field_images_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.owner_id = auth.uid()
        AND f.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "field_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.owner_id = auth.uid()
        AND f.id::text = (storage.foldername(name))[1]
    )
  );
