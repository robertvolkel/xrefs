-- ============================================================
-- Atlas Widened Candidate Fetch RPC (Decision #238 Step 2 — fetch-widening)
-- ============================================================
-- The default candidate fetch (lib/services/atlasClient.ts fetchAtlasCandidates)
-- does `.eq('family_id').limit(50)` with NO value filter, so it returns 50
-- ARBITRARY in-family rows. When a user loosens a value-driving attribute with a
-- per-attribute acceptance ±% band (resistance/capacitance), the in-band near-value
-- Atlas parts they want can be entirely absent from that arbitrary 50 — starvation.
--
-- This RPC pushes the numeric band predicate into SQL so it FILTERS BEFORE THE LIMIT:
-- the 50 returned rows are the 50 nearest in-band parts, not an arbitrary slice.
-- numericValue is stored at base SI at ingest (Decision #217), so the SI bounds the
-- app computes from the source value compare directly.
--
-- Parity with the default path: NO status filter (the default fetch returns all
-- statuses; obsolete handling happens in scoring/post-filters), and disabled
-- manufacturers are excluded the same way.
-- ============================================================

CREATE OR REPLACE FUNCTION fetch_atlas_candidates_widened(
  p_family_id TEXT,
  p_attr_id   TEXT,
  p_lo        NUMERIC,
  p_hi        NUMERIC,
  p_source_nv NUMERIC,
  p_disabled  TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_limit     INT DEFAULT 50
)
RETURNS TABLE (
  id                    UUID,
  mpn                   TEXT,
  manufacturer          TEXT,
  description           TEXT,
  clean_description     TEXT,
  category              TEXT,
  subcategory           TEXT,
  family_id             TEXT,
  status                TEXT,
  datasheet_url         TEXT,
  package               TEXT,
  parameters            JSONB,
  manufacturer_country  TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  SELECT
    p.id, p.mpn, p.manufacturer, p.description, p.clean_description,
    p.category, p.subcategory, p.family_id, p.status, p.datasheet_url,
    p.package, p.parameters, p.manufacturer_country
  FROM atlas_products p
  WHERE p.family_id = p_family_id
    AND (p_disabled IS NULL OR NOT (p.manufacturer = ANY(p_disabled)))
    -- only rows that actually carry a numeric value for the widened attribute,
    -- regex-guarded so the ::numeric cast can't error on stray text
    AND (p.parameters -> p_attr_id ->> 'numericValue') ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$'
    AND (p.parameters -> p_attr_id ->> 'numericValue')::numeric BETWEEN p_lo AND p_hi
  -- prefer parts nearest the source value when the band overflows the limit
  ORDER BY abs((p.parameters -> p_attr_id ->> 'numericValue')::numeric - p_source_nv) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION fetch_atlas_candidates_widened(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT[], INT) TO authenticated, service_role;
