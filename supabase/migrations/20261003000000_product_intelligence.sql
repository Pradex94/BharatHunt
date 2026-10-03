-- ===========================================================================
-- Product Intelligence, phase 2: derived product knowledge, precomputed
-- similarity, and an honest saved-product counter.
--
-- Nothing here duplicates `products`. Both new tables are *derived* from it by
-- the indexer (lib/intelligence/reindex.ts, service role) and can be rebuilt
-- from scratch at any time; deleting a product cascades its rows away.
--
--   product_intelligence  one row per published product: the concepts and
--                         audiences its listing names, the evidence for each,
--                         and a content hash so unchanged products are skipped.
--   product_similarities  the top similar products for each product, so a
--                         product page reads a ranked list instead of
--                         computing one on render.
--
-- Saves reuse `public.bookmarks`, which has existed since the first schema
-- (Clerk text user ids and RLS already in place, 20260721010000) but was never
-- wired to the UI. This migration only adds the trigger that keeps
-- `products.bookmark_count` true, so the actions never touch the counter and
-- an imported batch of anonymous saves cannot drift it.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Derived knowledge
-- ---------------------------------------------------------------------------

create table if not exists public.product_intelligence (
  product_id        uuid primary key references public.products (id) on delete cascade,
  -- Concept keys from lib/intelligence/concepts.ts. GIN-indexed: search
  -- expansion and Product Match retrieve candidates with `concepts && $1`.
  concepts          text[]      not null default '{}',
  audiences         text[]      not null default '{}',
  -- The full ProductKnowledge (lib/intelligence/knowledge.ts), evidence
  -- included, so an explanation can quote the phrase a match rests on.
  knowledge         jsonb       not null default '{}'::jsonb
                    check (jsonb_typeof(knowledge) = 'object'),
  content_hash      text        not null,
  knowledge_version integer     not null,
  indexed_at        timestamptz not null default now()
);

create index if not exists product_intelligence_concepts_idx
  on public.product_intelligence using gin (concepts);

alter table public.product_intelligence enable row level security;

-- Derived only from public listing fields, so it is as public as the product
-- it describes — and no more: a row for an unpublished product is invisible.
-- There is no insert/update/delete policy; only the service role writes.
drop policy if exists "product_intelligence_public_read" on public.product_intelligence;
create policy "product_intelligence_public_read"
  on public.product_intelligence for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_intelligence.product_id and p.status = 'published'
    )
  );

grant select on public.product_intelligence to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Precomputed similarity
-- ---------------------------------------------------------------------------

create table if not exists public.product_similarities (
  product_id          uuid        not null references public.products (id) on delete cascade,
  similar_product_id  uuid        not null references public.products (id) on delete cascade,
  rank                smallint    not null check (rank between 1 and 50),
  score               real        not null check (score >= 0 and score <= 1.5),
  text_score          real,
  concept_score       real,
  -- Concept keys both listings name, most telling first: the "why" under a card.
  shared_concepts     text[]      not null default '{}',
  -- Which algorithm wrote the row (lib/intelligence/similarity.ts SIMILARITY_METHOD).
  method              text        not null,
  computed_at         timestamptz not null default now(),
  primary key (product_id, similar_product_id),
  constraint product_similarities_not_self check (product_id <> similar_product_id)
);

create index if not exists product_similarities_rank_idx
  on public.product_similarities (product_id, rank);

-- Cascading deletes look rows up by the other side too.
create index if not exists product_similarities_similar_idx
  on public.product_similarities (similar_product_id);

alter table public.product_similarities enable row level security;

-- Both ends must be published: a product that goes back into review must not
-- surface as someone else's alternative while it waits.
drop policy if exists "product_similarities_public_read" on public.product_similarities;
create policy "product_similarities_public_read"
  on public.product_similarities for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_similarities.product_id and p.status = 'published'
    )
    and exists (
      select 1 from public.products p
      where p.id = product_similarities.similar_product_id and p.status = 'published'
    )
  );

grant select on public.product_similarities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Saves: keep products.bookmark_count true
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the counter moves even though the caller cannot update
-- someone else's product. Inside it `current_user` is the owner, which is
-- exactly what lets the review and source gates (20260825000000,
-- 20261002000000) pass this write — it touches neither status nor source.
create or replace function public.sync_bookmark_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.products
      set bookmark_count = coalesce(bookmark_count, 0) + 1
      where id = new.product_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.products
      set bookmark_count = greatest(0, coalesce(bookmark_count, 0) - 1)
      where id = old.product_id;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_bookmark_count() from public, anon, authenticated;

drop trigger if exists bookmarks_sync_count on public.bookmarks;
create trigger bookmarks_sync_count
  after insert or delete on public.bookmarks
  for each row execute function public.sync_bookmark_count();

-- Start from the truth rather than from whatever the column held.
update public.products p
  set bookmark_count = coalesce(
    (select count(*) from public.bookmarks b where b.product_id = p.id), 0)
  where p.bookmark_count is distinct from coalesce(
    (select count(*) from public.bookmarks b where b.product_id = p.id), 0);
