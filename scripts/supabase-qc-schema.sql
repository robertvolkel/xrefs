-- ============================================================
-- QC System: Platform Settings + Recommendation Log + Feedback
-- ============================================================

-- 1. Platform Settings (single-row config)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  qc_logging_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed the single row
INSERT INTO platform_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (logger needs to check the toggle)
CREATE POLICY "Authenticated users can read settings"
  ON platform_settings FOR SELECT TO authenticated
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can update settings"
  ON platform_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- 2. Recommendation Log
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_mpn TEXT NOT NULL,
  source_manufacturer TEXT,
  family_id TEXT,
  family_name TEXT,
  recommendation_count INTEGER NOT NULL DEFAULT 0,
  request_source TEXT NOT NULL CHECK (request_source IN ('chat', 'direct', 'batch')),
  data_source TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_log_user
  ON recommendation_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_log_family
  ON recommendation_log(family_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_log_source
  ON recommendation_log(request_source, created_at DESC);

ALTER TABLE recommendation_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own log entries
CREATE POLICY "Users can read own log entries"
  ON recommendation_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can read all log entries
CREATE POLICY "Admins can read all log entries"
  ON recommendation_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service-level insert (any authenticated user, via API routes)
CREATE POLICY "Authenticated users can insert log entries"
  ON recommendation_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


-- 3. QC Feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS qc_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id UUID REFERENCES recommendation_log(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What stage is being questioned
  feedback_stage TEXT NOT NULL CHECK (feedback_stage IN ('qualifying_questions', 'rule_logic')),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),

  -- Replacement context (rule_logic feedback)
  replacement_mpn TEXT,
  source_mpn TEXT NOT NULL,

  -- Rule detail (rule_logic, specific rule)
  rule_attribute_id TEXT,
  rule_attribute_name TEXT,
  rule_result TEXT,
  source_value TEXT,
  replacement_value TEXT,
  rule_note TEXT,

  -- Question detail (qualifying_questions feedback)
  question_id TEXT,
  question_text TEXT,

  -- User input
  user_comment TEXT NOT NULL,

  -- Admin fields
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_feedback_log
  ON qc_feedback(log_id);

CREATE INDEX IF NOT EXISTS idx_qc_feedback_status
  ON qc_feedback(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qc_feedback_user
  ON qc_feedback(user_id, created_at DESC);

ALTER TABLE qc_feedback ENABLE ROW LEVEL SECURITY;

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback"
  ON qc_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON qc_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can read all feedback
CREATE POLICY "Admins can read all feedback"
  ON qc_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can update any feedback (status, admin notes)
CREATE POLICY "Admins can update feedback"
  ON qc_feedback FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
