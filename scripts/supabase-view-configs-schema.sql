-- =============================================================
-- Add per-list view configs to parts_lists
-- =============================================================
-- Stores per-list view configurations as JSONB.
-- Structure mirrors ViewState: { activeViewId, defaultViewId, views[] }
-- Null means the list hasn't been migrated yet (uses global templates).

ALTER TABLE parts_lists ADD COLUMN IF NOT EXISTS view_configs JSONB;
