-- RPC function: count active cross-references per manufacturer slug.
-- Replaces client-side row counting that was truncated by PostgREST's 1000-row limit.
-- Used by GET /api/admin/manufacturers to populate the "MFR Crosses" column.

-- Drop first: CREATE OR REPLACE can't change the return type of an existing function.
DROP FUNCTION IF EXISTS get_cross_ref_counts();

CREATE OR REPLACE FUNCTION get_cross_ref_counts()
RETURNS TABLE(manufacturer_slug TEXT, count BIGINT, max_uploaded_at TIMESTAMPTZ)
LANGUAGE SQL STABLE
AS $$
  SELECT manufacturer_slug, COUNT(*), MAX(uploaded_at)
  FROM manufacturer_cross_references
  WHERE is_active = true
  GROUP BY manufacturer_slug;
$$;
