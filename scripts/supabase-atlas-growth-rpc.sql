-- get_atlas_growth_aggregates()
--
-- Powers /api/admin/atlas/growth's product-side aggregation.
--
-- Replaces the row-by-row pagination loop in growth/route.ts that walked
-- atlas_products in pages of 1000 (101+ pages once Atlas crossed 100K rows).
-- That loop silently undercounted whenever a later page hit a Postgres
-- statement timeout or network blip — it destructured `data` only, ignoring
-- `error`, so a null page broke the loop early. Symptoms: chart's right axis
-- capping at ~40K when the KPI tile reported 101K+. This RPC eliminates the
-- failure mode by doing the aggregation in Postgres.
--
-- Returns a single JSONB object with two arrays:
--   - mfrs[]: per-manufacturer rollup (one row per distinct manufacturer)
--       { manufacturer, product_count, min_created_at, categories[] }
--   - day_buckets[]: per-day product counts (one row per UTC day with inserts)
--       { day, product_delta }
--
-- The route still walks atlas_ingest_batches and atlas_manufacturers in TS
-- (those are small) and computes events from there.
--
-- Mirrors the patterns used by get_atlas_coverage_aggregates (Decision #179)
-- and get_triage_unmapped_aggregate (Decision #180) — generous statement
-- timeout, STABLE marker, single round-trip.

CREATE OR REPLACE FUNCTION get_atlas_growth_aggregates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET statement_timeout = '300s'
AS $$
DECLARE
  v_mfrs jsonb;
  v_days jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_mfrs
  FROM (
    SELECT
      manufacturer,
      COUNT(*) AS product_count,
      MIN(created_at) AS min_created_at,
      COALESCE(
        array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL AND category <> ''),
        ARRAY[]::text[]
      ) AS categories
    FROM atlas_products
    GROUP BY manufacturer
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
    INTO v_days
  FROM (
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*) AS product_delta
    FROM atlas_products
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'mfrs', v_mfrs,
    'day_buckets', v_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_atlas_growth_aggregates() TO authenticated, service_role;
