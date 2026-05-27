-- ============================================================
-- Atlas Coverage Stats RPC
-- ============================================================
-- Replaces the route's JSONB-pulling aggregation in
-- /api/admin/atlas/route.ts → computeAtlasCoverage().
--
-- Before: route fetched 67K lightweight rows + 49K rows with full
-- `parameters` JSONB (~47 MB) over the wire, then aggregated in
-- Node. Cold-cache page load took ~50s.
--
-- After: aggregation happens in Postgres. The function returns one
-- row per (manufacturer, family_id, category, subcategory) tuple
-- (~5K rows, a few KB total). The route composes these into the
-- per-MFR + global summary shape that the UI already expects.
--
-- Coverage calc: for each scorable row (family_id NOT NULL), count
-- how many of the family's rule attributeIds appear as keys in the
-- product's `parameters` JSONB. The family → rule-attrs map lives
-- in TS (logicTables/), so the route passes it as the `family_attrs`
-- argument. The GIN index on `parameters` (idx_atlas_products_params)
-- accelerates the `?` operator.
--
-- Idempotent — safe to re-run via CREATE OR REPLACE.
-- ============================================================

-- Returns a single jsonb array — one element per (manufacturer, family_id,
-- category, subcategory) tuple. Previously RETURNS TABLE, which made every
-- tuple a Postgres row and made the response subject to PostgREST's
-- server-side max-rows cap (1000 on Supabase). Once atlas_products grew
-- past ~120 MFRs the route silently truncated and totalProducts /
-- enabledProducts under-reported by tens of thousands. JSONB is a single
-- scalar value so the cap doesn't apply.
--
-- Mirrors the established pattern from get_atlas_growth_aggregates
-- (Decision #183) and get_triage_unmapped_aggregate (Decision #180) —
-- both return jsonb for exactly this reason.
CREATE OR REPLACE FUNCTION get_atlas_coverage_aggregates(family_attrs JSONB DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
-- Per-function timeout override. The aggregation walks ~71K atlas_products
-- rows and, for each scorable row, iterates ~10–20 rule attributeIds checking
-- `parameters ? key`. As atlas_products grows that hits Supabase's default
-- ~60s statement_timeout. Bumping to 5 min here gives headroom while keeping
-- the rest of the connection's queries on the safer original timeout.
-- Long-term the query should be optimized (e.g. precomputed coverage column),
-- but this unblocks the page.
SET statement_timeout = '300s'
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT
      p.manufacturer,
      p.family_id,
      p.category,
      p.subcategory,
      COUNT(*)::BIGINT AS product_count,

      -- Covered rule count: for scorable rows whose family_id is in the
      -- passed-in attrs map, count how many of that family's rule attributes
      -- appear as JSONB keys in the product's parameters. Non-scorable rows
      -- (family_id IS NULL) and rows for families not in family_attrs
      -- contribute 0. COALESCE handles the SUM-over-empty edge case.
      COALESCE(SUM(
        CASE
          WHEN p.family_id IS NOT NULL AND family_attrs ? p.family_id THEN
            (SELECT COUNT(*)
               FROM jsonb_array_elements_text(family_attrs->p.family_id) AS rule_attr
               WHERE p.parameters ? rule_attr)
          ELSE 0
        END
      ), 0)::BIGINT AS total_covered,

      -- Total rules in this row's family × number of rows in this group.
      -- jsonb_array_length is constant within the group, so SUM == COUNT *
      -- length, but expressing it as SUM keeps the CASE logic uniform.
      COALESCE(SUM(
        CASE
          WHEN p.family_id IS NOT NULL AND family_attrs ? p.family_id THEN
            jsonb_array_length(family_attrs->p.family_id)
          ELSE 0
        END
      ), 0)::BIGINT AS total_rules,

      MAX(p.updated_at) AS last_updated
    FROM atlas_products p
    GROUP BY p.manufacturer, p.family_id, p.category, p.subcategory
  ) t;
$$;

-- Permissions: the route uses the service-role client (bypasses RLS), so
-- explicit GRANT to authenticated isn't required for the route's own use.
-- Granting anyway in case admin tooling wants to call this directly via
-- the Supabase client without elevated credentials.
GRANT EXECUTE ON FUNCTION get_atlas_coverage_aggregates(JSONB) TO authenticated;
