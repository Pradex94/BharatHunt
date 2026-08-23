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
| `/api/webhooks/clerk` | Syncs Clerk users into the `profiles` table |

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

Deploys cleanly to [Vercel](https://vercel.com/new). Set the same environment variables in the project settings, point the Clerk webhook at `https://<your-domain>/api/webhooks/clerk`, and apply the Supabase migrations to your production database.
