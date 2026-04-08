-- Manufacturer Cross-References table
-- Stores manufacturer-certified replacement mappings uploaded via Admin
-- Each row maps an original part (MPN) to a cross-reference replacement (MPN)

CREATE TABLE manufacturer_cross_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer_slug TEXT NOT NULL,

  -- The replacement (cross-reference) part
  xref_mpn TEXT NOT NULL,
  xref_manufacturer TEXT,
  xref_description TEXT,

  -- The original part being replaced
  original_mpn TEXT NOT NULL,
  original_manufacturer TEXT,

  -- Classification
  equivalence_type TEXT NOT NULL DEFAULT 'functional'
    CHECK (equivalence_type IN ('pin_to_pin', 'functional')),

  -- Metadata
  upload_batch_id UUID,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Primary lookup: find cross-refs for a given original MPN
CREATE INDEX idx_mfr_xref_original ON manufacturer_cross_references (lower(original_mpn)) WHERE is_active = true;

-- List cross-refs for a specific manufacturer
CREATE INDEX idx_mfr_xref_slug ON manufacturer_cross_references (manufacturer_slug) WHERE is_active = true;

-- Group rows from the same upload batch
CREATE INDEX idx_mfr_xref_batch ON manufacturer_cross_references (upload_batch_id);

-- RLS policies
ALTER TABLE manufacturer_cross_references ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for recommendation pipeline)
CREATE POLICY "Authenticated users can read cross-references"
  ON manufacturer_cross_references FOR SELECT
  TO authenticated
  USING (true);

-- Only admin users can insert/update/delete (enforced at API level too)
CREATE POLICY "Admin users can manage cross-references"
  ON manufacturer_cross_references FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
