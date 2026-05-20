-- ============================================================
-- Atlas Family MFR Grounding RPC
-- ============================================================
-- Returns top-N manufacturers (by product count) for a given L3 family,
-- with a small sample of MPNs per manufacturer. Used by the Generate
-- endpoint for atlas_family_domain_cards to ground Opus card-writing
-- in actual atlas_products data rather than model priors (the root
-- cause of the May 2026 hallucination audit — every card pre-Phase-1
-- listed Western MFRs that have zero products under their family_id).
--
-- One DB round-trip instead of fetching all family rows for grouping
-- in app code — family 71 alone has ~18.7K rows.
-- ============================================================

CREATE OR REPLACE FUNCTION get_atlas_family_mfr_grounding(
  p_family_id TEXT,
  p_mfr_limit INT DEFAULT 15,
  p_sample_limit INT DEFAULT 5
)
RETURNS TABLE (
  manufacturer TEXT,
  product_count BIGINT,
  sample_mpns TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  WITH ranked AS (
    SELECT
      atlas_products.manufacturer AS mfr,
      COUNT(*) AS pc
    FROM atlas_products
    WHERE atlas_products.family_id = p_family_id
      AND atlas_products.manufacturer IS NOT NULL
      AND atlas_products.manufacturer <> ''
    GROUP BY atlas_products.manufacturer
    ORDER BY pc DESC
    LIMIT p_mfr_limit
  )
  SELECT
    r.mfr,
    r.pc,
    COALESCE(
      (
        SELECT array_agg(s.mpn ORDER BY s.mpn)
        FROM (
          SELECT atlas_products.mpn
          FROM atlas_products
          WHERE atlas_products.family_id = p_family_id
            AND atlas_products.manufacturer = r.mfr
            AND atlas_products.mpn IS NOT NULL
          ORDER BY atlas_products.mpn
          LIMIT p_sample_limit
        ) s
      ),
      ARRAY[]::TEXT[]
    ) AS sample_mpns
  FROM ranked r
  ORDER BY r.pc DESC;
$$;

GRANT EXECUTE ON FUNCTION get_atlas_family_mfr_grounding(TEXT, INT, INT) TO authenticated, service_role;

-- ============================================================
-- Aggregate counts companion — single-row "current state" for the
-- family. Used at card-save time to snapshot (grounded_at_product_count,
-- grounded_at_mfr_count) so a future Phase 2 staleness signal can show
-- the engineer when atlas data has drifted past their last save.
-- ============================================================

CREATE OR REPLACE FUNCTION get_atlas_family_grounding_counts(
  p_family_id TEXT
)
RETURNS TABLE (
  product_count BIGINT,
  mfr_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  SELECT
    COUNT(*) AS product_count,
    COUNT(DISTINCT manufacturer) FILTER (WHERE manufacturer IS NOT NULL AND manufacturer <> '') AS mfr_count
  FROM atlas_products
  WHERE family_id = p_family_id;
$$;

GRANT EXECUTE ON FUNCTION get_atlas_family_grounding_counts(TEXT) TO authenticated, service_role;
