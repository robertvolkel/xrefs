-- BOM Duplicate Detection: per-list upload-time preferences
-- Adds a JSONB column on parts_lists to hold { duplicateCheckDismissed?: boolean }.
-- Null on existing rows; absence == no dismissal recorded.
-- Safe to run multiple times via IF NOT EXISTS.

ALTER TABLE parts_lists
  ADD COLUMN IF NOT EXISTS upload_settings JSONB;

COMMENT ON COLUMN parts_lists.upload_settings IS
  'Per-list upload-time UX preferences. Today: { duplicateCheckDismissed } — user chose "Leave as is" on the duplicate-detection modal, don''t re-prompt.';
