-- ============================================================
-- Atlas Family Param Signatures (DB layer)
-- ============================================================
-- Engineer-curated entries that augment the code-defined
-- FAMILY_PARAM_SIGNATURES registry in
-- lib/services/atlasFamilyParamSignatures.ts.
--
-- Why a DB table at all? The code registry ships in the bundle —
-- adding an entry from there requires a code commit + redeploy.
-- The Triage AI Investigator regularly surfaces high-confidence
-- "wrong family" diagnoses; we want one click in the UI to:
--   (a) persist the rule going forward (this table),
--   (b) reclassify the products that already exist in
--       atlas_products with the offending param under the wrong
--       family.
--
-- Merge semantics (server-side helper does this in JS):
--   - Code-defined entries are the audited baseline. They always
--     apply.
--   - DB-defined entries are additive; if a DB row's pattern
--     duplicates a code entry, the code entry wins (avoids
--     accidental overrides of tested behavior).
--
-- Pattern is stored as plain TEXT and compiled to RegExp on read.
-- We store the literal source the engineer would have typed, e.g.
-- '^@?ib\\(ma\\)\\b'. Validation happens server-side at insert.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_family_param_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Regex source (without slashes / flags). Always compiled with
  -- the 'i' flag in the loader.
  pattern TEXT NOT NULL,

  -- Target classification fields — must form a real
  -- FamilyClassification (category + subcategory + familyId).
  target_family_id TEXT NOT NULL,
  target_category TEXT NOT NULL,
  target_subcategory TEXT NOT NULL,

  -- Why this paramName belongs to the target family. Shown in
  -- diagnosis cards and the audit log.
  reasoning TEXT NOT NULL,

  -- 'engineer_via_ai' = engineer accepted an AI Investigator
  -- verdict. 'engineer_manual' = engineer added it directly
  -- (future admin UI). Tracked for analytics.
  source TEXT NOT NULL DEFAULT 'engineer_via_ai'
    CHECK (source IN ('engineer_via_ai', 'engineer_manual')),

  -- Optional pointer to the AI Investigator audit row that
  -- produced this signature. NULL for manual entries.
  source_investigation_id UUID,

  -- Soft-disable without losing history.
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active row per (pattern, target_family_id). Same pattern
-- pointing to the same family is a duplicate; same pattern
-- pointing to two different families is a real (engineered) split
-- and allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_fps_active_unique
  ON atlas_family_param_signatures (pattern, target_family_id)
  WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_atlas_fps_target_family
  ON atlas_family_param_signatures (target_family_id)
  WHERE (is_active = true);

ALTER TABLE atlas_family_param_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read atlas family param signatures"
  ON atlas_family_param_signatures;
CREATE POLICY "Admins can read atlas family param signatures"
  ON atlas_family_param_signatures FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert atlas family param signatures"
  ON atlas_family_param_signatures;
CREATE POLICY "Admins can insert atlas family param signatures"
  ON atlas_family_param_signatures FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update atlas family param signatures"
  ON atlas_family_param_signatures;
CREATE POLICY "Admins can update atlas family param signatures"
  ON atlas_family_param_signatures FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- Retroactive reclassify RPC
-- ============================================================
-- Reclassifies every atlas_products row whose `parameters` JSONB
-- contains the given top-level key AND whose family_id is not
-- already the target. Returns the count of rows updated.
--
-- The route handler calls this after inserting a new signature so
-- products that landed in the wrong family during prior ingests
-- get fixed in the same click.
--
-- `parameters ? key` uses the JSONB key-existence operator (fast,
-- can use a GIN index on `parameters` if one exists). For the
-- unmapped-param case the sanitized key (e.g. 'ib_ma' for the
-- raw paramName '@IB(mA)') is what the ingest path stores.
-- ============================================================
CREATE OR REPLACE FUNCTION reclassify_products_by_param_key(
  param_key TEXT,
  target_family_id TEXT,
  target_category TEXT,
  target_subcategory TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE atlas_products
  SET
    family_id = target_family_id,
    category = target_category,
    subcategory = target_subcategory
  WHERE parameters ? param_key
    AND family_id IS DISTINCT FROM target_family_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION reclassify_products_by_param_key(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reclassify_products_by_param_key(TEXT, TEXT, TEXT, TEXT) TO service_role;
