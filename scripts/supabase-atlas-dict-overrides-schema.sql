-- ============================================================
-- Atlas Dictionary Override Layer
-- ============================================================
-- Allows admins to patch the hardcoded TypeScript Atlas translation
-- dictionaries at runtime without code deploys.
-- Overrides are merged on top of the TS base in atlasMapper.ts
-- using the same remove → override → add pattern as rule_overrides.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_dictionary_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT NOT NULL,
  param_name TEXT NOT NULL,          -- lowercase Atlas parameter name (dictionary key)

  -- Override action
  action TEXT NOT NULL CHECK (action IN ('modify', 'add', 'remove')),

  -- Mapping fields (NULL = use base value for 'modify')
  attribute_id TEXT,                 -- internal attribute ID (required for 'add')
  attribute_name TEXT,               -- display name (required for 'add')
  unit TEXT,                         -- unit string (optional)
  sort_order INTEGER,                -- display order (required for 'add')

  -- Audit
  is_active BOOLEAN NOT NULL DEFAULT true,
  change_reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active override per family+param_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_dict_overrides_active_unique
  ON atlas_dictionary_overrides (family_id, param_name) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_atlas_dict_overrides_family
  ON atlas_dictionary_overrides (family_id) WHERE (is_active = true);

ALTER TABLE atlas_dictionary_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read atlas dict overrides"
  ON atlas_dictionary_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert atlas dict overrides"
  ON atlas_dictionary_overrides FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update atlas dict overrides"
  ON atlas_dictionary_overrides FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
