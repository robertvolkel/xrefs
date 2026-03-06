-- ============================================================
-- Release Notes — Admin announcements visible to all users
-- ============================================================

CREATE TABLE IF NOT EXISTS release_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_notes_created
  ON release_notes (created_at DESC);

ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read release notes"
  ON release_notes FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert release notes"
  ON release_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update release notes"
  ON release_notes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete release notes"
  ON release_notes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
