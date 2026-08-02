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

Create `.env.local` in the project root:

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
```

Email is **optional and fail-open**: without `SENDGROVE_API_KEY` the /advertise form still stores the lead in Supabase and shows the success state — it just logs that no mail was sent.

> **Verify the sender, not just the domain.** Sendgrove rejects an unverified `from` with `403 FORBIDDEN` even when the domain is authenticated: *"Authenticating the domain (bharathunt.org) alone is not enough."* Add the exact address under **Senders & Domains** and confirm the OTP it emails you.

`EMAIL_FALLBACK_FROM` covers the gap while a new sender is still pending verification: if `EMAIL_FROM` comes back unverified, the send is retried once from the fallback and a warning is logged. Once the intended address is verified the fallback stops being used, and you can drop the variable.

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
