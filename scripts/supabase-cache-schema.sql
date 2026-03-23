-- ============================================================
-- Part Data Cache — persistent L2 cache for external API responses
-- ============================================================
-- Three cache tiers with different TTLs:
--   parametric  — technical specs (indefinite for Digikey, 90 days for parts.io)
--   lifecycle   — YTEOL, risk rank, compliance, suggested replacements (6 months)
--   commercial  — pricing, stock, lead times (24 hours)
-- ============================================================

CREATE TABLE IF NOT EXISTS part_data_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service       TEXT NOT NULL CHECK (service IN ('digikey', 'partsio', 'mouser')),
  mpn_lower     TEXT NOT NULL,              -- lowercase MPN for case-insensitive lookup
  variant       TEXT NOT NULL DEFAULT 'default', -- sub-key: 'parametric', 'lifecycle', 'commercial:USD', etc.
  cache_tier    TEXT NOT NULL CHECK (cache_tier IN ('parametric', 'lifecycle', 'commercial')),
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
