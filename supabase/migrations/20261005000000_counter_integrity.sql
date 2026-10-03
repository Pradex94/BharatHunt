-- ===========================================================================
-- Counter integrity: engagement counts come from rows, never from callers.
--
-- Until now `upvote_count` and `comment_count` were moved by the app calling
-- `increment_product_counter(product, column, delta)` after its insert. That
-- function is SECURITY DEFINER and was granted to `anon`, so anyone holding the
-- public anon key could add any delta to any product — `delta => 10000` on a
-- rival or on their own launch. `increment_view_count` had the same exposure.
-- These counts feed public rankings (Top rated, Trending), so that is a
-- manipulation hole, not a cosmetic one.
--
-- Now:
--   - triggers on `upvotes` and `comments` keep the counters exactly equal to
--     the rows, like `bookmarks` already does (20261003000000);
--   - `increment_product_counter` keeps its signature and grants but does
--     nothing, so a deployment that still calls it after its insert neither
--     fails nor double-counts — the migration and the code can ship in
--     either order;
--   - `increment_view_count` is service-role only. Views are counted by
--     /api/signals, once per visitor per product per hour, after the bot
--     filter and rate limit.
--
-- Checked against production before writing: stored counters equalled the
-- row counts for every product (475 upvotes, 54 comments), so the recount
-- below changes no visible number. Idempotent.
-- ===========================================================================

create or replace function public.sync_product_engagement_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.product_id, old.product_id);
  delta  integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'upvotes' then
    update public.products
      set upvote_count = greatest(0, coalesce(upvote_count, 0) + delta)
      where id = target;
  elsif tg_table_name = 'comments' then
    update public.products
      set comment_count = greatest(0, coalesce(comment_count, 0) + delta)
      where id = target;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_product_engagement_count() from public, anon, authenticated;

drop trigger if exists upvotes_sync_count on public.upvotes;
create trigger upvotes_sync_count
  after insert or delete on public.upvotes
  for each row execute function public.sync_product_engagement_count();

drop trigger if exists comments_sync_count on public.comments;
create trigger comments_sync_count
  after insert or delete on public.comments
  for each row execute function public.sync_product_engagement_count();

-- Kept callable so code still calling it keeps working; it no longer writes.
create or replace function public.increment_product_counter(
  target_product_id uuid,
  counter_column text,
  delta integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Intentionally empty: counters are maintained by triggers on the
  -- upvotes, comments and bookmarks tables (20261005000000).
  return;
end;
$$;

-- Views: counted server-side by /api/signals (service role) only.
create or replace function public.increment_view_count(target_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products set view_count = coalesce(view_count, 0) + 1 where id = target_product_id;
end;
$$;

revoke all on function public.increment_view_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_view_count(uuid) to service_role;

-- Start from the truth.
update public.products p
  set upvote_count = coalesce((select count(*) from public.upvotes u where u.product_id = p.id), 0)
  where p.upvote_count is distinct from coalesce((select count(*) from public.upvotes u where u.product_id = p.id), 0);
update public.products p
  set comment_count = coalesce((select count(*) from public.comments c where c.product_id = p.id), 0)
  where p.comment_count is distinct from coalesce((select count(*) from public.comments c where c.product_id = p.id), 0);
