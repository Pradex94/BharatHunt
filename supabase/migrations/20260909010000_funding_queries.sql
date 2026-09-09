-- The read side of Funding Intelligence: four functions that keep the dataset
-- in the database.
--
-- Why these are functions and not PostgREST queries
-- -------------------------------------------------
-- The brief is explicit that search must not work by shipping the dataset to
-- the browser, and the same argument applies one layer in: the feed filters on
-- six things at once, searches across a company name, a headline, an industry,
-- a stage and an *array* of investors, and needs a total count for pagination.
-- Expressed through PostgREST that is an `.or()` string with an array
-- containment clause wedged into it plus a second round trip for the count.
-- Expressed here it is one call, one plan, and every predicate lands on an index
-- from 20260909000000.
--
-- None of these is `security definer`. They run as the caller, so the RLS
-- policies on `funding_rounds`, `funding_investors` and
-- `funding_round_investors` are what decides which rows they can see -- exactly
-- as they decide it for a direct select. A pending round is unreachable through
-- these functions for the same reason it is unreachable without them, and a
-- later widening of the policy cannot be undone by a function that quietly
-- carried more privilege than the table.
--
-- Idempotent: `create or replace` throughout.

-- ---------------------------------------------------------------------------
-- 1. The feed
-- ---------------------------------------------------------------------------
-- Every filter is null-tolerant: a null argument means "no constraint", so the
-- unfiltered feed and the five-filter feed are the same plan with more of the
-- predicates satisfied trivially. That is what makes the filters compose --
-- section 4's "filters must work together" is not special-cased anywhere, it is
-- just what a conjunction does.

drop function if exists public.funding_search(text, text[], text[], text[], text, bigint, date, text, integer, integer);

create or replace function public.funding_search(
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
  total_count         bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
-- Every output column above is also a variable in this scope; `use_column`
-- resolves the ambiguity toward the table, and the body qualifies its
-- references anyway. Same guard `search_products` uses (20260809120000).
#variable_conflict use_column
declare
  nq       text := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  q_like   text;
  inv_like text;
  -- A bound, not a preference: `page_limit` arrives from a URL, and an
  -- unbounded one is a way to ask for the whole table in a single request.
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
      -- One LIKE against the stored generated column, served by the trigram
      -- GIN index. "Zepto", "Fintech", "Series A", "Sequoia" and "Delhi" are
      -- all the same query because they are all in `search_text`.
      and (q_like is null or r.search_text like q_like)
      and (stage_filter is null or pg_catalog.array_length(stage_filter, 1) is null
           or r.funding_stage = any (stage_filter))
      and (industry_filter is null or pg_catalog.array_length(industry_filter, 1) is null
           or r.industry = any (industry_filter))
      and (city_filter is null or pg_catalog.array_length(city_filter, 1) is null
           or r.city = any (city_filter))
      -- An amount floor excludes undisclosed rounds rather than treating them
      -- as zero. "At least 10 crore" is a claim about a known figure, and a
      -- round with no reported figure is not evidence either way.
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
    c.n
  from filtered f cross join counted c
  order by
    -- Featured first, and only on the default sort: an explicit "largest
    -- first" that silently reordered around an editorial pin would be lying
    -- about what it sorted by.
    case when sort_mode = 'recent' and f.is_featured then 0 else 1 end,
    case when sort_mode = 'amount' then f.amount_inr end desc nulls last,
    case when sort_mode = 'oldest' then f.announcement_date end asc,
    f.announcement_date desc,
    f.created_at desc
  limit lim offset off;
end;
$$;

grant execute on function public.funding_search(text, text[], text[], text[], text, bigint, date, text, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The snapshot
-- ---------------------------------------------------------------------------
-- The five figures across the top of /funding, in one round trip.
--
-- Dates are Asia/Kolkata, not UTC. "Funding announced today" on a page about
-- Indian startups has to mean the reader's today: between 00:00 and 05:30 IST,
-- UTC is still on yesterday's date, so a UTC `current_date` would empty the
-- card every night for five and a half hours.
--
-- `disclosed_this_month` travels with `total_this_month_inr` on purpose. A
-- total is only interpretable next to how many of the rounds it could actually
-- count -- the page renders "across 14 of 22 rounds with a disclosed amount"
-- rather than implying the rest were zero.

create or replace function public.funding_snapshot()
returns table (
  announced_today      bigint,
  rounds_this_week     bigint,
  rounds_this_month    bigint,
  total_this_month_inr bigint,
  disclosed_this_month bigint,
  top_industry         text,
  top_industry_count   bigint,
  top_stage            text,
  top_stage_count      bigint,
  total_rounds         bigint,
  last_published_at    timestamptz
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
#variable_conflict use_column
declare
  today date := (pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))::date;
begin
  return query
  with visible as (
    select r.announcement_date, r.industry, r.funding_stage, r.amount_inr, r.published_at
    from public.funding_rounds r
    where r.status = 'published' and not r.is_hidden
  ),
  this_month as (
    select * from visible where announcement_date >= today - 30
  ),
  industry_rank as (
    select v.industry as name, pg_catalog.count(*) as n
    from this_month v
    where v.industry is not null
    group by v.industry
    order by n desc, name asc
    limit 1
  ),
  stage_rank as (
    select v.funding_stage as name, pg_catalog.count(*) as n
    from this_month v
    -- 'Undisclosed' is the absence of a stage, so naming it "most active stage"
    -- would report a gap in the data as a finding about the market.
    where v.funding_stage <> 'Undisclosed'
    group by v.funding_stage
    order by n desc, name asc
    limit 1
  )
  select
    (select pg_catalog.count(*) from visible where announcement_date = today),
    (select pg_catalog.count(*) from visible where announcement_date >= today - 6),
    (select pg_catalog.count(*) from this_month),
    (select coalesce(pg_catalog.sum(amount_inr), 0)::bigint from this_month where amount_inr is not null),
    (select pg_catalog.count(*) from this_month where amount_inr is not null),
    (select name from industry_rank),
    (select n from industry_rank),
    (select name from stage_rank),
    (select n from stage_rank),
    (select pg_catalog.count(*) from visible),
    (select pg_catalog.max(published_at) from visible);
end;
$$;

grant execute on function public.funding_snapshot() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trends
-- ---------------------------------------------------------------------------
-- Five charts, one call, one JSON payload. Separate functions would be five
-- round trips for one screen, and the pieces are always rendered together.
--
-- `disclosed_round_count` and `total_round_count` come back alongside the
-- series so the page can say what share of rounds carried a figure. Without
-- them a "funding by month" bar chart silently reads undisclosed rounds as
-- zero, which is the exact failure section 30 forbids.

create or replace function public.funding_trends(
  months integer default 12,
  top_n  integer default 8
)
returns jsonb
language sql
stable
parallel safe
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(months, 12), 1), 36) as month_span,
      least(greatest(coalesce(top_n, 8), 1), 20)   as n
  ),
  visible as (
    select r.*
    from public.funding_rounds r, bounds b
    where r.status = 'published'
      and not r.is_hidden
      and r.announcement_date >= (
        pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Kolkata', pg_catalog.now()))
        - pg_catalog.make_interval(months => b.month_span - 1)
      )::date
  ),
  by_month as (
    select
      pg_catalog.to_char(pg_catalog.date_trunc('month', v.announcement_date), 'YYYY-MM') as month,
      pg_catalog.count(*)                                       as round_count,
      pg_catalog.count(*) filter (where v.amount_inr is not null) as disclosed_count,
      coalesce(pg_catalog.sum(v.amount_inr), 0)::bigint          as total_inr
    from visible v
    group by 1
    order by 1
  ),
  by_sector as (
    select v.industry as name,
           pg_catalog.count(*)                              as round_count,
           coalesce(pg_catalog.sum(v.amount_inr), 0)::bigint as total_inr
    from visible v
    where v.industry is not null
    group by 1
    order by round_count desc, name asc
    limit (select n from bounds)
  ),
  by_stage as (
    select v.funding_stage as name,
           pg_catalog.count(*)                              as round_count,
           coalesce(pg_catalog.sum(v.amount_inr), 0)::bigint as total_inr
    from visible v
    group by 1
    order by round_count desc, name asc
  ),
  top_investors as (
    select i.name,
           i.slug,
           pg_catalog.count(*)                                as deal_count,
           pg_catalog.count(*) filter (where ri.is_lead)      as lead_count
    from visible v
    join public.funding_round_investors ri on ri.round_id = v.id
    join public.funding_investors i        on i.id = ri.investor_id
    group by i.name, i.slug
    order by deal_count desc, i.name asc
    limit (select n from bounds)
  ),
  top_cities as (
    select v.city as name,
           pg_catalog.count(*)                              as round_count,
           coalesce(pg_catalog.sum(v.amount_inr), 0)::bigint as total_inr
    from visible v
    where v.city is not null
    group by 1
    order by round_count desc, name asc
    limit (select n from bounds)
  )
  select pg_catalog.jsonb_build_object(
    'by_month',       coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(by_month))       from by_month), '[]'::jsonb),
    'by_sector',      coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(by_sector))      from by_sector), '[]'::jsonb),
    'by_stage',       coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(by_stage))       from by_stage), '[]'::jsonb),
    'top_investors',  coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_investors))  from top_investors), '[]'::jsonb),
    'top_cities',     coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(top_cities))     from top_cities), '[]'::jsonb),
    'total_round_count',     (select pg_catalog.count(*) from visible),
    'disclosed_round_count', (select pg_catalog.count(*) from visible where amount_inr is not null)
  );
$$;

grant execute on function public.funding_trends(integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Investor discovery
-- ---------------------------------------------------------------------------
-- Everything here is derived from published rounds. There is no editorial field
-- on a `funding_investors` row -- no cheque size, no thesis, no contact -- for
-- the reason section 15 gives: the moment this page carries a fact that was not
-- in an article, it is inventing investor information. What it can say is what
-- the rounds say: how many deals, which stages, which sectors, and which
-- companies.

create or replace function public.funding_investor_directory(
  search_query text    default null,
  page_limit   integer default 24,
  page_offset  integer default 0
)
returns table (
  id                 uuid,
  name               text,
  slug               text,
  investor_type      text,
  deal_count         integer,
  lead_count         integer,
  last_deal_at       date,
  stages             text[],
  industries         text[],
  recent_investments jsonb,
  total_count        bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
#variable_conflict use_column
declare
  nq     text    := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  q_like text;
  lim    integer := least(greatest(coalesce(page_limit, 24), 1), 60);
  off    integer := greatest(coalesce(page_offset, 0), 0);
begin
  q_like := case when nq = '' then null else '%' || nq || '%' end;

  return query
  with matched as (
    select i.*
    from public.funding_investors i
    where i.published_deal_count > 0
      and (q_like is null or i.normalized_name like q_like)
  ),
  counted as (select pg_catalog.count(*) as n from matched)
  select
    m.id, m.name, m.slug, m.investor_type,
    m.published_deal_count, m.published_lead_count, m.last_deal_at,
    coalesce(agg.stages, '{}'::text[]),
    coalesce(agg.industries, '{}'::text[]),
    coalesce(agg.recent, '[]'::jsonb),
    c.n
  from matched m
  cross join counted c
  left join lateral (
    select
      pg_catalog.array_agg(distinct d.funding_stage) filter (where d.funding_stage <> 'Undisclosed') as stages,
      pg_catalog.array_agg(distinct d.industry) filter (where d.industry is not null)                as industries,
      -- Five most recent, newest first. `jsonb_agg` over an ordered subquery
      -- rather than an ordered aggregate so the limit applies before the
      -- aggregation, not after it.
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(recent_rows))
        from (
          select r2.startup_name, r2.startup_slug, r2.funding_stage,
                 r2.announcement_date, r2.amount, r2.currency
          from public.funding_round_investors ri2
          join public.funding_rounds r2 on r2.id = ri2.round_id
          where ri2.investor_id = m.id
            and r2.status = 'published' and not r2.is_hidden
          order by r2.announcement_date desc, r2.created_at desc
          limit 5
        ) recent_rows
      ) as recent
    from public.funding_round_investors ri
    join public.funding_rounds d on d.id = ri.round_id
    where ri.investor_id = m.id
      and d.status = 'published' and not d.is_hidden
  ) agg on true
  order by m.published_deal_count desc, m.last_deal_at desc nulls last, m.name asc
  limit lim offset off;
end;
$$;

grant execute on function public.funding_investor_directory(text, integer, integer)
  to anon, authenticated;
