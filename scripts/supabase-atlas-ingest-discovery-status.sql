-- Migration: add the 'discovery' status to atlas_ingest_batches.
--
-- A 'discovery' batch is a retroactive report generated for a LEGACY MFR (one
-- loaded before the batch pipeline / Decision #174 existed, so it has no batch
-- row). It carries the MFR's unmapped params so the Triage queue can surface
-- them, but it must NOT participate in the operator apply/revert flows or the
-- 30-day cleanup sweep:
--   • get_triage_unmapped_aggregate() is updated to INCLUDE 'discovery'
--     (see scripts/supabase-triage-aggregate-rpc.sql, status IN list).
--   • the pending/applied list route + proceed/revert/proceed-all-clean/discard
--     all filter 'pending'/'applied' explicitly, so they ignore 'discovery'.
--   • atlas_ingest_cleanup_expired() only sweeps ('applied','reverted'), so
--     discovery batches are never auto-expired (intentional — they ARE the
--     discovery signal).
--
-- Idempotent — safe to re-run. The inline column CHECK is auto-named
-- 'atlas_ingest_batches_status_check' by Postgres.

ALTER TABLE atlas_ingest_batches
  DROP CONSTRAINT IF EXISTS atlas_ingest_batches_status_check;

ALTER TABLE atlas_ingest_batches
  ADD CONSTRAINT atlas_ingest_batches_status_check
  CHECK (status IN ('pending', 'applied', 'reverted', 'expired', 'discovery'));

-- After running this, re-run scripts/supabase-triage-aggregate-rpc.sql so the
-- aggregate RPC's WHERE clause includes 'discovery'.
