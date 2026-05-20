-- ============================================================
-- Atlas AI Context Flags
-- ============================================================
-- One row per /suggest call where the model self-flagged that it lacked
-- adequate domain context for the family. Aggregated per-family to drive
-- the "Health" indicator on the Domain Cards admin panel:
--
--   "Last 30 days: 12 B7 Triage rows asked for more context"
--   → indicates the B7 domain card (if any) is missing real-world gotchas
--   the model encountered. Either Regenerate (Opus reads the latest data)
--   or write a fresh card.
--
-- Source: server-side write from /api/admin/atlas/dictionaries/suggest
-- when the AI's tool/JSON output sets `needsDomainCard: true`. The write
-- is fire-and-forget — never blocks the suggestion response.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_ai_context_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The family the row's products belong to. Always set (we don't flag
  -- rows that have no resolvable family scope — that's a different
  -- problem surfaced by the Triage queue itself).
  family_id TEXT NOT NULL,

  -- The raw Atlas paramName the AI was triaging when it flagged.
  -- Stored verbatim (not lowercased) for reverse-lookup convenience.
  param_name TEXT NOT NULL,

  -- One-line note the AI wrote explaining what context it lacked
  -- ("could not distinguish input-side vs output-side VCC" etc.).
  -- ~200 chars; not constrained because Sonnet's output varies.
  gap_description TEXT,

  -- Model that produced the flag — helpful if we later upgrade /suggest
  -- to a different model and want to filter old flags.
  model_used TEXT,

  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggregation index — used by the health endpoint to count flags per
-- family within a time window (default last 30 days).
CREATE INDEX IF NOT EXISTS idx_atlas_ai_context_flags_family_time
  ON atlas_ai_context_flags (family_id, flagged_at DESC);

ALTER TABLE atlas_ai_context_flags ENABLE ROW LEVEL SECURITY;

-- Service-role bypasses RLS, so route handlers always work. Admin policies
-- gate any direct-from-client reads (the panel uses an API endpoint, so
-- in practice these mostly exist for future audit UIs).
DROP POLICY IF EXISTS "Admins can read atlas ai context flags" ON atlas_ai_context_flags;
CREATE POLICY "Admins can read atlas ai context flags"
  ON atlas_ai_context_flags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can write atlas ai context flags" ON atlas_ai_context_flags;
CREATE POLICY "Admins can write atlas ai context flags"
  ON atlas_ai_context_flags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
