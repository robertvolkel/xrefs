-- ============================================================
-- Admin Stats Cache — Persistent aggregation cache
-- ============================================================
-- Keyed cache for expensive admin-panel aggregations. Survives
-- server restarts/deploys. Invalidated by admin writes and by
-- the manual Refresh button in each panel header.
--
-- Known keys:
--   'manufacturers-list' — /api/admin/manufacturers GET payload
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_stats_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin stats cache"
  ON admin_stats_cache FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
