-- ============================================================
-- Triage Queue Aggregation RPC
-- ============================================================
-- Replaces the route's JSONB-pulling aggregation in
-- /api/admin/atlas/ingest/batches/route.ts → computeTriageAggregation().
--
-- Before: route fetched all pending+applied atlas_ingest_batches with
-- their `report->'unmappedParams'` JSONB sub-paths over the wire (~MBs
-- when many batches accumulate), then aggregated in Node. Cold-cache
-- page load took 20–30s.
--
-- After: aggregation happens in Postgres. The function returns one
-- row per unique paramName across all pending+applied batches with
-- merged familyCounts/categoryCounts, MFR provenance, and deduplicated
-- sample values. Wire payload drops to ~50KB of aggregated rows.
-- The route composes these into the GlobalUnmapped[] shape the UI
-- expects, then runs the (small) override-annotation +
-- foreign-family-classification passes in Node.
--
-- Mirrors the pattern from supabase-atlas-coverage-rpc.sql per
-- Decision #179.
--
-- Idempotent — safe to re-run via CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION get_triage_unmapped_aggregate()
RETURNS TABLE (
  param_name TEXT,
  product_count BIGINT,
  affected_batch_ids TEXT[],
  affected_mfrs JSONB,
  family_counts JSONB,
  category_counts JSONB,
  sample_values TEXT[]
)
LANGUAGE sql
STABLE
-- Per-function timeout override. The aggregation walks every pending+applied
-- batch's report.unmappedParams JSONB array. For typical workloads (~10–50
-- batches) it finishes in 1–3s, but as batches accumulate the JSONB scan
-- can grow. Bumping to 5 min here gives headroom while keeping the rest of
-- the connection's queries on the safer default timeout.
SET statement_timeout = '300s'
AS $$
  WITH expanded AS (
    -- One row per (batch, unmapped-param-entry). Cross-joins each
    -- batch's report.unmappedParams JSONB array element-by-element.
    SELECT
      b.batch_id,
      b.manufacturer,
      elem,
      (elem->>'productCount')::INT AS pc
    FROM atlas_ingest_batches b
    CROSS JOIN LATERAL jsonb_array_elements(b.report->'unmappedParams') AS elem
    -- 'discovery' = retroactive batches for legacy (pre-pipeline) MFRs; they
    -- carry unmapped params for Triage but never enter the apply flow.
    WHERE b.status IN ('pending', 'applied', 'discovery')
      AND jsonb_typeof(b.report->'unmappedParams') = 'array'
  ),
  -- Per-paramName base aggregates: total productCount + dedup'd batch list.
  base AS (
    SELECT
      elem->>'paramName' AS pname,
      SUM(pc)::BIGINT AS total_pc,
      array_agg(DISTINCT batch_id) AS batch_ids
    FROM expanded
    GROUP BY elem->>'paramName'
  ),
  -- Per-paramName MFR rollup: dedupe by manufacturer name, sum productCount,
  -- sort by productCount desc so the dominant MFR appears first.
  mfr_agg AS (
    SELECT
      pname,
      jsonb_agg(jsonb_build_object('name', manufacturer, 'productCount', mfr_pc) ORDER BY mfr_pc DESC) AS affected_mfrs
    FROM (
      SELECT
        elem->>'paramName' AS pname,
        manufacturer,
        SUM(pc)::INT AS mfr_pc
      FROM expanded
      WHERE manufacturer IS NOT NULL
      GROUP BY elem->>'paramName', manufacturer
    ) m
    GROUP BY pname
  ),
  -- Per-paramName familyCounts: only uses the per-param `familyCounts`
  -- breakdown emitted by the mjs aggregator (added when the dominantFamily-
  -- attribution fix shipped). Older batches without per-param breakdown
  -- contribute productCount but no family attribution → dominantFamily
  -- falls back to null in those cases. Acceptable; the legacy batch-level
  -- approximation was buggy on mixed-product-type MFRs anyway (Delta case).
  fam_agg AS (
    SELECT
      pname,
      jsonb_object_agg(fam_key, fam_sum) AS family_counts
    FROM (
      SELECT
        elem->>'paramName' AS pname,
        fam.key AS fam_key,
        SUM((fam.value::TEXT)::INT)::BIGINT AS fam_sum
      FROM expanded
      CROSS JOIN LATERAL jsonb_each(COALESCE(elem->'familyCounts', '{}'::jsonb)) AS fam
      WHERE fam.key <> '(uncovered)'
      GROUP BY elem->>'paramName', fam.key
    ) fam_grouped
    GROUP BY pname
  ),
  -- Same for categoryCounts.
  cat_agg AS (
    SELECT
      pname,
      jsonb_object_agg(cat_key, cat_sum) AS category_counts
    FROM (
      SELECT
        elem->>'paramName' AS pname,
        cat.key AS cat_key,
        SUM((cat.value::TEXT)::INT)::BIGINT AS cat_sum
      FROM expanded
      CROSS JOIN LATERAL jsonb_each(COALESCE(elem->'categoryCounts', '{}'::jsonb)) AS cat
      WHERE cat.key <> '(uncovered)'
      GROUP BY elem->>'paramName', cat.key
    ) cat_grouped
    GROUP BY pname
  ),
  -- Sample values: dedupe across batches, take up to 5.
  sv_agg AS (
    SELECT
      pname,
      (array_agg(sv_text ORDER BY sv_text))[1:5] AS sample_values
    FROM (
      SELECT DISTINCT
        elem->>'paramName' AS pname,
        sv.value AS sv_text
      FROM expanded
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(elem->'sampleValues', '[]'::jsonb)) AS sv
      WHERE sv.value IS NOT NULL
    ) s
    GROUP BY pname
  )
  SELECT
    b.pname AS param_name,
    b.total_pc AS product_count,
    b.batch_ids AS affected_batch_ids,
    COALESCE(m.affected_mfrs, '[]'::jsonb) AS affected_mfrs,
    COALESCE(f.family_counts, '{}'::jsonb) AS family_counts,
    COALESCE(c.category_counts, '{}'::jsonb) AS category_counts,
    COALESCE(s.sample_values, ARRAY[]::TEXT[]) AS sample_values
  FROM base b
  LEFT JOIN mfr_agg m ON m.pname = b.pname
  LEFT JOIN fam_agg f ON f.pname = b.pname
  LEFT JOIN cat_agg c ON c.pname = b.pname
  LEFT JOIN sv_agg s ON s.pname = b.pname;
$$;

-- The route uses the service-role client (bypasses RLS), so explicit GRANT
-- to authenticated isn't required for the route's own use. Granting anyway
-- in case admin tooling wants to call this directly without elevated creds.
GRANT EXECUTE ON FUNCTION get_triage_unmapped_aggregate() TO authenticated;
