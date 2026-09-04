-- Link the Investor Directory plan to its Dodo Payments product.
--
-- NOT a migration, on purpose, and for the same reason as
-- supabase/link-dodo-products.sql: `dodo_product_id` is environment-specific. A
-- product created in Dodo's test dashboard does not exist in live, and vice
-- versa. Committing the id to supabase/migrations/ would bake one environment's
-- value into every database that ever runs the migration chain. This is an
-- operator step, run by hand, once per Dodo environment.
--
-- Run it in the Supabase SQL editor (or `psql`) after
-- 20260904000000_investor_directory.sql has been applied.
--
-- ── Before you run it ────────────────────────────────────────────────────────
-- 1. In the Dodo dashboard, create a product:
--        Name  : Bharat Hunt Investor Directory — Full Access
--        Price : one-time, INR, 499.00
--        No discount, not pay-what-you-want, not recurring.
--    Those constraints are not cosmetic — `createInvestorCheckout` re-reads the
--    catalogue price and refuses to open a checkout unless every one of them
--    holds. See lib/actions/investors.ts, step (3).
--
-- 2. Copy the product id and paste it over the placeholder below. `0`/`O` and
--    `I`/`l` are indistinguishable in most UI fonts, and one wrong character
--    means the directory silently stops being purchasable.
--
-- 3. Optionally verify it first, without touching the database:
--        node scripts/check-dodo-products.mjs pdt_YOUR_ID_HERE
--
-- Getting the id wrong is not dangerous, only annoying: the plan stays
-- unpurchasable, /investors renders "Purchasing is temporarily unavailable"
-- with the free preview still open, and an audit line is written. Nothing is
-- charged.
--
-- ── When you move to live mode ───────────────────────────────────────────────
-- Create the product again in the live dashboard and re-run this file with the
-- live id. Nothing else changes.

update public.investor_directory_plans
set dodo_product_id = v.dodo_product_id
from (values
  -- Ours (id, price)   -- Dodo product id
  ('full-access', 49900, 'pdt_REPLACE_WITH_YOUR_DODO_PRODUCT_ID')
) as v(plan_id, expected_paise, dodo_product_id)
where public.investor_directory_plans.id = v.plan_id
  -- The price is matched as well as the id. If someone edits the plan price in
  -- the database without repricing the Dodo product, this update skips the row
  -- rather than linking it to a product that charges something else -- which
  -- would then be caught at checkout, but caught later and more confusingly
  -- than here.
  and public.investor_directory_plans.amount_paise = v.expected_paise;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- The active plan must come back with a `pdt_` id. NULL means it is hidden from
-- the checkout (fail-closed) and that either the id above is wrong or the price
-- no longer matches the Dodo product.
select
  id,
  name,
  amount_paise,
  dodo_product_id,
  case
    when dodo_product_id is null then 'NOT PURCHASABLE — fix the id or the price'
    else 'ok'
  end as status
from public.investor_directory_plans
where is_active;
