-- Put the contact columns behind the paywall at the database, not just in the UI.
--
-- What this fixes
-- ---------------
-- 20260904000000 gave `investors` a SELECT policy admitting only free-preview
-- rows, and that half works: the anon key returns four rows and never the rest.
-- But **RLS is row-level**. Those four rows come back whole, so
--
--   GET /rest/v1/investors?select=*      (anon key, which ships in every browser)
--
-- hands back `email`, `linkedin`, `website` and `contact_details` for the four
-- preview investors — the exact fields /investors tells visitors are part of the
-- paid directory ("Contact locked" on the card, "part of the full directory" in
-- the detail panel, "Access to available investor contact details" on the
-- pricing card).
--
-- Verified against the live database rather than reasoned about: a `select=*`
-- with the anon key returned four rows carrying real values in `email`. The
-- application never asked for those columns — `services/investors.ts` selects an
-- explicit preview list — but "our client does not request it" is not an access
-- control, and PostgREST is a public endpoint that takes the column list from
-- the caller.
--
-- The fix
-- -------
-- Column-level privileges, which is the tool Postgres provides for exactly this
-- and the one thing RLS cannot express. Rows stay governed by the policy;
-- columns are governed here. A caller asking for a revoked column now gets 42501
-- instead of a value.
--
-- Why not a view instead
-- ----------------------
-- A `investors_public` view over the preview columns would also work, and it is
-- more machinery: a second object to keep in step with the table, its own
-- grants, and a `security_invoker` setting that is easy to get wrong in the
-- direction that leaks. This is four lines and it cannot drift from the table it
-- protects.
--
-- Not affected
-- ------------
-- `service_role` keeps every column. That is the role `createServiceClient()`
-- uses, and it is how a paying customer's directory read gets the contact block
-- — after `hasInvestorDirectoryAccess()` has said so in server-only code.
--
-- Idempotent: `revoke` on an already-revoked privilege is a no-op.

-- `authenticated` is revoked as well as `anon`, and that is the important half.
-- Signing up is free, so a policy that trusted `authenticated` would put the
-- paid fields one email address away from anyone. A signed-in customer who has
-- paid does not read through this role at all.
revoke select (website, email, linkedin, contact_details)
  on public.investors
  from anon, authenticated;

comment on column public.investors.email is
  'Paid field. SELECT is revoked from anon and authenticated; reachable only via service_role after hasInvestorDirectoryAccess(). See 20260904010000.';
comment on column public.investors.contact_details is
  'Paid field. SELECT is revoked from anon and authenticated. See 20260904010000.';

-- A note for whoever adds the next column
-- ---------------------------------------
-- New columns are granted to `anon` and `authenticated` by default, because the
-- table-level GRANT Supabase applies covers columns added later. So a column
-- added for the paid tier is **public until someone revokes it here**. If you add
-- one, add it to the revoke above in the same migration that adds the column.
