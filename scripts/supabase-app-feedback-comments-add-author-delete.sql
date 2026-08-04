-- App Feedback Comments: allow an author to delete their OWN comment.
--
-- Originally comments were fully immutable (no UPDATE / no DELETE policies).
-- This adds a single DELETE policy so either party can remove a message they
-- posted themselves — e.g. an admin retracting a reply to a customer's
-- feedback. It does NOT allow deleting the other party's comments, and it
-- does NOT allow edits (still no UPDATE policy). The parent-row
-- ON DELETE CASCADE for whole-thread deletion is unchanged.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS "Authors delete own comments" ON app_feedback_comments;
CREATE POLICY "Authors delete own comments"
  ON app_feedback_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
