-- ============================================================
-- Atlas Parameter Decision Log — append-only record of every
-- decision made about a Triage parameter.
-- ============================================================
-- WHY THIS EXISTS
--
-- Before this table, parameter decisions were scattered across three
-- places and no single surface showed a decision next to the evidence
-- behind it:
--
--   atlas_dictionary_overrides   accept decisions (2,032 active)
--   atlas_unmapped_param_notes   defer / unmappable / wrong-family /
--                                notes — MUTABLE, last-write-wins,
--                                NO history at all
--   atlas_triage_investigations  rich AI evidence, but ONLY for
--                                decisions made via the Investigate
--                                drawer
--
-- Measured July 19, 2026: of 2,032 active accepted mappings, only 65
-- appeared in the investigations table — 1,967 (97%) were invisible.
-- All 80 deferred params were invisible. Parking a param left no trace
-- anywhere.
--
-- THE INVERSION: the DECISION is the record; an AI investigation is
-- just one piece of evidence that may or may not be attached to it
-- (see `evidence`, which is NULL when the decision was made without
-- AI). That is what makes this decision-first rather than AI-first.
--
-- RELATIONSHIP TO atlas_unmapped_param_notes: complementary, NOT a
-- replacement. That table stays the fast last-write-wins CURRENT STATE
-- driving the ~26k-row Triage queue's filters and chip counts. This one
-- is the append-only HISTORY beside it. Do NOT derive current state by
-- replaying this log — that would be a real perf regression on a queue
-- that already has a scaling item in BACKLOG.
--
-- APPEND-ONLY: there is no UPDATE policy and no DELETE policy, by
-- design (mirrors app_feedback_comments). A correction is a NEW row —
-- undoing a 09:00 accept appends a 09:05 'mapping_revoked' row, so the
-- log reads "Accepted 09:00 → Reverted 09:05" rather than losing the
-- original. Nothing in this table is ever rewritten.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_param_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─── What was decided about ───────────────────────────────
  -- CANONICAL JOIN KEY: NFC-normalized + lowercased + trimmed.
  --
  -- This matters. The two source tables disagree on form:
  --   atlas_dictionary_overrides  stores NFC + lowercased (its POST route
  --                               normalizes on write)
  --   atlas_unmapped_param_notes  stores the RAW name
  -- Copying each source verbatim would split one parameter's history into
  -- two unrelated streams — and the same Chinese characters can persist as
  -- NFC or NFD depending on the source file's encoding, so it would happen
  -- invisibly. Normalizing here gives per-param history ONE stable key.
  -- The helper does this; callers pass whatever form they have.
  param_name TEXT NOT NULL,

  -- The name as the engineer actually saw it on screen, preserved for
  -- display only (lowercasing "VR(V)" → "vr(v)" for the join key should
  -- not leak into the UI). Never join on this.
  param_name_display TEXT,

  -- Scope is NULLABLE ON PURPOSE. atlas_unmapped_param_notes is keyed
  -- on param_name ALONE (no family), while atlas_dictionary_overrides
  -- carries family_id. So one param name can hold a single note but
  -- many per-family mappings. A status decision (defer / unmappable)
  -- therefore records family_id = NULL rather than GUESSING a family.
  family_id TEXT,
  category  TEXT,

  -- ─── The decision itself ──────────────────────────────────
  decision TEXT NOT NULL,

  -- The engineer's rationale AT DECISION TIME. Snapshotted deliberately
  -- rather than FK'd to the live note, so later edits to the note can't
  -- silently rewrite what the log says was known when the call was made.
  note TEXT,

  -- The AI DeepAnalysis blob when one informed this decision; NULL when
  -- the decision was made without AI. This column is the whole point:
  -- evidence hangs off the decision, the decision does not hang off the
  -- evidence.
  evidence JSONB,

  -- What it was mapped to, when applicable (NULL for defer/flag/etc).
  attribute_id   TEXT,
  attribute_name TEXT,

  -- ─── Links out ────────────────────────────────────────────
  -- The override row this decision produced / acted upon.
  override_id UUID REFERENCES atlas_dictionary_overrides(id) ON DELETE SET NULL,
  -- Back-link to the legacy investigations row (set by the backfill and
  -- by AI-assisted decisions, so the old audit trail stays reachable).
  investigation_id UUID REFERENCES atlas_triage_investigations(id) ON DELETE SET NULL,
  -- Groups the N rows written by one Batch Accept. For rows created
  -- natively the helper passes this straight through; the backfill
  -- parses it out of change_reason's '[batch:<uuid>]' marker (verified:
  -- 137 rows / 7 batches / largest 55). Used ONLY for display grouping —
  -- the data stays one row per param so per-param history is intact.
  batch_id TEXT,

  -- ─── Provenance ───────────────────────────────────────────
  -- 'ui'       clicked in the admin Triage UI
  -- 'batch'    part of a Batch Accept
  -- 'script'   a CLI maintenance script
  -- 'backfill' RECONSTRUCTED from pre-existing records, not observed.
  --            Surfaced distinctly in the UI so reconstructed history
  --            can never masquerade as observed history.
  source TEXT NOT NULL,

  -- Verified non-null across all three source tables before making this
  -- NOT NULL: atlas_dictionary_overrides.created_by (2,250/2,250),
  -- atlas_unmapped_param_notes.updated_by (168/168),
  -- atlas_triage_investigations.ran_by (97/97). CLI scripts resolve an
  -- admin UUID and abort if they cannot (see
  -- scripts/atlas-mark-condition-params-unmappable.mjs).
  decided_by UUID NOT NULL REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent ALTER for a deployment that ran an earlier draft of this file
-- before param_name_display existed.
ALTER TABLE atlas_param_decisions
  ADD COLUMN IF NOT EXISTS param_name_display TEXT;

-- ─── Constraints ─────────────────────────────────────────────
-- DROP-then-ADD so this migration is safe to re-run whenever the
-- allowed sets grow (same style as the unmapped-param-notes schema).
-- Existing rows satisfying a prior narrower set still satisfy the new
-- wider one, so growing the enum never needs a data migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atlas_param_decisions_decision_check'
  ) THEN
    ALTER TABLE atlas_param_decisions
      DROP CONSTRAINT atlas_param_decisions_decision_check;
  END IF;

  ALTER TABLE atlas_param_decisions
    ADD CONSTRAINT atlas_param_decisions_decision_check
    CHECK (decision IN (
      'mapping_accepted',      -- an override was created
      'mapping_edited',        -- superseded by a newer active override
      'mapping_revoked',       -- deactivated with nothing replacing it
      'deferred',              -- parked for later
      'reopened',              -- status cleared back to the open queue
      'marked_unmappable',
      'flagged_wrong_family',
      'confirmed_in_family',
      'note_added',
      'note_cleared',           -- an engineer's written rationale was erased
      'flag_toggled'
    ));

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atlas_param_decisions_source_check'
  ) THEN
    ALTER TABLE atlas_param_decisions
      DROP CONSTRAINT atlas_param_decisions_source_check;
  END IF;

  ALTER TABLE atlas_param_decisions
    ADD CONSTRAINT atlas_param_decisions_source_check
    CHECK (source IN ('ui', 'batch', 'script', 'backfill'));
END $$;

-- ─── Indexes ─────────────────────────────────────────────────

-- Default view: newest decisions first. This index is what makes
-- "find what I just did" a server-side ORDER BY rather than a
-- client-side sort of one page slice (which would silently show the
-- wrong rows at the top).
CREATE INDEX IF NOT EXISTS idx_atlas_param_decisions_decided_at
  ON atlas_param_decisions (decided_at DESC);

-- Per-parameter history pane: every decision ever made about one param.
CREATE INDEX IF NOT EXISTS idx_atlas_param_decisions_param
  ON atlas_param_decisions (param_name, decided_at DESC);

-- "Show me every defer last week" style filtering.
CREATE INDEX IF NOT EXISTS idx_atlas_param_decisions_decision
  ON atlas_param_decisions (decision, decided_at DESC);

-- "Mine" quick-filter.
CREATE INDEX IF NOT EXISTS idx_atlas_param_decisions_actor
  ON atlas_param_decisions (decided_by, decided_at DESC);

-- Batch-group collapse in the UI.
CREATE INDEX IF NOT EXISTS idx_atlas_param_decisions_batch
  ON atlas_param_decisions (batch_id, decided_at DESC)
  WHERE batch_id IS NOT NULL;

-- Idempotency guard for the backfill: re-running must insert zero rows.
-- Partial + UNIQUE on the natural key of a reconstructed decision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_param_decisions_backfill_unique
  ON atlas_param_decisions (param_name, decision, decided_at)
  WHERE source = 'backfill';

-- ─── Row Level Security ──────────────────────────────────────
-- Admin-only surface. SELECT + INSERT only: the absence of UPDATE and
-- DELETE policies IS the append-only enforcement. Do not add them.

ALTER TABLE atlas_param_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read param decisions" ON atlas_param_decisions;
CREATE POLICY "Admins read param decisions"
  ON atlas_param_decisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins insert param decisions" ON atlas_param_decisions;
CREATE POLICY "Admins insert param decisions"
  ON atlas_param_decisions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- No UPDATE policy — a logged decision is never rewritten.
-- No DELETE policy — decisions are permanent audit records.
