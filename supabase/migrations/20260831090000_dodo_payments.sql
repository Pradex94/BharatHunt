-- Switch the promotion payment path from Razorpay to Dodo Payments.
--
-- The tables from 20260828120000 keep their shape, their RLS posture and their
-- constraints. What changes is the provider vocabulary stored in them, plus two
-- additions the earlier schema had no need for. Idempotent throughout: safe to
-- re-run.
--
-- What did NOT change, and must not
-- ---------------------------------
-- None of these tables has a write policy, and none gains one here. The anon key
-- is public, so any signed-in user can reach PostgREST with their own Clerk
-- token; a policy that lets a user write a row lets them write *any value* into
-- it, including `status = 'active'`. Promotions and payments stay SELECT-only,
-- and the sole write path remains `createServiceClient()` from server code that
-- has already authenticated the user and verified they own the product.
--
-- The one thing that genuinely changed about pricing
-- --------------------------------------------------
-- Under Razorpay we sent an explicit amount, so `promotion_packages.amount_paise`
-- *was* the charge. Dodo Payments is a Merchant of Record: a checkout session
-- names a product in Dodo's own catalogue, and Dodo decides the figure from that
-- catalogue and adds tax. So `amount_paise` is now the price we quote and Dodo's
-- catalogue is the price we charge, which is two sources that can drift.
--
-- `dodo_product_id` is the join between them, and lib/actions/promotions.ts
-- re-reads Dodo's catalogue price on every purchase and refuses to open a
-- checkout when it does not equal `amount_paise`. That is what keeps the
-- original guarantee alive: a customer is never charged a figure other than the
-- one on screen.

-- 1. The catalogue
-- ----------------

-- Nullable, and deliberately so. There is no correct value to invent for the
-- three seeded packages: an operator has to create the matching products in the
-- Dodo dashboard and paste their ids in. Until they do, `getPromotionPackages()`
-- filters these rows out and the checkout renders "promotions are unavailable" —
-- fail-closed, rather than offering a package that cannot be bought.
alter table public.promotion_packages
  add column if not exists dodo_product_id text;

comment on column public.promotion_packages.dodo_product_id is
  'Dodo Payments product id (pdt_...) whose catalogue price must equal amount_paise. Null means this package is not purchasable and is hidden from the checkout.';

-- A Dodo product sells exactly one package. Two packages pointing at one product
-- would make `metadata.package_id` ambiguous on the way back in from a webhook.
create unique index if not exists promotion_packages_dodo_product_id_key
  on public.promotion_packages (dodo_product_id)
  where dodo_product_id is not null;

-- 2. The payment
-- --------------
-- Razorpay's three ids become Dodo's two. Renames rather than drop-and-add, so
-- any row already written keeps its data and its indexes.

-- Which provider took the money. Every new row is 'dodo'; the default is applied
-- to existing rows first, then they are corrected to 'razorpay' below, so a
-- historical charge is never mislabelled by the rename that follows it.
alter table public.payments
  add column if not exists provider text not null default 'dodo'
    check (provider in ('dodo', 'razorpay'));

do $$
begin
  -- `razorpay_order_id` still existing means this migration has not run yet, so
  -- every row present predates Dodo and was taken by Razorpay.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'razorpay_order_id'
  ) then
    update public.payments set provider = 'razorpay';
  end if;
end $$;

do $$
begin
  -- Razorpay's order id and Dodo's checkout session id occupy the same slot in
  -- the flow: created before the customer pays, unique per purchase, and the
  -- handle the return path looks a payment up by.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'razorpay_order_id'
  ) then
    alter table public.payments rename column razorpay_order_id to dodo_session_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'razorpay_payment_id'
  ) then
    alter table public.payments rename column razorpay_payment_id to dodo_payment_id;
  end if;
end $$;

-- Razorpay signed each Checkout callback with the key secret and we stored that
-- digest. Dodo has no per-payment signature: authenticity comes from the webhook
-- HMAC over the whole event body, which is verified and then discarded. A column
-- that can only ever be null from here is worse than no column.
alter table public.payments
  drop column if exists razorpay_signature;

-- What Dodo actually charged, as distinct from `amount`, which stays the net
-- figure we quoted and snapshotted from the package.
--
-- These differ whenever the Merchant of Record adds tax, and the gap is not an
-- error to reject — it is the tax Dodo collects and remits. Recording both is
-- what lets support answer "the card was debited ₹5,899 but the page said
-- ₹4,999" without a dashboard round trip.
alter table public.payments
  add column if not exists charged_amount bigint check (charged_amount >= 0);
alter table public.payments
  add column if not exists charged_currency text;
alter table public.payments
  add column if not exists charged_tax bigint check (charged_tax >= 0);

-- The hosted checkout URL Dodo returned for this session.
--
-- Stored so a customer who abandons a checkout and comes back inside the reuse
-- window is sent to the *same* session rather than being charged for a second
-- one. Razorpay needed no equivalent: its order id was enough to reopen the
-- modal, whereas Dodo's checkout lives behind a URL only the create call
-- returns. It is only ever handed back to the row's own owner.
alter table public.payments
  add column if not exists checkout_url text;

comment on column public.payments.amount is
  'Net price quoted to the customer, in paise, snapshotted from promotion_packages at purchase time.';
comment on column public.payments.charged_amount is
  'Total Dodo charged including tax, in the smallest unit of charged_currency. Null until settlement.';

-- The two unique indexes the renamed columns carry.
--
-- Renaming comes FIRST, and the order is load-bearing. Postgres keeps an index's
-- old *name* through a column rename, so on a database that held the Razorpay
-- schema `payments_razorpay_order_id_key` is still there, still unique, now
-- sitting on `dodo_session_id`. Creating the new name first would therefore
-- build a second, redundant unique index over the same column and leave the
-- Razorpay-named one behind forever. Rename, then create only what is missing.
do $$
begin
  if exists (select 1 from pg_class where relname = 'payments_razorpay_order_id_key')
     and not exists (select 1 from pg_class where relname = 'payments_dodo_session_id_key') then
    alter index public.payments_razorpay_order_id_key rename to payments_dodo_session_id_key;
  end if;

  if exists (select 1 from pg_class where relname = 'payments_razorpay_payment_id_key')
     and not exists (select 1 from pg_class where relname = 'payments_dodo_payment_id_key') then
    alter index public.payments_razorpay_payment_id_key rename to payments_dodo_payment_id_key;
  end if;
end $$;

-- Creates only on a database that never held the Razorpay schema.
create unique index if not exists payments_dodo_session_id_key
  on public.payments (dodo_session_id);

create unique index if not exists payments_dodo_payment_id_key
  on public.payments (dodo_payment_id)
  where dodo_payment_id is not null;

-- 3. Webhook idempotency ledger
-- -----------------------------
-- Same table, same purpose, new key vocabulary. Dodo delivers at least once and
-- retries on any non-2xx, so a repeated event is normal operation. The primary
-- key is Dodo's own `webhook-id` header: the handler inserts first and treats a
-- unique violation as "already processed", which makes the whole handler a no-op
-- on replay before it can touch a payment or a promotion.
--
-- No policies at all — RLS on with zero policies denies every verb to anon and
-- authenticated alike. Only the service role, and only from the webhook route.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'razorpay_webhook_events'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'dodo_webhook_events'
  ) then
    alter table public.razorpay_webhook_events rename to dodo_webhook_events;
    -- The rename does not follow the index, whose name still says razorpay.
    if exists (select 1 from pg_class where relname = 'razorpay_webhook_events_received_idx') then
      alter index public.razorpay_webhook_events_received_idx
        rename to dodo_webhook_events_received_idx;
    end if;
  end if;
end $$;

create table if not exists public.dodo_webhook_events (
  id          text primary key,
  event       text        not null,
  payment_id  text,
  -- Razorpay's `order_id`, under the name the same value now arrives as.
  session_id  text,
  received_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dodo_webhook_events'
      and column_name = 'order_id'
  ) then
    alter table public.dodo_webhook_events rename column order_id to session_id;
  end if;
end $$;

alter table public.dodo_webhook_events enable row level security;

-- Housekeeping: the ledger only needs to cover Dodo's retry horizon.
create index if not exists dodo_webhook_events_received_idx
  on public.dodo_webhook_events (received_at);
