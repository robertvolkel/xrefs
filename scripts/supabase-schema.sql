-- =============================================================
-- Profiles table — user roles & soft-disable
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)
-- =============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all profiles (needed for admin user list)
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT TO authenticated USING (true);

-- Only admins can update any profile (role changes, disable)
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'rvolkel@supplyframe.com' THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- Backfill existing users who don't have a profile row yet
-- =============================================================

INSERT INTO profiles (id, email, full_name, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', ''),
  CASE WHEN email = 'rvolkel@supplyframe.com' THEN 'admin' ELSE 'user' END
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);

-- =============================================================
-- Add currency column to parts_lists
-- =============================================================

ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
