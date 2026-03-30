-- ============================================================
-- Admin Override Layer — Rule & Context Question Overrides
-- ============================================================
-- Allows admins to patch hardcoded TypeScript logic tables and
-- context questions at runtime without code deploys.
-- Overrides are merged on top of the TS base in partDataService.
-- ============================================================

-- ─── Rule Overrides ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT NOT NULL,
  attribute_id TEXT NOT NULL,

  -- Override action
  action TEXT NOT NULL CHECK (action IN ('modify', 'add', 'remove')),

  -- Overridable fields (NULL = use base value)
  weight INTEGER CHECK (weight IS NULL OR (weight >= 0 AND weight <= 10)),
  logic_type TEXT CHECK (logic_type IS NULL OR logic_type IN (
    'identity', 'identity_range', 'identity_upgrade', 'identity_flag',
    'threshold', 'fit', 'application_review', 'operational', 'vref_check'
  )),
  threshold_direction TEXT CHECK (threshold_direction IS NULL OR threshold_direction IN (
    'gte', 'lte', 'range_superset'
  )),
  upgrade_hierarchy JSONB,            -- string[] for identity_upgrade
  block_on_missing BOOLEAN,
  tolerance_percent NUMERIC,
  engineering_reason TEXT,
  attribute_name TEXT,                 -- required for 'add' action
  sort_order INTEGER,                 -- required for 'add' action

  -- Audit
  is_active BOOLEAN NOT NULL DEFAULT true,
  change_reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active override per family+attribute
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_overrides_active_unique
  ON rule_overrides (family_id, attribute_id) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_rule_overrides_family
  ON rule_overrides (family_id) WHERE (is_active = true);

ALTER TABLE rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read rule overrides"
  ON rule_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert rule overrides"
  ON rule_overrides FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update rule overrides"
  ON rule_overrides FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ─── Context Overrides ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS context_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT NOT NULL,
  question_id TEXT NOT NULL,

  -- Override action
  action TEXT NOT NULL CHECK (action IN (
    'modify_question', 'add_question', 'disable_question',
    'add_option', 'modify_option'
  )),

  -- Question-level fields (for add_question / modify_question)
  question_text TEXT,
  priority INTEGER,
  required BOOLEAN,

  -- Option-level fields (for add_option / modify_option)
  option_value TEXT,
  option_label TEXT,
  option_description TEXT,
  attribute_effects JSONB,            -- AttributeEffect[] as JSON

  -- Audit
  is_active BOOLEAN NOT NULL DEFAULT true,
  change_reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_context_overrides_family
  ON context_overrides (family_id) WHERE (is_active = true);

ALTER TABLE context_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read context overrides"
  ON context_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert context overrides"
  ON context_overrides FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update context overrides"
  ON context_overrides FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ─── Audit: Previous Values Snapshot ──────────────────────
-- Captures rule state before each override for audit trail.
-- NULL for 'add' actions (nothing existed before) and pre-existing rows.

ALTER TABLE rule_overrides ADD COLUMN IF NOT EXISTS previous_values JSONB;


-- ─── Rule Annotations ─────────────────────────────────────
-- Lightweight comment threads on logic table rules for admin
-- collaboration. Keyed on family+attribute (not on override records),
-- so admins can discuss any rule whether or not it's been overridden.

CREATE TABLE IF NOT EXISTS rule_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT NOT NULL,
  attribute_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rule_annotations_family_attr
  ON rule_annotations (family_id, attribute_id);

ALTER TABLE rule_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read rule annotations"
  ON rule_annotations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert rule annotations"
  ON rule_annotations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update rule annotations"
  ON rule_annotations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete own annotations"
  ON rule_annotations FOR DELETE TO authenticated
  USING (created_by = auth.uid());
