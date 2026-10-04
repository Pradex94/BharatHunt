# BharatHunt platform audit — October 2026

Internal. Written 2026-10-04 against `main` at `fd17db4` and the production
database (read-only probe: aggregates only). Purpose: one inventory of what
exists, what is wrong, and what to do next, so new work extends existing systems
instead of duplicating them.

Status key: ✅ exists · 🟡 partial · 🔴 missing · ♻️ duplicate · ⚠️ broken ·
🧪 data-quality issue · ⚡ performance risk.

## 1. Feature inventory

| Feature | Current implementation | Status | Problems | Recommended improvement | Priority |
| --- | --- | --- | --- | --- | --- |
| Homepage | `app/(home)/page.tsx`, `components/landing/*`; force-static, 10-min ISR | ✅ | Long; Daily 5 strip and saved-items island added 2026-10-04 | Keep the order; do not add sections | P3 |
| Marketplace | `app/marketplace`, `services/products.ts` `getProducts`/`search_products` | ✅ | "Recently updated" impossible (`updated_at` moves on every view) | Keep the honest omission; no new filters without data | — |
| Product cards | `components/products/product-card.tsx` | ✅ | — | Audience line only when derived evidence exists | P2 |
| Product page | `app/products/[slug]/page.tsx` | ✅ | Company block trusted Daily 5 `companyName` | Verify company names (P0-1) | P0 |
| Similar / alternatives | `lib/intelligence/similarity.ts`, `related.ts`, `differences.ts`; precomputed `product_similarities` | ✅ | No embeddings (no provider key, by decision) | Keep lexicon + TF-IDF | — |
| Compare (≤4) | `/compare`, curated `/compare/a-vs-b`, `lib/intelligence/compare.ts` | ✅ | No integrations/funding row | Add funding row when a verified link exists | P2 |
| Product Match | `/discover`, `lib/intelligence/match.ts`, rate-limited | ✅ | "Compare these" CTA missing on results | Add compare-the-top-3 link | P1 |
| Daily 5 | `lib/daily-agent/*`, `/daily-5`, `/daily-5/[date]` | 🧪 | **3 of 8 published picks carry the wrong company** ("BDO India LLP" on Jio Haptik, "Hospital emergency infrastructure Limited" on TRUE ARTIS, a sentence on Traccia) | Verify extracted company against product name/domain at extraction and display (P0-1) | P0 |
| Collections | `lib/collections.ts` (topic, price×category, state), `/collections/[slug]`; user lists `/lists/[slug]` | ✅ | — | State pages already exist as `/collections/made-in-<state>` (do not add `/india/<state>` duplicates; redirect instead) | P2 |
| Categories / taxonomy | 10 fixed `PRODUCT_CATEGORIES`; review-only suggestions on `/admin/intelligence` | 🧪 | 29/159 products (18%) in "Other"; no Security, Sales, HR, E-commerce, Lifestyle categories, so many "Other" rows have no correct home | Controlled taxonomy expansion (needs a decision — see §9) + one-click "apply suggestion" for admins | P1 |
| Leaderboard / top launches | Homepage LaunchBoard, `?sort=top-rated` | ✅ | — | — | — |
| Search | trigram + fuzzy + concept-related block | ✅ | Intent queries ("startups in Haryana") not parsed | Route location/funding intents to existing filters | P2 |
| Voting / comments / saves / sharing | Server actions + triggers (`20261005000000` pending apply) | 🟡 | Counter-integrity migration still unapplied; transitional RPC calls remain | Apply migration, then remove transitional calls | P1 |
| Founder profiles | `profiles` table only | 🔴 | 449 profiles, **1 with a bio** — a founder page would be thin | Do not build pages until profiles carry data; keep founder name on product pages | P3 |
| Company ↔ product | Verified name+domain link to `funding_startups` (2026-10-04) | 🟡 | Only 3 products link (QNu Labs, Enlight Metals, TRUE ARTIS) | Add admin-confirmed links for the rest | P2 |
| India discovery | State collections, map list, marketplace `?state=` | ✅ | 50/159 products have no state | Prompt makers to confirm a state on edit | P2 |
| AI Intelligence hub | `/ai`: Trending, Signals, Model Watch, AI in India, Tools, Companies, Highlights, methodology panel | ✅ | Duplicated events inflate the feed | Fix dedup (P0-2) | P0 |
| AI news dedup | `lib/ai-news/grouping.ts` — same entity + headline Jaccard ≥ 0.42 | ⚠️ | **Real duplicates published**: Apple "Full Disk Access" ×3, Gemini 4 Argon ×5 (entity tagged "Gemini" on some, "Google" on others), OpenAI Dots ×2. 548/559 published stories in 7 days are single-source | Add a content-word rule + cross-entity check; admin suggested merges for existing duplicates (P0-2) | P0 |
| AI trend score | `lib/ai-news/trend.ts`; badge + methodology panel | ✅ | — | — | — |
| Funding Intelligence | `/funding`, `/funding/[slug]`, guides, calculator | 🧪 | Of 67 published rounds: 28 stage "Undisclosed", 38 no location, 24 no investors, 30 no lead | Gaps are shown as "Undisclosed" (correct); surface counts in Platform Health | P1 |
| Investors | `/funding/investors` (from rounds), `/investors` (paid directory) | 🧪 | Investor names with descriptions baked in ("former RBL Bank executive director Rajeev Ahuja") | Surface suspicious names to admins; fix the extractor | P1 |
| Investor matching | Directory search (paid) | 🟡 | No "investors for my sector/stage" from round data | Build from `funding_round_investors` (P2) | P2 |
| Launch Agent | `/dashboard/launch-agent/[slug]`; automated/assisted/prepared kits; BharatHunt performance (2026-10-04) | ✅ | — | Per-platform checklist view | P2 |
| Product submission / review | `createProduct` → pending → `lib/review.ts` | ✅ | — | — | — |
| Admin | `/admin`, `/admin/health` (2026-10-04), intelligence, daily-agent, ai-news, funding, investors, seo | 🟡 | No catalogue data-quality view (duplicates, incomplete listings) | Add data-quality card to Platform Health (P0-3) | P0 |
| Analytics | GA4 events + `product_events` → `product_signal_daily` | ✅ | — | Funnel view on `/admin/intelligence` | P2 |
| Background jobs | GitHub Actions: ingest daily 02:17 UTC, daily-agent hourly, intelligence hourly | ✅ | Workers Builds check fails (prod is Vercel; expected) | — | — |
| Embeddings / vector | None, by decision (no model key) | ✅ | — | Do not add | — |
| Cloudinary | Client uploads with preset | ✅ | — | — | — |
| Cache / rate limits | Upstash (fail-open), IP rate limits per action | ✅ | — | — | — |
| SEO | Per-page metadata, JSON-LD, sitemap, noindex thin pages | ✅ | — | — | — |
| Email / newsletter | Sendgrove, fail-open | ✅ | — | — | — |

## 2. Architecture map (where things live)

- Reads: `services/*` (server-only). Pure logic: `lib/**` with relative `.ts`
  imports, covered by `npm test`. Writes: `lib/actions/*` server actions.
- Precomputation: `lib/intelligence/reindex.ts` (knowledge + similarity),
  `refresh_discovery_signals()` (trending/rising), AI ingestion
  (`lib/ai-news/ingest.ts`), funding ingestion (`lib/funding/ingest.ts`),
  Daily 5 (`lib/daily-agent/run.ts`).
- Request path never calls a model or an external site.

## 3. Data model map

`products` → `profiles` (creator) · `product_intelligence`, `product_similarities`,
`product_signal_daily`, `product_events` · `bookmarks`, `user_lists(+items)` ·
`daily_agent_batches` → `daily_agent_candidates.product_id` ·
`funding_rounds` → `funding_startups`, `funding_round_investors` → `funding_investors` ·
`ai_stories` ← `ai_news_articles`, `ai_story_entities` → `ai_entities`.
Product ↔ startup: computed, verified link (no table).

## 4. AI / background work

No LLM calls anywhere in production (no `ANTHROPIC_API_KEY`, standing
decision). Optional model paths exist but are off: `lib/daily-agent/ai.ts`,
`lib/funding/ai.ts`. Everything else is rule-based and scheduled.

## 5. Duplicate implementations

None found worth consolidating. Two near-duplicates are intentional:
`nameKey` (daily-agent) and `normalizeEntityName` (funding) fold names for
different jobs; the product↔funding link uses both.

## 6. Performance risks

- `/admin/intelligence` and `/admin/health` read up to 5,000 products per load —
  admin-only, fine at today's scale; move to summary tables past ~5,000.
- AI ingestion loads the 72-hour story window per run — bounded.
- No per-visitor work on the homepage (static).

## 7. Data quality (production, 2026-10-04)

- Products: 159 published; 29 "Other"; 50 without a state; 56 without tags;
  7 without a logo; duplicates by domain: `share2.me` ×2, `gradgermany.com` ×2.
- Daily 5: 3/8 wrong or unusable company names (see above).
- AI: confirmed duplicate events (see above).
- Funding: large field gaps (correctly shown as unknown).
- Investors: 2+ names with descriptions baked in.

## 8. UX issues

- Company block could show a wrong company (fixed with P0-1).
- AI feed shows the same event several times (P0-2).

## 9. Priorities

- **P0**: (1) verify Daily 5 company names; (2) AI event dedup + merge
  suggestions for existing duplicates; (3) data-quality surface for admins
  (duplicate listings, suspicious investor names, funding field gaps, "Other").
- **P1**: taxonomy expansion (decision needed: which new top-level categories);
  one-click "apply category suggestion"; apply `20261005000000`; Product Match
  "compare these"; investor-name extractor fix.
- **P2**: investor matching from round data; admin-confirmed company links;
  intent search; Launch Agent checklist view; funnel analytics.
- **P3**: founder pages (only once profiles have data); homepage polish.

## 10. Sequence

P0-1 → P0-2 → P0-3, each with tests, typecheck, lint, build and a production
check; then P1 in the order listed.

## 11. Done (2026-10-04, second pass)

- **P0-1 Daily 5 company names.** `cleanLegalName` + `companyNameFits`
  (lib/daily-agent/domain.ts) at extraction; `verifiedCompanyName` at display.
  The three wrong names are hidden; the product page says "Company not
  confirmed". Stored descriptions still carry the false "built by" sentence
  until `scripts/daily-agent-fix-company-claims.mjs --apply` is run (dry run
  shows exactly three edits).
- **P0-2 AI duplicates.** `sameEventByContent` (lib/ai-news/grouping.ts):
  event words only, rare across the pool's entities, entity named in both
  headlines, research and topic entities excluded; strict at ingestion, lenient
  for admin suggestions. Over 720 production stories it proposes 14 clusters /
  20 duplicates, all genuine. "Suggested merges" panel on /admin/ai-news uses the
  existing merge action.
- **P0-3 Data quality** card on /admin/health: duplicate listings, "Other",
  missing logos/descriptions/states, funding field gaps, investor names that are
  descriptions, unverified Daily 5 company names.
- **P1** done: one-click "Move to <category>" on the category review;
  "Compare the top 3" on Product Match; investor extractor keeps the person in
  "former … director <Name>" and "<Name> through his family office <Fund>".
- **P1 open (need a decision or a production write):** taxonomy expansion;
  apply `20261005000000`; run the description fix.
