-- ============================================================
-- Atlas Param Suggestions — durable AI Generate verdicts
-- ============================================================
-- Persists the AI (/api/admin/atlas/dictionaries/suggest) verdict for a
-- triage param so it survives across sessions, browsers, and server
-- redeploys. Before this table, a generated verdict lived only in the
-- engineer's localStorage (1yr) + a 24h in-memory server cache — so the
-- server could not count or filter "Accept" across the whole queue, and
-- the pile of generated suggestions was not durable.
--
-- Scope key mirrors the dictionary-override scope exactly (Decision #178):
--   family_id = dominantFamily ?? dominantCategory ?? ''   (L3 id OR L2
--   category OR empty for unscoped). Stored '' (never NULL) so it can be
--   part of the primary key. param_name is stored NORMALIZED the same way
--   overrides join (normalizeOverrideKey = NFC + lower + trim) so a queue
--   row's scope key + normalized paramName looks the verdict up directly.
--   raw_param_name keeps the original for display.
--
-- Write path: the /suggest route upserts via the service-role client
-- (bypasses RLS). RLS policies below mirror atlas_unmapped_param_notes so
-- authenticated admins can also read/write directly if ever needed.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_param_suggestions (
  family_id               TEXT NOT NULL DEFAULT '',
  param_name              TEXT NOT NULL,
  raw_param_name          TEXT,
  verdict                 TEXT,
  suggested_attribute_id  TEXT,
  suggested_attribute_name TEXT,
  suggested_unit          TEXT,
  translation             TEXT,
  confidence              TEXT,
  reasoning               TEXT,
  explanation             TEXT,
  card_version_at_write   TEXT,
  schema_version_at_write TEXT,
  generated_by            UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, param_name)
);

-- Reconcile pre-existing deployments that may have created the table before
-- a column was added (additive, safe to re-run).
ALTER TABLE atlas_param_suggestions ADD COLUMN IF NOT EXISTS reasoning TEXT;
ALTER TABLE atlas_param_suggestions ADD COLUMN IF NOT EXISTS raw_param_name TEXT;

-- verdict CHECK added via DO block so re-runs stay safe if the allowed
-- verdict set ever grows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atlas_param_suggestions_verdict_check'
  ) THEN
    ALTER TABLE atlas_param_suggestions DROP CONSTRAINT atlas_param_suggestions_verdict_check;
  END IF;
  ALTER TABLE atlas_param_suggestions
    ADD CONSTRAINT atlas_param_suggestions_verdict_check
    CHECK (verdict IS NULL OR verdict IN ('accept', 'defer'));
END$$;

-- ─── Indexes ─────────────────────────────────────────────────
-- verdict drives the "Accept" filter + counts; family_id drives the
-- per-batch/scope rollups.
CREATE INDEX IF NOT EXISTS idx_atlas_param_suggestions_verdict
  ON atlas_param_suggestions (verdict);
CREATE INDEX IF NOT EXISTS idx_atlas_param_suggestions_family
  ON atlas_param_suggestions (family_id);
CREATE INDEX IF NOT EXISTS idx_atlas_param_suggestions_param
  ON atlas_param_suggestions (param_name);

-- ─── Row Level Security ──────────────────────────────────────
ALTER TABLE atlas_param_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read atlas param suggestions"
  ON atlas_param_suggestions;
CREATE POLICY "Authenticated can read atlas param suggestions"
  ON atlas_param_suggestions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert atlas param suggestions"
  ON atlas_param_suggestions;
CREATE POLICY "Admins can insert atlas param suggestions"
  ON atlas_param_suggestions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update atlas param suggestions"
  ON atlas_param_suggestions;
CREATE POLICY "Admins can update atlas param suggestions"
  ON atlas_param_suggestions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete atlas param suggestions"
  ON atlas_param_suggestions;
CREATE POLICY "Admins can delete atlas param suggestions"
  ON atlas_param_suggestions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- get_atlas_param_suggestion_verdicts() — whole-queue verdict map
-- ============================================================
-- Returns a single JSONB ARRAY of { family_id, param_name, verdict }, one
-- per row. RETURNS jsonb (NOT a TABLE) is deliberate and load-bearing:
-- PostgREST hard-caps TABLE/SETOF returns at 1000 rows server-side and
-- `.range()` cannot override it (Decision #206). A plain `.select()` of this
-- table would silently truncate at 1000, freezing the "generated so far"
-- counter and the Accept pile at 1000 once the queue grows. A scalar jsonb
-- return is not row-capped. The route parses `data` as the array directly.
-- Light rows only (verdict, no explanation/detail) so the payload stays small
-- (~60 bytes/row); per-page display detail is fetched separately (bounded).
-- Mirrors get_triage_unmapped_aggregate (Decision #180).
-- ============================================================
DROP FUNCTION IF EXISTS get_atlas_param_suggestion_verdicts();

CREATE FUNCTION get_atlas_param_suggestion_verdicts()
RETURNS jsonb
LANGUAGE sql
STABLE
SET statement_timeout = '60s'
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'family_id', family_id,
      'param_name', param_name,
      'verdict', verdict
    )),
    '[]'::jsonb
  )
  FROM atlas_param_suggestions
  WHERE verdict IS NOT NULL;
$$;
