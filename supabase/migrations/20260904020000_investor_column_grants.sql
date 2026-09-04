-- Actually put the contact columns behind the paywall.
--
-- Why there is a second migration for this
-- ----------------------------------------
-- 20260904010000 tried to do it with
--
--   revoke select (website, email, linkedin, contact_details) on public.investors
--     from anon, authenticated;
--
-- and that is a **no-op**. Postgres cannot revoke a column-level privilege from a
-- role that holds the *table-level* one: the table grant already covers every
-- column, present and future, so there is no column-level grant to take away.
-- Postgres says so, quietly, with a `WARNING: no privileges could be revoked for
-- column ...` that a migration runner does not surface as a failure.
--
-- Supabase grants table-level SELECT on everything in `public` to `anon` and
-- `authenticated` by default, so that is exactly the situation here. Confirmed
-- by re-running the attack against the live database after 20260904010000 was
-- applied: `?select=email` with the anon key still returned four addresses.
--
-- The correct shape is revoke-the-table-grant, then grant back the columns that
-- are genuinely public:
--
--   revoke select on <table> from <role>;
--   grant  select (<public columns>) on <table> to <role>;
--
-- After this, `?select=*` and `?select=email` both return 42501 for the anon and
-- authenticated roles, while the preview column list the application actually
-- asks for keeps working.
--
-- The previous migration is left in place rather than edited: it is already
-- recorded as applied, its comments are still true, and rewriting an applied
-- migration is how a database and its history stop describing the same thing.
--
-- Idempotent: re-running re-states the same grants.

-- 1. Drop the blanket table grant that makes every column readable.
revoke select on public.investors from anon, authenticated;

-- 2. Grant back exactly the columns the free preview renders.
--
--    `is_published`, `is_free_preview` and `sort_order` are included even though
--    nothing displays them: `services/investors.ts` filters and orders on them,
--    and a WHERE or ORDER BY needs SELECT privilege on the column just as much
--    as a projection does. Leaving them out fails the free preview itself.
--
--    The four withheld columns are `website`, `email`, `linkedin` and
--    `contact_details` — the contact block the pricing card sells and the detail
--    panel gates behind `isFullInvestor`.
grant select (
  id,
  name,
  firm_name,
  logo_url,
  location,
  investor_type,
  investment_stages,
  sectors,
  portfolio,
  check_size_min_inr,
  check_size_max_inr,
  thesis,
  is_free_preview,
  is_published,
  is_sample,
  sort_order,
  created_at,
  updated_at
) on public.investors to anon, authenticated;

-- `service_role` is untouched and keeps the whole table. It is the role
-- `createServiceClient()` uses, and the only way the contact columns reach a
-- customer — from server-only code, after `hasInvestorDirectoryAccess()` has
-- confirmed a settled payment.

-- A note for whoever adds the next column
-- ---------------------------------------
-- A new column is NOT readable by `anon`/`authenticated` any more, because those
-- roles now hold column grants rather than a table grant. That is the safe
-- default and the opposite of what 20260904010000 assumed. If you add a column
-- the free preview needs to display, filter on, or order by, add it to the grant
-- list above in the same migration — otherwise the preview query fails with
-- 42501 rather than silently leaking, which is the right way round.
