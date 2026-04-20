-- App Feedback: general user feedback about the app (ideas, issues, etc.)
-- Separate from qc_feedback (which is tied to specific recommendation rules/questions).

CREATE TABLE IF NOT EXISTS app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('idea', 'issue', 'other')),

  user_comment TEXT NOT NULL,

  user_agent TEXT,
  viewport TEXT,

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),

  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_status
  ON app_feedback(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_feedback_user
  ON app_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_feedback_category
  ON app_feedback(category, created_at DESC);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own app feedback"
  ON app_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own app feedback"
  ON app_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all app feedback"
  ON app_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update app feedback"
  ON app_feedback FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
