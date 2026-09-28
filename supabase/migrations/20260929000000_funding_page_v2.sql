-- Funding Intelligence, page v2: three reads the redesigned /funding needs and
-- the anon key could not previously answer.
--
--   1. `funding_search` gains a `smallest` sort and returns `confidence_score`.
--      The return type changes, so the function is dropped and recreated rather
--      than replaced. Its arguments are unchanged; every existing call site
--      keeps working, and the new column is read as optional by the app.
--
--   2. `funding_round_coverage(round_ids)` -- the other publications that
--      reported a round. Ingestion already folds duplicate articles into one
--      canonical round and records the extra coverage in
--      `funding_round_articles`, but the URLs live on `funding_news`, which has
--      no public policy (raw articles are a pipeline artifact). This exposes
--      exactly three columns of it -- outlet, link, date -- and only for rounds
--      the caller could already see. The excerpt and the publisher's own title
--      stay private.
--
--   3. `funding_last_sync()` -- when ingestion last completed a run. The page
--      used to show the newest *article's* publication time and call it "Last
--      updated"; that is the right figure for "latest round", but it cannot say
--      when we last checked. The logs table has no public policy either, since
--      failure detail can quote upstream bodies, so this returns one timestamp
--      and nothing else.
--
-- (2) and (3) are `security definer` because the rows they read are not public;
-- each one re-applies the published-and-not-hidden rule itself and returns only
-- the columns listed above. `search_path = ''` and fully-qualified names, as
-- everywhere else.
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. The feed, with a smallest-first sort and the extraction confidence
-- ---------------------------------------------------------------------------

drop function if exists public.funding_search(text, text[], text[], text[], text, bigint, date, text, integer, integer);

create function public.funding_search(
  search_query    text    default null,
  stage_filter    text[]  default null,
  industry_filter text[]  default null,
  city_filter     text[]  default null,
  investor_filter text    default null,
  min_amount      bigint  default null,
  since_date      date    default null,
  sort_mode       text    default 'recent',
  page_limit      integer default 20,
  page_offset     integer default 0
)
returns table (
  id                  uuid,
  startup_name        text,
  startup_slug        text,
  headline            text,
  summary             text,
  amount              text,
  amount_numeric      bigint,
  currency            text,
  amount_inr          bigint,
  funding_stage       text,
  industry            text,
  sub_industry        text,
  location            text,
  city                text,
  investors           text[],
  lead_investor       text,
  announcement_date   date,
  source_name         text,
  source_url          text,
  source_published_at timestamptz,
  logo_url            text,
  verified            boolean,
  extraction_method   text,
  is_featured         boolean,
  confidence_score    numeric,
  total_count         bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
#variable_conflict use_column
declare
  nq       text := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  q_like   text;
  inv_like text;
  lim      integer := least(greatest(coalesce(page_limit, 20), 1), 60);
  off      integer := greatest(coalesce(page_offset, 0), 0);
begin
  q_like   := case when nq = '' then null else '%' || nq || '%' end;
  inv_like := case
                when coalesce(pg_catalog.btrim(investor_filter), '') = '' then null
                else '%' || pg_catalog.lower(pg_catalog.btrim(investor_filter)) || '%'
              end;

  return query
  with filtered as (
    select r.*
    from public.funding_rounds r
    where r.status = 'published'
      and not r.is_hidden
      and (q_like is null or r.search_text like q_like)
      and (stage_filter is null or pg_catalog.array_length(stage_filter, 1) is null
           or r.funding_stage = any (stage_filter))
      and (industry_filter is null or pg_catalog.array_length(industry_filter, 1) is null
           or r.industry = any (industry_filter))
      and (city_filter is null or pg_catalog.array_length(city_filter, 1) is null
           or r.city = any (city_filter))
      and (min_amount is null or (r.amount_inr is not null and r.amount_inr >= min_amount))
      and (since_date is null or r.announcement_date >= since_date)
      and (
        inv_like is null
        or pg_catalog.lower(coalesce(r.lead_investor, '')) like inv_like
        or exists (
          select 1 from pg_catalog.unnest(r.investors) as inv where pg_catalog.lower(inv) like inv_like
        )
      )
  ),
  counted as (select pg_catalog.count(*) as n from filtered)
  select
    f.id, f.startup_name, f.startup_slug, f.headline, f.summary,
    f.amount, f.amount_numeric, f.currency, f.amount_inr,
    f.funding_stage, f.industry, f.sub_industry, f.location, f.city,
    f.investors, f.lead_investor, f.announcement_date,
    f.source_name, f.source_url, f.source_published_at, f.logo_url,
    f.verified, f.extraction_method, f.is_featured,
    f.confidence_score::numeric,
    c.n
  from filtered f cross join counted c
  order by
    case when sort_mode = 'recent' and f.is_featured then 0 else 1 end,
    case when sort_mode = 'amount' then f.amount_inr end desc nulls last,
    -- Smallest disclosed first. Undisclosed rounds go last here too: an
    -- unknown amount is not a small one.
    case when sort_mode = 'smallest' then f.amount_inr end asc nulls last,
    case when sort_mode = 'oldest' then f.announcement_date end asc,
    f.announcement_date desc,
    f.created_at desc
  limit lim offset off;
end;
$$;

grant execute on function public.funding_search(text, text[], text[], text[], text, bigint, date, text, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Additional coverage of a round
-- ---------------------------------------------------------------------------
-- Excludes the round's own primary article (`funding_rounds.news_id`), which
-- the card already attributes; what comes back is "also reported by".

create or replace function public.funding_round_coverage(round_ids uuid[])
returns table (
  round_id     uuid,
  source_name  text,
  url          text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ra.round_id, n.source_name, n.url, n.published_at
  from public.funding_round_articles ra
  join public.funding_rounds r on r.id = ra.round_id
  join public.funding_news n   on n.id = ra.news_id
  -- Bounded to the first 60 ids: the array arrives from the app, but a definer
  -- function should not trust its caller to keep it small. A slice, not a
  -- subquery -- `= any ((select ...))` is the subquery form of ANY and would
  -- compare each id against the whole array.
  where ra.round_id = any (round_ids[1:60])
    and r.status = 'published'
    and not r.is_hidden
    and n.id is distinct from r.news_id
  order by ra.round_id, n.published_at asc nulls last;
$$;

revoke all on function public.funding_round_coverage(uuid[]) from public;
grant execute on function public.funding_round_coverage(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The last completed ingestion run
-- ---------------------------------------------------------------------------

create or replace function public.funding_last_sync()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.max(l.completed_at)
  from public.funding_ingestion_logs l
  where l.ok and l.completed_at is not null;
$$;

revoke all on function public.funding_last_sync() from public;
grant execute on function public.funding_last_sync() to anon, authenticated;
