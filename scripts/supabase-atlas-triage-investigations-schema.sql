-- ============================================================
-- Atlas Triage Investigations — Persistent Audit Log of AI Verdicts
-- ============================================================
-- Every click of the "Investigate" button on a non-accept Triage row
-- writes one row here capturing what Sonnet 4.6 returned. When the
-- engineer follows up with a concrete action (commit override via
-- Mint+Accept, confirm wrong-family, mark unmappable), the row is
-- UPDATE'd with what they did + a link to the resulting override if
-- applicable. This gives a permanent audit trail of "AI said X, I did
-- Y, here's the resulting override row" that's reviewable months
-- later — independent of the localStorage cache which expires in 7d.
--
-- One row per investigation call. Re-running Investigate on the same
-- row (e.g. cache miss, or the engineer hit Refresh) creates a NEW
-- row. The audit log is append-mostly: only the action_* fields are
-- mutated, and only once (the first follow-up action wins). Multiple
-- investigations on the same paramName accumulate; the admin log view
-- groups by paramName for easy history scan.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_triage_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity of the param being investigated.
  param_name TEXT NOT NULL,
  scope_kind TEXT NOT NULL,          -- 'family' | 'category' | 'none'
  scope_key  TEXT,                    -- familyId (e.g. 'B5') or L2 category name (e.g. 'Microcontrollers'); null when scope_kind='none'

  -- AI verdict (one of the six DeepAnalysis buckets).
  bucket TEXT NOT NULL,               -- 'new_canonical' | 'disambiguation' | 'wrong_family' | 'unit_mismatch' | 'unscoped_products' | 'unmappable'
  confidence TEXT NOT NULL,           -- 'high' | 'medium' | 'low'
  summary TEXT,                       -- 1-2 sentence next-step
  prose TEXT,                         -- 3-5 sentence engineer-note prose
  primary_action_label TEXT,          -- the button label the engineer saw
  raw_response JSONB NOT NULL,        -- full DeepAnalysis blob — supports replay / debugging / future analysis

  -- Engineer follow-up. Null until an action is taken.
  -- 'override_created'      → Accept after Mint produced a dictionary override (see resulting_override_id)
  -- 'flagged_wrong_family'  → engineer Confirmed wrong-family
  -- 'marked_unmappable'     → engineer marked param unmappable
  -- 'dismissed'             → engineer closed/ignored the verdict (no inline action wired today; reserved)
  action_taken TEXT,
  action_at    TIMESTAMPTZ,
  resulting_override_id UUID REFERENCES atlas_dictionary_overrides(id) ON DELETE SET NULL,

  -- Optional revert metadata. When the engineer later decides the action
  -- was wrong and reverts via the AI Log panel, these get stamped. The
  -- original action_taken / action_at stays put so the audit log shows
  -- "Accepted at 9am, Reverted at 3pm" — full history, not overwritten.
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES auth.users(id),

  -- Provenance.
  ran_by UUID NOT NULL REFERENCES auth.users(id),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT atlas_triage_investigations_scope_kind_check
    CHECK (scope_kind IN ('family', 'category', 'none')),
  CONSTRAINT atlas_triage_investigations_bucket_check
    CHECK (bucket IN ('new_canonical', 'disambiguation', 'wrong_family', 'unit_mismatch', 'unscoped_products', 'unmappable')),
  CONSTRAINT atlas_triage_investigations_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low')),
  CONSTRAINT atlas_triage_investigations_action_check
    CHECK (action_taken IS NULL OR action_taken IN ('override_created', 'flagged_wrong_family', 'marked_unmappable', 'dismissed'))
);

-- Idempotent ALTER for existing deployments that pre-date the revert columns.
ALTER TABLE atlas_triage_investigations
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE atlas_triage_investigations
  ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES auth.users(id);

-- ─── Indexes ─────────────────────────────────────────────────

-- Default admin-log sort: most recent first.
CREATE INDEX IF NOT EXISTS idx_atlas_triage_investigations_ran_at
  ON atlas_triage_investigations (ran_at DESC);

-- Group-by-paramName history pane.
CREATE INDEX IF NOT EXISTS idx_atlas_triage_investigations_param
  ON atlas_triage_investigations (param_name, ran_at DESC);

-- Filter by bucket (e.g. "show me all wrong_family verdicts last week").
CREATE INDEX IF NOT EXISTS idx_atlas_triage_investigations_bucket
  ON atlas_triage_investigations (bucket, ran_at DESC);

-- Partial index for "outstanding" investigations the engineer never acted on.
CREATE INDEX IF NOT EXISTS idx_atlas_triage_investigations_pending
  ON atlas_triage_investigations (ran_at DESC)
  WHERE action_taken IS NULL;

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE atlas_triage_investigations ENABLE ROW LEVEL SECURITY;

-- DROP-then-CREATE so this script is safe to re-run.
DROP POLICY IF EXISTS "Admins can read atlas triage investigations"
  ON atlas_triage_investigations;
CREATE POLICY "Admins can read atlas triage investigations"
  ON atlas_triage_investigations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert atlas triage investigations"
  ON atlas_triage_investigations;
CREATE POLICY "Admins can insert atlas triage investigations"
  ON atlas_triage_investigations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update atlas triage investigations"
  ON atlas_triage_investigations;
CREATE POLICY "Admins can update atlas triage investigations"
  ON atlas_triage_investigations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- No DELETE policy — investigations are permanent audit records.
