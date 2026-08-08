-- ===========================================================================
-- Where a product was launched from.
--
-- Populated from Vercel's edge geo headers at submit time (lib/request-geo.ts)
-- and then confirmed or corrected by the maker in the launch form, so the value
-- stored is always one a human accepted. Only the state is kept — the client IP
-- is never read, logged or persisted.
--
-- Idempotent — safe to run more than once.
-- ===========================================================================

alter table public.products
  -- ISO 3166-2:IN subdivision code, e.g. 'IN-KA'. Null = not shared / unknown.
  add column if not exists launch_state        text,
  -- 'detected' (geo-IP, left as-is by the maker) or 'maker' (explicitly chosen).
  -- Lets the map distinguish an inferred location from a stated one.
  add column if not exists launch_state_source text;

-- Format check rather than an enum of all 36 codes: it rejects garbage without
-- needing a migration if India ever adds or renames a union territory.
alter table public.products
  drop constraint if exists products_launch_state_format;
alter table public.products
  add constraint products_launch_state_format
  check (launch_state is null or launch_state ~ '^IN-[A-Z]{2}$');

alter table public.products
  drop constraint if exists products_launch_state_source_valid;
alter table public.products
  add constraint products_launch_state_source_valid
  check (launch_state_source is null or launch_state_source in ('detected', 'maker'));

-- The landing map aggregates published products per state.
create index if not exists products_launch_state_idx
  on public.products (launch_state)
  where launch_state is not null and status = 'published';
