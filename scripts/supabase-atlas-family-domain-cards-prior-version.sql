-- ============================================================
-- Atlas Family Domain Cards — prior version columns
-- ============================================================
-- Adds three columns to atlas_family_domain_cards that snapshot the row's
-- prior state every time card_text is overwritten (Regenerate via Opus, or
-- manual PATCH cardText). Enables a "Diff vs prior" view in the admin UI so
-- the engineer can see what added / removed / changed between the version
-- they previously reviewed and the new one.
--
-- Design choice — column on the main row, not a separate history table:
--   Keeps ONE prior version per family. Cheap, single-table, simple to query.
--   If we ever need N-deep history, add atlas_family_domain_cards_history
--   without breaking these columns.
--
-- Apply via the Supabase SQL editor (no service-role JS path for DDL).
-- Idempotent (ADD COLUMN IF NOT EXISTS on all three).
-- ============================================================

ALTER TABLE atlas_family_domain_cards
  ADD COLUMN IF NOT EXISTS previous_card_text TEXT,
  ADD COLUMN IF NOT EXISTS previous_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_audit_results JSONB;
