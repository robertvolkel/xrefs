-- ============================================================
-- Manufacturer Company-Identity Graph (Western MFRs)
-- Decision #149 — companion to #148 (Chinese alias wiring).
-- ============================================================
-- Two-table graph mirroring the source xlsx structure:
--   manufacturer_companies — one row per company, parent_uid self-ref for
--     acquisitions / divisions / subsidiary brands.
--   manufacturer_aliases   — N rows per company. context carries the
--     taxonomy (also_known_as | brand_of | acquired_by | formerly_known_as
--     | short_name | division_of | previous_name_value | acronym |
--     parent_of | merged_into | trademark_of | product_family |
--     abbreviation | mis-spelling | nickname | phoenetic).
--
-- Also captures the "dual acquisition representation" in the source data:
-- acquisitions appear both via parent_uid AND via context=acquired_by
-- alias rows. The resolver consults both.
-- ============================================================

CREATE TABLE IF NOT EXISTS manufacturer_companies (
  uid BIGINT PRIMARY KEY,                          -- Source-system uid, preserved as-is
  name TEXT NOT NULL,
  source_url TEXT,
  status TEXT,                                     -- corporate|active|acquired|division|brand|merged|defunct|unknown|product|sister|null
  parent_uid BIGINT,                               -- Self-ref; NULL when source had an orphan parent pointer (31 rows)
  slug TEXT UNIQUE NOT NULL,                       -- Derived from name; dedupe-suffixed on collision

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes on manufacturer_companies ──────────────────────

CREATE INDEX IF NOT EXISTS idx_mfr_companies_parent
  ON manufacturer_companies (parent_uid) WHERE parent_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mfr_companies_name_lower
  ON manufacturer_companies (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_mfr_companies_status_surviving
  ON manufacturer_companies (status) WHERE status IN ('corporate', 'active');

-- ─── manufacturer_aliases ───────────────────────────────────

CREATE TABLE IF NOT EXISTS manufacturer_aliases (
  id BIGSERIAL PRIMARY KEY,
  company_uid BIGINT NOT NULL REFERENCES manufacturer_companies(uid) ON DELETE CASCADE,
  value TEXT NOT NULL,
  value_lower TEXT GENERATED ALWAYS AS (LOWER(value)) STORED,
  context TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfr_aliases_value_lower
  ON manufacturer_aliases (value_lower);

CREATE INDEX IF NOT EXISTS idx_mfr_aliases_company
  ON manufacturer_aliases (company_uid);

CREATE INDEX IF NOT EXISTS idx_mfr_aliases_context
  ON manufacturer_aliases (context);

-- Dedup guard: same company+alias shouldn't be recorded twice under different
-- context codes (e.g. "LT" shouldn't be both also_known_as AND short_name).
-- Actually it CAN — a name can legitimately be multiple things. Keep the
-- table permissive; the resolver dedupes variants on read.

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE manufacturer_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturer_aliases ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (resolver runs server-side, but this also
-- protects direct Supabase-JS reads from any future client-side use case).
CREATE POLICY "Authenticated users can read manufacturer_companies"
  ON manufacturer_companies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read manufacturer_aliases"
  ON manufacturer_aliases FOR SELECT TO authenticated
  USING (true);

-- Admin-only write. Policies copy the shape used by atlas_manufacturers.
CREATE POLICY "Admins can insert manufacturer_companies"
  ON manufacturer_companies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update manufacturer_companies"
  ON manufacturer_companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete manufacturer_companies"
  ON manufacturer_companies FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert manufacturer_aliases"
  ON manufacturer_aliases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update manufacturer_aliases"
  ON manufacturer_aliases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete manufacturer_aliases"
  ON manufacturer_aliases FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── updated_at auto-bump ──────────────────────────────────

CREATE OR REPLACE FUNCTION touch_manufacturer_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_manufacturer_companies ON manufacturer_companies;
CREATE TRIGGER trg_touch_manufacturer_companies
  BEFORE UPDATE ON manufacturer_companies
  FOR EACH ROW EXECUTE FUNCTION touch_manufacturer_companies_updated_at();
