-- ============================================================
-- Atlas Manufacturers — Profile Enrichment Columns
-- ============================================================
-- New columns for data from the Atlas external API.
-- Run after the base atlas_manufacturers table exists.
-- ============================================================

ALTER TABLE atlas_manufacturers
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS core_products TEXT,
  ADD COLUMN IF NOT EXISTS stock_code TEXT,
  ADD COLUMN IF NOT EXISTS gaia_id TEXT,
  ADD COLUMN IF NOT EXISTS api_synced_at TIMESTAMPTZ;

-- NOTE: Structured JSON fields (coreApplications, globalSalesRep,
-- ecomPlatforms, socialMediaPlatforms, tradeShowPlatforms,
-- industryOrgPlatforms) are currently null in the API.
-- Columns will be added when the API starts populating them.
