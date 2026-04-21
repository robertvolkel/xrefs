-- Decision #145: Per-list Replacement Priorities for composite ranking
-- Adds a JSONB column on parts_lists to hold { order: ReplacementAxis[], enabled: Record<ReplacementAxis, boolean> }.
-- Null on existing rows; server-side code falls back to DEFAULT_REPLACEMENT_PRIORITIES when null.
-- Safe to run multiple times via IF NOT EXISTS.

ALTER TABLE parts_lists
  ADD COLUMN IF NOT EXISTS replacement_priorities JSONB;

COMMENT ON COLUMN parts_lists.replacement_priorities IS
  'Decision #145 — ordered priority list (lifecycle/compliance/cost/stock) used for composite ranking of replacement recommendations. Null = server defaults.';
