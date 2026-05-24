-- ============================================================
-- Atlas Family Domain Cards
-- ============================================================
-- Per-family knowledge cards injected into the Triage AI prompts
-- (/suggest and /investigate). Cards capture sub-type distinctions,
-- naming pitfalls, conventional units, foreign-family indicators —
-- the idiosyncratic knowledge the Sonnet 4.6-class model can't
-- derive from schema labels alone.
--
-- Lifecycle: an admin clicks "Generate" for a family → server fires
-- an Opus 4.7-class one-shot call with the family's logic-table rules,
-- recent accepted overrides, signature registry hits, and cross-family
-- canonical inventory → Opus writes a first-draft card → status='draft'
-- row inserted. Admin reviews and edits → status='active'. The triage
-- routes only inject status='active' cards.
--
-- The TypeScript file at lib/services/atlasFamilyDomainCards.ts is a
-- FALLBACK for the 7 hand-written initial cards. DB rows shadow them
-- when both exist (DB wins). Migration of those 7 is opportunistic —
-- as engineers click "Regenerate" on a hand-written family, the new
-- DB row supersedes the TS constant.
-- ============================================================

CREATE TABLE IF NOT EXISTS atlas_family_domain_cards (
  -- Family ID is the primary key — there's exactly one card per family.
  -- Status transitions happen in-place via UPDATE rather than insert-new.
  -- (If we ever need version history, add an audit table; the live row
  -- always reflects the current state to keep loader logic trivial.)
  family_id TEXT PRIMARY KEY,

  -- Card content — plain text, ~150-300 words. Rendered verbatim into
  -- the AI prompt; no markdown processing.
  card_text TEXT NOT NULL,

  -- 'draft'    — Opus just generated this; engineer hasn't reviewed yet.
  --              Triage routes do NOT inject draft cards (avoids polluting
  --              live AI behavior with un-vetted content).
  -- 'active'   — engineer-approved; injected on every relevant Triage row.
  -- 'archived' — superseded or rejected; preserved for audit.
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),

  -- Which Anthropic model wrote the draft (e.g., 'claude-opus-4-7').
  -- Useful for tracking which generations need re-running after a model
  -- upgrade. Null for hand-written cards migrated from the TS fallback.
  model_used TEXT,

  -- JSONB snapshot of the inputs the generator saw at draft time:
  --   { logicTableRules: [...], recentOverrides: [...], signatureEntries: [...] }
  -- Lets us re-run a generation with the same context if needed, or diff
  -- across generations to see what new data drove a card revision.
  data_snapshot JSONB,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_atlas_family_domain_cards_status
  ON atlas_family_domain_cards (status);

ALTER TABLE atlas_family_domain_cards ENABLE ROW LEVEL SECURITY;

-- Admin-only policies. Service-role (used by route handlers) bypasses RLS
-- entirely, so these policies primarily gate any direct admin-UI reads.
DROP POLICY IF EXISTS "Admins can read atlas family domain cards" ON atlas_family_domain_cards;
CREATE POLICY "Admins can read atlas family domain cards"
  ON atlas_family_domain_cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can write atlas family domain cards" ON atlas_family_domain_cards;
CREATE POLICY "Admins can write atlas family domain cards"
  ON atlas_family_domain_cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_atlas_family_domain_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atlas_family_domain_cards_updated_at ON atlas_family_domain_cards;
CREATE TRIGGER trg_atlas_family_domain_cards_updated_at
  BEFORE UPDATE ON atlas_family_domain_cards
  FOR EACH ROW EXECUTE FUNCTION update_atlas_family_domain_cards_updated_at();

-- ============================================================
-- Decision #195 Phase 2 — audit_results column
-- ============================================================
-- Persisted output of lib/services/atlasFamilyCardAudit.ts. Populated on
-- every Generate; manually re-runnable. Null = never audited.
-- Shape (TS): CardAuditResult — see atlasFamilyCardAudit.ts.
--   { auditedAt, error?, bogusMfrs, omittedMfrs, wrongPrefixes,
--     fabricatedDict, issueCount, severity: 'clean'|'warn'|'block' }
-- Apply via Supabase SQL Editor.
ALTER TABLE atlas_family_domain_cards
  ADD COLUMN IF NOT EXISTS audit_results JSONB;
