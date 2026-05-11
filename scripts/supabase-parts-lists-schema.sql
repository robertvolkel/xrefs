-- ============================================================
-- parts_lists — captures the existing table in source control
-- ============================================================
-- This table was created via the Supabase dashboard; only ALTER
-- TABLE migrations exist in source control. This file is the
-- authoritative schema as of Phase 1 of the multi-tenant rebuild.
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS` won't overwrite the
-- existing table. The ADD COLUMN statements at the bottom mirror
-- prior incremental migrations:
--
--   supabase-parts-lists-priorities-migration.sql  (replacement_priorities)
--   supabase-upload-settings-migration.sql          (upload_settings)
--   supabase-view-configs-schema.sql                (view_configs)
--
-- The multi-tenant tenant-tables migration adds `org_id` to this
-- table — see supabase-multitenant-tenant-tables-migration.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS parts_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  default_view_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  total_rows INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  spreadsheet_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_configs JSONB,
  replacement_priorities JSONB,
  upload_settings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forward-compat: these statements no-op on a long-running DB but
-- protect a clean reapply if the table is being recreated.
ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS view_configs JSONB;
ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS replacement_priorities JSONB;
ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS upload_settings JSONB;
ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_parts_lists_user_updated
  ON parts_lists (user_id, updated_at DESC);

ALTER TABLE parts_lists ENABLE ROW LEVEL SECURITY;

-- Pre-multi-tenant RLS — preserved for back-compat. The multi-tenant
-- RLS migration drops and replaces these with org-aware policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parts_lists'
      AND policyname = 'Users can read own parts lists'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "Users can read own parts lists"
        ON parts_lists FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parts_lists'
      AND policyname = 'Users can insert own parts lists'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "Users can insert own parts lists"
        ON parts_lists FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parts_lists'
      AND policyname = 'Users can update own parts lists'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "Users can update own parts lists"
        ON parts_lists FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parts_lists'
      AND policyname = 'Users can delete own parts lists'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "Users can delete own parts lists"
        ON parts_lists FOR DELETE TO authenticated
        USING (user_id = auth.uid())
    $POLICY$;
  END IF;
END $$;
