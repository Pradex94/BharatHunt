-- ===========================================================================
-- "Top rated" ranks by upvotes, not by avg_rating.
--
-- 20260809120000 shipped search_products() ordering the 'top-rated' mode by
-- products.avg_rating. That column is only ever written by
-- add_feedback_and_update_product(), and nothing in the app calls it -- there
-- is no rating UI -- so avg_rating is NULL for every published row. Ordering
-- by an all-NULL column left the sort entirely to the tie-breaks, which is why
-- the tab looked like it was showing arbitrary products.
--
-- Upvotes are the rating this site actually collects, and "the all-time
-- community favourites" is what the marketplace copy already promises the tab
-- shows. Trending stays distinct: it is the time-decayed score, this is the
-- all-time board.
--
-- Carried as its own migration because 20260809120000 has already been applied;
-- that file also holds the corrected definition, so a fresh database and an
-- existing one both end up here.
-- ===========================================================================

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
    -- Upvotes, not avg_rating: nothing writes public.feedback, so every row
    -- is tied at NULL there and "top rated" degenerates into random order.
    case when sort_mode = 'top-rated'  then c.upvote_count   end desc nulls last,
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

grant execute on function public.search_products(text, text, text[], text, integer, integer)
  to anon, authenticated;
