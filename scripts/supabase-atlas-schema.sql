-- ============================================================
-- Atlas — Chinese Manufacturer Product Catalog
-- ============================================================
-- Stores products ingested from Atlas JSON files, mapped to
-- internal Digikey-schema attributeId format at ingestion time.
-- Products in covered families get a family_id for matching;
-- uncovered products are searchable but not scorable.
-- ============================================================

-- Enable trigram extension for fuzzy MPN search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Atlas Products ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Part identity
  mpn TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,                  -- ComponentCategory value (e.g., 'Capacitors', 'Voltage Regulators')
  subcategory TEXT NOT NULL DEFAULT '',    -- Internal subcategory (e.g., 'MLCC', 'LDO')
  family_id TEXT,                          -- Matched logic table family ID (NULL if uncovered)
  status TEXT NOT NULL DEFAULT 'Active',   -- PartStatus
  datasheet_url TEXT,
  package TEXT,                            -- Extracted for quick filtering

  -- Parametric data in internal attributeId format (mapped at ingestion time)
  -- Schema: { "attributeId": { "value": "display string", "numericValue": 123, "unit": "V" }, ... }
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Ingestion metadata
  atlas_source_file TEXT,                  -- Which JSON file this came from
  atlas_raw JSONB,                         -- Original unmapped model for debugging/remapping
  manufacturer_country TEXT DEFAULT 'CN',  -- ISO country code

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate MPNs from same manufacturer
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_products_mpn_mfr
  ON atlas_products (mpn, manufacturer);

-- Trigram index for fuzzy MPN search
CREATE INDEX IF NOT EXISTS idx_atlas_products_mpn_trgm
  ON atlas_products USING gin (mpn gin_trgm_ops);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_atlas_products_manufacturer
  ON atlas_products (manufacturer);

CREATE INDEX IF NOT EXISTS idx_atlas_products_family_id
  ON atlas_products (family_id) WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_products_category
  ON atlas_products (category);

-- GIN index on parameters for JSONB queries
CREATE INDEX IF NOT EXISTS idx_atlas_products_params
  ON atlas_products USING gin (parameters);

-- ─── Row Level Security ───────────────────────────────────

ALTER TABLE atlas_products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read Atlas products (for search + recommendations)
CREATE POLICY "Authenticated users can read atlas products"
  ON atlas_products FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert atlas products"
  ON atlas_products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas products"
  ON atlas_products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete atlas products"
  ON atlas_products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Atlas Manufacturer Settings ────────────────────────────
-- Stores admin-toggled enable/disable state per manufacturer.
-- Opt-out model: if no row exists, the manufacturer is enabled.

CREATE TABLE IF NOT EXISTS atlas_manufacturer_settings (
  manufacturer TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE atlas_manufacturer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read atlas manufacturer settings"
  ON atlas_manufacturer_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert atlas manufacturer settings"
  ON atlas_manufacturer_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas manufacturer settings"
  ON atlas_manufacturer_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
