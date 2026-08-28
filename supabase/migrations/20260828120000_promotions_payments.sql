-- Paid promotions, and the Razorpay payments that buy them.
--
-- Until now /promote was a scripted demo: `lib/promote.ts` advanced invented
-- bids client-side and no money, product or row was ever involved. This adds the
-- first real money path on the platform, so every rule below is written on the
-- assumption that the client is hostile.
--
-- The one thing this migration exists to guarantee
-- ------------------------------------------------
-- The price is a column, not a request parameter. `promotion_packages.amount_paise`
-- is the only place a rupee figure is authored; the checkout sends a package id
-- and nothing else, and the server reads the amount from here. A browser that
-- posts `{ amount: 1 }` changes nothing, because no code path anywhere accepts
-- an amount from a caller.
--
-- Why none of these tables has a write policy
-- -------------------------------------------
-- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by definition, so any signed-in user
-- can reach PostgREST directly with their own Clerk token. The launch review
-- gate (20260825000000) learned this: a policy that lets a user write a row lets
-- them write *any value* into it, including `status = 'active'`. So promotions
-- and payments carry SELECT policies only. With RLS enabled and no INSERT /
-- UPDATE / DELETE policy, those verbs are denied to every ordinary caller -- the
-- sole write path is `createServiceClient()`, reached only from server code that
-- has already authenticated the user and verified they own the product. There is
-- no trigger to add here because there is no permitted user write to gate.
--
-- Idempotent throughout: safe to re-run.

-- 1. The catalogue
-- ----------------
-- Money is stored in paise as a bigint, never rupees as a numeric. Razorpay's
-- API is denominated in paise, so this is the same unit end to end with no
-- rounding step anywhere between the column and the charge.

create table if not exists public.promotion_packages (
  id            text primary key,
  name          text        not null,
  description   text,
  -- Where the slot renders. Kept in the same vocabulary as lib/promote.ts's
  -- PROMO_SLOTS so the marketing page and the catalogue describe one product.
  placement     text        not null check (placement in ('spotlight', 'featured', 'category')),
  duration_days integer     not null check (duration_days > 0 and duration_days <= 365),
  amount_paise  bigint      not null check (amount_paise > 0 and amount_paise <= 100000000),
  currency      text        not null default 'INR' check (currency = 'INR'),
  sort_order    integer     not null default 0,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.promotion_packages enable row level security;

-- The only publicly readable table of the four: the checkout page has to render
-- prices. Inactive packages stay hidden so a retired price cannot be bought by
-- guessing its id -- the server-side lookup filters on `is_active` too.
drop policy if exists "promotion_packages_select_active" on public.promotion_packages;
create policy "promotion_packages_select_active"
  on public.promotion_packages for select
  using (is_active);

-- `on conflict do nothing`, deliberately. Re-running a migration must never
-- rewrite a live price: an operator who changed a figure in the dashboard would
-- otherwise have it silently reverted by the next `supabase db push`.
insert into public.promotion_packages
  (id, name, description, placement, duration_days, amount_paise, sort_order)
values
  ('spotlight-7d', 'Spotlight',
   'The single top placement, carried on the homepage and above the marketplace listing.',
   'spotlight', 7, 499900, 1),
  ('featured-7d', 'Featured',
   'Top row of the marketplace and of your category page.',
   'featured', 7, 249900, 2),
  ('category-7d', 'Category',
   'Top row of your category page, where browsing intent is highest.',
   'category', 7, 99900, 3)
on conflict (id) do nothing;

-- 2. The promotion
-- ----------------
-- One purchase of one slot for one product. `amount_paise` is snapshotted from
-- the package at purchase time so a later price change never rewrites what a
-- customer was charged.

create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text        not null references public.profiles (id) on delete cascade,
  product_id    uuid        not null references public.products (id) on delete cascade,
  package_id    text        not null references public.promotion_packages (id),
  placement     text        not null,
  duration_days integer     not null check (duration_days > 0),
  amount_paise  bigint      not null check (amount_paise > 0),
  currency      text        not null default 'INR',
  -- pending_payment -> active on verified payment. cancelled/refunded are
  -- terminal. 'expired' is what a lapsed window becomes; reads also compare
  -- ends_at, so a promotion stops rendering the moment it lapses whether or not
  -- anything has swept it yet.
  status        text        not null default 'pending_payment'
                  check (status in ('pending_payment', 'active', 'expired', 'cancelled', 'refunded')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  activated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.promotions enable row level security;

drop policy if exists "promotions_select_own" on public.promotions;
create policy "promotions_select_own"
  on public.promotions for select
  using (public.requesting_user_id() = user_id);

-- The database-level answer to "never activate a promotion twice".
--
-- Both the checkout's verify call and the Razorpay webhook can arrive for the
-- same payment, and a customer can buy again while a slot is still running. The
-- application makes each of those a conditional update, but this index is what
-- makes a second active row *impossible* rather than merely unlikely -- two
-- concurrent activations for one product cannot both commit.
create unique index if not exists promotions_one_active_per_product
  on public.promotions (product_id)
  where status = 'active';

create index if not exists promotions_active_window_idx
  on public.promotions (ends_at)
  where status = 'active';

create index if not exists promotions_user_idx
  on public.promotions (user_id, created_at desc);

-- Finds the reusable pending row when a customer retries a failed payment,
-- which is what stops a retry from minting a second promotion.
create index if not exists promotions_pending_retry_idx
  on public.promotions (user_id, product_id, package_id, created_at desc)
  where status = 'pending_payment';

drop trigger if exists promotions_updated_at on public.promotions;
create trigger promotions_updated_at
  before update on public.promotions
  for each row execute function public.update_updated_at();

drop trigger if exists promotion_packages_updated_at on public.promotion_packages;
create trigger promotion_packages_updated_at
  before update on public.promotion_packages
  for each row execute function public.update_updated_at();

-- 3. The payment
-- --------------
-- Razorpay identifiers and amounts only. No card number, no CVV, no OTP, no
-- PIN, no VPA -- none of it ever reaches this server: Standard Checkout collects
-- instrument details on Razorpay's own origin, and all we are handed back are
-- the three opaque ids below.

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text        not null references public.profiles (id) on delete cascade,
  promotion_id        uuid        not null references public.promotions (id) on delete cascade,
  razorpay_order_id   text        not null,
  razorpay_payment_id text,
  razorpay_signature  text,
  receipt             text        not null,
  amount              bigint      not null check (amount > 0),
  currency            text        not null default 'INR',
  status              text        not null default 'created'
                        check (status in ('created', 'pending', 'paid', 'failed', 'refunded')),
  -- Razorpay's own failure reason, kept for support. Never shown verbatim to the
  -- customer, who gets a fixed message instead.
  error_code          text,
  error_description   text,
  refunded_amount     bigint      not null default 0 check (refunded_amount >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (public.requesting_user_id() = user_id);

-- One Razorpay order is one row, forever. This is what makes order creation
-- idempotent: a double-clicked Pay button reuses the existing order rather than
-- opening a second one against the same promotion.
create unique index if not exists payments_razorpay_order_id_key
  on public.payments (razorpay_order_id);

-- And one Razorpay payment is recorded once. A replayed webhook or a repeated
-- verify call cannot land the same capture on two rows.
create unique index if not exists payments_razorpay_payment_id_key
  on public.payments (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists payments_promotion_idx on public.payments (promotion_id);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

-- Serves the "is there an open order for this promotion?" lookup on retry.
create index if not exists payments_open_idx
  on public.payments (promotion_id)
  where status in ('created', 'pending');

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.update_updated_at();

-- 4. Webhook idempotency ledger
-- -----------------------------
-- Razorpay delivers at least once and retries on any non-2xx, so the same event
-- arriving twice is normal operation, not an anomaly. The primary key is
-- Razorpay's own `x-razorpay-event-id`: the handler inserts first and treats a
-- unique violation as "already processed", which makes the whole handler a
-- no-op on replay before it can touch a payment or a promotion.
--
-- No policies at all -- RLS on with zero policies denies every verb to anon and
-- authenticated alike. Only the service role, and only from the webhook route.

create table if not exists public.razorpay_webhook_events (
  id          text primary key,
  event       text        not null,
  payment_id  text,
  order_id    text,
  received_at timestamptz not null default now()
);

alter table public.razorpay_webhook_events enable row level security;

-- Housekeeping: the ledger only needs to cover Razorpay's retry horizon.
create index if not exists razorpay_webhook_events_received_idx
  on public.razorpay_webhook_events (received_at);
