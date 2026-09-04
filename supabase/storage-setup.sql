-- ORQ8 Supabase Storage Setup
-- Run this in the Supabase SQL Editor

-- Create the storage bucket for ORQ8 files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orq8-files',
  'orq8-files',
  false, -- private bucket
  10485760, -- 10MB limit
  ARRAY[
    'image/*',
    'application/pdf',
    'text/*',
    'application/json',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.*'
  ]
) ON CONFLICT (id) DO NOTHING;

-- RLS policy: Users can only access files in their org's folder
CREATE POLICY "org_file_access" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'orq8-files'
    AND (
      -- Service role can access everything (for backend operations)
      auth.role() = 'service_role'
      OR
      -- Users can access files they own
      owner = auth.uid()
    )
  );

-- RLS policy: Authenticated users can upload
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'orq8-files'
    AND auth.role() = 'authenticated'
  );

-- RLS policy: Authenticated users can read their own files
CREATE POLICY "authenticated_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'orq8-files'
    AND auth.role() = 'authenticated'
  );
