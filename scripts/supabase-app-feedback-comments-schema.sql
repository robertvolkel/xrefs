-- App Feedback Comments: collaborative threads on each feedback item.
-- Both the submitting user and the platform admin can post comments back
-- and forth. Comments are immutable (no edits / no deletes) so the unread
-- indicator math stays simple and the audit trail is clean.
--
-- Read-state lives on the parent app_feedback row as two timestamps so we
-- can compute "is there anything unread for me" in a single query.

CREATE TABLE IF NOT EXISTS app_feedback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'admin')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_comments_thread
  ON app_feedback_comments(feedback_id, created_at);

ALTER TABLE app_feedback_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own thread" ON app_feedback_comments;
CREATE POLICY "Users read own thread"
  ON app_feedback_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_feedback f
    WHERE f.id = feedback_id AND f.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users insert in own thread" ON app_feedback_comments;
CREATE POLICY "Users insert in own thread"
  ON app_feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'user'
    AND EXISTS (SELECT 1 FROM app_feedback f WHERE f.id = feedback_id AND f.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read all threads" ON app_feedback_comments;
CREATE POLICY "Admins read all threads"
  ON app_feedback_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins insert on any thread" ON app_feedback_comments;
CREATE POLICY "Admins insert on any thread"
  ON app_feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'admin'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Read-state timestamps on the parent feedback row.
ALTER TABLE app_feedback
  ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ;

-- SECURITY DEFINER function so a regular user can stamp their own
-- `user_last_read_at` without us having to grant them a broad UPDATE
-- policy on `app_feedback` (which would let them tamper with status,
-- admin_notes, etc.). The function is locked to the caller's own rows
-- via the `auth.uid()` check inside.
CREATE OR REPLACE FUNCTION mark_app_feedback_user_read(p_feedback_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  UPDATE app_feedback
     SET user_last_read_at = v_now
   WHERE id = p_feedback_id
     AND user_id = auth.uid();
  RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_app_feedback_user_read(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Thread-level DELETE policies. Either side can wipe out the whole
-- thread; the comments table cascades via ON DELETE CASCADE on its FK.
-- Attachments in Storage are cleaned up by the API route, since SQL
-- can't reach the storage bucket directly.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users delete own app feedback" ON app_feedback;
CREATE POLICY "Users delete own app feedback"
  ON app_feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins delete any app feedback" ON app_feedback;
CREATE POLICY "Admins delete any app feedback"
  ON app_feedback FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users delete own feedback attachments" ON storage.objects;
CREATE POLICY "Users delete own feedback attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'app-feedback-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins delete all feedback attachments" ON storage.objects;
CREATE POLICY "Admins delete all feedback attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'app-feedback-attachments'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────
-- One-time migration: move existing `admin_notes` content into a seed
-- admin comment per feedback row, then drop the column.
-- Run these two statements MANUALLY after spot-checking the comments
-- table; they are commented out so the schema file is idempotent.
-- ─────────────────────────────────────────────────────────────────────
--
-- INSERT INTO app_feedback_comments (feedback_id, author_id, author_role, body, created_at)
-- SELECT id, resolved_by, 'admin', admin_notes, COALESCE(resolved_at, updated_at)
--   FROM app_feedback
--  WHERE admin_notes IS NOT NULL
--    AND admin_notes <> ''
--    AND resolved_by IS NOT NULL;
--
-- ALTER TABLE app_feedback DROP COLUMN admin_notes;
