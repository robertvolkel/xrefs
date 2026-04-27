-- Per-rule value aliases for identity / identity_upgrade comparisons.
-- Each entry is a JSONB array of arrays of strings, where each inner array is
-- a group of equivalent values (e.g. [['Polar','Polarized','Uni-Polar'], ['Bi-Polar','Bipolar']]).
-- Null = no aliases (current behavior).
-- Safe to run multiple times via IF NOT EXISTS.

ALTER TABLE rule_overrides
  ADD COLUMN IF NOT EXISTS value_aliases JSONB;

COMMENT ON COLUMN rule_overrides.value_aliases IS
  'string[][] of equivalent value groups for identity / identity_upgrade rules. Null = no aliases.';
