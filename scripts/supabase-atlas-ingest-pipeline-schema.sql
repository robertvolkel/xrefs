-- ============================================================
-- Atlas Ingest Pipeline — Provenance, Batches, Snapshots
-- ============================================================
-- Adds the safety foundation for the new ingest workflow:
--   1) Provenance tags on atlas_products.parameters JSONB
--      (per-attribute { source: 'atlas' | 'extraction' | 'manual',
--                       ingested_at: timestamptz })
--   2) atlas_ingest_batches — pending diff reports awaiting approval
--   3) atlas_products_snapshots — pre-apply row snapshots for revert
--
-- Idempotent: safe to re-run. The provenance backfill skips rows
-- that already carry source markers.
-- ============================================================

-- ─── 1. Provenance backfill on atlas_products.parameters ──────
--
-- Existing per-attribute shape:
--   { "value": "...", "numericValue": 1.5, "unit": "V" }
--   (and historically, extraction-sourced attrs carried _source: 'desc_extract')
--
-- New per-attribute shape:
--   { "value": "...", "numericValue": 1.5, "unit": "V",
--     "source": "atlas" | "extraction" | "manual",
--     "ingested_at": "..." }
--
-- Strategy: rebuild the parameters JSONB row-by-row.
--   - Keys whose value object has _source = 'desc_extract'
--       → source: 'extraction' (and drop the legacy _source field)
--   - All other keys → source: 'atlas'
--   - ingested_at = now() at backfill time

DO $$
DECLARE
  rec RECORD;
  new_params JSONB;
  attr_key TEXT;
  attr_val JSONB;
  attr_source TEXT;
  cleaned_val JSONB;
  rows_processed INTEGER := 0;
  now_iso TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
BEGIN
  FOR rec IN
    SELECT id, parameters
    FROM atlas_products
    WHERE parameters IS NOT NULL
      AND parameters <> '{}'::jsonb
      -- Skip rows already migrated (any value with a top-level "source" field)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(parameters) AS kv
        WHERE kv.value ? 'source'
      )
  LOOP
    new_params := '{}'::jsonb;

    FOR attr_key, attr_val IN SELECT * FROM jsonb_each(rec.parameters) LOOP
      -- Determine provenance from legacy _source marker
      IF attr_val ? '_source' AND attr_val->>'_source' = 'desc_extract' THEN
        attr_source := 'extraction';
      ELSE
        attr_source := 'atlas';
      END IF;

      -- Strip legacy _source, add new provenance fields
      cleaned_val := (attr_val - '_source')
        || jsonb_build_object('source', attr_source, 'ingested_at', now_iso);

      new_params := new_params || jsonb_build_object(attr_key, cleaned_val);
    END LOOP;

    UPDATE atlas_products
    SET parameters = new_params
    WHERE id = rec.id;

    rows_processed := rows_processed + 1;
  END LOOP;

  RAISE NOTICE 'Provenance backfill complete: % rows updated', rows_processed;
END $$;

-- ─── 2. atlas_ingest_batches ──────────────────────────────────
-- One row per (manufacturer, source_file) refresh.
-- Lifecycle: pending → applied | reverted | expired

CREATE TABLE IF NOT EXISTS atlas_ingest_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  report JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'reverted', 'expired')),
  -- Risk classification computed at report generation time.
  -- 'clean'     → only inserts + additive attr changes, zero unmapped, zero classification flips, zero removals
  -- 'review'    → has removals or classification flips, but no unmapped + no value changes on existing keys
  -- 'attention' → has unmapped params or value changes on existing keys
  risk TEXT NOT NULL DEFAULT 'attention'
    CHECK (risk IN ('clean', 'review', 'attention')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_ingest_batches_status
  ON atlas_ingest_batches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_ingest_batches_manufacturer
  ON atlas_ingest_batches (manufacturer);

CREATE INDEX IF NOT EXISTS idx_atlas_ingest_batches_risk_status
  ON atlas_ingest_batches (risk, status);

ALTER TABLE atlas_ingest_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read atlas ingest batches"
  ON atlas_ingest_batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert atlas ingest batches"
  ON atlas_ingest_batches FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas ingest batches"
  ON atlas_ingest_batches FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atlas ingest batches"
  ON atlas_ingest_batches FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── 3. atlas_products_snapshots ──────────────────────────────
-- Pre-apply row snapshot per affected MPN. 30-day retention.

CREATE TABLE IF NOT EXISTS atlas_products_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES atlas_ingest_batches(batch_id) ON DELETE CASCADE,
  mpn TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  prev_row JSONB,                -- complete pre-apply row, or null for inserts
  new_row JSONB NOT NULL,        -- complete post-apply row
  change_kind TEXT NOT NULL
    CHECK (change_kind IN ('insert', 'update', 'soft_delete', 'hard_delete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_atlas_products_snapshots_batch
  ON atlas_products_snapshots (batch_id);

CREATE INDEX IF NOT EXISTS idx_atlas_products_snapshots_expires
  ON atlas_products_snapshots (expires_at);

CREATE INDEX IF NOT EXISTS idx_atlas_products_snapshots_mpn_mfr
  ON atlas_products_snapshots (mpn, manufacturer);

ALTER TABLE atlas_products_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read atlas products snapshots"
  ON atlas_products_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert atlas products snapshots"
  ON atlas_products_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atlas products snapshots"
  ON atlas_products_snapshots FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── 4. Cleanup function for expired snapshots & batches ──────
-- Call from a scheduled job (pg_cron) or manually:
--   SELECT atlas_ingest_cleanup_expired();

CREATE OR REPLACE FUNCTION atlas_ingest_cleanup_expired()
RETURNS TABLE(deleted_snapshots BIGINT, expired_batches BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  snap_count BIGINT;
  batch_count BIGINT;
BEGIN
  DELETE FROM atlas_products_snapshots
  WHERE expires_at < now();
  GET DIAGNOSTICS snap_count = ROW_COUNT;

  -- Mark applied/reverted batches with no remaining snapshots as expired
  UPDATE atlas_ingest_batches
  SET status = 'expired'
  WHERE status IN ('applied', 'reverted')
    AND created_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM atlas_products_snapshots s
      WHERE s.batch_id = atlas_ingest_batches.batch_id
    );
  GET DIAGNOSTICS batch_count = ROW_COUNT;

  RETURN QUERY SELECT snap_count, batch_count;
END $$;
