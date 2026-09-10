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

# Promote — hidden unless this is exactly "true". See "Promote is hidden" below.
NEXT_PUBLIC_PROMOTE_ENABLED=true

# Dodo Payments — payments for /promote/checkout (REQUIRED to sell promotion slots)
# Both are SERVER-ONLY. Dodo issues no publishable key; every key is secret.
DODO_PAYMENTS_API_KEY=dodo_test_xxxxxxxxxxxxxxxx
DODO_PAYMENTS_WEBHOOK_KEY=whsec_xxxxxxxxxxxxxxxx   # a DIFFERENT value from the API key
DODO_PAYMENTS_ENVIRONMENT=test_mode                # anything but live_mode means test_mode

# Funding Intelligence (/funding) — all optional; the feature works with none of them.
# Shared secret for /api/funding/ingest. REQUIRED to run ingestion on a schedule;
# without it the endpoint answers 503 and ingests nothing. The admin "Run
# ingestion now" button works regardless (it authenticates the signed-in admin).
FUNDING_INGEST_SECRET=<a-long-random-string>
# Enables the model pass over each article. Without it, extraction is entirely
# rule-based — the designed fallback, not a degraded mode.
# ANTHROPIC_API_KEY=sk-ant-...
# FUNDING_AI_MODEL=claude-haiku-4-5   # defaults to claude-opus-5
# FUNDING_USD_INR_RATE=88             # charts only; cards never show a converted figure

# AI Trending (/ai) — optional; the feature works with none of them.
# Shared secret for /api/ai-news/ingest. REQUIRED only to run ingestion on a
# schedule; without it the endpoint answers 503. The admin "Run AI News
# Ingestion" button works regardless (it authenticates the signed-in admin).
AI_NEWS_INGEST_SECRET=<a-long-random-string>

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
| `/admin/investors` | Admin only — add, edit, publish and free-preview-flag investors |
| `/investors` | Investor Directory — free preview for everyone, full directory after a one-time ₹499 purchase |
| `/funding` | Funding Intelligence — live funding feed, snapshot, filters, trends, roadmap, calculator |
| `/funding/[startup-slug]` | A company's funding history, totals and investors |
| `/funding/investors` | Investors seen in published rounds — deals, stages, sectors, recent investments |
| `/funding/guides`, `/funding/guides/[slug]` | Ten fundraising guides (static, prerendered) |
| `/admin/funding` | Admin only — review queue, source health, ingestion controls, manual entry |
| `/api/funding/ingest` | Scheduled ingestion trigger — shared-secret only, 503 when unconfigured |
| `/ai` | AI Trending — top story, trending rail, category/region filters, search, latest feed |
| `/ai/[story-slug]` | One AI story: our summary, its entities, the trend score, every source covering it |
| `/admin/ai-news` | Admin only — review queue, sources, ingestion controls, run log, manual entry |
| `/api/ai-news/ingest` | Scheduled AI news ingestion trigger — shared-secret only, 503 when unconfigured |
| `/promote` | Promotion marketing page — **hidden (404) unless `NEXT_PUBLIC_PROMOTE_ENABLED=true`** |
| `/promote/checkout` | Buy a fixed-price promotion slot (Dodo Payments hosted checkout) — hidden with `/promote` |
| `/api/webhooks/clerk` | Syncs Clerk users into the `profiles` table |
| `/api/webhooks/dodo` | Settles payments for **both** paid products — promotions and Investor Directory access (signed, idempotent) |

## Promote is hidden

Promote ships switched off. `PROMOTE_ENABLED` in `lib/constants.ts` reads
`NEXT_PUBLIC_PROMOTE_ENABLED`, and while it is not exactly `"true"`:

- `/promote` and `/promote/checkout` call `notFound()` as their first statement, so both
  answer a real `404` (and Next injects `noindex`) rather than rendering,
- the **Promote** entry drops out of `NAV_LINKS`, so it is in neither the desktop nor the
  mobile nav,
- `/promote` drops out of the sitemap.

Nothing is deleted. The pages, the components, the packages, the Dodo checkout and the
webhook are all still here and still wired up — set `NEXT_PUBLIC_PROMOTE_ENABLED=true` and
redeploy (`NEXT_PUBLIC_*` is inlined at build time, so a variable change without a rebuild
does nothing) and the whole surface returns.

Two deliberate omissions. `/promote` is **not** added to `robots.txt`: `Disallow` stops
crawling, not indexing, so it would stop Google ever seeing the 404 that actually removes
the page from the index. And **promotions already paid for are untouched** — active
placements keep running and keep rendering, and `/api/webhooks/dodo` still settles and
activates them. Hiding the shop front does not cancel orders.

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

## Investor Directory (`/investors`)

A curated investor dataset: a free preview for everyone, and the complete directory behind a
one-time **₹499** purchase. It is the platform's second paid product and it reuses the first one's
payment machinery rather than repeating it — `lib/dodo.ts`, `lib/dodo-signature.ts`, the single
`/api/webhooks/dodo` route and the `dodo_webhook_events` idempotency ledger are all shared.

**No new environment variables.** It runs on the `DODO_PAYMENTS_*` and Supabase values already
documented above.

### Access model

| Who | Sees |
| --- | --- |
| Visitor (signed out) | Hero, free preview (4 investors, no contact fields), locked teaser, benefits, pricing |
| Signed in, not paid | The same |
| Paid | The full directory: search, filters, every profile, contact details |

Access **is** a settled payment — `investor_directory_purchases.status = 'paid'`. There is no
separate entitlement table to drift out of step, and a full refund flips the same row to `refunded`,
which revokes access on the very next request.

### How the free limit and the paywall are actually enforced

Two independent gates, and the weaker one still fails closed:

1. **RLS.** `investors` has a single SELECT policy: `is_published and is_free_preview`. The anon key
   ships in the browser, so anyone can point PostgREST at `/rest/v1/investors` with their own Clerk
   token — and get the preview rows, never the directory. Note the policy does *not* mention the
   purchase: a paying customer's token gets exactly what a stranger's does.
2. **Server code.** Premium rows are read only through `createServiceClient()` in
   `services/investors.ts`, and only by `getInvestorDirectory()`, which takes a `userId` and
   re-checks the purchase **itself** rather than trusting a caller to have done it.

The free tier is a `.limit(INVESTOR_FREE_PREVIEW_LIMIT)` in the query, not a `.slice()` in a
component — four rows are fetched, so four rows exist. The locked cards carry **no data at all**
(they draw bars, not blurred text), and the "N more profiles" figure comes from a `count`-only query.

### Setup

1. Apply the migration: `supabase db push` (or run
   `supabase/migrations/20260904000000_investor_directory.sql` in the SQL editor). It creates
   `investors`, `investor_directory_plans` and `investor_directory_purchases`, and seeds **twelve
   clearly-marked sample investors** so the page has something to render. They describe no real
   investor — invented fund names, `example.com` addresses, no natural person — and `/investors`
   displays a "Sample data" notice for as long as any of them exist.
2. In the Dodo dashboard create a one-time INR **499.00** product (no discount, not
   pay-what-you-want, not recurring).
3. Verify it: `node scripts/check-dodo-products.mjs pdt_YOUR_ID --paise=49900`
4. Link it: paste the id into `supabase/link-dodo-investor-plan.sql` and run that file.

Until step 4, the plan has no `dodo_product_id`, nothing is purchasable, and the page says so — the
same fail-closed posture the promotion packages use. The free preview stays open throughout.

### Managing the data

`/admin/investors` (admin only) is add / edit / delete, plus one-click **Published** and **Free
preview** toggles. Anything saved there clears `is_sample`, so the demonstration notice disappears by
itself as the seeds are replaced. Every action re-checks `getIsAdmin()` server-side — the page guard
decides what is *rendered*, not what is authorized.

## Funding Intelligence (`/funding`)

Aggregated Indian startup funding news: a live feed of rounds, a company-level funding history, an
investor directory derived from the reporting, trend charts, a ten-step fundraising roadmap with
guides, and a "how much should I raise" calculator.

**It works with no keys at all.** Extraction is rule-based by default, so a fresh clone can ingest,
review and publish without an API key. `ANTHROPIC_API_KEY` adds a model pass on top; everything else
is optional.

### The pipeline

```
funding_sources  →  fetch  →  normalise  →  dedupe  →  classify  →  extract  →  funding_rounds
   (config)         (RSS/     (URL, title,  (3 checks) (keywords)   (rules,      (status =
                     GDELT)    hash)                                then AI)      'pending')
                                                                                      ↓
                                                              /admin/funding review → 'published'
                                                                                      ↓
                                                                                  /funding
```

Nothing publishes itself. Every extracted round lands as `status = 'pending'` and is invisible to the
public RLS policy until an admin approves it — the same shape as the launch review queue below, and
for a stronger reason: the product here *is* the claim that a figure was reported by a named source.

### Running it twice is a no-op

Three duplicate checks, in order. Only the first discards; the other two keep the article and attach
it to the round it duplicates, because six outlets covering one Series A is a fact worth keeping.

| # | Key | Catches |
| --- | --- | --- |
| 1 | `funding_news.normalized_url` (unique) | The same article, however it was linked |
| 2 | `funding_news.content_hash` | The same story at a second URL (syndication, AMP split) |
| 3 | `funding_rounds.event_key` (unique), then headline similarity | A *different* article about the same event |

`event_key` is company + stage + month, deliberately without the amount: two outlets reporting one
round as "₹20 crore" and "$2.4 million" disagree by the day's exchange rate, so keying on the figure
would split one event in two.

### Data trust rules

* A card shows **what the source reported**, in the currency it reported. Nothing on a card is
  converted. `amount_inr` exists only so the charts can add currencies, and the rate used is stamped
  on each row so revising it never rewrites history.
* An unreported amount is `null` and renders as "Undisclosed" — never `₹0`.
* Unknown investors are `[]`, never a plausible fund.
* A stage the vocabulary does not contain (`pre-Series A`, `bridge`) becomes `Undisclosed` rather
  than being rounded to a neighbour.
* Charts show "Not enough data yet" below three points, and every money total states how many of the
  rounds actually carried a figure.
* Summaries are generated **from the extracted fields**, never from the publisher's sentences — the
  generator has no access to the article body, so it cannot reproduce a paragraph even by accident.

### Adding a funding source

No code change. Insert a row into `funding_sources` (or use `/admin/funding` to enable, disable and
re-run an existing one):

```sql
insert into public.funding_sources (name, source_type, feed_url, publisher, enabled, priority, poll_interval_minutes)
values ('Example Startup Desk', 'rss', 'https://example.com/feed', 'Example', true, 50, 30);
```

`source_type` is `rss`, `api`, `gdelt` or `manual`. **Check the publication's robots.txt first** — the
seeded rows record what each one permits, and two ship disabled for that reason (see the header of
`supabase/migrations/20260909020000_funding_sources_seed.sql`).

Sources back off exponentially on failure (`poll_interval × 2^failures`, capped at a day) and are
flagged unhealthy after three, which shows in the admin table.

### How extraction works

1. **Classify** — cheap keyword pass; roundups, IPOs, stake sales and VC fund closes are refused
   here, before anything expensive runs.
2. **Rule-based extraction** (`lib/funding/extract.ts`) — regex over the headline and body for the
   amount, stage, company, investors, sector and city. Always runs. A field the text does not state
   stays null.
3. **Model pass** (`lib/funding/ai.ts`, optional) — may only *fill gaps* and rewrite the summary. It
   cannot overwrite a fact a regex read out of the literal text; when the two disagree, the round is
   flagged for review and its confidence is capped rather than one answer winning.
4. **Confidence** is the lower of the two, and is internal only — the card says "AI extracted", never
   a percentage.

### Scheduling ingestion

`/api/funding/ingest` accepts `GET` or `POST` with `Authorization: Bearer $FUNDING_INGEST_SECRET`
(or `X-Ingest-Secret`). Unset secret ⇒ **503, ingests nothing** — unset means closed, never open.

```bash
curl -X POST https://bharathunt.org/api/funding/ingest \
  -H "Authorization: Bearer $FUNDING_INGEST_SECRET"
```

`?source=<uuid>` runs one source and ignores its interval. Every run is idempotent, so overlapping
triggers are harmless.

* **Cloudflare Workers** (this project's target) — add a cron trigger in `wrangler.jsonc` and call
  the URL from the scheduled handler, or point any external scheduler at it.
* **Vercel** — `vercel.json` → `{ "crons": [{ "path": "/api/funding/ingest", "schedule": "*/15 * * * *" }] }`,
  with `FUNDING_INGEST_SECRET` set (Vercel sends it as a Bearer token).
* **Anything else** — GitHub Actions, cron-job.org, a cron box. It is one authenticated HTTP call.

Per-source `poll_interval_minutes` -- floored at **four hours** by migration `20260910040000` -- means
a frequent cron does not turn into a frequent poll of every source.

### Reviewing

`/admin/funding` (admin only) has the review queue ordered **lowest confidence first** — the records
most likely to be wrong are seen first, since nobody is waiting on the other end of this queue. From
there: publish, reject, edit any field, feature, hide, add a round by hand, enable/disable a source,
and **Run ingestion now** with per-run counts (fetched, new, rounds, duplicates, rejected, errors)
and per-source health.

Editing recomputes what depends on the edit — `amount_inr`, the slug, the `event_key`, and the
startup/investor links — so a corrected stage cannot leave a stale dedupe key behind.

### Alerts

Schema only, by design (`funding_alert_subscriptions`). A row is one saved filter over fields
`/funding` already filters on, with a `last_notified_at` watermark. Nothing sends anything yet.

## AI Trending (`/ai`)

What is happening in AI right now: news, launches, models, companies, funding and research,
collected from official sources, research feeds and reporting, grouped into **stories** rather than
articles, and ranked by the **BharatHunt Trend Score**.

**It works with no keys at all.** Classification, entity extraction, summarisation and the trend
score are all rule-based and run in-process. There is no AI API key in this pipeline and nothing in
it claims otherwise — see `lib/ai-news/classify.ts` for why that is a design choice rather than a
gap.

### The pipeline

```
ai_news_sources → fetch → normalise → AI relevance → dedupe → classify → group → score → ai_stories
   (config)        (RSS/    (URL,       (lexicon +    (3       (category, (entity   (trend   (published
                    arXiv/    title,      source        checks)  region,    + title   score)   or pending)
                    HN/       hash)       prior)                 entities)  + window)             ↓
                    GDELT)                                                                       /ai
```

### Articles and stories are different things

Six publications covering one model release is **six articles and one story**. One table would force
a choice between throwing five sources away and printing the same headline six times, so
deduplication runs on articles (`normalized_url`, then `content_hash`, then a headline/entity/time
similarity check) and grouping runs on events (`story_key`).

That extra coverage is the product. `source_count` is both the "Covered by 4 sources" line and the
largest single term in the trend score, and it is maintained by a Postgres trigger counting
*distinct publications* — so no code path can inflate it, and four articles from one outlet's three
sections stay one source.

### The BharatHunt Trend Score

Ours, not an industry metric and not anyone else's "trending" number. 0-100, from five observed
signals (`lib/ai-news/trend.ts`):

| Term | Weight | What it measures |
| --- | --- | --- |
| Recency | 32% | Hours since the story was last covered, on an 18-hour half-life |
| Sources | 28% | Distinct publications covering it, log-scaled, saturating at six |
| Velocity | 20% | Articles per hour **right now** — the term that makes trending different from popular |
| Authority | 12% | Reliability of the covering sources (a lab's own post is not an aggregator link) |
| Engagement | 8% | Story-page opens here, plus a source API's own count where one exists (Hacker News points + comments) |

**A story that cannot be dated gets no score at all**, not a zero: two of the five terms are
time-derived, and re-weighting the rest to fill the gap would be inventing a number. It renders with
no badge and sorts last. The same rule governs the percentages on "Trending AI topics" and "AI
companies making noise" — `ai_trending_topics` and `ai_trending_entities` return `NULL` for a change
whose earlier window was too small to divide by, and the UI prints the count alone.

Scores are recomputed for every story covered in the last week at the end of **every** run,
including runs that ingested nothing — recency decays with the clock, so a story nobody is covering
has to fall on its own. One snapshot per story per hour is kept in `ai_trend_snapshots`, which is
what lets `/ai/[slug]` say "+9 today" rather than only "popular".

### What it will not do

It reads feeds and documented public APIs and stops there. It does not follow the article link,
render the page, extract the body, work around a paywall, present false credentials or retry through
a block. Politeness is enforced in three places: `poll_interval_minutes` per source decides whether a
fetch happens at all, a 12s timeout bounds how long a connection is held, and a 4MB cap bounds how
much is read. A failing source is backed off exponentially, not retried tightly.

**Nothing a publisher wrote is republished.** Summaries are composed by `lib/ai-news/summarize.ts`
from facts the pipeline established — the headline restated, the entities extracted, how many
sources are covering it, how we filed it. The feed's own excerpt is stored (classification reads it)
and is never rendered. Every link goes to the publisher.

### What publishes itself, and what waits

A story goes live without a human when its source is marked `auto_publish` **and** the classifier's
relevance cleared `AUTO_PUBLISH_RELEVANCE` (0.55). Everything else lands in the review queue at
`/admin/ai-news`. The gap is deliberate: a news page that needed an admin for every story would be
empty most of the day, and one that published everything would have no review step at all. Both
aggregators (Hacker News, GDELT) are `auto_publish = false` — an aggregator entry is a pointer to
somebody else's reporting, which makes it excellent corroboration and poor evidence.

Pending stories are invisible to the public RLS policy, so the queue is real rather than decorative.

### Running it twice is a no-op

`ai_news_articles.normalized_url` is unique and is checked *before* anything expensive happens, so a
re-run over the same feed contents classifies nothing and writes nothing. Rejected articles are
stored too — that is what makes the second pass cheap, because an article already judged "not about
AI" is recognised by URL and never scored again.

### Scheduling ingestion

`POST /api/ai-news/ingest` with `Authorization: Bearer $AI_NEWS_INGEST_SECRET`. Running it often is
safe: each source is skipped until its own `poll_interval_minutes` has elapsed, and that is floored at
**four hours** (migration `20260910040000`). So the trigger cadence is an upper bound on *asking*, not
a fetch rate -- a frequent cron drains the queue of sources that have come due, it does not poll any
one of them more often.

It is **not** wired to a scheduler in this repo, deliberately — the project is mid-migration from
Vercel to Cloudflare and the right mechanism differs by target:

- **Vercel**: add a `crons` entry to `vercel.json`. Note that Hobby plans allow only daily crons, so
  a `*/10` schedule fails the deployment on that tier:
  ```json
  "crons": [{ "path": "/api/ai-news/ingest", "schedule": "*/10 * * * *" }]
  ```
- **Cloudflare**: OpenNext's Worker exports only a `fetch` handler, so a Cron Trigger cannot invoke
  it directly. Use a small separate scheduled Worker (or any external scheduler) that fetches the
  URL with the header.

### Testing it

```bash
node scripts/ai-news-dry-run.mjs              # every seeded source, no database writes
node scripts/ai-news-dry-run.mjs --verbose    # per-article keep/reject verdicts and scores
node scripts/ai-news-dry-run.mjs --only=arXiv # one source
```

The dry run reads its source list straight out of `20260910020000_ai_news_sources_seed.sql`, so it
always exercises the configuration that will be deployed. It fetches, parses, classifies, groups and
scores against **today's** live feeds and prints what it would write, then exits non-zero if any
source failed — the check unit tests cannot perform, because "is this feed still alive" is not a
question a fixture can answer. Every endpoint in the seed was verified with it before being
committed; feeds that answered 404/410, that rejected an identified bot, or that served HTML from
their `/feed/` path were removed rather than left to fail on a schedule.

Then `npm test` covers the logic: 150 assertions across normalisation, classification, grouping, the
trend score, the feed parsers and the summariser — including the brief's own cases ("New smartphone
launched" rejected, "New smartphone launches with on-device AI model" kept; eight articles in two
hours outranking ten over a month).

### Adding a source

Insert a row into `ai_news_sources` (or add it to the seed migration and re-run it — the
`on conflict` clause re-syncs configuration in place without resetting health counters or overriding
an operator's `enabled` flag):

| Column | What to set |
| --- | --- |
| `source_type` | `rss`, `atom`, `arxiv`, `hn`, `gdelt` or `manual` — picks the adapter |
| `source_category` | `official`, `research`, `news`, `blog`, `aggregator` — sets the relevance prior |
| `reliability_score` | 0-1, by hand. Feeds the authority term; never derived from our own output |
| `region` | `india` or `global` — a prior only; article content overrides it |
| `poll_interval_minutes` | The politeness contract. 15-20 for wires, 60 for blogs, 180+ for papers |
| `auto_publish` | Whether its stories may go live without review |

Then run `node scripts/ai-news-dry-run.mjs --only=<name>` to confirm it parses before enabling it.

### Known limits

- **No semantic similarity.** Grouping is entity + folded-verb word overlap + a time window, because
  there is no embedding provider configured and a similarity function pretending to be semantic
  would be worse than none. It therefore misses pairs a reader would call obvious, and the admin
  merge control is what covers that rather than a looser threshold — a wrong merge destroys a story
  while a missed one merely shows it twice.
- **GDELT is seeded disabled.** The adapter is implemented and unit-tested, but
  `api.gdeltproject.org` was unreachable from the network this was built on, so it was never
  verified end to end. Enable it in `/admin/ai-news` once a fetch from the deployment environment
  succeeds.
- **Alerts, digests and personalised feeds are not built.** The schema is shaped to allow them
  (entities are first-class rows, stories carry stable slugs and trend history), and nothing here
  pretends they exist.

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
