-- RPC function: count active cross-references per manufacturer slug.
-- Replaces client-side row counting that was truncated by PostgREST's 1000-row limit.
-- Used by GET /api/admin/manufacturers to populate the "MFR Crosses" column.

CREATE OR REPLACE FUNCTION get_cross_ref_counts()
RETURNS TABLE(manufacturer_slug TEXT, count BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT manufacturer_slug, COUNT(*)
  FROM manufacturer_cross_references
  WHERE is_active = true
  GROUP BY manufacturer_slug;
$$;
