-- ============================================================
-- Atlas Unmapped Parameter Notes — Team Collaboration on Triage
-- ============================================================
-- Per-paramName free-form notes for the Atlas Dictionary Triage
-- queue. Engineers attach research, reasoning, and "wait until
-- we have rule support" annotations to individual unmapped
-- parameters; teammates see them on the same row.
--
-- Single note per paramName globally (not per family/batch),
-- last-write-wins. Notes are an aid to deciding what to map to;
-- they do not affect ingest or matching pipelines.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_unmapped_param_notes (
  param_name TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_unmapped_notes_updated
  ON atlas_unmapped_param_notes (updated_at DESC);

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE atlas_unmapped_param_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atlas unmapped param notes"
  ON atlas_unmapped_param_notes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
