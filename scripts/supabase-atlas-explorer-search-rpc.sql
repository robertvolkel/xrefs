-- ============================================================
-- Atlas Explorer Search RPC
-- ============================================================
-- The admin Atlas MFRs > Search tab was hitting Postgres
-- statement_timeout (57014) on 114K+ rows under the authenticated
-- role even with simple ILIKE queries — the planner doesn't pick
-- up trigram indexes reliably across that role's path, and the
-- authenticated role's timeout is shorter than the resulting
-- sequential scan needs.
--
-- This RPC fixes it three ways:
--   1. SECURITY DEFINER so the function runs as table owner, giving
--      the planner consistent access to indexes regardless of who
--      calls it.
--   2. SET LOCAL statement_timeout = '30s' for headroom — the cap
--      that was killing the cookie-auth path doesn't apply here.
--   3. Explicit UNION ALL with per-side LIMIT pushes both sides
--      through indexed scans (mpn trigram, manufacturer trigram)
--      independently, instead of an OR that the planner regresses
--      to sequential.
-- ============================================================

-- Ensure pg_trgm extension is enabled (idempotent — usually pre-installed
-- on Supabase, but make explicit so the indexes below succeed cleanly).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for substring ILIKE matching on both columns.
-- The mpn index may already exist from the base schema; recreate to be
-- safe. Manufacturer was previously btree-only, so substring ILIKE on
-- it fell back to seq-scan.
CREATE INDEX IF NOT EXISTS idx_atlas_products_mpn_trgm
  ON atlas_products USING gin (mpn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_atlas_products_manufacturer_trgm
  ON atlas_products USING gin (manufacturer gin_trgm_ops);

-- Drop any older version so the signature change goes through cleanly.
DROP FUNCTION IF EXISTS search_atlas_products_admin(TEXT, INTEGER);

CREATE FUNCTION search_atlas_products_admin(q TEXT, lim INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  mpn TEXT,
  manufacturer TEXT,
  description TEXT,
  clean_description TEXT,
  category TEXT,
  subcategory TEXT,
  family_id TEXT,
  status TEXT,
  parameters JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pattern TEXT := '%' || q || '%';
BEGIN
  SET LOCAL statement_timeout = '30s';

  RETURN QUERY
  WITH mpn_hits AS (
    SELECT ap.id, ap.mpn, ap.manufacturer, ap.description, ap.clean_description,
           ap.category, ap.subcategory, ap.family_id, ap.status, ap.parameters
    FROM atlas_products ap
    WHERE ap.mpn ILIKE pattern
    LIMIT lim
  ),
  mfr_hits AS (
    SELECT ap.id, ap.mpn, ap.manufacturer, ap.description, ap.clean_description,
           ap.category, ap.subcategory, ap.family_id, ap.status, ap.parameters
    FROM atlas_products ap
    WHERE ap.manufacturer ILIKE pattern
    LIMIT lim
  ),
  combined AS (
    SELECT * FROM mpn_hits
    UNION
    SELECT * FROM mfr_hits
  )
  SELECT c.id, c.mpn, c.manufacturer, c.description, c.clean_description,
         c.category, c.subcategory, c.family_id, c.status, c.parameters
  FROM combined c
  LIMIT lim;
END;
$$;

-- Restrict to authenticated users; the route handler still gates with
-- requireAdmin() upstream.
REVOKE ALL ON FUNCTION search_atlas_products_admin(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_atlas_products_admin(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_atlas_products_admin(TEXT, INTEGER) TO service_role;
