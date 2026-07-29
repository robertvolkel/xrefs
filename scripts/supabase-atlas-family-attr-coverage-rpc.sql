-- RPC: get_atlas_family_attr_coverage
--
-- Powers the Atlas Coverage DRAWER (per-attribute fill rate for one
-- manufacturer × family). Replaces the route's plain
--   .from('atlas_products').select('parameters').eq('manufacturer', name).eq('family_id', fam)
-- which PostgREST silently capped at 1000 rows — so for the 66 (mfr, family)
-- groups larger than that (HONGFA/F1 has 20,206 products) the drawer computed
-- its percentages from a truncated sample. Counting inside Postgres and
-- returning only the totals sidesteps the cap entirely.
--
-- Takes a VARIANT ARRAY (not a single name): the drawer's live caller passes a
-- manufacturer's canonical display name ("ISC 无锡固电"), while products are
-- stored under the English-only name ("ISC"), so a single-string match returned
-- ZERO for variant-stored MFRs. The route resolves variants via
-- resolveManufacturerAlias() and passes them all here.
--
-- RETURNS jsonb (not RETURNS TABLE): a scalar return is never row-limited — the
-- same cap-dodging pattern as get_atlas_coverage_aggregates /
-- get_manufacturer_product_stats.
--
-- Shape: { "totalProducts": <bigint>, "attrCounts": { "<attrId>": <count>, ... } }
-- where count = number of products (within the scoped set) whose `parameters`
-- JSONB contains that key. The route joins this against the family's logic-table
-- rules to build the gap matrix (percentages, dict/DigiKey/Parts.io membership).

DROP FUNCTION IF EXISTS get_atlas_family_attr_coverage(text[], text);

CREATE OR REPLACE FUNCTION get_atlas_family_attr_coverage(
  p_manufacturer_variants text[],
  p_family_id text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET statement_timeout = '60s'
AS $$
  WITH scoped AS (
    SELECT p.parameters
    FROM atlas_products p
    WHERE p.manufacturer = ANY (p_manufacturer_variants)
      AND p.family_id = p_family_id
  ),
  attr_counts AS (
    -- Each product's JSONB keys are distinct, so one row per (product, key) =
    -- a count of products carrying that key.
    SELECT k AS attr_id, COUNT(*) AS product_count
    FROM scoped s,
         LATERAL jsonb_object_keys(COALESCE(s.parameters, '{}'::jsonb)) AS k
    GROUP BY k
  )
  SELECT jsonb_build_object(
    'totalProducts', (SELECT COUNT(*) FROM scoped),
    'attrCounts', COALESCE(
      (SELECT jsonb_object_agg(attr_id, product_count) FROM attr_counts),
      '{}'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_atlas_family_attr_coverage(text[], text) TO authenticated, service_role;

-- The (manufacturer, family_id) filter is served by the existing composite index
-- created alongside get_manufacturer_product_stats:
--   idx_atlas_products_mfr_family ON atlas_products (manufacturer, family_id)
