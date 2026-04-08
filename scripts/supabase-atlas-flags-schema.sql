-- ============================================================
-- Atlas Product Flags — Data Quality Flagging
-- ============================================================
-- Admins can flag Atlas products with issues (wrong category,
-- bad data, missing parameters, etc.) and add a comment.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_product_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES atlas_products(id) ON DELETE CASCADE,
  mpn TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atlas_flags_status
  ON atlas_product_flags (status);

CREATE INDEX IF NOT EXISTS idx_atlas_flags_product
  ON atlas_product_flags (product_id);

CREATE INDEX IF NOT EXISTS idx_atlas_flags_created
  ON atlas_product_flags (created_at DESC);

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE atlas_product_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read atlas product flags"
  ON atlas_product_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert atlas product flags"
  ON atlas_product_flags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas product flags"
  ON atlas_product_flags FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
