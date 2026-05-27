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
-- Both aggregations are filtered to enabled manufacturers only — products
-- under MFRs with atlas_manufacturers.enabled = false are excluded so the
-- growth chart's cumulative line lands exactly on the live KPI value
-- (summary.enabledProducts in /api/admin/atlas).
--
-- The KPI route (app/api/admin/atlas/route.ts) prefers atlas_manufacturers
-- (the canonical identity table per Decision #161) over the legacy
-- atlas_manufacturer_settings, joining atlas_products.manufacturer against
-- both name_en and name_display. We mirror that join exactly so the chart's
-- right edge matches the KPI to the row. Unknown MFRs (no matching
-- atlas_manufacturers row) are treated as enabled, matching the route's
-- `!disabledSet.has(name)` behavior.
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
      p.manufacturer,
      COUNT(*) AS product_count,
      MIN(p.created_at) AS min_created_at,
      COALESCE(
        array_agg(DISTINCT p.category) FILTER (WHERE p.category IS NOT NULL AND p.category <> ''),
        ARRAY[]::text[]
      ) AS categories
    FROM atlas_products p
    LEFT JOIN LATERAL (
      SELECT enabled FROM atlas_manufacturers
      WHERE name_display = p.manufacturer OR name_en = p.manufacturer
      LIMIT 1
    ) m ON true
    WHERE COALESCE(m.enabled, true) = true
    GROUP BY p.manufacturer
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
    INTO v_days
  FROM (
    SELECT
      to_char(date_trunc('day', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*) AS product_delta
    FROM atlas_products p
    LEFT JOIN LATERAL (
      SELECT enabled FROM atlas_manufacturers
      WHERE name_display = p.manufacturer OR name_en = p.manufacturer
      LIMIT 1
    ) m ON true
    WHERE COALESCE(m.enabled, true) = true
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'mfrs', v_mfrs,
    'day_buckets', v_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_atlas_growth_aggregates() TO authenticated, service_role;
