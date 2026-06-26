-- mpn_grounding_observations
--
-- Observe-only measurement of would-be MPN fabrications in the chat assistant's prose.
-- Written fire-and-forget from the chat orchestrators; has NO effect on what the
-- customer sees. Lets us measure the real fabrication rate (and tune the detector's
-- vocabulary / family patterns) BEFORE any enforcement is switched on.
-- See docs/mpn-grounding-gate-plan.md (step 3).

create table if not exists mpn_grounding_observations (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  surface            text not null,          -- 'chat' | 'refine' | 'list'
  conversation_id    text,
  user_id            uuid,
  model              text,
  message_length     integer not null,
  verified_mpn_count integer not null,       -- size of the verified set the message was checked against
  finding_count      integer not null,
  high_count         integer not null,       -- looked like a real MPN family but unverified (strong fabrication signal)
  medium_count       integer not null,       -- merely structurally MPN-shaped + unverified
  findings           jsonb not null default '[]'::jsonb  -- [{ token, normalized, confidence, reason, index }]
);

create index if not exists idx_mpn_grounding_obs_created on mpn_grounding_observations (created_at desc);
create index if not exists idx_mpn_grounding_obs_surface on mpn_grounding_observations (surface);
-- Rows with findings are the interesting ones (would-be catches) — partial index for the dashboard.
create index if not exists idx_mpn_grounding_obs_hits on mpn_grounding_observations (created_at desc)
  where finding_count > 0;

-- Service-role writes only (orchestrators run server-side); no end-user access.
alter table mpn_grounding_observations enable row level security;
