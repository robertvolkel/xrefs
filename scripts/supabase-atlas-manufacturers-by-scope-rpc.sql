-- ============================================================
-- Atlas Manufacturers-by-Scope RPC
-- ============================================================
-- Powers the chat "which manufacturers make X?" discovery tool
-- (find_component_manufacturers). One generalized query answers all
-- three grains the tool resolves a free-text component term into:
--
--   * specific family   → p_family_ids := ARRAY['B6']        (BJTs)
--   * component supertype→ p_categories := ARRAY['Capacitors'] (all cap families)
--   * high-level group   → p_family_ids := ARRAY['12','13',...] (all 19 passives)
--   * "all components"   → both NULL                            (every maker)
--
-- Filters are AND'd; a NULL filter is a no-op. Returns the TRUE distinct
-- manufacturer count (uncapped) plus the top-N makers by product volume,
-- so the tool can be honest about the cap ("N makers total; top 30 shown").
--
-- RETURN TYPE — why jsonb, not RETURNS TABLE (Decision #206):
--   PostgREST silently caps *table-returning* functions at 1000 rows and
--   `.range()` can't reach past it. A broad scope (e.g. all passives) can
--   exceed 1000 distinct manufacturers, so a single scalar jsonb return is
--   the cap-proof shape — same pattern as get_manufacturer_product_stats /
--   get_atlas_coverage_aggregates. The total_manufacturer_count is computed
--   in SQL over the FULL grouped set, independent of p_limit.
--
-- Indexes already exist: idx_atlas_products_family_id, idx_atlas_products_category,
-- idx_atlas_products_manufacturer (scripts/supabase-atlas-schema.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION get_atlas_manufacturers_for_scope(
  p_family_ids TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  WITH scoped AS (
    SELECT
      atlas_products.manufacturer AS manufacturer,
      COUNT(*)::bigint AS product_count
    FROM atlas_products
    WHERE atlas_products.status <> 'discontinued'  -- Decision #204: honor soft-deletes
      AND atlas_products.manufacturer IS NOT NULL
      AND atlas_products.manufacturer <> ''
      AND (p_family_ids IS NULL OR atlas_products.family_id = ANY(p_family_ids))
      AND (p_categories IS NULL OR atlas_products.category = ANY(p_categories))
    GROUP BY atlas_products.manufacturer
  )
  SELECT jsonb_build_object(
    'total_manufacturer_count', (SELECT COUNT(*) FROM scoped),
    'total_product_count', (SELECT COALESCE(SUM(product_count), 0) FROM scoped),
    'manufacturers', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('manufacturer', manufacturer, 'product_count', product_count)
        )
        FROM (
          SELECT manufacturer, product_count
          FROM scoped
          ORDER BY product_count DESC, manufacturer ASC
          LIMIT p_limit
        ) top
      ),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_atlas_manufacturers_for_scope(TEXT[], TEXT[], INT) TO authenticated, service_role;
