-- Funding Intelligence: ingested funding news, structured funding rounds, and
-- the investor/startup entities they imply.
--
-- The shape of this feature in one paragraph
-- ------------------------------------------
-- `funding_sources` says where to look. An ingestion run fetches each enabled
-- source and writes one `funding_news` row per *article*. Articles that look
-- like funding announcements are put through extraction, which writes one
-- `funding_rounds` row per *funding event*. A round is invisible until an admin
-- publishes it. `funding_startups` and `funding_investors` are the entities
-- those published rounds roll up into, and both are maintained by trigger so no
-- code path can leave them disagreeing with the rounds they summarise.
--
-- Why articles and events are different tables
-- --------------------------------------------
-- Six publications covering one Series A is six articles and one round. Storing
-- them as one table would force a choice between losing five sources and
-- publishing the same round six times. So deduplication runs on articles
-- (`normalized_url`, then `content_hash`, then a headline/startup/date
-- similarity check in lib/funding/ingest.ts) while publishing runs on events
-- (`event_key`), and `funding_round_articles` records the extra coverage
-- instead of discarding it.
--
-- Why nothing here has a write policy
-- -----------------------------------
-- The rule this schema inherits from 20260825000000 (launch review) and
-- 20260828120000 (promotions): NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the
-- browser, so a policy that lets a session write a row lets it write *any
-- value* into that row -- `status = 'published'`, `verified = true`,
-- `confidence_score = 1`. On a funding dataset that is not a defacement risk,
-- it is a credibility risk: the whole product is the claim that a figure on
-- this page was reported by a named source. Every write here is
-- `createServiceClient()` from server code that has already checked
-- `getIsAdmin()`, or from the ingestion endpoint, which carries its own shared
-- secret. The one exception is `funding_alert_subscriptions`, which holds a
-- user's own notification preferences and nothing privileged.
--
-- Money, and the one conversion this schema allows
-- ------------------------------------------------
-- `amount_numeric` + `currency` are what the source reported, and that pair is
-- what any card renders. `amount_inr` exists only so a chart can add a $4M seed
-- to a Rs 25 Cr Series A, and the rate used is stamped on the row
-- (`fx_rate_to_inr`) rather than applied at read time -- a rate that moves must
-- not silently rewrite last quarter's totals. Anything unreported stays null;
-- see the trust rule in lib/funding/extract.ts.
--
-- Idempotent throughout: safe to re-run.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Sources
-- ---------------------------------------------------------------------------
-- Configuration, not code. An operator disables a feed that has started
-- returning junk by flipping `enabled` in /admin/funding; nothing redeploys.

create table if not exists public.funding_sources (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null check (length(btrim(name)) between 1 and 120),
  source_type           text        not null check (source_type in ('rss', 'api', 'gdelt', 'manual')),
  feed_url              text,
  api_endpoint          text,
  -- The publication name stamped onto every article from this source, when the
  -- feed itself does not carry one worth trusting.
  publisher             text,
  homepage_url          text,
  enabled               boolean     not null default true,
  -- Lower runs first, and decides which bucket the scheduler puts a source in.
  priority              integer     not null default 100 check (priority between 0 and 1000),
  -- Per-source politeness. Section 29 of the brief: minutes for the feeds that
  -- actually move, an hour for the rest. A source is skipped entirely when it
  -- was fetched more recently than this, so a five-minute cron does not turn
  -- into a five-minute poll of every feed on the list.
  poll_interval_minutes integer     not null default 60 check (poll_interval_minutes between 5 and 1440),
  -- Drives the exponential backoff in lib/funding/ingest.ts and the health
  -- badge in the admin table. Reset to 0 by any successful fetch.
  consecutive_failures  integer     not null default 0 check (consecutive_failures >= 0),
  is_healthy            boolean     not null default true,
  last_attempt_at       timestamptz,
  last_success_at       timestamptz,
  last_error_at         timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A fetchable source needs somewhere to fetch from. 'manual' is the exception:
  -- it is the bucket admin-entered rounds are attributed to, and it is never
  -- fetched.
  constraint funding_sources_endpoint_present check (
    source_type = 'manual' or coalesce(feed_url, api_endpoint) is not null
  )
);

alter table public.funding_sources enable row level security;

-- No policy, deliberately. RLS with no policy denies every anon and
-- authenticated read, which is the correct answer for a table whose rows are
-- operational configuration -- including `api_endpoint`, which can carry a key
-- in its query string on some providers. Admin reads go through the service
-- role in services/funding-admin.ts.

create unique index if not exists funding_sources_name_key
  on public.funding_sources (lower(btrim(name)));

-- The scheduler's own query: enabled sources, best priority first.
create index if not exists funding_sources_due_idx
  on public.funding_sources (priority, last_attempt_at nulls first)
  where enabled;

drop trigger if exists funding_sources_updated_at on public.funding_sources;
create trigger funding_sources_updated_at
  before update on public.funding_sources
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Startups
-- ---------------------------------------------------------------------------
-- The entity behind /funding/[startup-slug]. Aggregates are columns rather
-- than a view because they are also the RLS test: a startup is visible exactly
-- when it has a published round, so the counter cannot be allowed to drift from
-- the rounds it counts. The trigger in section 7 is what guarantees that.

create table if not exists public.funding_startups (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null check (length(btrim(name)) between 1 and 160),
  slug                  text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Case- and punctuation-folded name, from `normalizeEntityName` in
  -- lib/funding/normalize.ts. This is what a second article about the same
  -- company matches on; the display `name` keeps whatever the source wrote.
  normalized_name       text        not null,
  website               text,
  logo_url              text,
  description           text,
  industry              text,
  sub_industry          text,
  location              text,
  city                  text,
  -- Maintained by trigger. Published rounds only -- a pending round must not
  -- make a company page appear, or the review step would be decorative.
  published_round_count integer     not null default 0,
  total_disclosed_inr   bigint      not null default 0,
  first_round_at        date,
  last_round_at         date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.funding_startups enable row level security;

drop policy if exists "funding_startups_select_published" on public.funding_startups;
create policy "funding_startups_select_published"
  on public.funding_startups for select
  using (published_round_count > 0);

create unique index if not exists funding_startups_slug_key on public.funding_startups (slug);
create unique index if not exists funding_startups_normalized_name_key
  on public.funding_startups (normalized_name);
create index if not exists funding_startups_published_idx
  on public.funding_startups (last_round_at desc nulls last)
  where published_round_count > 0;

drop trigger if exists funding_startups_updated_at on public.funding_startups;
create trigger funding_startups_updated_at
  before update on public.funding_startups
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Investors
-- ---------------------------------------------------------------------------
-- Distinct from `public.investors` (20260904000000) on purpose. That table is a
-- curated dataset that is sold, with cheque sizes and contact details an admin
-- typed in; this one is the set of names that have appeared in published
-- funding rounds, and it holds nothing that was not in an article. Merging them
-- would put paid-product columns on a row that ingestion writes.

create table if not exists public.funding_investors (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null check (length(btrim(name)) between 1 and 160),
  slug                  text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  normalized_name       text        not null,
  website               text,
  logo_url              text,
  investor_type         text,
  -- Maintained by trigger, same contract as the startup counters above.
  published_deal_count  integer     not null default 0,
  published_lead_count  integer     not null default 0,
  last_deal_at          date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.funding_investors enable row level security;

drop policy if exists "funding_investors_select_published" on public.funding_investors;
create policy "funding_investors_select_published"
  on public.funding_investors for select
  using (published_deal_count > 0);

create unique index if not exists funding_investors_slug_key on public.funding_investors (slug);
create unique index if not exists funding_investors_normalized_name_key
  on public.funding_investors (normalized_name);
create index if not exists funding_investors_deals_idx
  on public.funding_investors (published_deal_count desc, last_deal_at desc nulls last)
  where published_deal_count > 0;
create index if not exists funding_investors_name_trgm_idx
  on public.funding_investors using gin (normalized_name extensions.gin_trgm_ops);

drop trigger if exists funding_investors_updated_at on public.funding_investors;
create trigger funding_investors_updated_at
  before update on public.funding_investors
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Articles
-- ---------------------------------------------------------------------------
-- One row per article the ingestion has ever seen, funding-related or not.
-- Keeping the rejected ones is what makes a re-run cheap: an article that was
-- already judged "not a funding story" is recognised by URL and skipped without
-- being parsed, classified or sent anywhere.

create table if not exists public.funding_news (
  id                   uuid primary key default gen_random_uuid(),
  source_id            uuid references public.funding_sources (id) on delete set null,
  -- Denormalised so an article keeps its attribution even if the source row is
  -- later deleted. The card's "Source: Inc42" line reads from here.
  source_name          text        not null,
  url                  text        not null,
  -- THE deduplication key. Lower-cased host, no `www.`, no trailing slash, and
  -- no tracking parameters -- see `normalizeUrl` in lib/funding/normalize.ts.
  -- The unique index below is what makes running ingestion twice a no-op.
  normalized_url       text        not null,
  -- SHA-256 of the normalised title plus the normalised summary. The secondary
  -- check: the same story republished at a second URL (a syndication, an
  -- AMP/canonical split) collides here even though the URLs differ.
  content_hash         text        not null,
  title                text        not null,
  normalized_title     text        not null,
  -- The feed's own snippet. Kept because extraction reads it; never rendered.
  -- What a visitor sees is the summary on `funding_rounds`, which is written
  -- from scratch. Reproducing a publisher's paragraphs is the thing this
  -- feature must not do.
  excerpt              text,
  author               text,
  image_url            text,
  published_at         timestamptz,
  fetched_at           timestamptz not null default now(),
  status               text        not null default 'pending'
                         check (status in ('pending', 'processed', 'published', 'rejected', 'error')),
  -- Set by the cheap keyword classifier before anything expensive runs.
  is_funding_candidate boolean     not null default false,
  rejected_reason      text,
  error                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.funding_news enable row level security;

-- No policy: raw articles are a pipeline artifact, and the public surface is
-- `funding_rounds`. Admins read them through the service role.

create unique index if not exists funding_news_normalized_url_key
  on public.funding_news (normalized_url);

-- Deliberately NOT unique. Two publications writing the same headline about the
-- same round is the case this index exists to *find*, not to refuse -- the brief
-- is explicit that separate coverage of one event is worth keeping. The
-- ingestion queries this, then decides.
create index if not exists funding_news_content_hash_idx on public.funding_news (content_hash);

create index if not exists funding_news_status_idx
  on public.funding_news (status, published_at desc nulls last);
create index if not exists funding_news_source_idx
  on public.funding_news (source_name, published_at desc nulls last);
create index if not exists funding_news_published_idx
  on public.funding_news (published_at desc nulls last);
-- Serves the tertiary duplicate check, which compares a candidate headline
-- against recent ones.
create index if not exists funding_news_title_trgm_idx
  on public.funding_news using gin (normalized_title extensions.gin_trgm_ops);

drop trigger if exists funding_news_updated_at on public.funding_news;
create trigger funding_news_updated_at
  before update on public.funding_news
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Rounds
-- ---------------------------------------------------------------------------
-- The public record. Everything a visitor sees on /funding is a row of this
-- table with `status = 'published'`.

create table if not exists public.funding_rounds (
  id                 uuid primary key default gen_random_uuid(),
  -- The article this was extracted from. `set null` rather than cascade: losing
  -- the article must never silently delete a published round.
  news_id            uuid references public.funding_news (id) on delete set null,
  startup_id         uuid references public.funding_startups (id) on delete set null,
  -- Denormalised name and slug. A round has to render, sort and be searched on
  -- these before it is published, and it is only attached to a startup row when
  -- it is published -- so the join cannot be the source of truth for them.
  startup_name       text        not null check (length(btrim(startup_name)) between 1 and 160),
  startup_slug       text        not null check (startup_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  headline           text        not null check (length(btrim(headline)) between 1 and 300),
  -- 50-80 words, written by the extraction layer from the article's metadata.
  -- Bounded here as well as in code: a "summary" that grew to article length
  -- would be a republication.
  summary            text        check (summary is null or length(summary) <= 900),
  -- The figure exactly as reported, for display: "Rs 25 Cr", "$4 million".
  amount             text,
  -- The same figure as a number, in whole major units of `currency`.
  amount_numeric     bigint      check (amount_numeric is null or amount_numeric >= 0),
  currency           text        check (currency is null or currency in
                       ('INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'JPY', 'AUD', 'CAD')),
  -- For aggregation only, and null whenever the amount is. See the header note.
  amount_inr         bigint      check (amount_inr is null or amount_inr >= 0),
  fx_rate_to_inr     numeric(12, 4) check (fx_rate_to_inr is null or fx_rate_to_inr > 0),
  -- 'Undisclosed' is a real answer here, not a missing one: plenty of rounds are
  -- announced without a stage. Making the column `not null` with that default
  -- means every filter and group-by has something to bite on.
  funding_stage      text        not null default 'Undisclosed' check (funding_stage in (
                       'Bootstrapped', 'Pre-seed', 'Angel', 'Seed', 'Series A', 'Series B',
                       'Series C', 'Series D+', 'Debt', 'Grant', 'Venture Debt',
                       'Acquisition', 'Undisclosed')),
  industry           text,
  sub_industry       text,
  -- As written in the article ("Bengaluru, Karnataka").
  location           text,
  -- The filter bucket that location falls into. Separate because the filter bar
  -- offers nine fixed choices and free text cannot be grouped by.
  city               text,
  -- Denormalised for display and search; `funding_round_investors` is the join
  -- that /funding/investors is built on. Both are written in one transaction by
  -- the publish path.
  investors          text[]      not null default '{}',
  lead_investor      text,
  announcement_date  date        not null,
  source_name        text        not null,
  source_url         text        not null,
  source_published_at timestamptz,
  logo_url           text,
  status             text        not null default 'pending'
                       check (status in ('pending', 'processed', 'published', 'rejected', 'error')),
  is_featured        boolean     not null default false,
  -- Distinct from `rejected`: hidden is "take this off the page now", which an
  -- admin may need to do to a published round in seconds without losing the
  -- record of why it was there.
  is_hidden          boolean     not null default false,
  -- A human checked this against the source. Never set by extraction.
  verified           boolean     not null default false,
  -- How sure the extractor was, 0..1. Internal: the page shows "AI extracted",
  -- not a percentage, because a number invites a precision that is not there.
  confidence_score   numeric(4, 3) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  extraction_method  text        check (extraction_method is null or extraction_method in ('rules', 'ai', 'manual')),
  -- Tertiary dedupe, at the event level: normalised startup + stage + amount
  -- bucket + month. Unique, so two articles about one round cannot both become
  -- a published row. See `fundingEventKey` in lib/funding/normalize.ts.
  event_key          text        not null,
  review_note        text,
  reviewed_by        text,
  reviewed_at        timestamptz,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- One free-text column for the search index to read, maintained by Postgres
  -- so it can never fall behind the row. `array_to_string`, `lower`, `coalesce`
  -- and `||` are all immutable, which is what a stored generated column needs.
  search_text        text generated always as (
                       lower(
                         coalesce(startup_name, '') || ' ' ||
                         coalesce(headline, '') || ' ' ||
                         coalesce(industry, '') || ' ' ||
                         coalesce(sub_industry, '') || ' ' ||
                         coalesce(funding_stage, '') || ' ' ||
                         coalesce(location, '') || ' ' ||
                         coalesce(city, '') || ' ' ||
                         coalesce(lead_investor, '') || ' ' ||
                         array_to_string(investors, ' ')
                       )
                     ) stored
);

alter table public.funding_rounds enable row level security;

-- THE policy. Published and not hidden, for anon and authenticated alike --
-- there is no signed-in view of this dataset, so there is nothing for an
-- identity to widen. A pending round is unreachable with the anon key no matter
-- what a request asks for.
drop policy if exists "funding_rounds_select_published" on public.funding_rounds;
create policy "funding_rounds_select_published"
  on public.funding_rounds for select
  using (status = 'published' and not is_hidden);

create unique index if not exists funding_rounds_event_key
  on public.funding_rounds (event_key);

-- The feed's own query: newest published first.
create index if not exists funding_rounds_published_idx
  on public.funding_rounds (announcement_date desc, created_at desc)
  where status = 'published' and not is_hidden;

-- The filter columns, each indexed against the same published predicate so a
-- filtered feed never falls back to a sequential scan.
create index if not exists funding_rounds_stage_idx
  on public.funding_rounds (funding_stage, announcement_date desc)
  where status = 'published' and not is_hidden;
create index if not exists funding_rounds_industry_idx
  on public.funding_rounds (industry, announcement_date desc)
  where status = 'published' and not is_hidden;
create index if not exists funding_rounds_city_idx
  on public.funding_rounds (city, announcement_date desc)
  where status = 'published' and not is_hidden;
create index if not exists funding_rounds_amount_idx
  on public.funding_rounds (amount_inr desc nulls last)
  where status = 'published' and not is_hidden;
create index if not exists funding_rounds_startup_idx
  on public.funding_rounds (startup_id, announcement_date desc);
create index if not exists funding_rounds_startup_slug_idx
  on public.funding_rounds (startup_slug, announcement_date desc);
create index if not exists funding_rounds_source_idx
  on public.funding_rounds (source_name, announcement_date desc);
create index if not exists funding_rounds_announcement_date_idx
  on public.funding_rounds (announcement_date desc);
create index if not exists funding_rounds_startup_name_idx
  on public.funding_rounds (lower(startup_name));
-- The admin queue: oldest pending first, same fairness argument as the launch
-- review queue in services/admin.ts.
create index if not exists funding_rounds_pending_idx
  on public.funding_rounds (created_at)
  where status in ('pending', 'processed', 'error');
create index if not exists funding_rounds_featured_idx
  on public.funding_rounds (announcement_date desc)
  where status = 'published' and not is_hidden and is_featured;
-- Free-text search, over the generated column above.
create index if not exists funding_rounds_search_trgm_idx
  on public.funding_rounds using gin (search_text extensions.gin_trgm_ops);
-- "Rounds this investor is in", straight off the denormalised array.
create index if not exists funding_rounds_investors_idx
  on public.funding_rounds using gin (investors);

drop trigger if exists funding_rounds_updated_at on public.funding_rounds;
create trigger funding_rounds_updated_at
  before update on public.funding_rounds
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Round <-> investor, and round <-> extra coverage
-- ---------------------------------------------------------------------------

create table if not exists public.funding_round_investors (
  round_id    uuid not null references public.funding_rounds (id) on delete cascade,
  investor_id uuid not null references public.funding_investors (id) on delete cascade,
  is_lead     boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (round_id, investor_id)
);

alter table public.funding_round_investors enable row level security;

-- Visible exactly when its round is. Written as an EXISTS against the rounds
-- table so the rule lives in one place: widening `funding_rounds` later cannot
-- leave this table behind, and narrowing it cannot leak through here.
drop policy if exists "funding_round_investors_select_published" on public.funding_round_investors;
create policy "funding_round_investors_select_published"
  on public.funding_round_investors for select
  using (
    exists (
      select 1 from public.funding_rounds r
      where r.id = round_id and r.status = 'published' and not r.is_hidden
    )
  );

create index if not exists funding_round_investors_investor_idx
  on public.funding_round_investors (investor_id, is_lead);

-- The second, third and fourth publication to cover one round. Kept so a round
-- can say "also covered by" rather than pretending one outlet reported it.
create table if not exists public.funding_round_articles (
  round_id   uuid not null references public.funding_rounds (id) on delete cascade,
  news_id    uuid not null references public.funding_news (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, news_id)
);

alter table public.funding_round_articles enable row level security;

drop policy if exists "funding_round_articles_select_published" on public.funding_round_articles;
create policy "funding_round_articles_select_published"
  on public.funding_round_articles for select
  using (
    exists (
      select 1 from public.funding_rounds r
      where r.id = round_id and r.status = 'published' and not r.is_hidden
    )
  );

create index if not exists funding_round_articles_news_idx
  on public.funding_round_articles (news_id);

-- ---------------------------------------------------------------------------
-- 7. Keeping the rollups honest
-- ---------------------------------------------------------------------------
-- Both counters are also RLS predicates (sections 2 and 3), so "recompute" is
-- the only safe implementation: an increment/decrement that missed an edge --
-- a round moving between two startups, a publish followed by a hide -- would
-- either hide a company that has rounds or expose one that does not.
--
-- Cost is bounded: a startup has a handful of rounds, an investor tens.

create or replace function public.funding_refresh_startup_stats(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.funding_startups s
  set published_round_count = coalesce(agg.n, 0),
      total_disclosed_inr   = coalesce(agg.total, 0),
      first_round_at        = agg.first_at,
      last_round_at         = agg.last_at
  from (
    select count(*)                  as n,
           sum(coalesce(r.amount_inr, 0)) as total,
           min(r.announcement_date)   as first_at,
           max(r.announcement_date)   as last_at
    from public.funding_rounds r
    where r.startup_id = target
      and r.status = 'published'
      and not r.is_hidden
  ) agg
  where s.id = target;
$$;

create or replace function public.funding_refresh_investor_stats(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.funding_investors i
  set published_deal_count = coalesce(agg.n, 0),
      published_lead_count = coalesce(agg.leads, 0),
      last_deal_at         = agg.last_at
  from (
    select count(*)                                     as n,
           count(*) filter (where ri.is_lead)           as leads,
           max(r.announcement_date)                     as last_at
    from public.funding_round_investors ri
    join public.funding_rounds r on r.id = ri.round_id
    where ri.investor_id = target
      and r.status = 'published'
      and not r.is_hidden
  ) agg
  where i.id = target;
$$;

-- Fires on every round write, and refreshes both sides. `security definer` on
-- the two helpers above is what lets this run under the service role that wrote
-- the round without needing its own policies.
create or replace function public.funding_rounds_sync_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  investor uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.startup_id is not null then
    perform public.funding_refresh_startup_stats(old.startup_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.startup_id is not null then
    perform public.funding_refresh_startup_stats(new.startup_id);
  end if;

  -- Publishing a round changes the deal count of every investor in it, so the
  -- join rows have to be walked even though none of them changed.
  for investor in
    select ri.investor_id
    from public.funding_round_investors ri
    where ri.round_id = coalesce(new.id, old.id)
  loop
    perform public.funding_refresh_investor_stats(investor);
  end loop;

  return null;
end;
$$;

drop trigger if exists funding_rounds_sync_stats on public.funding_rounds;
create trigger funding_rounds_sync_stats
  after insert or update or delete on public.funding_rounds
  for each row execute function public.funding_rounds_sync_stats();

create or replace function public.funding_round_investors_sync_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.funding_refresh_investor_stats(old.investor_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.funding_refresh_investor_stats(new.investor_id);
  end if;
  return null;
end;
$$;

drop trigger if exists funding_round_investors_sync_stats on public.funding_round_investors;
create trigger funding_round_investors_sync_stats
  after insert or update or delete on public.funding_round_investors
  for each row execute function public.funding_round_investors_sync_stats();

-- ---------------------------------------------------------------------------
-- 8. Observability
-- ---------------------------------------------------------------------------
-- One row per source per run. `run_id` groups them, so the admin screen can
-- show "the last run" as a single line and still drill into which feed failed.

create table if not exists public.funding_ingestion_logs (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid        not null,
  source_id        uuid references public.funding_sources (id) on delete set null,
  source_name      text        not null,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  duration_ms      integer     check (duration_ms is null or duration_ms >= 0),
  articles_fetched integer     not null default 0,
  articles_created integer     not null default 0,
  duplicates       integer     not null default 0,
  rounds_created   integer     not null default 0,
  rejected         integer     not null default 0,
  errors           integer     not null default 0,
  error_detail     text,
  ok               boolean     not null default false,
  -- 'cron' | 'admin' | 'manual' -- who asked for this run.
  trigger_source   text        not null default 'cron',
  created_at       timestamptz not null default now()
);

alter table public.funding_ingestion_logs enable row level security;

-- No policy. Failure detail can quote an upstream URL or error body; admins
-- read it through the service role.

create index if not exists funding_ingestion_logs_run_idx
  on public.funding_ingestion_logs (run_id, started_at desc);
create index if not exists funding_ingestion_logs_recent_idx
  on public.funding_ingestion_logs (started_at desc);
create index if not exists funding_ingestion_logs_source_idx
  on public.funding_ingestion_logs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 9. Alerts (schema only)
-- ---------------------------------------------------------------------------
-- Section 18 of the brief: architect for alerts, do not build the delivery.
-- This is the whole architecture -- a row is one saved filter, and every field
-- it can carry is a field /funding already filters on, so a future job is a
-- query this schema can already answer.
--
-- Nothing sends anything yet. `last_notified_at` exists so that when something
-- does, it has a watermark to work from rather than re-notifying a backlog.

create table if not exists public.funding_alert_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        text        not null references public.profiles (id) on delete cascade,
  label          text        check (label is null or length(label) <= 120),
  industry       text,
  funding_stage  text,
  city           text,
  investor       text,
  min_amount_inr bigint      check (min_amount_inr is null or min_amount_inr >= 0),
  channel        text        not null default 'email' check (channel in ('email', 'none')),
  is_active      boolean     not null default true,
  last_notified_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A subscription that filters on nothing is a subscription to everything,
  -- which is a mailing list rather than an alert.
  constraint funding_alert_has_criteria check (
    coalesce(industry, funding_stage, city, investor) is not null
    or min_amount_inr is not null
  )
);

alter table public.funding_alert_subscriptions enable row level security;

-- The one table here a user may write, and the exception is narrow: every
-- column is a preference of theirs, and none of them is privileged. Shaped like
-- the `bookmarks` policies in 20260721010000.
drop policy if exists "funding_alerts_select_own" on public.funding_alert_subscriptions;
create policy "funding_alerts_select_own"
  on public.funding_alert_subscriptions for select
  using (public.requesting_user_id() = user_id);

drop policy if exists "funding_alerts_insert_own" on public.funding_alert_subscriptions;
create policy "funding_alerts_insert_own"
  on public.funding_alert_subscriptions for insert
  with check (public.requesting_user_id() = user_id);

drop policy if exists "funding_alerts_delete_own" on public.funding_alert_subscriptions;
create policy "funding_alerts_delete_own"
  on public.funding_alert_subscriptions for delete
  using (public.requesting_user_id() = user_id);

create index if not exists funding_alert_subscriptions_user_idx
  on public.funding_alert_subscriptions (user_id, created_at desc);
create index if not exists funding_alert_subscriptions_active_idx
  on public.funding_alert_subscriptions (is_active)
  where is_active;

drop trigger if exists funding_alert_subscriptions_updated_at on public.funding_alert_subscriptions;
create trigger funding_alert_subscriptions_updated_at
  before update on public.funding_alert_subscriptions
  for each row execute function public.update_updated_at();
