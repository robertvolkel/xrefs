-- ============================================================
-- Multi-Tenant Foundation — Organizations & Identity
-- ============================================================
-- Creates the four new tables that the multi-tenant rebuild
-- depends on:
--
--   orgs                       — tenant rows
--   org_invitations            — invite-only signup flow
--   impersonation_audit_log    — SuperAdmin support audit trail
--   api_keys                   — replaces the XREFS_API_KEYS env hack
--
-- Idempotent: safe to re-run.
--
-- Migration order: this is step 1. Run BEFORE
--   supabase-multitenant-profiles-migration.sql
--
-- See ~/.claude/plans/the-application-needs-shimmying-planet.md §1.1
-- ============================================================

-- ─── orgs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'deleted')),
  -- Per-org data-source licenses (Decision #4, schema only — no enforcement yet).
  -- Shape: { atlas: bool, partsio: bool, mouser: bool, findchips: bool,
  --          hide_chinese_manufacturers: bool }
  licenses JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Org-level preferences overlay (resolved between user-level and platform defaults).
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orgs_status_active
  ON orgs (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON orgs (slug);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- Org rows are SuperAdmin-managed. Org members can read their own org.
-- Note: the is_super_admin() / current_org_id() helpers don't exist yet —
-- the RLS migration installs them. Inline subqueries below keep this file
-- self-contained; the RLS migration replaces these with helper calls.
CREATE POLICY "super_admin_all_orgs"
  ON orgs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "org_member_read_own_org"
  ON orgs FOR SELECT TO authenticated
  USING (id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── org_invitations ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'user')),
  -- 32-byte random token, SHA-256 hashed at storage. The raw token is in
  -- the invite email URL; only the hash is queryable here.
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_token_pending
  ON org_invitations (token_hash) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_invitations_org
  ON org_invitations (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON org_invitations (lower(email));

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_invitations"
  ON org_invitations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "org_admin_manage_own_org_invitations"
  ON org_invitations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'org_admin'
      AND profiles.org_id = org_invitations.org_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'org_admin'
      AND profiles.org_id = org_invitations.org_id
  ));

-- ─── impersonation_audit_log ────────────────────────────────

CREATE TABLE IF NOT EXISTS impersonation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  super_admin_email TEXT NOT NULL,
  impersonated_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  impersonated_email TEXT NOT NULL,
  impersonated_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  -- Required free-text reason at session start (surfaced in UI + email to org admin).
  reason TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_impersonation_super
  ON impersonation_audit_log (super_admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_target_org
  ON impersonation_audit_log (impersonated_org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_open
  ON impersonation_audit_log (started_at DESC) WHERE ended_at IS NULL;

ALTER TABLE impersonation_audit_log ENABLE ROW LEVEL SECURITY;

-- Append-only log. INSERT/UPDATE handled by service-role from the
-- /api/super-admin/impersonate route. Read access: super_admin sees all;
-- org_admin sees rows for their org (the trust-signal piece).
CREATE POLICY "super_admin_read_all_impersonation"
  ON impersonation_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "org_admin_read_own_org_impersonation"
  ON impersonation_audit_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'org_admin'
      AND profiles.org_id = impersonation_audit_log.impersonated_org_id
  ));

-- ─── api_keys ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                           -- human label e.g. "Sister Product XYZ"
  key_hash TEXT NOT NULL UNIQUE,                -- SHA-256 of the raw token
  key_prefix TEXT NOT NULL,                     -- first 8 chars of raw token for UI display
  -- Phase 1.5 (Decision #1.5.6) will extend with `scopes TEXT[]`. Keeping
  -- this schema minimal here so Phase 1 can ship without that dependency.
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_active
  ON api_keys (key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_org
  ON api_keys (org_id, created_at DESC);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_api_keys"
  ON api_keys FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "org_admin_manage_own_api_keys"
  ON api_keys FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'org_admin'
      AND profiles.org_id = api_keys.org_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'org_admin'
      AND profiles.org_id = api_keys.org_id
  ));
