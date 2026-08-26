-- Launch review: a product is not live until an admin approves it.
--
-- Until now `createProduct` inserted `status = 'published'` and the launch was
-- instantly public. This adds a third status, 'pending', between the two that
-- already existed, so a submission waits in a queue the admin works through.
-- Everything public already filters on `status = 'published'` — the marketplace
-- queries, the search functions, the sitemap, the category counts — so a
-- pending product is invisible everywhere by construction, and the existing
-- select policy ("published OR you're the creator") still lets its maker see it
-- on their dashboard.
--
-- The important half is the gate. The approval check cannot live only in the
-- server action: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by definition, so a
-- maker holding their own Clerk session token can call PostgREST directly, and
-- the existing update policy ("creators can update their own products") would
-- happily accept `status = 'published'`. The trigger below is what actually
-- makes approval required; the server action is just the pleasant way to reach
-- it.

-- 1. Allow the new status. 'archived' is deliberately not added — nothing
--    writes it today, and the admin badge map already falls back gracefully.
alter table public.products
  drop constraint if exists products_status_check;

alter table public.products
  add constraint products_status_check
  check (status in ('draft', 'pending', 'published'));

-- 2. The queue reads one narrow slice, oldest first, on every admin page load.
create index if not exists products_pending_review_idx
  on public.products (created_at)
  where status = 'pending';

-- 3. The gate.
--
-- SECURITY INVOKER (the default) is load-bearing: inside a SECURITY DEFINER
-- function `current_user` is the function's owner, which would make the check
-- below always pass. PostgREST issues `set local role` per request, so an
-- ordinary caller is 'authenticated' or 'anon', and only the service-role key
-- — which lives on the server and is reached exclusively through
-- `createServiceClient()` — arrives as 'service_role'.
create or replace function public.enforce_product_review_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- Branching on tg_op rather than guarding each test keeps `old` out of the
  -- insert path entirely, where it is not assigned.
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      raise exception 'A product is published by review, not by its creator'
        using errcode = 'check_violation';
    end if;
    if new.published_at is not null then
      raise exception 'published_at is set when a product is approved'
        using errcode = 'check_violation';
    end if;
  else
    if new.status = 'published' and old.status is distinct from 'published' then
      raise exception 'A product is published by review, not by its creator'
        using errcode = 'check_violation';
    end if;
    if new.published_at is distinct from old.published_at then
      raise exception 'published_at is set when a product is approved'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_review_gate on public.products;

create trigger products_review_gate
  before insert or update on public.products
  for each row execute function public.enforce_product_review_gate();

-- 4. Defense in depth: the same rule as a policy, so a status the trigger would
--    reject cannot even be inserted.
drop policy if exists "Users can create products" on public.products;

create policy "Users can create products"
  on public.products for insert
  with check (
    public.requesting_user_id() = creator_id
    and status in ('draft', 'pending')
  );
