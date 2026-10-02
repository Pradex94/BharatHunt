-- BharatHunt Daily 5: an agent that discovers Indian products, verifies them,
-- and proposes a handful a day for the admin to publish.
--
-- The shape of this feature in one paragraph
-- ------------------------------------------
-- `daily_agent_configs` holds one row per agent ("daily5" today; "weekly25" or
-- an AI-only list later are new rows, not new code). Each run is a
-- `daily_agent_batches` row; every product the run looked at is a
-- `daily_agent_candidates` row carrying its provenance, India evidence, scores
-- and the drafted listing. **No `products` row exists until an admin approves
-- a candidate** (or auto-publish passes every gate): a dry run, a rejection or
-- a skipped candidate never touches the products table, so nothing here can
-- leak a half-verified launch into the marketplace. The approved product is an
-- ordinary product with `source = 'daily_agent'`, owned by a system curator
-- profile, so every existing page, search and sitemap path serves it unchanged.
--
-- Why nothing here has a policy
-- -----------------------------
-- Same rule as 20260915000000 (Launch Agent) and 20260909000000 (funding): the
-- anon key ships in the browser, so a policy would let any session read the
-- internal provenance or write a candidate. Every read and write is
-- `createServiceClient()` from server code that has proved the caller is an
-- admin (lib/actions/daily-agent-admin.ts) or holds the job secret
-- (app/api/daily-agent/run/route.ts). The public /daily-5 page reads through a
-- server-only service function that selects published rows only.
--
-- Idempotent throughout: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Where a product came from
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists source text not null default 'maker';

alter table public.products
  drop constraint if exists products_source_valid;
alter table public.products
  add constraint products_source_valid
  check (source in ('maker', 'daily_agent'));

-- The homepage's daily ranking reads maker launches only, and /daily-5 reads
-- the curated ones; both are a slice of recent published rows.
create index if not exists products_curated_published_idx
  on public.products (published_at desc)
  where status = 'published' and source <> 'maker';

-- `source` is provenance, so a maker's session must not be able to claim its
-- launch was curated (or un-curate one). Same reasoning, and the same
-- SECURITY INVOKER `current_user` test, as enforce_product_review_gate in
-- 20260825000000: only the service role, reached through
-- `createServiceClient()`, may write anything but the default.
create or replace function public.enforce_product_source_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source is distinct from 'maker' then
      raise exception 'A product''s source is set by BharatHunt, not by its creator'
        using errcode = 'check_violation';
    end if;
  elsif new.source is distinct from old.source then
    raise exception 'A product''s source is set by BharatHunt, not by its creator'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists products_source_gate on public.products;
create trigger products_source_gate
  before insert or update on public.products
  for each row execute function public.enforce_product_source_gate();

-- A curated product's state comes from evidence on its own site (a CIN, a
-- GSTIN, a registered address) — neither geo-IP ('detected') nor a maker's
-- choice ('maker'). The map keeps the three apart.
alter table public.products
  drop constraint if exists products_launch_state_source_valid;
alter table public.products
  add constraint products_launch_state_source_valid
  check (launch_state_source is null or launch_state_source in ('detected', 'maker', 'verified'));

-- The owner of every curated product. `profiles.id` is text (Clerk ids, see
-- 20260721010000), and no Clerk id starts with `system_`, so no session can
-- ever act as this profile — which is the point: nobody can edit a curated
-- listing through the maker policies, only an admin through the service role.
insert into public.profiles (id, username, display_name, bio, website_url)
values (
  'system_bharathunt_curator',
  'bharathunt-curator',
  'BharatHunt Curator',
  'Indian products discovered and verified by BharatHunt Daily 5. Built one of them? Write to us and we will hand the listing over to you.',
  'https://bharathunt.org/daily-5'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Agent configuration: one row per agent
-- ---------------------------------------------------------------------------

create table if not exists public.daily_agent_configs (
  agent_type               text primary key check (agent_type ~ '^[a-z0-9][a-z0-9_]{1,39}$'),
  label                    text        not null check (length(btrim(label)) between 1 and 80),
  -- The whole-agent kill switch: off means scheduled runs do nothing.
  enabled                  boolean     not null default true,
  daily_target             integer     not null default 5 check (daily_target between 1 and 25),
  -- Local wall-clock time in `timezone`. The scheduler ticks hourly and the
  -- run starts on the first tick at or after this.
  run_time                 text        not null default '09:00' check (run_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone                 text        not null default 'Asia/Kolkata',
  -- 'approval': nothing goes live without an admin. 'auto_publish': candidates
  -- that clear every gate go live — but only while `auto_publish_allowed` is
  -- also true, which is the kill switch for auto-publishing specifically.
  mode                     text        not null default 'approval' check (mode in ('approval', 'auto_publish')),
  auto_publish_allowed     boolean     not null default false,
  min_india_confidence     integer     not null default 70 check (min_india_confidence between 0 and 100),
  min_quality_score        integer     not null default 60 check (min_quality_score between 0 and 100),
  enabled_sources          text[]      not null default '{}',
  -- Resource bounds. See lib/daily-agent/config.ts for what each one caps.
  max_discovery_candidates integer     not null default 40 check (max_discovery_candidates between 1 and 200),
  max_sites_per_batch      integer     not null default 15 check (max_sites_per_batch between 1 and 100),
  max_ai_calls             integer     not null default 10 check (max_ai_calls between 0 and 100),
  max_concurrent_requests  integer     not null default 3 check (max_concurrent_requests between 1 and 8),
  request_timeout_ms       integer     not null default 8000 check (request_timeout_ms between 1000 and 20000),
  cache_ttl_days           integer     not null default 30 check (cache_ttl_days between 1 and 365),
  -- { india, completeness, website, uniqueness, launchReadiness, relevance }
  score_weights            jsonb       not null default '{}'::jsonb check (jsonb_typeof(score_weights) = 'object'),
  -- Future agents narrow the pool here (categories, states, ai_only, …).
  filters                  jsonb       not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  notify_enabled           boolean     not null default true,
  -- URLs an admin queued for the next run; the manual source drains it.
  manual_urls              text[]      not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.daily_agent_configs enable row level security;

drop trigger if exists daily_agent_configs_updated_at on public.daily_agent_configs;
create trigger daily_agent_configs_updated_at
  before update on public.daily_agent_configs
  for each row execute function public.update_updated_at();

insert into public.daily_agent_configs (agent_type, label, enabled_sources)
values ('daily5', 'BharatHunt Daily 5', array['manual', 'show_hn', 'news_launches', 'funded_startups', 'india_ai_gazetteer'])
on conflict (agent_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Batches: one per agent per day (plus any number of dry runs)
-- ---------------------------------------------------------------------------

create table if not exists public.daily_agent_batches (
  id                   uuid primary key default gen_random_uuid(),
  agent_type           text        not null references public.daily_agent_configs (agent_type) on delete cascade,
  -- The local date in the agent's timezone, which is what /daily-5/<date> shows.
  batch_date           date        not null,
  is_dry_run           boolean     not null default false,
  trigger              text        not null default 'manual' check (trigger in ('scheduled', 'manual')),
  status               text        not null default 'discovering'
                       check (status in ('discovering', 'verifying', 'selecting', 'review', 'completed', 'failed')),
  -- The stage a failed batch stopped in, so a resume knows where to restart.
  failed_stage         text,
  attempts             integer     not null default 0,
  target_count         integer     not null,
  -- The settings this run used, so a historical batch can be explained after
  -- the settings change.
  config_snapshot      jsonb       not null default '{}'::jsonb,
  discovered_count     integer     not null default 0,
  duplicate_count      integer     not null default 0,
  skipped_count        integer     not null default 0,
  ineligible_count     integer     not null default 0,
  needs_review_count   integer     not null default 0,
  eligible_count       integer     not null default 0,
  selected_count       integer     not null default 0,
  published_count      integer     not null default 0,
  rejected_count       integer     not null default 0,
  -- Cost accounting, shown on the dashboard.
  sites_fetched        integer     not null default 0,
  cache_hits           integer     not null default 0,
  ai_calls             integer     not null default 0,
  ai_cost_usd          numeric(10, 4) not null default 0,
  -- [{ source, ok, found, kept, error?, ms }]: one per source, so a source that
  -- timed out is visible without failing the batch.
  source_reports       jsonb       not null default '[]'::jsonb check (jsonb_typeof(source_reports) = 'array'),
  -- [{ at, message }]: the [BHARATHUNT-DAILY5] lines, kept with the batch.
  log                  jsonb       not null default '[]'::jsonb check (jsonb_typeof(log) = 'array'),
  -- A lease, so the scheduler and the admin's button cannot advance the same
  -- batch at once.
  locked_until         timestamptz,
  error_message        text,
  notified_at          timestamptz,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.daily_agent_batches enable row level security;

-- Idempotency: one real batch per agent per day. A second scheduled tick, a
-- retried workflow or a double-clicked button finds this row instead of
-- creating another. Dry runs are exempt — they publish nothing.
create unique index if not exists daily_agent_batches_one_per_day
  on public.daily_agent_batches (agent_type, batch_date)
  where not is_dry_run;

create index if not exists daily_agent_batches_recent_idx
  on public.daily_agent_batches (agent_type, started_at desc);

create index if not exists daily_agent_batches_public_idx
  on public.daily_agent_batches (agent_type, batch_date desc)
  where not is_dry_run and published_count > 0;

drop trigger if exists daily_agent_batches_updated_at on public.daily_agent_batches;
create trigger daily_agent_batches_updated_at
  before update on public.daily_agent_batches
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Candidates: every product a batch looked at, and why it went where it did
-- ---------------------------------------------------------------------------

create table if not exists public.daily_agent_candidates (
  id                      uuid primary key default gen_random_uuid(),
  batch_id                uuid        not null references public.daily_agent_batches (id) on delete cascade,
  agent_type              text        not null,
  -- From normalizeSite (lib/daily-agent/domain.ts): the registrable domain,
  -- or the full host on shared hosting. The duplicate key. A candidate a
  -- headline named without linking holds `name:<folded name>` here until its
  -- website is resolved.
  normalized_domain       text        not null check (length(normalized_domain) between 3 and 255),
  website_url             text        check (website_url is null or website_url ~ '^https?://'),
  name                    text        not null check (length(btrim(name)) between 1 and 120),
  -- Provenance. Never hidden: the dashboard shows all of it.
  source_name             text        not null,
  source_urls             text[]      not null default '{}',
  source_snippet          text        check (source_snippet is null or length(source_snippet) <= 600),
  -- True when the website was found by probing domains for a name (a news
  -- headline named the product but did not link it). Always needs a human.
  website_inferred        boolean     not null default false,
  discovery_score         integer     not null default 0,
  discovered_at           timestamptz not null default now(),
  verified_at             timestamptz,
  status                  text        not null default 'discovered'
                          check (status in ('discovered', 'already_exists', 'skipped', 'ineligible', 'needs_review',
                                            'eligible', 'selected', 'publishing', 'published', 'rejected')),
  status_reason           text        check (status_reason is null or length(status_reason) <= 500),
  duplicate_of_product_id uuid        references public.products (id) on delete set null,
  duplicate_reason        text,
  india_confidence        integer     check (india_confidence is null or india_confidence between 0 and 100),
  -- [{ kind, label, weight, evidence, url }]
  india_signals           jsonb       not null default '[]'::jsonb check (jsonb_typeof(india_signals) = 'array'),
  -- Verified facts only; a key that could not be verified is null.
  facts                   jsonb       not null default '{}'::jsonb check (jsonb_typeof(facts) = 'object'),
  -- The drafted listing: tagline, short/full description, category, tags, why.
  content                 jsonb       not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  scores                  jsonb       not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  overall_score           integer     check (overall_score is null or overall_score between 0 and 100),
  issues                  text[]      not null default '{}',
  rank                    integer,
  product_id              uuid        unique references public.products (id) on delete set null,
  reviewed_by             text,
  reviewed_at             timestamptz,
  review_note             text        check (review_note is null or length(review_note) <= 1000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint daily_agent_candidates_domain_per_batch unique (batch_id, normalized_domain)
);

alter table public.daily_agent_candidates enable row level security;

create index if not exists daily_agent_candidates_batch_idx
  on public.daily_agent_candidates (batch_id, status);

-- The verification cache and the "seen recently" check both look a domain up
-- across batches, newest first.
create index if not exists daily_agent_candidates_domain_idx
  on public.daily_agent_candidates (normalized_domain, verified_at desc nulls last);

drop trigger if exists daily_agent_candidates_updated_at on public.daily_agent_candidates;
create trigger daily_agent_candidates_updated_at
  before update on public.daily_agent_candidates
  for each row execute function public.update_updated_at();
