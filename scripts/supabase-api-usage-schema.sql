-- ============================================================
-- API Usage Log — Tracks external API calls for cost visibility
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service       TEXT NOT NULL CHECK (service IN ('anthropic', 'digikey', 'mouser', 'partsio')),
  model         TEXT,                   -- 'sonnet-4.5' | 'haiku-4.5' | null for non-Claude
  operation     TEXT NOT NULL,          -- 'chat' | 'refinement_chat' | 'profile_extract' | 'qc_analysis' | 'keyword_search' | 'product_details' | 'batch_search' | 'gap_fill'
  input_tokens  INTEGER,               -- Claude only
  output_tokens INTEGER,               -- Claude only
  cached_tokens INTEGER DEFAULT 0,     -- Claude prompt caching
  request_count INTEGER DEFAULT 1,     -- For batched calls (e.g., Mouser chunks)
  llm_calls     INTEGER DEFAULT 1,     -- Claude only: iterations in tool-use loop
  estimated_cost_usd NUMERIC(10,6),    -- Claude only, pre-calculated
  metadata      JSONB                  -- Optional: MPN, family, etc.
);

-- Indexes for common query patterns
CREATE INDEX idx_api_usage_user_date ON api_usage_log (user_id, created_at DESC);
CREATE INDEX idx_api_usage_service ON api_usage_log (service, created_at DESC);

-- RLS
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all rows
CREATE POLICY "Admins can read api usage logs"
  ON api_usage_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role inserts (server-side only, bypasses RLS)
-- No INSERT policy needed — inserts use service role client
