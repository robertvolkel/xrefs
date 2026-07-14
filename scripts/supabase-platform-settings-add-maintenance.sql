-- ============================================================
-- Maintenance Mode — automatic "app is down for maintenance" switch
-- ============================================================
-- Adds a global maintenance flag to platform_settings (the same single-row
-- table that holds qc_logging_enabled) plus three SECURITY DEFINER helper
-- functions.
--
-- Why SECURITY DEFINER: platform_settings RLS allows SELECT only to
-- `authenticated` and UPDATE only to admins (see supabase-qc-schema.sql).
-- But this feature must:
--   * READ the flag from a PUBLIC endpoint (login screen, before sign-in → anon)
--   * WRITE the flag from the chat route under a REGULAR (non-admin) user
--       when Claude reports "out of credits"
--   * WRITE the recovery timestamp from the same public/anon endpoint
-- A direct .update()/.select() in those contexts would silently no-op under
-- RLS. These definer functions run with the table owner's rights and are the
-- ONLY write path, so RLS on the table itself stays locked down.
--
-- Run once in Supabase (single project → live everywhere).
-- ============================================================

-- 1. Columns on the existing single-row settings table
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maintenance_last_check TIMESTAMPTZ;

-- Make sure the global row exists (no-op if it already does)
INSERT INTO platform_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2a. Read the flag. Callable by anon (login screen) + authenticated.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_maintenance_status()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT maintenance_mode FROM platform_settings WHERE id = 'global'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION get_maintenance_status() TO anon, authenticated;

-- ------------------------------------------------------------
-- 2b. Set the flag. UPSERTs the global row so it works even if missing.
--     Called by the chat route (regular user, turning ON) and the public
--     status route (recovery ping succeeded, turning OFF).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_maintenance_mode(p_on BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO platform_settings (id, maintenance_mode, maintenance_since)
  VALUES ('global', p_on, CASE WHEN p_on THEN now() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE
    SET maintenance_mode  = EXCLUDED.maintenance_mode,
        -- keep the original "since" on a repeated ON; clear it on OFF
        maintenance_since = CASE
          WHEN p_on THEN COALESCE(platform_settings.maintenance_since, now())
          ELSE NULL
        END;
END;
$$;

GRANT EXECUTE ON FUNCTION set_maintenance_mode(BOOLEAN) TO anon, authenticated;

-- ------------------------------------------------------------
-- 2c. Atomically claim the once-a-minute recovery-check slot.
--     Returns true iff THIS caller won the slot (should fire the ping).
--     The WHERE clause is the throttle — holds across serverless instances.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_maintenance_recovery_check()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  UPDATE platform_settings
     SET maintenance_last_check = now()
   WHERE id = 'global'
     AND (maintenance_last_check IS NULL
          OR maintenance_last_check < now() - interval '60 seconds');
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_maintenance_recovery_check() TO anon, authenticated;
