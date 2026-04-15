-- Distributor Click Tracking
-- Tracks user clicks on distributor product links in the Commercial tab.

CREATE TABLE IF NOT EXISTS distributor_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mpn TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  distributor TEXT NOT NULL,
  product_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distributor_clicks_user ON distributor_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_distributor_clicks_created ON distributor_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_distributor_clicks_distributor ON distributor_clicks(distributor);
CREATE INDEX IF NOT EXISTS idx_distributor_clicks_mpn ON distributor_clicks(mpn);

ALTER TABLE distributor_clicks ENABLE ROW LEVEL SECURITY;

-- Users can insert their own clicks (browser client with auth session)
CREATE POLICY "Users can insert own distributor clicks"
  ON distributor_clicks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own click history
CREATE POLICY "Users can read own distributor clicks"
  ON distributor_clicks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
