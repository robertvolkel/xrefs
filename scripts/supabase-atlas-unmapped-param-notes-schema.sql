-- ============================================================
-- Atlas Unmapped Parameter Notes — Team Collaboration on Triage
-- ============================================================
-- Per-paramName free-form notes + structured triage status for
-- the Atlas Dictionary Triage queue.
--
-- The row carries two orthogonal axes:
--   1. note (free-form) — engineers attach research/reasoning/
--      "wait until we have rule support" annotations.
--   2. status (enum) — structured triage outcome:
--        'wrong_family'        — confirmed misclassification; the
--                                products carrying this paramName
--                                belong in another family. Excluded
--                                from the synonym workflow.
--        'confirmed_in_family' — engineer reverted an auto-flag;
--                                suppress future foreign-family
--                                detection for this paramName even
--                                if it matches a registry signature.
--        NULL                  — default; row is a free-form note
--                                or an open synonym-mapping case.
--
-- flagged_by ('auto' | 'engineer') tracks who set the status —
-- 'auto' means the foreign-family registry surfaced it and an
-- engineer Confirmed; 'engineer' means manual classification.
--
-- auto_diagnosis (JSONB) captures the registry hit at flag time
-- (suggestedFamily, reasoning, matchingParam) so the audit record
-- survives later registry edits.
--
-- Single row per paramName globally (not per family/batch).
-- Last-write-wins. Status + auto_diagnosis are an aid to triage;
-- they do not directly affect ingest or matching pipelines (the
-- registry consumed by reclassifyByParameterSignals is the
-- ingest-time hook).
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_unmapped_param_notes (
  param_name TEXT PRIMARY KEY,
  note TEXT,
  status TEXT,
  flagged_by TEXT,
  auto_diagnosis JSONB,
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_unmapped_param_notes_status_check
    CHECK (status IS NULL OR status IN ('wrong_family', 'confirmed_in_family')),
  CONSTRAINT atlas_unmapped_param_notes_flagged_by_check
    CHECK (flagged_by IS NULL OR flagged_by IN ('auto', 'engineer')),
  -- A row exists for one of two reasons: an engineer wrote a note,
  -- or a status was set. An empty row with neither would be deleted
  -- by the PUT handler — enforce here too so the table cannot drift
  -- to all-null rows on bad client writes.
  CONSTRAINT atlas_unmapped_param_notes_has_signal
    CHECK (
      (note IS NOT NULL AND length(trim(note)) > 0)
      OR status IS NOT NULL
    )
);

-- Pre-existing deployments may have created the table with
-- `note NOT NULL` and without the new columns. Reconcile.
ALTER TABLE atlas_unmapped_param_notes
  ALTER COLUMN note DROP NOT NULL;

ALTER TABLE atlas_unmapped_param_notes
  ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE atlas_unmapped_param_notes
  ADD COLUMN IF NOT EXISTS flagged_by TEXT;
ALTER TABLE atlas_unmapped_param_notes
  ADD COLUMN IF NOT EXISTS auto_diagnosis JSONB;

-- Add CHECK constraints (idempotent via DO blocks — ALTER TABLE ADD
-- CONSTRAINT has no IF NOT EXISTS form prior to PG 17).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atlas_unmapped_param_notes_status_check'
  ) THEN
    ALTER TABLE atlas_unmapped_param_notes
      ADD CONSTRAINT atlas_unmapped_param_notes_status_check
      CHECK (status IS NULL OR status IN ('wrong_family', 'confirmed_in_family'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atlas_unmapped_param_notes_flagged_by_check'
  ) THEN
    ALTER TABLE atlas_unmapped_param_notes
      ADD CONSTRAINT atlas_unmapped_param_notes_flagged_by_check
      CHECK (flagged_by IS NULL OR flagged_by IN ('auto', 'engineer'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atlas_unmapped_param_notes_has_signal'
  ) THEN
    ALTER TABLE atlas_unmapped_param_notes
      ADD CONSTRAINT atlas_unmapped_param_notes_has_signal
      CHECK (
        (note IS NOT NULL AND length(trim(note)) > 0)
        OR status IS NOT NULL
      );
  END IF;
END$$;

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_unmapped_notes_updated
  ON atlas_unmapped_param_notes (updated_at DESC);

-- Partial index for the auto-flagged review queue (status filter
-- is the dominant access pattern from the Triage UI).
CREATE INDEX IF NOT EXISTS idx_atlas_unmapped_notes_status
  ON atlas_unmapped_param_notes (status)
  WHERE status IS NOT NULL;

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE atlas_unmapped_param_notes ENABLE ROW LEVEL SECURITY;

-- DROP-then-CREATE so this script is safe to re-run on existing
-- deployments. CREATE POLICY has no IF NOT EXISTS support prior to
-- PG 16, and CREATE OR REPLACE POLICY doesn't exist either.
DROP POLICY IF EXISTS "Authenticated users can read atlas unmapped param notes"
  ON atlas_unmapped_param_notes;
CREATE POLICY "Authenticated users can read atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert atlas unmapped param notes"
  ON atlas_unmapped_param_notes;
CREATE POLICY "Admins can insert atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update atlas unmapped param notes"
  ON atlas_unmapped_param_notes;
CREATE POLICY "Admins can update atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete atlas unmapped param notes"
  ON atlas_unmapped_param_notes;
CREATE POLICY "Admins can delete atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
