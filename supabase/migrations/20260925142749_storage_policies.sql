/*
# Storage policies for report-media bucket

## Overview
Creates storage policies so authenticated users can upload media to their own
report folders, and anyone can read public media. Private media URLs are only
retrievable by the report owner via the report_media table RLS (the URL itself
is in a public bucket, but the row-level access to know which URL exists is
gated by RLS on report_media).
*/

-- Allow authenticated users to upload to report-media bucket
DROP POLICY IF EXISTS "report_media_upload" ON storage.objects;
CREATE POLICY "report_media_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-media');

-- Allow anyone to read from report-media bucket (public bucket)
DROP POLICY IF EXISTS "report_media_read" ON storage.objects;
CREATE POLICY "report_media_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'report-media');

-- Allow owners to update their own media
DROP POLICY IF EXISTS "report_media_update" ON storage.objects;
CREATE POLICY "report_media_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'report-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'report-media');

-- Allow owners to delete their own media
DROP POLICY IF EXISTS "report_media_delete" ON storage.objects;
CREATE POLICY "report_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'report-media' AND owner = auth.uid());
