-- Repair: `ai_story_search` referenced NULLIF as though it were a function.
--
-- What was wrong
-- --------------
-- 20260910010000 declared two of its local variables like this:
--
--   mode text := coalesce(pg_catalog.nullif(pg_catalog.btrim(sort_mode), ''), 'trending');
--
-- `btrim` is a real function in `pg_catalog` and qualifying it is correct.
-- **NULLIF is not a function.** It is grammar -- a syntactic construct the
-- parser rewrites into a CASE expression -- and so are COALESCE, LEAST,
-- GREATEST and CASE. None of them lives in a schema, and prefixing one with
-- `pg_catalog.` asks for a function that does not exist:
--
--   ERROR: function pg_catalog.nullif(text, unknown) does not exist (42601)
--
-- The trap is that this compiles. A PL/pgSQL body is only parsed at *call*
-- time, so the migration applied cleanly and the whole feed then failed on the
-- first request. It was caught by calling the function through the anon key
-- after applying, which is the only thing that would have caught it.
--
-- Why a new migration rather than an edit
-- ---------------------------------------
-- 20260910010000 has already been applied and recorded in
-- `supabase_migrations.schema_migrations`. Editing an applied file leaves the
-- remote history describing something that no longer exists on disk, and a
-- database that has already run it would never pick the correction up anyway.
-- So the fix ships as its own migration, which is a no-op everywhere it has
-- already been applied and self-explanatory everywhere it has not.
--
-- Only the two declarations changed. Everything else is 20260910010000
-- verbatim, so the two can be diffed against each other.

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
  -- THE FIX: `nullif`, not `pg_catalog.nullif`. See the header.
  mode    text    := coalesce(nullif(pg_catalog.btrim(sort_mode), ''), 'trending');
  reg     text    := nullif(pg_catalog.btrim(coalesce(region_filter, '')), '');
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
