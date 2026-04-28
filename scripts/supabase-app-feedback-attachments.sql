-- App Feedback: image attachments support.
-- Adds an `attachments` JSONB column to `app_feedback` and provisions a private
-- Storage bucket with RLS so users can upload under their own user_id prefix
-- and admins can read all objects.

ALTER TABLE app_feedback
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-feedback-attachments', 'app-feedback-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own feedback attachments" ON storage.objects;
CREATE POLICY "Users upload own feedback attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-feedback-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own feedback attachments" ON storage.objects;
CREATE POLICY "Users read own feedback attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'app-feedback-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins read all feedback attachments" ON storage.objects;
CREATE POLICY "Admins read all feedback attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'app-feedback-attachments'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
