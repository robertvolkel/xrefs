-- =============================================================
-- Add user preferences to profiles
-- =============================================================
-- Stores user preferences as JSONB for agent personalization
-- and matching engine context (compliance defaults, manufacturer
-- preferences, industry, business role, etc.).
--
-- Structure mirrors UserPreferences interface in lib/types.ts.
-- Null/empty means no preferences set (backward-compatible).

-- Main JSONB blob for flexible preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';

-- Denormalized columns for admin queries / filtering
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company TEXT;

-- GIN index for JSONB queries (e.g., "find all automotive users")
CREATE INDEX IF NOT EXISTS idx_profiles_preferences ON profiles USING GIN (preferences);

-- RLS: allow users to update their own profile (preferences, business_role, industry, company)
-- Note: existing policies already allow admin updates on any profile.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
