-- spec_value_observations
--
-- Observe-only measurement of would-be SPEC-VALUE fabrications in the chat assistant's prose.
-- Sibling of mpn_grounding_observations: that table catches fabricated PART NUMBERS; this one
-- catches value+unit tokens the assistant wrote ("aim for 50 V", ">90% efficiency", "~100 mΩ")
-- that don't trace to the turn's grounded attributes. Written fire-and-forget from the chat
-- orchestrators; has NO effect on what the customer sees. Lets us measure the real spec-value
-- leak rate — the surface the family-knowledge injection (Track A) widens and the MPN detector
-- is blind to — BEFORE any enforcement is considered.
-- See docs/mpn-grounding-gate-plan.md and the chat-intelligence redesign plan (Phase 1).

create table if not exists spec_value_observations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  surface           text not null,          -- 'chat' | 'refine' | 'list'
  conversation_id   text,
  user_id           text,                   -- text (not uuid): the API-key service-user id isn't a uuid
  model             text,
  message_length    integer not null,
  known_value_count integer not null,       -- size of the grounded value set the message was checked against
  finding_count     integer not null,
  high_count        integer not null,       -- value+unit claim not present in grounded data (strong signal)
  medium_count      integer not null,       -- bare percentage not present in grounded data
  findings          jsonb not null default '[]'::jsonb  -- [{ token, value, unit, baseSI, reason, confidence, index }]
);

create index if not exists idx_spec_value_obs_created on spec_value_observations (created_at desc);
create index if not exists idx_spec_value_obs_surface on spec_value_observations (surface);
-- Rows with findings are the interesting ones (would-be catches) — partial index for analysis.
create index if not exists idx_spec_value_obs_hits on spec_value_observations (created_at desc)
  where finding_count > 0;

-- Service-role writes only (orchestrators run server-side); no end-user access.
alter table spec_value_observations enable row level security;
