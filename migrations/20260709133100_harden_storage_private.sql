-- Private Supabase Storage bucket for ERP receipts and internal attachments.
-- The application uploads with a server-only service role key and serves files
-- through authenticated signed-url redirects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE ALL ON TABLE storage.objects FROM anon, authenticated;
REVOKE ALL ON TABLE storage.buckets FROM anon, authenticated;

DROP POLICY IF EXISTS starlim_uploads_service_role_all ON storage.objects;
CREATE POLICY starlim_uploads_service_role_all
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');
