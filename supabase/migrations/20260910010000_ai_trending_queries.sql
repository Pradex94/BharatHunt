-- The read side of AI Trending: the feed, the two "what is rising" rollups, and
-- the freshness stamp the hero prints.
--
-- Why these are functions and not PostgREST queries
-- -------------------------------------------------
-- Section 8 of the brief is explicit that search must not work by shipping the
-- dataset to the browser, and the same argument applies one layer in. The feed
-- filters on a category set, a region and a free-text query at once, ranks by a
-- score or by recency, and needs a total count for pagination. Through
-- PostgREST that is an `.or()` string plus a second round trip for the count.
-- Here it is one call, one plan, and every predicate lands on an index from
-- 20260910000000.
--
-- The rollups have a second reason: sections 18 and 19 ask for a *change*
-- ("↑ 32%"), which is two windowed counts compared. That comparison has to
-- happen where the rows are.
--
-- Only one of these is `security definer`
-- ---------------------------------------
-- `ai_story_search`, `ai_trending_topics` and `ai_trending_entities` all run as
-- the caller, so the RLS policies on `ai_stories` and `ai_story_entities` are
-- what decide which rows they see -- exactly as those policies decide it for a
-- direct select. A pending story is unreachable through these functions for the
-- same reason it is unreachable without them, and a later narrowing of the
-- policy cannot be defeated by a function that quietly carried more privilege
-- than the table.
--
-- `ai_news_freshness` is the exception, and it is the smallest one available:
-- `ai_ingestion_runs` has no read policy at all because it is an operational
-- log, but "when did this page last update" is a fact a visitor is entitled to
-- and is the only honest way to render section 30's "Updated 4 minutes ago".
-- So the function returns four timestamps and two counts and cannot be asked
-- for anything else.
--
-- Idempotent: `create or replace` throughout, with a `drop` first wherever the
-- signature may have changed.

-- ---------------------------------------------------------------------------
-- 1. The feed
-- ---------------------------------------------------------------------------
-- Every filter is null-tolerant: a null argument means "no constraint", so the
-- unfiltered feed and the fully filtered feed are the same plan with more of
-- the predicates satisfied trivially. That is what makes filters compose -- the
-- combination is not special-cased anywhere, it is just what a conjunction
-- does.

drop function if exists public.ai_story_search(text, text[], text, text, integer, integer);

create or replace function public.ai_story_search(
  search_query    text    default null,
  category_filter text[]  default null,
  region_filter   text    default null,
  sort_mode       text    default 'trending',
  page_limit      integer default 12,
  page_offset     integer default 0
)
returns table (
  id               uuid,
  slug             text,
  title            text,
  summary          text,
  category         text,
  sub_category     text,
  region           text,
  trend_score      numeric,
  source_count     integer,
  article_count    integer,
  view_count       integer,
  first_seen_at    timestamptz,
  last_seen_at     timestamptz,
  top_source_name  text,
  top_source_url   text,
  image_url        text,
  featured         boolean,
  total_count      bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
-- Every output column above is also a variable in this scope; `use_column`
-- resolves the ambiguity toward the table, and the body qualifies its
-- references anyway. The same guard `search_products` uses (20260809120000).
#variable_conflict use_column
declare
  nq      text := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  -- One `%token%` per word, ANDed. "open source ai" then matches a story whose
  -- title says "open-source" and whose summary says "AI" -- a single
  -- `%open source ai%` would require those three words adjacent and in order,
  -- which is not what anyone typing them means. Capped at six tokens: past that
  -- the query is not a search, and each one costs an index probe.
  q_likes text[];
  -- A bound, not a preference: `page_limit` arrives from a URL, and an
  -- unbounded one is a way to ask for the whole table in a single request.
  lim     integer := least(greatest(coalesce(page_limit, 12), 1), 48);
  off     integer := greatest(coalesce(page_offset, 0), 0);
  mode    text    := coalesce(pg_catalog.nullif(pg_catalog.btrim(sort_mode), ''), 'trending');
  reg     text    := pg_catalog.nullif(pg_catalog.btrim(coalesce(region_filter, '')), '');
begin
  if nq <> '' then
    select pg_catalog.array_agg('%' || t || '%')
    into q_likes
    from (
      select t
      from pg_catalog.regexp_split_to_table(nq, '\s+') as t
      where pg_catalog.length(t) >= 2
      limit 6
    ) tokens;
  end if;

  return query
  with filtered as (
    select s.*
    from public.ai_stories s
    where s.status = 'published'
      and not s.is_hidden
      -- One LIKE per token against the stored generated column, served by the
      -- trigram GIN index. "Gemini", "AI agents", "funding" and "Sam Altman"
      -- are all the same query because they are all in `search_text`.
      and (q_likes is null or s.search_text like all (q_likes))
      and (category_filter is null
           or pg_catalog.array_length(category_filter, 1) is null
           or s.category = any (category_filter))
      and (reg is null or s.region = reg)
  )
  select f.id,
         f.slug,
         f.title,
         f.summary,
         f.category,
         f.sub_category,
         f.region,
         f.trend_score,
         f.source_count,
         f.article_count,
         f.view_count,
         f.first_seen_at,
         f.last_seen_at,
         f.top_source_name,
         f.top_source_url,
         f.image_url,
         f.featured,
         pg_catalog.count(*) over () as total_count
  from filtered f
  order by
    -- Relevance only exists when something was typed. Ranking by trigram
    -- similarity against the whole search column, so a story whose *title* is
    -- the query outranks one that mentions it once in a summary.
    case when mode = 'relevance' and nq <> ''
         then extensions.similarity(f.search_text, nq) end desc nulls last,
    -- "Latest" is a different question from "trending" and must not be
    -- contaminated by the score.
    case when mode = 'latest' then f.last_seen_at end desc nulls last,
    case when mode = 'trending' then f.trend_score end desc nulls last,
    -- The tie-break, and the whole ordering for any unrecognised mode: newest
    -- coverage first. Never random, so pagination is stable between pages.
    f.last_seen_at desc nulls last,
    f.id
  limit lim offset off;
end;
$$;

comment on function public.ai_story_search(text, text[], text, text, integer, integer) is
  'AI Trending feed: free-text + category + region filters, one plan, with a windowed total for pagination. Runs as the caller, so RLS decides visibility.';

-- ---------------------------------------------------------------------------
-- 2. Trending topics (section 19)
-- ---------------------------------------------------------------------------
-- Two counts per category -- the last `window_hours`, and the `window_hours`
-- before that -- and the change between them.
--
-- The honesty rule is `min_prior`. A category that went from 1 story to 2 has
-- "risen 100%", which is a true arithmetic statement and a worthless one, and
-- printing it would be exactly the fabricated percentage section 19 warns
-- against. Below the threshold `change_pct` comes back NULL and the UI prints
-- the count on its own. A brand-new category (prior = 0) is also NULL rather
-- than infinity.

drop function if exists public.ai_trending_topics(integer, integer, integer);

create or replace function public.ai_trending_topics(
  window_hours integer default 24,
  min_prior    integer default 3,
  row_limit    integer default 8
)
returns table (
  category      text,
  current_count bigint,
  prior_count   bigint,
  change_pct    numeric
)
language sql
stable
parallel safe
set search_path = ''
as $$
  with bounds as (
    select now() - pg_catalog.make_interval(hours => least(greatest(coalesce(window_hours, 24), 1), 168)) as cur_start,
           now() - pg_catalog.make_interval(hours => 2 * least(greatest(coalesce(window_hours, 24), 1), 168)) as prev_start
  ),
  counted as (
    select s.category,
           pg_catalog.count(*) filter (where s.last_seen_at >= b.cur_start)  as current_count,
           pg_catalog.count(*) filter (where s.last_seen_at >= b.prev_start
                                         and s.last_seen_at <  b.cur_start)  as prior_count
    from public.ai_stories s
    cross join bounds b
    where s.status = 'published'
      and not s.is_hidden
      and s.last_seen_at >= b.prev_start
    group by s.category
  )
  select c.category,
         c.current_count,
         c.prior_count,
         case
           when c.prior_count >= greatest(coalesce(min_prior, 3), 1)
             then pg_catalog.round(((c.current_count - c.prior_count)::numeric / c.prior_count) * 100, 0)
           else null
         end as change_pct
  from counted c
  where c.current_count > 0
  order by c.current_count desc, c.category
  limit least(greatest(coalesce(row_limit, 8), 1), 30);
$$;

comment on function public.ai_trending_topics(integer, integer, integer) is
  'Story counts per category for the last window vs the window before it. change_pct is NULL when the prior window is too small for a percentage to mean anything.';

-- ---------------------------------------------------------------------------
-- 3. Trending entities (sections 17 and 18)
-- ---------------------------------------------------------------------------
-- "AI Companies Making Noise", and the same machinery for models, people and
-- tools. Same two-window comparison and the same `min_prior` honesty rule as
-- topics, plus the entity's most recent story so the card can link somewhere.

drop function if exists public.ai_trending_entities(text, integer, integer, integer);

create or replace function public.ai_trending_entities(
  type_filter  text    default 'company',
  window_hours integer default 72,
  min_prior    integer default 2,
  row_limit    integer default 6
)
returns table (
  id                 uuid,
  name               text,
  slug               text,
  entity_type        text,
  website            text,
  current_count      bigint,
  prior_count        bigint,
  change_pct         numeric,
  mentions           bigint,
  latest_story_title text,
  latest_story_slug  text,
  latest_seen_at     timestamptz
)
language sql
stable
parallel safe
set search_path = ''
as $$
  with bounds as (
    select now() - pg_catalog.make_interval(hours => least(greatest(coalesce(window_hours, 72), 1), 720)) as cur_start,
           now() - pg_catalog.make_interval(hours => 2 * least(greatest(coalesce(window_hours, 72), 1), 720)) as prev_start
  ),
  linked as (
    select e.id,
           e.name,
           e.slug,
           e.entity_type,
           e.website,
           se.mentions,
           s.title      as story_title,
           s.slug       as story_slug,
           s.last_seen_at,
           b.cur_start
    from public.ai_story_entities se
    join public.ai_entities e on e.id = se.entity_id
    join public.ai_stories  s on s.id = se.story_id
    cross join bounds b
    where s.status = 'published'
      and not s.is_hidden
      and s.last_seen_at >= b.prev_start
      and (type_filter is null or e.entity_type = type_filter)
  ),
  counted as (
    select l.id,
           l.name,
           l.slug,
           l.entity_type,
           l.website,
           pg_catalog.count(*) filter (where l.last_seen_at >= l.cur_start) as current_count,
           pg_catalog.count(*) filter (where l.last_seen_at <  l.cur_start) as prior_count,
           pg_catalog.sum(l.mentions) filter (where l.last_seen_at >= l.cur_start) as mentions,
           pg_catalog.max(l.last_seen_at) as latest_seen_at
    from linked l
    group by l.id, l.name, l.slug, l.entity_type, l.website
  )
  select c.id,
         c.name,
         c.slug,
         c.entity_type,
         c.website,
         c.current_count,
         c.prior_count,
         case
           when c.prior_count >= greatest(coalesce(min_prior, 2), 1)
             then pg_catalog.round(((c.current_count - c.prior_count)::numeric / c.prior_count) * 100, 0)
           else null
         end as change_pct,
         coalesce(c.mentions, 0) as mentions,
         -- The entity's newest story, resolved per row rather than joined --
         -- a lateral keeps the group-by above from having to carry the title.
         latest.story_title,
         latest.story_slug,
         c.latest_seen_at
  from counted c
  left join lateral (
    select l.story_title, l.story_slug
    from linked l
    where l.id = c.id
    order by l.last_seen_at desc nulls last
    limit 1
  ) latest on true
  where c.current_count > 0
  order by c.current_count desc, c.mentions desc nulls last, c.name
  limit least(greatest(coalesce(row_limit, 6), 1), 30);
$$;

comment on function public.ai_trending_entities(text, integer, integer, integer) is
  'Companies/models/people/tools by published-story coverage in the last window vs the one before. change_pct is NULL below min_prior.';

-- ---------------------------------------------------------------------------
-- 4. Freshness (section 30)
-- ---------------------------------------------------------------------------
-- What the hero prints, and what decides whether it prints anything at all.
-- Three different clocks, because they answer three different questions and
-- conflating them is how a page ends up claiming to be live when it is not:
--
--   last_attempt_at  -- when ingestion last ran, successfully or otherwise
--   last_success_at  -- when it last actually completed
--   last_story_at    -- when the newest published story was last covered
--
-- The hero shows `last_success_at` as "Updated N ago" and says nothing about
-- being live, because this pipeline is a scheduled poll and calling it
-- real-time would be a lie about the underlying sources. When `last_success_at`
-- is older than the staleness threshold the UI switches to the "ingestion
-- temporarily unavailable" state from section 31 instead of quietly ageing.

drop function if exists public.ai_news_freshness();

create or replace function public.ai_news_freshness()
returns table (
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_story_at   timestamptz,
  stories_24h     bigint,
  published_total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select pg_catalog.max(r.started_at) from public.ai_ingestion_runs r),
    (select pg_catalog.max(r.finished_at) from public.ai_ingestion_runs r
      where r.status in ('ok', 'partial')),
    (select pg_catalog.max(s.last_seen_at) from public.ai_stories s
      where s.status = 'published' and not s.is_hidden),
    (select pg_catalog.count(*) from public.ai_stories s
      where s.status = 'published' and not s.is_hidden
        and s.last_seen_at >= now() - interval '24 hours'),
    (select pg_catalog.count(*) from public.ai_stories s
      where s.status = 'published' and not s.is_hidden);
$$;

comment on function public.ai_news_freshness() is
  'Timestamps and counts for the /ai freshness line. SECURITY DEFINER only because ai_ingestion_runs is otherwise unreadable; returns nothing else from it.';

-- ---------------------------------------------------------------------------
-- 5. Applying a batch of trend scores
-- ---------------------------------------------------------------------------
-- The write side of `recomputeTrendScores` in lib/ai-news/ingest.ts, and the
-- only write function in this feature.
--
-- It exists because the alternative is worse in two different ways. A per-story
-- `update` is one HTTP round trip each, and a run rescores every story covered
-- in the last week — hundreds of requests inside a cron invocation that has a
-- few seconds to spare. A PostgREST `upsert` cannot be used instead, because an
-- upsert is an INSERT first and `ai_stories` has four NOT NULL columns the
-- caller would then have to resend for every row just to update a score.
--
-- So: one call, one statement, an array of {id, trend_score, …} objects.
--
-- NOT security definer, and explicitly revoked from anon and authenticated. The
-- ingestion runs on the service-role client, which bypasses RLS anyway, so this
-- function needs no privilege of its own — and a score-writing function that
-- anyone with the public anon key could call is precisely the "credibility
-- risk" the schema header describes.

drop function if exists public.ai_apply_trend_scores(jsonb);

create or replace function public.ai_apply_trend_scores(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer;
begin
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'array' then
    return 0;
  end if;

  with scores as (
    select *
    from pg_catalog.jsonb_to_recordset(payload) as x(
      id               uuid,
      trend_score      numeric,
      recency_score    numeric,
      velocity_score   numeric,
      engagement_score numeric,
      authority_score  numeric
    )
  )
  update public.ai_stories s
  set trend_score      = x.trend_score,
      recency_score    = x.recency_score,
      velocity_score   = x.velocity_score,
      engagement_score = x.engagement_score,
      authority_score  = x.authority_score
  from scores x
  where s.id = x.id
    -- Skip the write when nothing moved. Every one of these rows has an
    -- `updated_at` trigger on it, so an unconditional update would restamp the
    -- whole recent archive on every run and make `updated_at` useless as a
    -- change signal.
    and (s.trend_score      is distinct from x.trend_score
      or s.recency_score    is distinct from x.recency_score
      or s.velocity_score   is distinct from x.velocity_score
      or s.engagement_score is distinct from x.engagement_score
      or s.authority_score  is distinct from x.authority_score);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.ai_apply_trend_scores(jsonb) from public, anon, authenticated;

comment on function public.ai_apply_trend_scores(jsonb) is
  'Batch-writes recomputed BharatHunt Trend Scores. Service-role only: revoked from anon and authenticated.';

-- The three caller-privileged read functions need no grant beyond the default,
-- but the definer one is stated explicitly so a later `revoke all on functions`
-- hardening pass has something to re-grant rather than something to guess at.
grant execute on function public.ai_news_freshness() to anon, authenticated;
