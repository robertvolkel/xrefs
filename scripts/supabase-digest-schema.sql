-- Release Notes Email Digest: Add last_digest_sent_at to platform_settings
-- Run this against your Supabase database to enable digest tracking.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;
