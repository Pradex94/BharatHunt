@AGENTS.md

# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Bharat Hunt** — a Product-Hunt-for-India marketplace: makers submit products,
the community upvotes, comments, and discovers them. Next.js 16 (App Router,
React 19, TS strict) + Supabase (Postgres/RLS) + Clerk auth + Tailwind v4.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — ESLint (use `npx eslint app components lib services hooks` to
  scope to app code)
- `npx tsc --noEmit` — type-check

**Shell note:** on this machine the Bash tool's PATH is missing `npm`/`git` — run
those through the PowerShell tool instead.

## Architecture

- **Auth → DB identity.** Clerk is wired to Supabase as a third-party auth
  provider. `lib/supabase/server.ts` attaches the Clerk session token; RLS
  policies authorize on `auth.jwt()->>'sub'` (the Clerk user id, stored as
  `text`, not uuid). The webhook (`app/api/webhooks/clerk/route.ts`) uses the
  service-role key to bypass RLS.
- **Profiles are a FK dependency.** `products.creator_id`, `comments.user_id`,
  `upvotes.user_id` all FK to `profiles.id`. Profiles are created by the Clerk
  `user.created` webhook, which is unreliable locally. **Before any insert that
  references a user id, call `ensureProfile()` (`lib/ensure-profile.ts`)** — it
  self-heals the missing row, avoiding `products_creator_id_fkey` violations.
  It's already wired into the product/comment/upvote actions.
- **Data layer.** `services/products.ts` holds all product queries (server-only,
  imports the Supabase client). `lib/actions/*` are Server Actions. Anything a
  client component needs (category taxonomy, sorts, pricing types) lives in
  `lib/constants.ts`, which is framework-agnostic and safe to import client-side
  — do **not** import `services/` from a client component.
- **Marketplace state is URL-driven.** Filters/sort/search/page live in
  `searchParams` (`category`/`sort`/`q`/`pricing`/`page`) via
  `hooks/use-update-search-params.ts`, so views are shareable. "Load more" uses
  the `loadMoreProducts` action for client-side accumulation.
- **UI primitives** in `components/ui/` are shadcn built on **Base UI**
  (`@base-ui/react`), not Radix. Triggers take a `render={<Button .../>}` prop.
  (Gotcha: Base UI's `Menu.GroupLabel` throws outside a `Menu.Group`, so
  `DropdownMenuLabel` is a plain styled `div`.)

## Design system

- **`design.md` is the locked source of truth.** Read it before any visual
  change. The current system is the orange "Product Hunt" aesthetic (white
  canvas, black navbar, orange `#FF6B1A` gradient CTAs, Inter bold headlines,
  24px cards).
- Tokens live in `app/globals.css` (Tailwind `@theme` + shadcn `:root`
  variables). **Semantic token names are stable** (`bg-card`, `text-ink`,
  `text-body`, `bg-secondary-bg`, `bg-surface-dark`, `text-primary`, …) — a
  re-theme remaps token *values*, and inner pages follow automatically. Prefer
  these names over raw hex.
- Typography: `components/ui/typography.tsx` (`Display`/`H1`–`H3` = Inter bold;
  `Numeric` = JetBrains Mono tabular figures for counts/prices).
- Motion: `components/ui/motion.tsx` (`FadeIn`/`FadeInStagger`/`FadeInItem`);
  `prefers-reduced-motion` is honored globally.
- **The landing page (`app/page.tsx` + `components/landing/`) uses STATIC demo
  data** (`components/landing/data.ts`) — ZenTask/Payflow/etc. and the community
  stats are presentation-only, not live Supabase rows. Inner pages use real data.

## Conventions

- Files are lowercase-kebab (`product-card.tsx`), matching the repo.
- Keep changes token-driven; don't introduce a fourth brand color (orange only —
  no blue/green per the design brief). Pricing badges stay orange/neutral/amber.
- `.claude/skills/`, `.agents/`, `.hallmark/`, `skills-lock.json` are gitignored
  vendored AI-tooling — never commit them; ESLint ignores them too.
- `.env.local` is gitignored (Supabase + Clerk keys); the README lists the vars.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
