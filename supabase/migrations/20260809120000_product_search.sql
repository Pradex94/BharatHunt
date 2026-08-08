-- ===========================================================================
-- Forgiving product search.
--
-- The old search was a single PostgREST filter:
--   name.ilike.%q%,tagline.ilike.%q%
-- Case-insensitive, but literal: "grow easy" could never match "GrowEasy",
-- nothing but name/tagline was searched, results came back in whatever order
-- the active sort imposed, and with no text index every query was a sequential
-- scan with a leading-wildcard LIKE.
--
-- The fix is to match on a *separator-free* normalisation of both sides, so
-- "GrowEasy", "Grow Easy", "grow-easy" and "grow_easy" all collapse to the
-- same string, and to rank the matches instead of returning them arbitrarily.
--
-- Idempotent -- safe to run more than once.
-- ===========================================================================

-- Trigram matching, for typo tolerance and for indexing leading-wildcard LIKE.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Normalisation. Must be IMMUTABLE -- generated columns depend on it.
-- ---------------------------------------------------------------------------

-- NFKD first so accented letters decompose to base letter + combining mark;
-- the mark is then dropped by the [^a-z0-9] strip, turning "cafe<acute>" into
-- "cafe" rather than "caf". Everything else -- spaces, hyphens, underscores,
-- dots, punctuation -- is removed outright, which is what makes "Grow Easy"
-- and "GrowEasy" the same string.
create or replace function public.search_normalize(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    normalize(pg_catalog.lower(coalesce(value, '')), nfkd),
    '[^a-z0-9]+', '', 'g'
  )
$$;

-- Same, for a tags array. array_to_string is only STABLE, so it cannot appear
-- in a generated column directly; wrapping it is safe here because text output
-- is trivially immutable.
create or replace function public.search_normalize_array(value_list text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.search_normalize(
    pg_catalog.array_to_string(coalesce(value_list, '{}'::text[]), ' ')
  )
$$;

-- Splits a query into normalised tokens:
-- "AI Marketing Copilot" -> {ai,marketing,copilot}.
create or replace function public.search_tokens(value text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array(
      select public.search_normalize(token)
      from pg_catalog.regexp_split_to_table(
             coalesce(value, ''), '[^[:alnum:]]+'
           ) as token
      where public.search_normalize(token) <> ''
    ),
    '{}'::text[]
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. Stored normalisations. The displayed name/tagline are never touched --
--    these are match-only shadows of them.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists search_name text
    generated always as (public.search_normalize(name)) stored;

alter table public.products
  -- One haystack for recall, covering every public field worth searching.
  add column if not exists search_text text
    generated always as (
      public.search_normalize(name)
      || public.search_normalize(tagline)
      || public.search_normalize(category)
      || public.search_normalize_array(tags)
      || public.search_normalize(description)
    ) stored;

-- GIN trigram indexes make LIKE '%needle%' and similarity() index-backed
-- instead of a sequential scan -- the whole point of pg_trgm here.
create index if not exists products_search_name_trgm_idx
  on public.products using gin (search_name extensions.gin_trgm_ops);

create index if not exists products_search_text_trgm_idx
  on public.products using gin (search_text extensions.gin_trgm_ops);

-- Makers get the same treatment, so "grow easy" style forgiveness applies to
-- founder names too. Only the two already-public profile fields are indexed --
-- nothing private is made searchable.
alter table public.profiles
  add column if not exists search_name text
    generated always as (
      public.search_normalize(display_name) || public.search_normalize(username)
    ) stored;

create index if not exists profiles_search_name_trgm_idx
  on public.profiles using gin (search_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Ranked search.
--
-- SECURITY INVOKER (the default -- deliberately not DEFINER) so row-level
-- security still applies and no caller can reach another user's drafts.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(
  search_query    text,
  category_filter text    default null,
  pricing_filter  text[]  default null,
  sort_mode       text    default 'relevance',
  page_limit      integer default 12,
  page_offset     integer default 0
)
returns table (
  id                   uuid,
  slug                 text,
  name                 text,
  tagline              text,
  category             text,
  pricing_type         text,
  avg_rating           numeric,
  upvote_count         integer,
  comment_count        integer,
  hero_image_url       text,
  tags                 text[],
  website_url          text,
  github_url           text,
  creator_display_name text,
  creator_username     text,
  relevance            real,
  total_count          bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- PL/pgSQL locals, not a joined CTE: the planner sees each LIKE pattern as a
  -- parameter and can use the trigram index. Computing them in a CROSS JOIN
  -- instead makes every pattern a correlated column reference, which silently
  -- turns the whole thing back into a sequential scan.
  nq       text   := public.search_normalize(search_query);
  toks     text[] := public.search_tokens(search_query);
  rawq     text   := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  pats     text[];
  nq_like  text;
  lead_pat text;
  fuzzy_on boolean;
begin
  -- Punctuation-only or empty input normalises away to nothing. Return before
  -- touching the table rather than scanning for '%%'.
  if nq = '' then
    return;
  end if;

  pats     := array(select '%' || t || '%' from pg_catalog.unnest(toks) as t);
  nq_like  := '%' || nq || '%';
  lead_pat := pats[1];
  fuzzy_on := pg_catalog.length(nq) >= 4;

  return query
  with candidates as materialized (
    select
      p.id, p.slug, p.name, p.tagline, p.description, p.category, p.pricing_type,
      p.avg_rating, p.upvote_count, p.comment_count, p.hero_image_url, p.tags,
      p.website_url, p.github_url, p.creator_id, p.trend_score, p.pricing_amount,
      p.published_at, p.search_name
    from public.products p
    where p.status = 'published'
      and (category_filter is null or p.category = category_filter)
      and (pricing_filter is null
           or pg_catalog.cardinality(pricing_filter) = 0
           or p.pricing_type = any (pricing_filter))
      and (
        -- Separator-free substring. This is what makes "grow easy" find
        -- "GrowEasy", and it is index-backed.
        p.search_text like nq_like
        -- Or every token present. `like all` alone cannot use the index, so it
        -- is led by the first token -- a necessary condition that can -- and
        -- the full check is left as a recheck on the few rows that survive.
        or (lead_pat is not null
            and p.search_text like lead_pat
            and p.search_text like all (pats))
        -- Or a close-enough name. The `%` operator is index-backed at the
        -- default 0.3 threshold and is a superset of the 0.35 we require, so
        -- the exact test below only ever removes rows.
        or (fuzzy_on
            and p.search_name operator(extensions.%) nq
            and extensions.similarity(p.search_name, nq) >= 0.35)
      )
  ),
  scored as (
    select
      c.*,
      -- Highest band the *name* reaches. Bands, not additions, so a long
      -- description can never outrank an exact name match.
      (case
         when pg_catalog.lower(c.name) = rawq              then 120
         when c.search_name = nq                           then 100
         when c.search_name like nq || '%'                 then 80
         when c.search_name like nq_like                   then 65
         else 0
       end
       -- Every query token present in the name.
       + case
           when lead_pat is not null and c.search_name like all (pats) then 30
           else 0
         end
       + case when public.search_normalize(c.tagline)      like nq_like then 35 else 0 end
       + case when public.search_normalize(c.category)     like nq_like then 25 else 0 end
       + case when public.search_normalize_array(c.tags)   like nq_like then 25 else 0 end
       + case when public.search_normalize(c.description)  like nq_like then 15 else 0 end
       -- Typo tolerance, worth less than any literal hit.
       + case
           when fuzzy_on then (extensions.similarity(c.search_name, nq) * 40)
           else 0
         end
      )::real as relevance
    from candidates c
  ),
  counted as (
    select s.*, pg_catalog.count(*) over () as total_count from scored s
  )
  select
    c.id, c.slug, c.name, c.tagline, c.category, c.pricing_type,
    c.avg_rating, c.upvote_count, c.comment_count, c.hero_image_url,
    c.tags, c.website_url, c.github_url,
    pr.display_name, pr.username,
    c.relevance, c.total_count
  from counted c
  left join public.profiles pr on pr.id = c.creator_id
  order by
    case when sort_mode = 'relevance'  then c.relevance      end desc nulls last,
    case when sort_mode = 'trending'   then c.trend_score    end desc nulls last,
    case when sort_mode = 'top-rated'  then c.avg_rating     end desc nulls last,
    case when sort_mode = 'price-low'  then c.pricing_amount end asc  nulls last,
    case when sort_mode = 'price-high' then c.pricing_amount end desc nulls last,
    case when sort_mode = 'newest'     then c.published_at   end desc nulls last,
    -- Deterministic tie-break, so equal scores never come back in random order.
    c.upvote_count desc nulls last,
    c.published_at desc nulls last,
    c.id
  limit  greatest(1, least(page_limit, 60))
  offset greatest(0, page_offset);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. "Did you mean" -- the single closest product name, for a search that
--    returned nothing at all.
--
-- The threshold here (0.2) is deliberately *looser* than the 0.35 the search
-- itself uses. It has to be: search_products already returns anything scoring
-- 0.35 or better, so a stricter suggestion threshold could never fire -- if
-- the search found nothing, there was nothing above 0.35 to find. This is the
-- extra, more forgiving pass that runs only once the normalised, token and
-- fuzzy passes have all come up empty, and it offers a hint rather than a
-- result.
--
-- 0.2 is measured, not guessed. Against the live catalogue, typos the search
-- rejects sit around 0.23 ("gowesy" and "grwesy" -> GrowEasy), while genuinely
-- unrelated queries peak at 0.083 ("spotify"). The gap is wide enough that
-- "facebook" suggests nothing.
-- ---------------------------------------------------------------------------
create or replace function public.suggest_product_name(search_query text)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select p.name
  from public.products p
  where p.status = 'published'
    and pg_catalog.length(public.search_normalize(search_query)) >= 4
    and extensions.similarity(p.search_name, public.search_normalize(search_query)) >= 0.2
  order by
    extensions.similarity(p.search_name, public.search_normalize(search_query)) desc,
    p.upvote_count desc nulls last
  limit 1
$$;

grant execute on function public.search_products(text, text, text[], text, integer, integer)
  to anon, authenticated;
grant execute on function public.suggest_product_name(text) to anon, authenticated;
grant execute on function public.search_normalize(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Search analytics.
--
-- product_events cannot carry this: its product_id is NOT NULL, and the whole
-- point is to see the searches that matched *nothing*. Hence a small table of
-- its own.
--
-- Deliberately identity-free: no user id, no IP, no session. Answering "which
-- searches come up empty" needs the term and the count and nothing else, and
-- collecting less means there is nothing here to leak.
-- ---------------------------------------------------------------------------
create table if not exists public.search_queries (
  id               uuid primary key default gen_random_uuid(),
  -- What the visitor typed, for a human to read in the report.
  query            text        not null,
  -- What it matched on, so variants collapse when grouping.
  query_normalized text        not null,
  result_count     integer     not null,
  created_at       timestamptz not null default now()
);

create index if not exists search_queries_zero_result_idx
  on public.search_queries (query_normalized, created_at desc)
  where result_count = 0;

alter table public.search_queries enable row level security;

-- Anyone may record a search; nobody may read them back through the API. There
-- is deliberately no SELECT policy, so reporting runs through the service role.
drop policy if exists "search_queries_insert_any" on public.search_queries;
create policy "search_queries_insert_any"
  on public.search_queries
  for insert
  with check (true);

grant insert on public.search_queries to anon, authenticated;
