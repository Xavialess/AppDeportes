-- =============================================================================
-- Migration: 0018 – Updated storage RLS for field-images
--
-- After migration 0016, fields no longer has owner_id. Storage policies that
-- verified f.owner_id = auth.uid() must now join through clubs.
-- =============================================================================

DROP POLICY IF EXISTS "field_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "field_images_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "field_images_owner_delete" ON storage.objects;

CREATE POLICY "field_images_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1
      FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id::text = (storage.foldername(objects.name))[1]
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "field_images_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1
      FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id::text = (storage.foldername(objects.name))[1]
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "field_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'field-images'
    AND EXISTS (
      SELECT 1
      FROM public.fields f
      JOIN public.clubs c ON c.id = f.club_id
      WHERE f.id::text = (storage.foldername(objects.name))[1]
        AND c.owner_id = auth.uid()
    )
  );
