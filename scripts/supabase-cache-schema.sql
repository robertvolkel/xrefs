-- ============================================================
-- Part Data Cache — persistent L2 cache for external API responses
-- ============================================================
-- Five cache tiers with different TTLs:
--   parametric      — technical specs (indefinite for Digikey, 90 days for parts.io)
--   lifecycle       — YTEOL, risk rank, compliance, suggested replacements (6 months)
--   commercial      — pricing, stock, lead times (24 hours)
--   search          — search results from searchParts() (7 days)
--   recommendations — cached full RecommendationResult by (mpn, context, prefs) (30 days)
-- ============================================================

CREATE TABLE IF NOT EXISTS part_data_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service       TEXT NOT NULL CHECK (service IN ('digikey', 'partsio', 'mouser', 'search')),
  mpn_lower     TEXT NOT NULL,              -- lowercase MPN (or search cache key) for case-insensitive lookup
  variant       TEXT NOT NULL DEFAULT 'default', -- sub-key: 'parametric', 'lifecycle', 'commercial:USD', etc.
  cache_tier    TEXT NOT NULL CHECK (cache_tier IN ('parametric', 'lifecycle', 'commercial', 'search', 'recommendations')),
  response_data JSONB NOT NULL,             -- raw API response (or relevant subset)
  response_size INTEGER,                    -- approx byte size for monitoring
  expires_at    TIMESTAMPTZ,                -- NULL = indefinite (parametric Digikey)
  hit_count     INTEGER NOT NULL DEFAULT 0,
  last_hit_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (service, mpn_lower, variant)
);

-- Indexes for lookup, cleanup, and admin queries
CREATE INDEX idx_cache_expires ON part_data_cache (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_cache_service_updated ON part_data_cache (service, updated_at DESC);
CREATE INDEX idx_cache_mpn ON part_data_cache (mpn_lower);

-- RLS: service role writes, admin reads
ALTER TABLE part_data_cache ENABLE ROW LEVEL SECURITY;

-- Admins can read cache entries for monitoring
CREATE POLICY "Admins can read cache"
  ON part_data_cache FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can delete cache entries for manual invalidation
CREATE POLICY "Admins can delete cache"
  ON part_data_cache FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- No INSERT/UPDATE policies — all writes use service role client (bypasses RLS)

-- ============================================================
-- Migration: Add 'search' to service and cache_tier CHECK constraints
-- Run this on existing deployments where the table already exists.
-- ============================================================
-- ALTER TABLE part_data_cache
--   DROP CONSTRAINT IF EXISTS part_data_cache_service_check,
--   ADD CONSTRAINT part_data_cache_service_check CHECK (service IN ('digikey', 'partsio', 'mouser', 'search'));
--
-- ALTER TABLE part_data_cache
--   DROP CONSTRAINT IF EXISTS part_data_cache_cache_tier_check,
--   ADD CONSTRAINT part_data_cache_cache_tier_check CHECK (cache_tier IN ('parametric', 'lifecycle', 'commercial', 'search'));

-- ============================================================
-- Migration: Add 'recommendations' to cache_tier CHECK constraint
-- Run on existing deployments to enable the recommendations cache tier.
-- The recommendations tier reuses service='search' with variant='rec:...'
-- so no service-CHECK migration is needed.
-- ============================================================
ALTER TABLE part_data_cache
  DROP CONSTRAINT IF EXISTS part_data_cache_cache_tier_check,
  ADD CONSTRAINT part_data_cache_cache_tier_check
    CHECK (cache_tier IN ('parametric', 'lifecycle', 'commercial', 'search', 'recommendations'));
