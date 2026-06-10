-- Migration: add 'wip' (Work In Progress) to app_feedback.status
-- Ordering intent: open → reviewed → wip → resolved → dismissed
-- Run once against an existing app_feedback table (the CREATE script's
-- IF NOT EXISTS won't update an already-created CHECK constraint).
-- Idempotent: drops the old constraint by name if present, re-adds the new one.

ALTER TABLE app_feedback
  DROP CONSTRAINT IF EXISTS app_feedback_status_check;

ALTER TABLE app_feedback
  ADD CONSTRAINT app_feedback_status_check
  CHECK (status IN ('open', 'reviewed', 'wip', 'resolved', 'dismissed'));
