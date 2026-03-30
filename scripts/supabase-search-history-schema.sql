-- =============================================================
-- Search History table — tracks user searches for admin stats
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)
-- =============================================================

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  source_mpn TEXT,
  source_manufacturer TEXT,
  source_category TEXT,
  recommendation_count INTEGER NOT NULL DEFAULT 0,
  phase_reached TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);

-- Row Level Security
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- logSearch() in supabaseLogger.ts uses the browser Supabase client,
-- so users need INSERT permission on their own rows
CREATE POLICY "Users can insert own search history"
  ON search_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own history; service role reads all (admin stats)
CREATE POLICY "Users can read own search history"
  ON search_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());
