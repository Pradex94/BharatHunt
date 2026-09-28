-- The AI Intelligence Hub: three more feed filters, and the numbers behind the
-- "AI Pulse" strip on /ai.
--
-- What changes
-- ------------
-- 1. `ai_story_search` gains three optional arguments -- a date window, a
--    company (entity slug) and a publication -- and is otherwise
--    20260910030000 verbatim, so the two can be diffed.
-- 2. `ai_hub_pulse()` returns the page's headline counts in one call.
-- 3. `ai_active_sources()` lists the publications behind recent stories, which
--    is both the Source filter's options and a transparency fact in itself.
--
-- All three run as the caller. RLS on `ai_stories`, `ai_story_entities` and
-- `ai_news_articles` already decides what an anonymous visitor may see, and a
-- rollup that carried more privilege than the tables it reads would be a way
-- around those policies.
--
-- Deploy order does not matter
-- ----------------------------
-- `services/ai-news.ts` only passes the new arguments when a visitor has set
-- one of the new filters, so the old six-argument call keeps working against
-- this function (the new arguments default to null), and the new code keeps
-- working against the old function until a new filter is used. The pulse and
-- sources calls fall back to what `ai_news_freshness()` already provides.
--
-- NULLIF / COALESCE / LEAST / GREATEST are grammar, not functions: never
-- schema-qualify them (see 20260910030000 for what that cost last time).

-- ---------------------------------------------------------------------------
-- 1. The feed, with date / company / source filters
-- ---------------------------------------------------------------------------

drop function if exists public.ai_story_search(text, text[], text, text, integer, integer);
drop function if exists public.ai_story_search(text, text[], text, text, integer, integer, integer, text, text);

create or replace function public.ai_story_search(
  search_query    text    default null,
  category_filter text[]  default null,
  region_filter   text    default null,
  sort_mode       text    default 'trending',
  page_limit      integer default 12,
  page_offset     integer default 0,
  since_hours     integer default null,
  entity_filter   text    default null,
  source_filter   text    default null
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
#variable_conflict use_column
declare
  nq      text := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  q_likes text[];
  lim     integer := least(greatest(coalesce(page_limit, 12), 1), 48);
  off     integer := greatest(coalesce(page_offset, 0), 0);
  mode    text    := coalesce(nullif(pg_catalog.btrim(sort_mode), ''), 'trending');
  reg     text    := nullif(pg_catalog.btrim(coalesce(region_filter, '')), '');
  -- A year is the widest window the UI offers anything close to; the bound is
  -- here because the value arrives from a URL.
  since   timestamptz := case
                           when since_hours is null then null
                           else now() - pg_catalog.make_interval(hours => least(greatest(since_hours, 1), 8760))
                         end;
  ent     text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(entity_filter, ''))), '');
  src     text := nullif(pg_catalog.btrim(coalesce(source_filter, '')), '');
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
      and (q_likes is null or s.search_text like all (q_likes))
      and (category_filter is null
           or pg_catalog.array_length(category_filter, 1) is null
           or s.category = any (category_filter))
      and (reg is null or s.region = reg)
      and (since is null or s.last_seen_at >= since)
      -- A company filter is an entity *slug*, matched through the link table,
      -- so "OpenAI" finds every story the pipeline tied to OpenAI rather than
      -- every story whose text happens to contain the letters.
      and (ent is null or exists (
            select 1
            from public.ai_story_entities se
            join public.ai_entities e on e.id = se.entity_id
            where se.story_id = s.id and e.slug = ent
          ))
      -- Any article in the story, not only the top one: "stories TechCrunch
      -- covered" includes the ones where somebody else was the lead source.
      and (src is null or exists (
            select 1
            from public.ai_news_articles a
            where a.story_id = s.id
              and a.status <> 'rejected'
              and a.source_name = src
          ))
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
    case when mode = 'relevance' and nq <> ''
         then extensions.similarity(f.search_text, nq) end desc nulls last,
    case when mode = 'latest' then f.last_seen_at end desc nulls last,
    case when mode = 'trending' then f.trend_score end desc nulls last,
    f.last_seen_at desc nulls last,
    f.id
  limit lim offset off;
end;
$$;

comment on function public.ai_story_search(text, text[], text, text, integer, integer, integer, text, text) is
  'AI Trending feed: free-text, category, region, date-window, company and source filters in one plan, with a windowed total for pagination. Runs as the caller, so RLS decides visibility.';

-- ---------------------------------------------------------------------------
-- 2. AI Pulse
-- ---------------------------------------------------------------------------
-- Every number is a count of published rows. Each one names its window in the
-- column, and the UI prints that window next to the number -- "42 companies"
-- with no window would be a claim about all time that nobody could check.

drop function if exists public.ai_hub_pulse();

create or replace function public.ai_hub_pulse()
returns table (
  stories_24h      bigint,
  multi_source_24h bigint,
  sources_24h      bigint,
  topics_24h       bigint,
  companies_7d     bigint,
  models_7d        bigint,
  tools_7d         bigint
)
language sql
stable
parallel safe
set search_path = ''
as $$
  with recent as (
    select s.id, s.category, s.source_count
    from public.ai_stories s
    where s.status = 'published'
      and not s.is_hidden
      and s.last_seen_at >= now() - interval '24 hours'
  ),
  week_entities as (
    select e.id, e.entity_type
    from public.ai_story_entities se
    join public.ai_entities e on e.id = se.entity_id
    join public.ai_stories s on s.id = se.story_id
    where s.status = 'published'
      and not s.is_hidden
      and s.last_seen_at >= now() - interval '7 days'
  )
  select
    (select pg_catalog.count(*) from recent),
    (select pg_catalog.count(*) from recent where source_count >= 2),
    (select pg_catalog.count(distinct a.source_name)
       from public.ai_news_articles a
       join recent r on r.id = a.story_id
      where a.status <> 'rejected'),
    (select pg_catalog.count(distinct category) from recent),
    (select pg_catalog.count(distinct id) from week_entities where entity_type = 'company'),
    (select pg_catalog.count(distinct id) from week_entities where entity_type = 'model'),
    (select pg_catalog.count(distinct id) from week_entities where entity_type = 'tool');
$$;

comment on function public.ai_hub_pulse() is
  'Headline counts for /ai: published stories, multi-source stories, publications and categories in the last 24h; distinct companies, models and tools named in the last 7 days.';

-- ---------------------------------------------------------------------------
-- 3. The publications behind recent stories
-- ---------------------------------------------------------------------------

drop function if exists public.ai_active_sources(integer, integer);

create or replace function public.ai_active_sources(
  window_hours integer default 720,
  row_limit    integer default 40
)
returns table (
  source_name text,
  story_count bigint
)
language sql
stable
parallel safe
set search_path = ''
as $$
  select a.source_name,
         pg_catalog.count(distinct a.story_id) as story_count
  from public.ai_news_articles a
  join public.ai_stories s on s.id = a.story_id
  where s.status = 'published'
    and not s.is_hidden
    and a.status <> 'rejected'
    and s.last_seen_at >= now() - pg_catalog.make_interval(hours => least(greatest(coalesce(window_hours, 720), 1), 8760))
  group by a.source_name
  order by story_count desc, a.source_name
  limit least(greatest(coalesce(row_limit, 40), 1), 100);
$$;

comment on function public.ai_active_sources(integer, integer) is
  'Publications with published AI stories in the window, by story count. Feeds the /ai Source filter.';
