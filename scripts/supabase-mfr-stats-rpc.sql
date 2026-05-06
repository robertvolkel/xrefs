-- RPC function: aggregate manufacturer product stats via GROUP BY
-- Returns one row per (manufacturer, family_id) with count + distinct param keys
-- Replaces fetching all 55K+ rows into JavaScript for in-memory aggregation
--
-- Performance: ~1-2s vs 20-30s (eliminates 55K row fetch + JSONB deserialization)

-- Drop first: CREATE OR REPLACE can't change the return type of an existing function.
DROP FUNCTION IF EXISTS get_manufacturer_product_stats();

CREATE OR REPLACE FUNCTION get_manufacturer_product_stats()
RETURNS TABLE (
  manufacturer TEXT,
  family_id TEXT,
  product_count BIGINT,
  param_keys TEXT[],
  max_updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE
-- Override Supabase's default 8s statement_timeout. The param_union CTE
-- below unnests every JSONB key across all scorable atlas_products
-- (~500K key-rows after YANGJIE — Decision #174 bulk apply pushed past 8s).
-- 60s is generous; if we ever exceed it, precompute param_keys on ingest.
SET statement_timeout = '60s'
AS $$
  -- Step 1: Get all (manufacturer, family_id) groups with counts + last-modified timestamp
  -- Step 2: For scorable groups, collect distinct param keys
  WITH groups AS (
    SELECT
      p.manufacturer,
      p.family_id,
      COUNT(*) AS product_count,
      MAX(p.updated_at) AS max_updated_at
    FROM atlas_products p
    GROUP BY p.manufacturer, p.family_id
  ),
  -- Collect distinct parameter keys per (manufacturer, family_id) for scorable products
  param_union AS (
    SELECT
      p.manufacturer,
      p.family_id,
      ARRAY_AGG(DISTINCT k) AS param_keys
    FROM atlas_products p,
         LATERAL jsonb_object_keys(COALESCE(p.parameters, '{}'::jsonb)) AS k
    WHERE p.family_id IS NOT NULL
      AND p.parameters IS NOT NULL
      AND p.parameters != '{}'::jsonb
    GROUP BY p.manufacturer, p.family_id
  )
  SELECT
    g.manufacturer,
    g.family_id,
    g.product_count,
    pu.param_keys,
    g.max_updated_at
  FROM groups g
  LEFT JOIN param_union pu
    ON g.manufacturer = pu.manufacturer
    AND g.family_id IS NOT DISTINCT FROM pu.family_id
  ORDER BY g.manufacturer, g.family_id;
$$;

-- Index to speed up the GROUP BY
CREATE INDEX IF NOT EXISTS idx_atlas_products_mfr_family
  ON atlas_products (manufacturer, family_id);
