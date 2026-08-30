-- Link each promotion package to its Dodo Payments product.
--
-- NOT a migration, on purpose. `dodo_product_id` is environment-specific: a
-- product created in Dodo's test dashboard does not exist in live, and vice
-- versa. Committing these ids to supabase/migrations/ would bake one
-- environment's values into every database that ever runs the migration chain.
-- This is an operator step, run by hand, once per Dodo environment.
--
-- Run it in the Supabase SQL editor (or `psql`) after
-- 20260831090000_dodo_payments.sql has been applied.
--
-- ── Before you run it ────────────────────────────────────────────────────────
-- The ids below were transcribed from a dashboard screenshot, so treat them as a
-- draft: open Dodo > Products, copy each id, and paste it over the matching
-- value. `0`/`O` and `I`/`l` are indistinguishable in most UI fonts and one
-- wrong character means that package silently stops being purchasable.
--
-- Getting one wrong is not dangerous, only annoying: `createPromotionCheckout`
-- reads the catalogue price back from Dodo before opening any checkout, so a
-- bad id fails closed with "That promotion package is not available to buy
-- right now" and an audit line, rather than charging anything.
--
-- ── When you move to live mode ───────────────────────────────────────────────
-- Create the three products again in the live dashboard and re-run this file
-- with the live ids. Nothing else changes.

update public.promotion_packages
set dodo_product_id = v.dodo_product_id
from (values
  -- Ours (id, price)          -- Dodo product name          -- Dodo product id
  ('spotlight-7d', 499900, 'pdt_0NmXGgBNvbblpm36iVB9e'),  -- Homepage + Marketplace
  ('featured-7d',  249900, 'pdt_0NmXHLoS0jTCR3OJks6HJ'),  -- Featured Listing
  ('category-7d',   99900, 'pdt_0NmXHRmsIsa9wnSTT3ziC')   -- Newsletter Feature
) as v(package_id, expected_paise, dodo_product_id)
where public.promotion_packages.id = v.package_id
  -- The price is matched as well as the id. If someone edits a package price in
  -- the database without repricing the Dodo product, this update skips that row
  -- rather than linking a package to a product that charges something else --
  -- which would then be caught at checkout, but caught later and more
  -- confusingly than here.
  and public.promotion_packages.amount_paise = v.expected_paise;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Every active package must come back with a `pdt_` id. Any row showing NULL is
-- hidden from the checkout (fail-closed) and means either the id above is wrong
-- or its price no longer matches the Dodo product.
select
  id,
  name,
  amount_paise,
  dodo_product_id,
  case
    when dodo_product_id is null then 'NOT PURCHASABLE — fix the id or the price'
    else 'ok'
  end as status
from public.promotion_packages
where is_active
order by sort_order;
