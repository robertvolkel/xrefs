-- RPC function: aggregate manufacturer product stats via GROUP BY
-- Returns one entry per (manufacturer, family_id) with count + distinct param keys
-- Replaces fetching all 55K+ rows into JavaScript for in-memory aggregation
--
-- Performance: ~1-2s vs 20-30s (eliminates 55K row fetch + JSONB deserialization)
--
-- RETURN TYPE — why jsonb, not RETURNS TABLE (Decision #206):
--   PostgREST silently caps *table-returning* functions at 1000 rows; `.range()`
--   can't reach past it. Once Atlas grew past 1000 distinct (manufacturer,
--   family_id) groups, the old `RETURNS TABLE` form was truncated — the admin
--   Manufacturers panel undercounted to 265 MFRs / 272,691 products against a
--   true 379 / 411,468, and ~114 MFRs vanished from the list entirely. Returning
--   a single jsonb array sidesteps the cap (a scalar return is never row-limited),
--   exactly as get_atlas_growth_aggregates / get_atlas_coverage_aggregates already
--   do. The route parses `data` as the array directly — no shape change per entry.

-- Drop first: CREATE OR REPLACE can't change the return type of an existing function.
DROP FUNCTION IF EXISTS get_manufacturer_product_stats();

CREATE OR REPLACE FUNCTION get_manufacturer_product_stats()
RETURNS jsonb
LANGUAGE sql STABLE
-- Override Supabase's default 8s statement_timeout. Kept generous even though
-- the expensive param_union CTE was removed (see below): a plain GROUP BY over
-- ~440K rows is fast, but the margin is cheap insurance.
SET statement_timeout = '120s'
AS $$
  -- Per (manufacturer, family_id): product count + last-modified timestamp,
  -- jsonb_agg'd into one array (no 1000-row cap).
  --
  -- The old param_union CTE (a LATERAL jsonb_object_keys unnest over ~500K
  -- key-rows) fed a coverage metric that credited an attribute to EVERY product
  -- in a group if one product had it — inflated coverage that couldn't respond
  -- to dictionary accepts. Coverage now comes per-product from
  -- get_atlas_coverage_aggregates via the shared rollup, so param_keys has no
  -- consumer and the unnest (the sole reason for the 120s timeout) is gone.
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT
      p.manufacturer,
      p.family_id,
      COUNT(*) AS product_count,
      MAX(p.updated_at) AS max_updated_at
    FROM atlas_products p
    GROUP BY p.manufacturer, p.family_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_manufacturer_product_stats() TO authenticated, service_role;

-- Index to speed up the GROUP BY
CREATE INDEX IF NOT EXISTS idx_atlas_products_mfr_family
  ON atlas_products (manufacturer, family_id);
