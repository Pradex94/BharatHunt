-- The Investor Directory: a curated investor dataset sold once for a fixed price.
--
-- This is the platform's second money path, and it reuses the first one's
-- machinery rather than repeating it. `lib/dodo.ts`, `lib/dodo-signature.ts`,
-- the single `/api/webhooks/dodo` route and the `dodo_webhook_events`
-- idempotency ledger are all shared with promotions; what is new here is the
-- data being sold, and one purchase table to record who may see it.
--
-- The one thing this migration exists to guarantee
-- -----------------------------------------------
-- **The premium rows are unreachable with the anon key.** NEXT_PUBLIC_SUPABASE_ANON_KEY
-- ships in the browser, so anyone can point PostgREST at `/rest/v1/investors`
-- with their own Clerk token and ask for `select=*`. The SELECT policy below
-- therefore admits *only* the free-preview rows -- not "the rows you paid for",
-- which would put the entitlement test inside a policy that a later schema
-- change could quietly widen. Paid reads happen exclusively through
-- `createServiceClient()` in server-only code that has already checked the
-- purchase (services/investors.ts), so there are two independent gates and the
-- weaker one still fails closed.
--
-- Why the entitlement is not its own table
-- ----------------------------------------
-- Access *is* a settled payment: `investor_directory_purchases.status = 'paid'`.
-- A separate entitlement row would be a second fact that has to be kept in step
-- with the first, and the failure mode of that drift is either a customer who
-- paid and cannot see the directory, or a refunded customer who still can. One
-- row, one truth: a full refund flips the same row to `refunded` and the access
-- goes with it.
--
-- Why none of these tables has a write policy
-- -------------------------------------------
-- Same rule the promotions schema (20260828120000) established and the launch
-- review gate (20260825000000) learned the hard way: a policy that lets a user
-- write a row lets them write *any value* into it, including `status = 'paid'`.
-- So purchases carry a SELECT policy only, and `investors` carries no write
-- policy at all. Every write is `createServiceClient()` from server code that
-- has already authenticated the caller.
--
-- Idempotent throughout: safe to re-run.

-- 1. The catalogue
-- ----------------
-- One row today (`full-access`, 49900 paise). A table rather than a constant
-- because the price a card is about to be charged must be a column the server
-- reads, never a figure a request can carry -- the guarantee
-- `promotion_packages` exists for, applied to the second product.

create table if not exists public.investor_directory_plans (
  id              text primary key,
  name            text        not null,
  description     text,
  amount_paise    bigint      not null check (amount_paise > 0 and amount_paise <= 100000000),
  currency        text        not null default 'INR' check (currency = 'INR'),
  -- Dodo Payments product id (pdt_...) whose catalogue price must equal
  -- `amount_paise`. Nullable, and deliberately so: there is no correct value to
  -- invent for the seeded plan. Until an operator creates the product in the
  -- Dodo dashboard and pastes its id here, the plan is not purchasable and the
  -- page renders "unavailable" rather than a Pay button that always errors.
  dodo_product_id text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.investor_directory_plans enable row level security;

-- Publicly readable: the landing page has to render a price before anyone has
-- signed in. Inactive plans stay hidden so a retired price cannot be bought by
-- guessing its id -- the server-side lookup filters on `is_active` too.
drop policy if exists "investor_directory_plans_select_active" on public.investor_directory_plans;
create policy "investor_directory_plans_select_active"
  on public.investor_directory_plans for select
  using (is_active);

comment on column public.investor_directory_plans.dodo_product_id is
  'Dodo Payments product id (pdt_...) whose catalogue price must equal amount_paise. Null means the directory is not purchasable and the page says so.';

-- `on conflict do nothing`: re-running a migration must never rewrite a live
-- price, or an operator's dashboard edit would be reverted by the next push.
insert into public.investor_directory_plans (id, name, description, amount_paise)
values (
  'full-access',
  'Investor Directory - Full Access',
  'One-time purchase of the complete Bharat Hunt Investor Directory, with search, filters and full investor profiles.',
  49900
)
on conflict (id) do nothing;

drop trigger if exists investor_directory_plans_updated_at on public.investor_directory_plans;
create trigger investor_directory_plans_updated_at
  before update on public.investor_directory_plans
  for each row execute function public.update_updated_at();

-- 2. The data being sold
-- ----------------------
-- Deliberately flat. Stages, sectors and portfolio are `text[]` rather than
-- join tables: they are short, unordered tag lists that are always read whole
-- and never joined against anything, and a GIN index makes containment queries
-- on them cheap. Three lookup tables would buy referential integrity over
-- vocabulary that lives in lib/investors.ts either way.

create table if not exists public.investors (
  id                 uuid primary key default gen_random_uuid(),
  -- The display name: a fund's own name, or an angel's name.
  name               text        not null check (length(btrim(name)) between 1 and 120),
  -- The firm behind the person, when the two differ. Null for a fund.
  firm_name          text        check (firm_name is null or length(firm_name) <= 160),
  logo_url           text,
  website            text,
  location           text,
  -- Angel / VC / Micro VC / Accelerator / Family Office / Syndicate / CVC.
  -- Free text with a length bound rather than an enum: the vocabulary lives in
  -- lib/investors.ts, and an enum would make adding "Venture Debt" a migration.
  investor_type      text        check (investor_type is null or length(investor_type) <= 60),
  investment_stages  text[]      not null default '{}',
  sectors            text[]      not null default '{}',
  -- Whole rupees, NOT paise. The payment tables are paise-denominated because
  -- that is the unit Dodo charges in; a cheque size is an editorial figure
  -- typed by an admin, and storing 5000000 rather than 500000000 for a fifty
  -- lakh cheque is the difference between a readable admin form and a bug.
  check_size_min_inr bigint      check (check_size_min_inr is null or check_size_min_inr >= 0),
  check_size_max_inr bigint      check (check_size_max_inr is null or check_size_max_inr >= 0),
  thesis             text,
  portfolio          text[]      not null default '{}',
  email              text,
  linkedin           text,
  -- Anything else worth showing that has no column of its own (a pitch form
  -- link, an office address). Rendered as one block, never parsed.
  contact_details    text,
  -- The free sample. Four of these are visible to everyone, signed in or not;
  -- see INVESTOR_FREE_PREVIEW_LIMIT in lib/investors.ts, which is the ceiling
  -- the query actually applies. Flagging more rows than that limit is harmless
  -- -- the query still returns at most the limit.
  is_free_preview    boolean     not null default false,
  is_published       boolean     not null default true,
  -- True for the seeded demonstration records below. The page renders a plain
  -- notice while any are present, so a visitor is never shown invented data
  -- presented as research. Set false (or delete the rows) once real investors
  -- are imported.
  is_sample          boolean     not null default false,
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint investors_check_size_order
    check (
      check_size_min_inr is null
      or check_size_max_inr is null
      or check_size_max_inr >= check_size_min_inr
    )
);

alter table public.investors enable row level security;

-- THE policy. Free previews and nothing else, for anon and authenticated alike.
--
-- Note what is absent: any mention of a purchase. A paid customer's own Clerk
-- token gets exactly what a stranger's does from PostgREST -- the preview rows
-- -- and the premium set is reachable only through the service role, from
-- server code that checked the purchase first. That is the property worth
-- defending: the dataset is the product, and a policy that widened by accident
-- would give it away with no failure anyone would notice.
drop policy if exists "investors_select_free_preview" on public.investors;
create policy "investors_select_free_preview"
  on public.investors for select
  using (is_published and is_free_preview);

create index if not exists investors_published_idx
  on public.investors (sort_order, created_at desc)
  where is_published;

create index if not exists investors_free_preview_idx
  on public.investors (sort_order)
  where is_published and is_free_preview;

-- Containment queries: "investors who do Seed", "investors in FinTech".
create index if not exists investors_stages_idx on public.investors using gin (investment_stages);
create index if not exists investors_sectors_idx on public.investors using gin (sectors);

drop trigger if exists investors_updated_at on public.investors;
create trigger investors_updated_at
  before update on public.investors
  for each row execute function public.update_updated_at();

-- 3. The purchase
-- ---------------
-- Shaped like `payments` (20260828120000 / 20260831090000) and for the same
-- reasons, but a separate table rather than a nullable `promotion_id` on that
-- one: `payments.promotion_id` is `not null` and every index and settlement
-- path is built on that being true. Widening it would put the live promotion
-- money path at risk to save a table.
--
-- No card number, no CVV, no UPI VPA: Dodo collects instrument details on its
-- own origin and hands back opaque ids.

create table if not exists public.investor_directory_purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           text        not null references public.profiles (id) on delete cascade,
  plan_id           text        not null references public.investor_directory_plans (id),
  dodo_session_id   text        not null,
  dodo_payment_id   text,
  -- The hosted checkout URL, so a customer who abandons and comes back inside
  -- the reuse window is sent to the *same* session rather than charged for a
  -- second one.
  checkout_url      text,
  receipt           text        not null,
  -- Net price quoted, in paise, snapshotted from the plan at purchase time.
  amount            bigint      not null check (amount > 0),
  currency          text        not null default 'INR',
  -- What Dodo actually charged, tax included. Dodo is the Merchant of Record,
  -- so this is expected to exceed `amount` -- see the note in
  -- lib/promotion-activation.ts on why settlement is an identity check and not
  -- an amount equality.
  charged_amount    bigint      check (charged_amount >= 0),
  charged_currency  text,
  charged_tax       bigint      check (charged_tax >= 0),
  status            text        not null default 'created'
                      check (status in ('created', 'pending', 'paid', 'failed', 'refunded')),
  -- Dodo's own failure reason, kept for support. Never shown verbatim to the
  -- customer, who gets a fixed message instead.
  error_code        text,
  error_description text,
  refunded_amount   bigint      not null default 0 check (refunded_amount >= 0),
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.investor_directory_purchases enable row level security;

-- A customer may read their own receipts. Nothing may write.
drop policy if exists "investor_directory_purchases_select_own" on public.investor_directory_purchases;
create policy "investor_directory_purchases_select_own"
  on public.investor_directory_purchases for select
  using (public.requesting_user_id() = user_id);

-- One Dodo session is one row, forever. This is what makes session creation
-- idempotent and what `settleInvestorPurchase` looks a payment up by.
create unique index if not exists investor_directory_purchases_session_key
  on public.investor_directory_purchases (dodo_session_id);

-- And one Dodo payment is recorded once, so a replayed webhook or a repeated
-- verify call cannot land the same capture on two rows.
create unique index if not exists investor_directory_purchases_payment_key
  on public.investor_directory_purchases (dodo_payment_id)
  where dodo_payment_id is not null;

-- Deliberately NOT unique. A second successful purchase by the same person is
-- a support case to refund, not a settlement to refuse: a unique index here
-- would make the webhook unable to record money that has already left their
-- account. `createInvestorCheckout` refuses to open a second session instead,
-- which is the gate that can fail safely.
create index if not exists investor_directory_purchases_paid_idx
  on public.investor_directory_purchases (user_id)
  where status = 'paid';

create index if not exists investor_directory_purchases_user_idx
  on public.investor_directory_purchases (user_id, created_at desc);

-- Serves the "is there an open session for this customer?" lookup on retry.
create index if not exists investor_directory_purchases_open_idx
  on public.investor_directory_purchases (user_id, created_at desc)
  where status in ('created', 'pending');

drop trigger if exists investor_directory_purchases_updated_at on public.investor_directory_purchases;
create trigger investor_directory_purchases_updated_at
  before update on public.investor_directory_purchases
  for each row execute function public.update_updated_at();

-- 4. Demonstration records
-- ------------------------
-- Twelve rows so the page has something to render before a real dataset is
-- imported. Every one is `is_sample = true` and the page says so in plain
-- language while any are present.
--
-- Nothing here describes a real investor. The fund names are invented, the
-- websites and addresses use the RFC 2606 reserved `example.com` domain so no
-- link or mailbox points at anyone, and no natural person is named. That is a
-- hard rule for this product: an investor directory that ships with plausible
-- fabrications about real firms is not a seed dataset, it is a liability.
--
-- The four `is_free_preview` rows are what a visitor sees for free. Replace
-- these rows via /admin/investors, or delete them once real data lands.

-- Guarded by "has this ever been seeded", not `on conflict do nothing`: there is
-- no natural unique key on an investor (two funds may share a name, and adding
-- one would be a constraint on real data invented to serve a seed), so a
-- conflict clause would have nothing to bite on and a re-run would insert
-- twelve more rows. The `is_sample` test also means an operator who edited or
-- deleted the samples does not get them back on the next `supabase db push`.
do $$
begin
  if exists (select 1 from public.investors where is_sample) then
    return;
  end if;

  insert into public.investors
    (name, firm_name, website, location, investor_type, investment_stages, sectors,
     check_size_min_inr, check_size_max_inr, thesis, portfolio, email, linkedin,
     contact_details, is_free_preview, is_sample, sort_order)
  values
  ('Aarambh Ventures', null, 'https://example.com', 'Bengaluru, Karnataka', 'Micro VC',
   '{"Pre-Seed","Seed"}', '{"SaaS","Developer Tools","AI"}',
   2500000, 25000000,
   'Sample record. Backs technical founding teams building developer-first software out of India for a global market.',
   '{"Sample Portfolio Co","Sample Analytics"}',
   'partners@example.com', null,
   'Sample contact block. Warm introductions preferred; cold pitches reviewed monthly.',
   true, true, 1),

  ('Prithvi Seed Partners', null, 'https://example.com', 'Mumbai, Maharashtra', 'VC',
   '{"Seed","Series A"}', '{"FinTech","Consumer"}',
   10000000, 120000000,
   'Sample record. Invests in consumer financial services reaching first-time formal-credit customers.',
   '{"Sample Lending Co","Sample Payments"}',
   'hello@example.com', null, null,
   true, true, 2),

  ('Uttara Capital', null, 'https://example.com', 'Gurugram, Haryana', 'VC',
   '{"Series A","Series B"}', '{"B2B","Logistics","SaaS"}',
   40000000, 400000000,
   'Sample record. Growth-stage cheques into supply-chain and B2B commerce infrastructure.',
   '{"Sample Freight","Sample Warehouse OS"}',
   'team@example.com', null, null,
   true, true, 3),

  ('Nirmaan Angels', null, 'https://example.com', 'Hyderabad, Telangana', 'Syndicate',
   '{"Pre-Seed","Seed"}', '{"Health","Education","Consumer"}',
   1000000, 10000000,
   'Sample record. Operator-led syndicate writing first cheques alongside an institutional lead.',
   '{"Sample Clinic App"}',
   'syndicate@example.com', null,
   'Sample contact block. Applications reviewed in batches.',
   true, true, 4),

  ('Dhruva Growth Partners', null, 'https://example.com', 'Bengaluru, Karnataka', 'VC',
   '{"Series A","Series B","Series C"}', '{"SaaS","AI","Enterprise"}',
   80000000, 800000000,
   'Sample record. Leads growth rounds in enterprise software with demonstrated net revenue retention.',
   '{"Sample Data Cloud","Sample Security Co"}',
   'invest@example.com', null, null,
   false, true, 5),

  ('Saanjh Fund', null, 'https://example.com', 'Pune, Maharashtra', 'Micro VC',
   '{"Pre-Seed","Seed"}', '{"Consumer","D2C","Food"}',
   2000000, 20000000,
   'Sample record. Early cheques into consumer brands with an offline-first distribution edge.',
   '{"Sample Beverages"}',
   'founders@example.com', null, null,
   false, true, 6),

  ('Chitra Early Stage', null, 'https://example.com', 'Chennai, Tamil Nadu', 'Micro VC',
   '{"Pre-Seed"}', '{"Deep Tech","Hardware","AI"}',
   1500000, 15000000,
   'Sample record. Pre-product cheques into research-heavy teams commercialising hardware and applied AI.',
   '{"Sample Robotics"}',
   'contact@example.com', null, null,
   false, true, 7),

  ('Vayu Capital Collective', null, 'https://example.com', 'Bengaluru, Karnataka', 'Family Office',
   '{"Seed","Series A"}', '{"Climate","Energy","Mobility"}',
   20000000, 200000000,
   'Sample record. Patient capital into climate and energy-transition businesses with hard assets.',
   '{"Sample Solar","Sample Grid Co"}',
   'office@example.com', null, null,
   false, true, 8),

  ('Kalpataru Accelerator', null, 'https://example.com', 'Ahmedabad, Gujarat', 'Accelerator',
   '{"Pre-Seed"}', '{"SaaS","Marketplace","AgriTech"}',
   500000, 3000000,
   'Sample record. Twelve-week cohort programme with a standard first cheque and demo day.',
   '{"Sample Agri Marketplace"}',
   'apply@example.com', null,
   'Sample contact block. Two cohorts a year; applications open ahead of each.',
   false, true, 9),

  ('Meghdoot Ventures', null, 'https://example.com', 'Jaipur, Rajasthan', 'Micro VC',
   '{"Seed"}', '{"Consumer","Travel","Media"}',
   3000000, 30000000,
   'Sample record. Seed cheques into consumer internet businesses serving non-metro India.',
   '{"Sample Travel App"}',
   'seed@example.com', null, null,
   false, true, 10),

  ('Trisandhya Capital', null, 'https://example.com', 'Kolkata, West Bengal', 'VC',
   '{"Series A"}', '{"FinTech","InsurTech","B2B"}',
   50000000, 300000000,
   'Sample record. Series A investor in regulated financial infrastructure and insurance distribution.',
   '{"Sample Insurance Co"}',
   'ir@example.com', null, null,
   false, true, 11),

  ('Anugraha Corporate Ventures', null, 'https://example.com', 'Noida, Uttar Pradesh', 'CVC',
   '{"Series A","Series B"}', '{"Enterprise","AI","Cybersecurity"}',
   60000000, 500000000,
   'Sample record. Corporate venture arm investing where there is a commercial partnership on offer.',
   '{"Sample Threat Intel"}',
   'ventures@example.com', null, null,
   false, true, 12);
end $$;
