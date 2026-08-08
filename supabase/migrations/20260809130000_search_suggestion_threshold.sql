-- ===========================================================================
-- Lower the "Did you mean" threshold from 0.4 to 0.2.
--
-- 20260809120000 shipped suggest_product_name() at 0.4, which made it dead
-- code: search_products() already returns anything scoring 0.35 or better, so
-- a suggestion needing 0.4 could only ever fire for a search that had already
-- returned results. The suggestion has to be *looser* than the search, not
-- stricter -- it is the extra pass that runs once the normalised, token and
-- fuzzy passes have all come up empty.
--
-- 0.2 is measured against the live catalogue: typos the search rejects sit
-- around 0.23 ("gowesy", "grwesy" -> GrowEasy), while unrelated queries peak
-- at 0.083 ("spotify"), so "facebook" still suggests nothing.
--
-- Carried as its own migration because 20260809120000 has already been applied;
-- that file also holds the corrected definition, so a fresh database and an
-- existing one both end up at 0.2.
-- ===========================================================================

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

grant execute on function public.suggest_product_name(text) to anon, authenticated;
