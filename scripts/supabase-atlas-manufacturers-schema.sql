-- ============================================================
-- Atlas Manufacturers — Canonical Manufacturer Identity
-- ============================================================
-- First-class manufacturer records linking across data sources
-- (Atlas, parts.io, future: Digikey, Mouser). Seeded from the
-- master manufacturer list; profile data populated over time.
--
-- Replaces atlas_manufacturer_settings for the enabled toggle.
-- Joins to atlas_products via name_display = atlas_products.manufacturer.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_manufacturers (
  id SERIAL PRIMARY KEY,

  -- Source system IDs
  atlas_id INTEGER UNIQUE,                       -- Atlas source system ID (e.g., 666664)
  partsio_id INTEGER,                            -- parts.io manufacturer ID (nullable)

  -- Identity
  slug TEXT UNIQUE NOT NULL,                     -- URL-friendly identifier (e.g., 'gigadevice')
  name_en TEXT NOT NULL,                         -- English name (e.g., 'GIGADEVICE')
  name_zh TEXT,                                  -- Chinese name (e.g., '兆易创新')
  name_display TEXT UNIQUE NOT NULL,             -- Exact join key to atlas_products.manufacturer
  partsio_name TEXT,                             -- parts.io manufacturer name (nullable)
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,    -- Name variants for fuzzy matching

  -- Profile data (populated later via enrichment)
  website_url TEXT,
  logo_url TEXT,
  headquarters TEXT,
  country TEXT DEFAULT 'CN',                     -- ISO country code
  founded_year INTEGER,
  summary TEXT,                                  -- Markdown or plain text description
  is_second_source BOOLEAN NOT NULL DEFAULT false,

  -- Structured profile data (JSONB for flexibility)
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  manufacturing_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  authorized_distributors JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  design_resources JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Admin settings (absorbed from atlas_manufacturer_settings)
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_mfr_slug
  ON atlas_manufacturers (slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_mfr_atlas_id
  ON atlas_manufacturers (atlas_id) WHERE atlas_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_mfr_name_display
  ON atlas_manufacturers (name_display);

CREATE INDEX IF NOT EXISTS idx_atlas_mfr_partsio_id
  ON atlas_manufacturers (partsio_id) WHERE partsio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_mfr_enabled
  ON atlas_manufacturers (enabled) WHERE enabled = false;

-- GIN index on aliases for @> containment queries
CREATE INDEX IF NOT EXISTS idx_atlas_mfr_aliases
  ON atlas_manufacturers USING gin (aliases);

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE atlas_manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read atlas manufacturers"
  ON atlas_manufacturers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert atlas manufacturers"
  ON atlas_manufacturers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas manufacturers"
  ON atlas_manufacturers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atlas manufacturers"
  ON atlas_manufacturers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Migration: Copy enabled state from atlas_manufacturer_settings ──

-- Run this AFTER creating the table and importing manufacturers:
-- UPDATE atlas_manufacturers am
-- SET enabled = ams.enabled,
--     updated_at = ams.updated_at,
--     updated_by = ams.updated_by
-- FROM atlas_manufacturer_settings ams
-- WHERE am.name_display = ams.manufacturer
--   AND ams.enabled = false;
