-- View Templates (Master Views)
-- Shared view configurations stored per-user in Supabase.
-- Master views are referenced by ID from per-list view_configs JSONB.
-- Decision #130

CREATE TABLE IF NOT EXISTS view_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT DEFAULT '',
  column_meta JSONB,
  calculated_fields JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_view_templates_user ON view_templates(user_id);

-- Only one default master view per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_view_templates_user_default
  ON view_templates(user_id) WHERE is_default = true;

-- RLS: users see/edit only their own
ALTER TABLE view_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own view templates"
  ON view_templates FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own view templates"
  ON view_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own view templates"
  ON view_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own view templates"
  ON view_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid());
