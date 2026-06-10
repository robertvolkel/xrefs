-- Unified in-app notifications inbox.
--
-- Source-agnostic: any producer (feedback reply, new feedback, future
-- release-note / BOM-report / system messages) drops one row here per
-- recipient. The in-app inbox reads these; email delivery is handled
-- separately by lib/services/notificationService.ts at create time.
--
-- Rows are INSERTed by the server-side service-role client (bypasses RLS),
-- so there is intentionally NO user INSERT/UPDATE policy. Users may only
-- SELECT their own rows; marking-read goes through the SECURITY DEFINER
-- functions below (same pattern as mark_app_feedback_user_read).
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'feedback_reply', 'feedback_new', 'release_note', 'bom_report', 'system'
  )),
  title TEXT NOT NULL,
  body TEXT,                          -- short plaintext preview
  link TEXT,                          -- in-app URL to navigate to on click
  data JSONB NOT NULL DEFAULT '{}',   -- source metadata + optional dedupeKey
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "my recent" list query
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);

-- "my unread count" — partial index keeps it tiny
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_id) WHERE read_at IS NULL;

-- dedup lookups by (recipient, type, dedupeKey)
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(recipient_id, type, ((data->>'dedupeKey')));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- No user INSERT/UPDATE/DELETE policy on purpose: writes happen via the
-- service-role client; mark-read via the RPCs below.

-- ─────────────────────────────────────────────────────────────────────
-- Mark-read SECURITY DEFINER functions (mirror mark_app_feedback_user_read).
-- Locked to the caller's own rows via the auth.uid() check inside.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_notification_read(p_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  UPDATE notifications
     SET read_at = v_now
   WHERE id = p_id
     AND recipient_id = auth.uid()
     AND read_at IS NULL;
  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
     SET read_at = NOW()
   WHERE recipient_id = auth.uid()
     AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;
