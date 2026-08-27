-- Product ratings: the one thing missing before `aggregateRating` can be honest.
--
-- `products.avg_rating` has existed as a column since the original schema and
-- has been null for every published row, because nothing ever wrote it. Emitting
-- an aggregateRating from it would have been fabricated structured data — the
-- exact thing Google issues manual actions for — so lib/seo.ts has always
-- omitted it. This gives the column a real source.
--
-- Three rules are enforced here rather than in the application, for the same
-- reason the launch review gate is: the anon key is public, so anything only the
-- server action checks is advisory.
--
--   1. One rating per person per product. A unique constraint, so a second
--      submission updates rather than stacks.
--   2. A maker cannot rate their own product. Self-rating is the cheapest way to
--      manufacture five stars, and a marketplace that allows it has ratings
--      worth nothing.
--   3. `avg_rating` and `rating_count` are maintained by trigger, never by the
--      client. A denormalised aggregate a caller can write is an aggregate that
--      will eventually be wrong.

create table if not exists public.product_ratings (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  user_id     text not null references public.profiles (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_ratings_one_per_user unique (product_id, user_id)
);

create index if not exists product_ratings_product_idx
  on public.product_ratings (product_id);

alter table public.products
  add column if not exists rating_count integer not null default 0;

-- Rating counts are read on every product page and every card.
create index if not exists products_rating_idx
  on public.products (avg_rating desc nulls last)
  where status = 'published' and rating_count > 0;

alter table public.product_ratings enable row level security;

-- Public: the numbers are shown on a public page, so they are readable by all.
drop policy if exists "Ratings are viewable by everyone" on public.product_ratings;
create policy "Ratings are viewable by everyone"
  on public.product_ratings for select
  using (true);

/*
 * Insert and update are scoped to the caller's own row, and rule 2 is enforced
 * in the `with check`: the subquery refuses a rating whose product belongs to
 * the person casting it.
 */
drop policy if exists "Users can rate products they do not own" on public.product_ratings;
create policy "Users can rate products they do not own"
  on public.product_ratings for insert
  with check (
    public.requesting_user_id() = user_id
    and not exists (
      select 1
      from public.products p
      where p.id = product_id
        and p.creator_id = public.requesting_user_id()
    )
  );

drop policy if exists "Users can change their own rating" on public.product_ratings;
create policy "Users can change their own rating"
  on public.product_ratings for update
  using (public.requesting_user_id() = user_id)
  with check (public.requesting_user_id() = user_id);

drop policy if exists "Users can remove their own rating" on public.product_ratings;
create policy "Users can remove their own rating"
  on public.product_ratings for delete
  using (public.requesting_user_id() = user_id);

/*
 * Keeps products.avg_rating and products.rating_count in step with the ratings
 * table.
 *
 * SECURITY DEFINER is required and deliberate: the person rating a product is
 * not its creator, so the "creators can update their own products" policy would
 * refuse the aggregate write if this ran as the caller. The function touches
 * only the two aggregate columns and derives both from the table it is
 * triggered on, so it cannot be used to write anything a caller chooses — and
 * because the definer is not an ordinary role, the launch review gate's
 * `current_user` allowlist lets the write through without the status columns
 * ever being in scope.
 */
create or replace function public.recalculate_product_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
  set
    avg_rating = sub.avg_rating,
    rating_count = sub.rating_count
  from (
    select
      round(avg(r.rating)::numeric, 2) as avg_rating,
      count(*)::int as rating_count
    from public.product_ratings r
    where r.product_id = target
  ) sub
  where p.id = target;

  -- The last rating removed leaves no row in the subquery's average, which is
  -- null: the correct value for "nobody has rated this", and what the schema
  -- builder checks before emitting anything.
  update public.products
  set rating_count = 0, avg_rating = null
  where id = target
    and not exists (select 1 from public.product_ratings r where r.product_id = target);

  return null;
end;
$$;

drop trigger if exists product_ratings_recalculate on public.product_ratings;

create trigger product_ratings_recalculate
  after insert or update or delete on public.product_ratings
  for each row execute function public.recalculate_product_rating();

-- `updated_at` is what tells a re-rating apart from a first one in the logs.
create or replace function public.touch_product_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_ratings_touch on public.product_ratings;

create trigger product_ratings_touch
  before update on public.product_ratings
  for each row execute function public.touch_product_rating();
