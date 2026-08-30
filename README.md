# Bharat Hunt

A curated marketplace for discovering, upvoting, and launching premium software — lifetime deals and tools built by founders, for founders. Products are submitted, ranked by a time-decayed trending score, filtered by category and pricing, and discussed in comments.

The interface runs a **warm editorial design system** (the Claude.com aesthetic): a cream canvas, a single coral accent, dark-navy surfaces for the footer and callouts, a serif display face paired with a humanist sans, and monospace reserved for numbers.

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Server Components, Server Actions, Turbopack)
- **[React 19](https://react.dev)** + **TypeScript** (strict)
- **[Supabase](https://supabase.com)** — Postgres, Row-Level Security, PostgREST
- **[Clerk](https://clerk.com)** — auth via third-party JWTs into Supabase
- **[Tailwind CSS v4](https://tailwindcss.com)** with `@theme` tokens
- **[shadcn/ui](https://ui.shadcn.com)** on **[Base UI](https://base-ui.com)** primitives
- **[Framer Motion](https://www.framer.com/motion/)** — reduced-motion aware
- **[Lucide](https://lucide.dev)** icons
- Fonts (via `next/font`): **Fraunces** (serif display), **Inter** (body/UI), **JetBrains Mono** (code/numbers)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>   # server-only; used by the Clerk webhook

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-clerk-publishable-key>
CLERK_SECRET_KEY=<your-clerk-secret-key>
CLERK_WEBHOOK_SIGNING_SECRET=<your-clerk-webhook-signing-secret>

# Email — Sendgrove Unified API v2 for advertising inquiry mail (lib/email.ts)
SENDGROVE_API_KEY=<keyId>:<keySecret>         # sent as the X-API-Key header
EMAIL_FROM=Bharat Hunt <ads@bharathunt.org>   # must be a VERIFIED sender
EMAIL_FALLBACK_FROM=Bharat Hunt <info@bharathunt.org>   # optional; see below

# Dodo Payments — payments for /promote/checkout (REQUIRED to sell promotion slots)
# Both are SERVER-ONLY. Dodo issues no publishable key; every key is secret.
DODO_PAYMENTS_API_KEY=dodo_test_xxxxxxxxxxxxxxxx
DODO_PAYMENTS_WEBHOOK_KEY=whsec_xxxxxxxxxxxxxxxx   # a DIFFERENT value from the API key
DODO_PAYMENTS_ENVIRONMENT=test_mode                # anything but live_mode means test_mode

# Cloudflare Turnstile — captcha on the /advertise inquiry form (REQUIRED for that form)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<your-turnstile-site-key>
TURNSTILE_SECRET_KEY=<your-turnstile-secret-key>

# Cloudinary — image uploads on /submit (REQUIRED to upload; URL paste still works without it)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=<your-UNSIGNED-upload-preset>

# Google Analytics — optional. Not a secret; it ships in the page source.
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX          # GA4 measurement ID; empty = GA4 off
NEXT_PUBLIC_GA_DEBUG=true               # mount the tag in dev too (see below)
```

Turnstile is **required and fail-closed**: `submitAdInquiry` rejects every submission when `TURNSTILE_SECRET_KEY` is unset, so without both keys the /advertise form is not merely unprotected — it cannot accept a lead at all. When the site key is missing the form replaces itself with an email fallback rather than rendering a button that can never succeed. Create a widget at [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) and add your domain (plus `localhost` for dev).

Sending an advertising inquiry **requires a logged-in account**. `submitAdInquiry` rejects anonymous callers, the lead is stored against the submitter's `user_id`, and the RLS insert policy on `ad_inquiries` only accepts a row whose `user_id` matches the caller's Clerk id — so the `20260817000000_ad_inquiries_require_login` migration must be applied before the form can store anything.

Email is **optional and fail-open**: without `SENDGROVE_API_KEY` the /advertise form still stores the lead in Supabase and shows the success state — it just logs that no mail was sent.

### Image uploads (Cloudinary)

`lib/upload.ts` posts straight from the browser to Cloudinary as an **unsigned**
upload, so the preset it names must be set to `Unsigned` in the Cloudinary
console (**Settings → Upload → Upload presets → your preset → Signing Mode**).
A preset left on the default `Signed` fails every upload with:

```
Upload preset must be whitelisted for unsigned uploads
```

That is a console setting, not a code change — nothing in this repo can override
it. Both variables are missing from `.env.local` by default, in which case the
uploader refuses politely ("Image uploads aren't configured") and makers can
still paste image URLs.

> **Unsigned means public.** The cloud name and preset ship in the page source,
> so anyone can upload to that preset. Keep the preset restricted in Cloudinary
> (allowed formats, max file size, a dedicated folder), or move to signed
> uploads via a server route if abuse shows up.

> **Verify the sender, not just the domain.** Sendgrove rejects an unverified `from` with `403 FORBIDDEN` even when the domain is authenticated: *"Authenticating the domain (bharathunt.org) alone is not enough."* Add the exact address under **Senders & Domains** and confirm the OTP it emails you.

`EMAIL_FALLBACK_FROM` covers the gap while a new sender is still pending verification: if `EMAIL_FROM` comes back unverified, the send is retried once from the fallback and a warning is logged. Once the intended address is verified the fallback stops being used, and you can drop the variable.

### How to configure Google Analytics

GA4 is the only analytics tag on the site — loaded directly as `gtag.js`, with no
Tag Manager container in between.

**1. Set the measurement ID.** It comes from GA4 Admin → Data streams → your web
stream → Measurement ID (`G-XXXXXXXXXX`). It is not a secret — every GA site
ships its ID in the page source.

| Where | What to do |
| --- | --- |
| Local | `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX` in `.env.local` |
| Vercel | Settings → Environment Variables → add `NEXT_PUBLIC_GA_ID` for Production (and Preview if you want preview traffic measured), then redeploy |
| Fallback | `lib/constants.ts` carries the project's own ID as the default, so a checkout with no env var still reports correctly |

Because `NEXT_PUBLIC_*` values are inlined at build time, changing the variable
in Vercel needs a **redeploy** to take effect — restarting is not enough.

Setting `NEXT_PUBLIC_GA_ID` to an *empty* value switches GA4 off entirely: no
script, no requests, nothing to break.

**2. Turn off Enhanced measurement's "Page changes based on browser history
events"** (GA4 Admin → Data streams → your stream → Enhanced measurement). The
App Router navigates via `history.pushState`, and
`components/analytics/ga-page-views.tsx` already sends a `page_view` for every
route. Leaving the GA4 setting on double-counts every navigation.

**3. Verify.** `npm run build && npm start`, open `/`, click through to
`/marketplace` and a product page, and watch GA4 → Reports → Realtime. Three
page views with three different paths means the SPA tracking works. In dev, set
`NEXT_PUBLIC_GA_DEBUG=true` first.

#### How it works

- **Consent Mode v2.** The tag always loads, but `ad_storage`, `ad_user_data`,
  `ad_personalization` and `analytics_storage` default to *denied* and only flip
  to granted when a visitor accepts the cookie banner. Until then GA4 sends
  cookieless pings and stores nothing on the device — which is what `/cookies`
  and `/privacy` promise in writing, so keep those pages in step with any change
  here.
- **Off outside production** unless `NEXT_PUBLIC_GA_DEBUG=true`, so local
  browsing does not land in the reports.
- **Admin and API paths are never tracked.** `UNTRACKED_PATH_PREFIXES` in
  `lib/analytics.ts` drops `/admin` and `/api`; add `/dashboard` there if
  signed-in maker pages should stay out too.
- **Helpers live in `lib/analytics.ts`** — `initAnalytics()`,
  `trackPageView(path)`, `trackEvent(name, params)` and `updateConsentSignals()`.
  They no-op during SSR, when GA is off, and when the loader was blocked, so a
  call site never needs a guard:

  ```ts
  "use client";
  import { trackEvent } from "@/lib/analytics";

  trackEvent("upvote", { product_slug: slug });
  ```

- **One script, one place.** The bootstrap is rendered by
  `components/analytics/google-analytics.tsx` inside the explicit `<head>` in
  `app/layout.tsx`. That placement is load-bearing and the file explains why —
  read the comment before moving it.

Clerk is wired to Supabase as a [third-party auth provider](https://clerk.com/docs/integrations/databases/supabase): the browser/server Supabase clients attach the Clerk session token, and RLS policies authorize against the JWT's `sub` claim (see `supabase/migrations/`).

### 3. Set up the database

Apply the migrations in `supabase/migrations/` to your Supabase project (via the [Supabase CLI](https://supabase.com/docs/guides/cli) `supabase db push`, or by running the SQL in the dashboard). `supabase/seed.sql` contains demo products.

> **Every migration belongs in `supabase/migrations/`.** SQL kept anywhere else never reaches `db push`, and the app degrades quietly rather than failing loudly: a missing `ad_inquiries` table dropped advertising leads, and the missing Phase 2 columns made the launch form discard CTA, platform links, tech stack, offers and roadmap data on save. If a feature's fields aren't persisting, check the migrations ran before debugging the code.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Profiles & the Clerk webhook:** new users get a `profiles` row from the Clerk `user.created` webhook (`app/api/webhooks/clerk/route.ts`). Because that webhook can't reach `localhost` without a tunnel, the app also self-heals — `lib/ensure-profile.ts` upserts the profile on first submit/upvote/comment, so those actions work locally without configuring the webhook.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

Type-check with `npx tsc --noEmit`.

## Routes

| Path | Description |
| --- | --- |
| `/` | Landing — featured / latest / by-category rails and a coral CTA |
| `/marketplace` | Browse all products: sidebar filters (category, pricing), search, sort, "load more" |
| `/products/[slug]` | Product detail — description, screenshots, upvotes, comments |
| `/products/[slug]/edit` | Edit a product (creator only) |
| `/submit` | Submit a new product |
| `/categories`, `/categories/[slug]` | Category index + per-category listings (real taxonomy, live counts) |
| `/collections`, `/collections/[slug]` | Curated editorial groupings that resolve to live product queries |
| `/blog`, `/blog/[slug]` | Editorial blog |
| `/login`, `/signup` | Clerk auth |
| `/admin` | Admin only — the review queue, plus every product and the platform stats |
| `/admin/review/[id]` | Where the Approve / Send back links in the review email land |
| `/promote` | Promotion marketing page — the auction board is a preview; links to checkout |
| `/promote/checkout` | Buy a fixed-price promotion slot (Dodo Payments hosted checkout) |
| `/api/webhooks/clerk` | Syncs Clerk users into the `profiles` table |
| `/api/webhooks/dodo` | Settles payments and activates promotions (signed, idempotent) |

## Paid promotions (Dodo Payments)

`/promote/checkout` sells fixed-price promotion slots through Dodo Payments' hosted checkout. Dodo is
a **Merchant of Record**: it is the legal seller on every transaction, so it calculates and remits
the sales tax and issues the invoice. Two things follow from that and both are visible in the code.

**The customer is charged more than the sticker price, on purpose.** `promotion_packages.amount_paise`
is the net price we quote; Dodo adds the tax for the customer's jurisdiction on top. The checkout says
so above the Pay button, `payments.amount` stores the net figure and `payments.charged_amount` stores
what was actually taken, and the receipt shows the charged total so it agrees with the card statement.

**The price lives in two places, and they are reconciled before every purchase.** A Dodo checkout
session names a `product_id`, not an amount — so each package row carries a `dodo_product_id`, and
`createPromotionCheckout` reads that product's catalogue price back from Dodo and **refuses to open a
checkout unless it equals `amount_paise` in the same currency**, with no discount and no
pay-what-you-want. That preserves what sending an explicit amount used to give for free: a customer is
never charged a figure the page did not show them. A package with no `dodo_product_id` is hidden from
the checkout entirely rather than offered with a Pay button that cannot work.

**The browser never decides the price.** The checkout posts a package id and a product id. No
parameter on `createPromotionCheckout` can carry an amount.

**Nothing is marked paid because the customer came back.** Dodo returns them to
`/promote/checkout?status=success&promotion=<id>`, which is a claim, not evidence.
`confirmPromotionPayment` looks that promotion up **among the caller's own payment rows**, reads the
checkout session id from that row rather than from the request, asks Dodo over the API whether the
session produced a payment and what its status is, then re-reads the payment for its amount, currency
and metadata. `settlePayment` then refuses anything that does not bind back: the session must be ours,
the `promotion_id` in the session metadata must match, the currency must match, and the charge must
not be *less* than the price we quoted. Only then does the payment become `paid` and the promotion
`active`.

A returned payment that is neither settled nor dead — a UPI mandate awaiting approval, an unfinished
3DS step — is reported as **pending**, never as a failure. Telling that customer the payment failed is
how they end up paying twice.

**`promotions` and `payments` have SELECT policies only.** With RLS on and no INSERT/UPDATE/DELETE
policy, the anon key cannot write them at all — the sole write path is the service-role client, and
the authorization happens in `lib/actions/promotions.ts` before each write. Same reasoning as the
launch review gate below.

### The webhook

Point Dodo at `https://bharathunt.org/api/webhooks/dodo` and subscribe to `payment.succeeded`,
`payment.failed`, `payment.cancelled`, `payment.processing` and `refund.succeeded`. The body is
verified to the [Standard Webhooks](https://www.standardwebhooks.com) spec against
`DODO_PAYMENTS_WEBHOOK_KEY` — a **different value** from the API key; swapping the two fails every
delivery silently and paid promotions never activate.

`lib/dodo-signature.ts` implements that check with no SDK import and no `server-only` marker, so
`npm test` can exercise it in plain Node. It is pinned to a golden vector generated from the
`standardwebhooks` package the SDK itself verifies with, which is what catches a drift a round-trip
test cannot see.

Delivery is at-least-once, so the handler is idempotent four ways: the signed content includes the
delivery timestamp, so a captured body stops verifying after five minutes; `dodo_webhook_events` is a
ledger keyed on Dodo's `webhook-id` header and short-circuits a replay before any handler runs; every
settlement update is conditioned on the row's current status; and a partial unique index
(`promotions (product_id) where status = 'active'`) makes a second live slot for one product
impossible rather than merely unlikely. Refund totals are recomputed from Dodo's own refund list
rather than accumulated per event, so a replayed refund cannot double-count.

### Test mode

Unlike the Razorpay integration this replaced, there **is** a test branch, because Dodo has two base
URLs and two key formats. `DODO_PAYMENTS_ENVIRONMENT` must say `live_mode` exactly; anything else,
including unset, selects test mode. A key whose prefix disagrees with the selected environment is
refused before any request goes out.

### What is not wired yet

A purchased slot is charged, recorded and visible to its buyer, but **promoted placements are not yet
rendered on the marketplace or homepage**. `getActivePromotions()` in `services/promotions.ts` is the
seam those queries will read from. Do not advertise the checkout publicly until that is done.

## Launch review

Nothing published itself. A submitted product enters the queue as `status = 'pending'`, and only an
approval moves it to `'published'`.

**The gate is in Postgres, not in the action.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by
definition, so a maker holding their own Clerk session can call PostgREST directly, and the existing
"creators can update their own products" policy would accept `status = 'published'`. The trigger in
`20260825000000_launch_review_queue.sql` refuses that status — and any change to `published_at` —
from every Postgres role except `service_role`, which only `createServiceClient()` reaches. The
server action is the pleasant way to approve; the trigger is what makes approval *required*.

The flow:

1. A maker submits. The row is stored as `pending`, so it is invisible everywhere public (every
   marketplace query, search function, sitemap entry and category count already filters on
   `status = 'published'`), and they land on `/dashboard?submitted=…`.
2. Two mails go out: the queue prompt to `ADMIN_EMAILS`, and an acknowledgement to the maker. Both
   are fail-open — `/admin` is the durable record, mail is only the prompt.
3. The admin approves or sends it back, either from `/admin` or from the mail. Approving sets
   `published_at` and sends the maker the "you're live" receipt; sending it back returns the product
   to their drafts with an optional note, and the dashboard grows a **Submit for review** button so
   they can revise and requeue it.

**One-click from the mail** needs `ADMIN_REVIEW_SECRET`. Links are HMACs over the product id, the
action and a 7-day expiry (`lib/review-token.ts`), so an approve link cannot be edited into a reject
link, moved to another product, or given a longer life. Without the variable the mail still arrives
and simply links to `/admin`, which is gated by the Clerk session — the feature degrades to "sign in
and approve", never to "anyone can approve". `/admin/review/[id]` only *displays* the decision;
approving is a POST, because mail scanners fetch every link in a message before a human sees it.

Existing published products are untouched by the migration. **Apply it before deploying the app** —
a build that inserts `'pending'` against the old `products_status_check` cannot accept a launch.

## Project structure

```
app/                 Routes (App Router)
components/
  layout/            Navbar, footer
  marketplace/       Sidebar, sort pills, search, product list
  products/          Product card, comment, upvote, forms
  ui/                Design-system primitives (button, card, typography, …)
lib/
  actions/           Server Actions (products, comments, upvotes, marketplace)
  supabase/          Server + browser Supabase clients
  constants.ts       Category taxonomy, sorts, pricing types
  collections.ts     Curated collection definitions
  blog.ts            Blog post content
  ensure-profile.ts  Self-healing profile upsert
services/            Data-access layer (product queries)
supabase/            Migrations + seed
design.md            The locked design system (single source of truth)
```

## Design system

`design.md` is the locked source of truth for the visual system — the cream/coral/navy trinity, the Fraunces + Inter + JetBrains Mono type split, spacing, radius, and motion rules. The tokens are implemented natively in `app/globals.css` (Tailwind `@theme` + shadcn CSS variables). Read `design.md` before making visual changes.

## Deploy

Deploys cleanly to [Vercel](https://vercel.com/new). Set the same environment variables in the project settings, point the Clerk webhook at `https://bharathunt.org/api/webhooks/clerk`, and apply the Supabase migrations to your production database.

### Function region

`vercel.json` pins Serverless Functions to **`bom1` (Mumbai)**. JSON takes no
comments, so the reasoning lives here.

Vercel's default region is `iad1` (Washington DC), and the audience is in India
while the Supabase project is in AWS `ap-northeast-1` (Tokyo) — so `iad1` was
the worst of the three available choices, paying a trans-Atlantic hop to reach
the user *and* a trans-Pacific hop to reach the database. Production response
headers showed it plainly: `X-Vercel-Id: bom1::iad1::…` — received at the Mumbai
edge, executed in Virginia.

`bom1` puts the function where the edge already terminates and where the users
are, and shortens the database leg as well (Mumbai→Tokyo rather than
Virginia→Tokyo). Every dynamic route benefits: `/marketplace`,
`/products/[slug]`, `/categories/*`, `/collections/*`, `/dashboard`, `/submit`.

**The remaining win here is the database, not the function.** Moving the
Supabase project to `ap-south-1` (Mumbai) would put it in the same region as the
functions and cut roughly 120ms off every round trip a dynamic page makes. That
is a project migration, not a config change, so it is called out rather than
done.

### Domain and DNS

The site is **bharathunt.org**, served by Vercel. The records it needs:

| Type  | Name  | Value                                             | Purpose                                     |
| ----- | ----- | ------------------------------------------------- | ------------------------------------------- |
| A     | `@`   | `76.76.21.21`                                     | Vercel's anycast address for the apex       |
| CNAME | `www` | `cname.vercel-dns.com`                            | `www` on the same project (Vercel redirects it to the apex) |
| MX    | `@`   | `mail.sendgrove.com`                              | inbound mail for `@bharathunt.org`          |
| TXT   | `@`   | `v=spf1 a mx include:spf.smtp1.sendgrove.net ~all` | SPF, so Sendgrove's mail is not spam-filed  |

`NEXT_PUBLIC_SITE_URL` is an **override, not a requirement**. `lib/constants.ts` defaults `SITE_URL` to `https://bharathunt.org`, because that value is what every canonical tag, sitemap entry, OG image and JSON-LD node points a crawler at — a production build that forgot the variable would otherwise hand Google the `.vercel.app` host and split the site's ranking across two origins. Set the variable only for a deployment that should describe itself as something else (a preview, a staging domain).

### Cloudflare

Two ways to use it, and the difference reaches the code.

**DNS only (grey cloud).** Cloudflare answers DNS and traffic goes straight to Vercel. Nothing about the app changes; you get fast free DNS, DNSSEC, and one place to hold the records.

**Proxied (orange cloud).** Cloudflare terminates the connection and calls Vercel itself, which puts its WAF, bot rules and caching in front of the site — and means every request reaches the origin *from a Cloudflare data centre*. Two things are computed from that address:

- the global per-IP rate limit in `proxy.ts` (300/min) — keyed on the connecting address it would give everyone served by one Cloudflare PoP a single shared budget, throttling a whole city;
- the launch-location prefill (`lib/request-geo.ts`) — it would report the PoP's location rather than the maker's.

`lib/cloudflare.ts` handles this with no configuration: it matches the connecting address against [Cloudflare's published edge ranges](https://www.cloudflare.com/ips/) and only then believes `cf-connecting-ip` / `cf-ipcountry`. Off Cloudflare, nothing is read from those headers — which is the point, since they are ordinary request headers anyone could send to the origin directly.

If you do turn the proxy on:

- SSL/TLS mode **Full (strict)** — anything less puts a plaintext hop in front of a site that has none today.
- Enable the **"Add visitor location headers" managed transform**, or only `cf-ipcountry` arrives and the state prefill quietly falls back to Vercel's (now Cloudflare-shaped) guess.
- Leave **Auto Minify** and **Rocket Loader** off. They rewrite the app's own JavaScript.
- Don't add cache rules for HTML routes. Caching and revalidation are Vercel's job here (ISR, `revalidatePath`), and a second cache in front of them serves stale launches.
