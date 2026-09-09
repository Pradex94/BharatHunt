-- AI Trending: ingested AI coverage, the stories it groups into, the entities
-- those stories are about, and the trend history behind "what is happening in
-- AI right now".
--
-- The shape of this feature in one paragraph
-- ------------------------------------------
-- `ai_news_sources` says where to look. An ingestion run fetches each enabled,
-- due source and writes one `ai_news_articles` row per *article*. Articles that
-- are not about AI are kept but marked, so a re-run recognises and skips them
-- for free. Articles that are get grouped into an `ai_stories` row -- one row
-- per *event*, however many publications covered it -- and that story is what
-- /ai renders. `ai_entities` are the companies, models, people and tools those
-- stories name, and `ai_trend_snapshots` is the score's history, which is what
-- lets the page say "trending up" rather than merely "popular".
--
-- Why articles and stories are different tables
-- ---------------------------------------------
-- Six publications covering one model release is six articles and one story.
-- One table would force a choice between throwing five sources away and
-- printing the same headline six times. So deduplication runs on articles
-- (`normalized_url`, then `content_hash`, then a headline/entity/time
-- similarity check in lib/ai-news/ingest.ts) and grouping runs on events
-- (`story_key`). The extra coverage is the product: `source_count` is both the
-- "Covered by 4 sources" line and the largest single term in the trend score.
--
-- Why almost nothing here has a write policy
-- ------------------------------------------
-- The rule this schema inherits from 20260825000000 (launch review),
-- 20260828120000 (promotions) and 20260909000000 (funding):
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser, so a policy that lets a
-- session write a row lets it write *any value* into that row --
-- `status = 'published'`, `featured = true`, `trend_score = 100`. On a news
-- ranking that is not a defacement risk, it is a credibility risk: the entire
-- claim this page makes is that its ordering came from observed coverage.
-- Every write here is `createServiceClient()` from server code that has already
-- checked `getIsAdmin()`, or from the ingestion endpoint, which carries its own
-- shared secret.
--
-- The trend score is BharatHunt's, and it is never invented
-- --------------------------------------------------------
-- `trend_score` is nullable on purpose. It is our own ranking -- the "BharatHunt
-- Trend Score" -- computed in lib/ai-news/trend.ts from signals we actually
-- observe: how recently the story was last covered, how many independent
-- sources covered it, how fast that coverage arrived, how reliable those
-- sources are, and how many people opened the story here. A story with no
-- usable publication time has no recency signal, so it gets NULL and the UI
-- shows no badge at all. There is no default, no placeholder and no random
-- component anywhere in this feature.
--
-- Idempotent throughout: safe to re-run.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Sources
-- ---------------------------------------------------------------------------
-- Configuration, not code. An operator disables a feed that started returning
-- junk by flipping `enabled` in /admin/ai-news; nothing redeploys.

create table if not exists public.ai_news_sources (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null check (length(btrim(name)) between 1 and 120),
  -- How lib/ai-news/sources.ts should read it. Each value maps to one adapter.
  source_type           text        not null check (source_type in
                          ('rss', 'atom', 'arxiv', 'hn', 'gdelt', 'manual')),
  feed_url              text,
  api_endpoint          text,
  -- The publication name stamped onto every article from this source, when the
  -- feed itself does not carry one worth trusting.
  publisher             text,
  homepage_url          text,
  -- 'official' is a company or lab announcing its own work, 'research' a paper
  -- feed, 'news' a publication, 'blog' an individual or company blog,
  -- 'aggregator' something that links to other people's reporting. Section 22
  -- of the brief: these are not equally authoritative and the score must not
  -- pretend they are.
  source_category       text        not null default 'news' check (source_category in
                          ('official', 'research', 'news', 'blog', 'aggregator')),
  -- 0..1, the weight this source lends a story's authority term. Set by hand,
  -- never by code: it is an editorial judgement, and a number a machine derived
  -- from its own output would be circular.
  reliability_score     numeric(3, 2) not null default 0.60
                          check (reliability_score >= 0 and reliability_score <= 1),
  -- Which half of the India / Global filter a source feeds by default. A story
  -- can still be classified the other way on its content; this is the prior.
  region                text        not null default 'global'
                          check (region in ('india', 'global')),
  enabled               boolean     not null default true,
  -- Whether stories built from this source may go live without a human. False
  -- puts everything it produces in the admin queue instead. See
  -- AUTO_PUBLISH_RELEVANCE in lib/ai-news/constants.ts for the other half of
  -- that decision.
  auto_publish          boolean     not null default true,
  -- Lower runs first, and decides which bucket the scheduler puts a source in.
  priority              integer     not null default 100 check (priority between 0 and 1000),
  -- Per-source politeness, and the whole of section 24: minutes for the feeds
  -- that actually move, an hour for the rest. A source is skipped entirely when
  -- it was attempted more recently than this, so a five-minute cron does not
  -- become a five-minute poll of every feed on the list.
  poll_interval_minutes integer     not null default 60
                          check (poll_interval_minutes between 5 and 1440),
  -- Drives the exponential backoff in lib/ai-news/ingest.ts and the health
  -- badge in the admin table. Reset to 0 by any successful fetch.
  consecutive_failures  integer     not null default 0 check (consecutive_failures >= 0),
  is_healthy            boolean     not null default true,
  last_attempt_at       timestamptz,
  last_success_at       timestamptz,
  last_error_at         timestamptz,
  last_error            text,
  -- Observability that costs one UPDATE we were making anyway.
  total_articles_seen   integer     not null default 0 check (total_articles_seen >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A fetchable source needs somewhere to fetch from. 'manual' is the
  -- exception: it is the bucket admin-entered articles are attributed to, and
  -- it is never fetched.
  constraint ai_news_sources_endpoint_present check (
    source_type = 'manual' or coalesce(feed_url, api_endpoint) is not null
  )
);

alter table public.ai_news_sources enable row level security;

-- No policy, deliberately. RLS with no policy denies every anon and
-- authenticated read, which is the correct answer for a table whose rows are
-- operational configuration -- including `api_endpoint`, which can carry a key
-- in its query string on some providers. Admin reads go through the service
-- role in services/ai-news-admin.ts.

create unique index if not exists ai_news_sources_name_key
  on public.ai_news_sources (lower(btrim(name)));

-- The scheduler's own query: enabled sources, best priority first, least
-- recently attempted first inside a priority.
create index if not exists ai_news_sources_due_idx
  on public.ai_news_sources (priority, last_attempt_at nulls first)
  where enabled;

drop trigger if exists ai_news_sources_updated_at on public.ai_news_sources;
create trigger ai_news_sources_updated_at
  before update on public.ai_news_sources
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Stories
-- ---------------------------------------------------------------------------
-- The public record. Everything a visitor sees on /ai is a row of this table
-- with `status = 'published'` and `is_hidden = false`.

create table if not exists public.ai_stories (
  id                uuid primary key default gen_random_uuid(),
  title             text        not null check (length(btrim(title)) between 1 and 300),
  slug              text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- 50-80 words, composed by lib/ai-news/summarize.ts from facts the pipeline
  -- extracted -- never a paragraph lifted from a publisher. Bounded here as
  -- well as in code: a "summary" that grew to article length would be a
  -- republication, and the original article has to stay the source of truth.
  summary           text        check (summary is null or length(summary) <= 700),
  category          text        not null,
  sub_category      text,
  region            text        not null default 'global' check (region in ('india', 'global')),

  -- ── The BharatHunt Trend Score, and its parts ──────────────────────────
  -- Stored rather than computed at read time because the feed orders by it and
  -- an ORDER BY has to hit an index. Recomputed for every recently-active story
  -- at the end of each ingestion run (lib/ai-news/ingest.ts), so it is never
  -- more stale than one cron interval. NULL means "not enough signal to rank",
  -- and the UI renders nothing rather than a number.
  trend_score       numeric(5, 2) check (trend_score is null or (trend_score >= 0 and trend_score <= 100)),
  -- Kept alongside the total so a score can be explained rather than asserted,
  -- both in /admin/ai-news and in the snapshot history below. Each is 0..100.
  recency_score     numeric(5, 2) check (recency_score is null or (recency_score >= 0 and recency_score <= 100)),
  velocity_score    numeric(5, 2) check (velocity_score is null or (velocity_score >= 0 and velocity_score <= 100)),
  engagement_score  numeric(5, 2) check (engagement_score is null or (engagement_score >= 0 and engagement_score <= 100)),
  authority_score   numeric(5, 2) check (authority_score is null or (authority_score >= 0 and authority_score <= 100)),
  -- Maintained by trigger from the articles below -- see section 7. Never
  -- written by application code, so "covered by N sources" cannot drift from
  -- the N rows it counts.
  source_count      integer     not null default 0 check (source_count >= 0),
  article_count     integer     not null default 0 check (article_count >= 0),
  first_seen_at     timestamptz,
  last_seen_at      timestamptz,

  -- First-party engagement: opens of /ai/[slug] on this site. The only
  -- engagement signal this feature has that it is entitled to use, and it is
  -- log-scaled and lightly weighted in trend.ts precisely because it is small.
  view_count        integer     not null default 0 check (view_count >= 0),

  status            text        not null default 'pending'
                      check (status in ('pending', 'published', 'rejected')),
  -- Distinct from 'rejected': hidden is "take this off the page now", which an
  -- admin may need to do in seconds without losing the record of why it was
  -- there.
  is_hidden         boolean     not null default false,
  featured          boolean     not null default false,

  -- Display attribution. The single best source for the story -- highest
  -- reliability, earliest publication -- denormalised so a card renders without
  -- touching the articles table.
  top_source_name   text,
  top_source_url    text,
  image_url         text,

  -- The identity of an *event*, as opposed to an article about one. Unique, so
  -- the second publication to cover a release attaches to the first story
  -- instead of creating a second. See `storyKey` in lib/ai-news/normalize.ts.
  story_key         text        not null,

  -- The one entity the story is *about*, normalised (`normalizeEntityName`).
  -- Half of the grouping decision in `findStoryForArticle`: a second article is
  -- the same story only when it names the same primary entity, so this is read
  -- on every ingestion run and has to be on the row rather than behind a join.
  primary_entity    text,

  -- Denormalised entity names and keywords, maintained by the ingestion in the
  -- same write as the join rows. They exist so the generated column below can
  -- see them: a stored generated column may only read plain columns of its own
  -- row, and search has to match "Sam Altman" and "gpt" as readily as a word
  -- from the headline.
  entity_text       text        not null default '',
  keywords          text[]      not null default '{}',

  review_note       text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One free-text column for the search index to read, maintained by Postgres
  -- so it can never fall behind the row. `lower`, `coalesce`, `array_to_string`
  -- and `||` are all immutable, which is what a stored generated column needs.
  search_text       text generated always as (
                      lower(
                        coalesce(title, '') || ' ' ||
                        coalesce(summary, '') || ' ' ||
                        coalesce(category, '') || ' ' ||
                        coalesce(sub_category, '') || ' ' ||
                        coalesce(entity_text, '') || ' ' ||
                        coalesce(top_source_name, '') || ' ' ||
                        array_to_string(keywords, ' ')
                      )
                    ) stored
);

alter table public.ai_stories enable row level security;

-- THE policy. Published and not hidden, for anon and authenticated alike --
-- there is no signed-in view of this dataset, so there is nothing an identity
-- could widen. A pending story is unreachable with the anon key no matter what
-- a request asks for, which is what makes the review queue real rather than
-- decorative.
drop policy if exists "ai_stories_select_published" on public.ai_stories;
create policy "ai_stories_select_published"
  on public.ai_stories for select
  using (status = 'published' and not is_hidden);

create unique index if not exists ai_stories_slug_key on public.ai_stories (slug);
create unique index if not exists ai_stories_story_key on public.ai_stories (story_key);

-- The trending feed: highest score first among live stories. `nulls last` so an
-- unrankable story sinks rather than sorting to the top of a desc order.
create index if not exists ai_stories_trending_idx
  on public.ai_stories (trend_score desc nulls last, last_seen_at desc nulls last)
  where status = 'published' and not is_hidden;

-- "Latest AI news": newest first, which is a different question from trending
-- and deserves its own index.
create index if not exists ai_stories_latest_idx
  on public.ai_stories (last_seen_at desc nulls last)
  where status = 'published' and not is_hidden;

-- Each filter indexed against the same published predicate, so a filtered feed
-- never falls back to a sequential scan.
create index if not exists ai_stories_category_idx
  on public.ai_stories (category, trend_score desc nulls last)
  where status = 'published' and not is_hidden;
create index if not exists ai_stories_region_idx
  on public.ai_stories (region, last_seen_at desc nulls last)
  where status = 'published' and not is_hidden;
create index if not exists ai_stories_featured_idx
  on public.ai_stories (trend_score desc nulls last)
  where status = 'published' and not is_hidden and featured;
-- The admin queue: oldest pending first, the same fairness argument as the
-- launch review queue in services/admin.ts.
create index if not exists ai_stories_pending_idx
  on public.ai_stories (created_at)
  where status = 'pending';
-- The ingestion's own working-set query: recent stories to group against, and
-- the entity half of the grouping test.
create index if not exists ai_stories_grouping_idx
  on public.ai_stories (primary_entity, last_seen_at desc nulls last);
-- Free-text search, over the generated column above.
create index if not exists ai_stories_search_trgm_idx
  on public.ai_stories using gin (search_text extensions.gin_trgm_ops);

drop trigger if exists ai_stories_updated_at on public.ai_stories;
create trigger ai_stories_updated_at
  before update on public.ai_stories
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Articles
-- ---------------------------------------------------------------------------
-- One row per article the ingestion has ever seen, AI-related or not. Keeping
-- the rejected ones is what makes a re-run cheap: an article already judged
-- "not about AI" is recognised by URL and skipped without being parsed,
-- classified or grouped.

create table if not exists public.ai_news_articles (
  id               uuid primary key default gen_random_uuid(),
  -- `set null` rather than cascade: losing a story must never silently delete
  -- the record of the article it was built from.
  story_id         uuid references public.ai_stories (id) on delete set null,
  source_id        uuid references public.ai_news_sources (id) on delete set null,
  -- Denormalised so an article keeps its attribution even if the source row is
  -- later deleted. The card's "Source: TechCrunch" line reads from here.
  source_name      text        not null,
  source_url       text        not null,
  -- THE deduplication key. Lower-cased host, no `www.`, no trailing slash and
  -- no tracking parameters -- see `normalizeUrl` in lib/ai-news/normalize.ts.
  -- The unique index below is what makes running ingestion twice a no-op.
  normalized_url   text        not null,
  -- SHA-256 of the normalised title plus normalised excerpt. The secondary
  -- check: the same story republished at a second URL (a syndication, an
  -- AMP/canonical split) collides here even though the URLs differ.
  content_hash     text        not null,
  title            text        not null,
  normalized_title text        not null,
  -- The feed's own snippet. Kept because classification and summarisation read
  -- it; never rendered. Reproducing a publisher's paragraphs is the one thing
  -- this feature must not do.
  excerpt          text,
  -- Our own composed sentence for this article, when it differs from the
  -- story's. Same 50-80 word contract, same bound.
  summary          text        check (summary is null or length(summary) <= 700),
  author           text,
  image_url        text,
  published_at     timestamptz,
  fetched_at       timestamptz not null default now(),
  -- A public interaction count the source's own API reports -- Hacker News
  -- points plus comments, today. This is the "engagement data from supported
  -- APIs" the brief allows, and it is null for every source that does not
  -- publish one, because a zero and an unknown are different facts and only one
  -- of them may be fed to a score.
  external_engagement        integer check (external_engagement is null or external_engagement >= 0),
  external_engagement_source text,

  -- ── Classification (section 10) ───────────────────────────────────────
  is_ai_related    boolean     not null default false,
  -- 0..1 from lib/ai-news/classify.ts. The reason an article was kept, and the
  -- number the auto-publish threshold reads.
  relevance_score  numeric(4, 3) check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)),
  category         text,
  sub_category     text,
  region           text        check (region is null or region in ('india', 'global')),
  -- Section 11 asks for these by name. Arrays rather than a jsonb blob because
  -- every one of them is a list of short strings we want to index and search.
  company          text,
  people           text[]      not null default '{}',
  products         text[]      not null default '{}',
  models           text[]      not null default '{}',
  entities         text[]      not null default '{}',
  keywords         text[]      not null default '{}',

  status           text        not null default 'pending'
                     check (status in ('pending', 'processed', 'duplicate', 'rejected', 'error')),
  rejected_reason  text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.ai_news_articles enable row level security;

-- Visible exactly when its story is. Written as an EXISTS against ai_stories so
-- the rule lives in one place: widening the story policy later cannot leave
-- this table behind, and narrowing it cannot leak through here. This is what
-- powers the "Covered by 4 sources" list on /ai/[slug] without a service-role
-- read.
drop policy if exists "ai_news_articles_select_published" on public.ai_news_articles;
create policy "ai_news_articles_select_published"
  on public.ai_news_articles for select
  using (
    exists (
      select 1 from public.ai_stories s
      where s.id = story_id and s.status = 'published' and not s.is_hidden
    )
  );

create unique index if not exists ai_news_articles_normalized_url_key
  on public.ai_news_articles (normalized_url);

-- Deliberately NOT unique. Two publications writing near-identical headlines
-- about the same release is the case this index exists to *find*, not refuse --
-- separate coverage of one event is the whole product. The ingestion queries
-- this, then decides.
create index if not exists ai_news_articles_content_hash_idx
  on public.ai_news_articles (content_hash);

create index if not exists ai_news_articles_story_idx
  on public.ai_news_articles (story_id, published_at desc nulls last);
create index if not exists ai_news_articles_published_idx
  on public.ai_news_articles (published_at desc nulls last);
create index if not exists ai_news_articles_source_idx
  on public.ai_news_articles (source_name, published_at desc nulls last);
create index if not exists ai_news_articles_category_idx
  on public.ai_news_articles (category, published_at desc nulls last);
create index if not exists ai_news_articles_status_idx
  on public.ai_news_articles (status, fetched_at desc);
-- The admin "incoming" table, and the queue of things classification kept but
-- grouping has not placed yet.
create index if not exists ai_news_articles_unassigned_idx
  on public.ai_news_articles (fetched_at desc)
  where story_id is null and is_ai_related;
-- Serves the tertiary duplicate check, which compares a candidate headline
-- against recent ones.
create index if not exists ai_news_articles_title_trgm_idx
  on public.ai_news_articles using gin (normalized_title extensions.gin_trgm_ops);

drop trigger if exists ai_news_articles_updated_at on public.ai_news_articles;
create trigger ai_news_articles_updated_at
  before update on public.ai_news_articles
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Entities
-- ---------------------------------------------------------------------------
-- The companies, models, people and tools stories are about (section 17), and
-- the data behind "AI Companies Making Noise" (section 18). Identity only: no
-- counters live here, because a counter would have to be kept in step with a
-- visibility rule *and* a time window, and both of those are questions the
-- read-side functions in 20260910010000 answer directly from the join.

create table if not exists public.ai_entities (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null check (length(btrim(name)) between 1 and 120),
  slug            text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Case- and punctuation-folded name, from `normalizeEntityName`. This is what
  -- a second story about the same company matches on; `name` keeps the display
  -- form the gazetteer defines.
  normalized_name text        not null,
  entity_type     text        not null check (entity_type in
                    ('company', 'model', 'person', 'tool', 'topic')),
  -- Set for entities the gazetteer knows about, so a company card can link out.
  website         text,
  logo_url        text,
  -- True for entities that came from lib/ai-news/entities.ts rather than from a
  -- headline. Only curated ones are offered as filters -- a name guessed out of
  -- a headline is good enough to search on and not good enough to advertise.
  is_curated      boolean     not null default false,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.ai_entities enable row level security;

-- Readable by anyone. This table holds public proper nouns -- "OpenAI",
-- "Gemini", "Sam Altman" -- and nothing else: no story linkage, no counts, no
-- timestamps that reveal what we hold. The linkage is in ai_story_entities,
-- which is gated on the story being published, so a row here says only that a
-- name is known, which is not a fact worth protecting.
drop policy if exists "ai_entities_select_all" on public.ai_entities;
create policy "ai_entities_select_all"
  on public.ai_entities for select
  using (true);

-- Type-scoped, not global: "Claude" is a model and could equally be a person,
-- and collapsing those into one row would merge two different things.
create unique index if not exists ai_entities_type_normalized_key
  on public.ai_entities (entity_type, normalized_name);
create unique index if not exists ai_entities_type_slug_key
  on public.ai_entities (entity_type, slug);
create index if not exists ai_entities_slug_idx on public.ai_entities (slug);
create index if not exists ai_entities_name_trgm_idx
  on public.ai_entities using gin (normalized_name extensions.gin_trgm_ops);

drop trigger if exists ai_entities_updated_at on public.ai_entities;
create trigger ai_entities_updated_at
  before update on public.ai_entities
  for each row execute function public.update_updated_at();

create table if not exists public.ai_story_entities (
  story_id   uuid not null references public.ai_stories (id) on delete cascade,
  entity_id  uuid not null references public.ai_entities (id) on delete cascade,
  -- How many of the story's articles named this entity. The "mentions" column
  -- in section 18, and a tie-breaker when two companies appear in one story.
  mentions   integer not null default 1 check (mentions >= 0),
  -- The entity the headline is actually about, as opposed to one it mentions in
  -- passing. At most one per story is set by the ingestion.
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (story_id, entity_id)
);

alter table public.ai_story_entities enable row level security;

drop policy if exists "ai_story_entities_select_published" on public.ai_story_entities;
create policy "ai_story_entities_select_published"
  on public.ai_story_entities for select
  using (
    exists (
      select 1 from public.ai_stories s
      where s.id = story_id and s.status = 'published' and not s.is_hidden
    )
  );

create index if not exists ai_story_entities_entity_idx
  on public.ai_story_entities (entity_id, is_primary);

-- ---------------------------------------------------------------------------
-- 5. Trend history
-- ---------------------------------------------------------------------------
-- Section 15: storing only the current score would make "Trending up" a claim
-- with nothing behind it. One row per story per hour, so a day of a busy story
-- costs 24 rows and the series is directly comparable across stories however
-- often the cron happens to run.

create table if not exists public.ai_trend_snapshots (
  id               uuid primary key default gen_random_uuid(),
  story_id         uuid        not null references public.ai_stories (id) on delete cascade,
  trend_score      numeric(5, 2) check (trend_score is null or (trend_score >= 0 and trend_score <= 100)),
  source_count     integer     not null default 0,
  recency_score    numeric(5, 2),
  velocity_score   numeric(5, 2),
  engagement_score numeric(5, 2),
  authority_score  numeric(5, 2),
  calculated_at    timestamptz not null default now(),
  -- The UTC hour this snapshot belongs to, as `YYYY-MM-DDTHH`, written by the
  -- application. A text bucket rather than `date_trunc('hour', calculated_at)`
  -- because that expression is STABLE, not IMMUTABLE, for a timestamptz -- it
  -- reads the session TimeZone -- and a unique index may only contain immutable
  -- expressions. Writing the bucket explicitly also makes a second run inside
  -- the same hour an update rather than a second row.
  bucket_hour      text        not null check (bucket_hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}$')
);

alter table public.ai_trend_snapshots enable row level security;

-- Visible with its story: the "up 12 points today" line on /ai/[slug] is read
-- with the anon key like everything else on that page.
drop policy if exists "ai_trend_snapshots_select_published" on public.ai_trend_snapshots;
create policy "ai_trend_snapshots_select_published"
  on public.ai_trend_snapshots for select
  using (
    exists (
      select 1 from public.ai_stories s
      where s.id = story_id and s.status = 'published' and not s.is_hidden
    )
  );

create unique index if not exists ai_trend_snapshots_story_hour_key
  on public.ai_trend_snapshots (story_id, bucket_hour);
create index if not exists ai_trend_snapshots_story_idx
  on public.ai_trend_snapshots (story_id, calculated_at desc);
-- The pruning query in lib/ai-news/ingest.ts.
create index if not exists ai_trend_snapshots_calculated_idx
  on public.ai_trend_snapshots (calculated_at);

-- ---------------------------------------------------------------------------
-- 6. Ingestion runs
-- ---------------------------------------------------------------------------
-- The log behind "Run AI News Ingestion" in /admin/ai-news (section 23). One
-- row per run, written before the work starts so a run that dies mid-way leaves
-- evidence rather than nothing.

create table if not exists public.ai_ingestion_runs (
  id                  uuid primary key default gen_random_uuid(),
  trigger_source      text        not null default 'cron'
                        check (trigger_source in ('cron', 'admin', 'manual')),
  status              text        not null default 'running'
                        check (status in ('running', 'ok', 'partial', 'failed')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  duration_ms         integer,
  sources_attempted   integer     not null default 0,
  sources_succeeded   integer     not null default 0,
  sources_failed      integer     not null default 0,
  articles_fetched    integer     not null default 0,
  articles_relevant   integer     not null default 0,
  articles_duplicate  integer     not null default 0,
  articles_rejected   integer     not null default 0,
  stories_created     integer     not null default 0,
  stories_updated     integer     not null default 0,
  scores_recomputed   integer     not null default 0,
  -- `[{ source, message }]`. One broken feed must not stop the others
  -- (section 32), so a failure is recorded here and the run carries on.
  errors              jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now()
);

alter table public.ai_ingestion_runs enable row level security;

-- No policy: operational logs. `ai_news_freshness()` in 20260910010000 is the
-- one thing a visitor may learn from this table, and it returns timestamps and
-- counts, nothing else.

create index if not exists ai_ingestion_runs_started_idx
  on public.ai_ingestion_runs (started_at desc);
create index if not exists ai_ingestion_runs_success_idx
  on public.ai_ingestion_runs (finished_at desc)
  where status in ('ok', 'partial');

-- ---------------------------------------------------------------------------
-- 7. Story aggregates, maintained by trigger
-- ---------------------------------------------------------------------------
-- `source_count` is both the "Covered by 4 sources" line and the largest term
-- in the trend score, so it is the one number in this feature that must not be
-- allowed to disagree with the rows it counts. A trigger, not application code:
-- there is then no code path -- ingestion, admin merge, admin delete, a manual
-- SQL fix -- that can leave it wrong.
--
-- DISTINCT source_name, not a row count. Four articles from one publication's
-- three sections is one source covering the story, and counting it as four
-- would be the easiest way to manufacture a trend.

create or replace function public.ai_refresh_story_aggregates(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_stories s
  set source_count  = coalesce(a.sources, 0),
      article_count = coalesce(a.articles, 0),
      first_seen_at = a.first_at,
      last_seen_at  = a.last_at
  from (
    select count(distinct lower(btrim(source_name))) as sources,
           count(*)                                  as articles,
           min(coalesce(published_at, fetched_at))   as first_at,
           max(coalesce(published_at, fetched_at))   as last_at
    from public.ai_news_articles
    where story_id = target
      and status <> 'rejected'
  ) a
  where s.id = target;
$$;

create or replace function public.ai_articles_touch_story()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  -- Branched on TG_OP with OLD and NEW referenced only where they exist.
  --
  -- Not a stylistic preference: OLD is an *unassigned record* in an INSERT
  -- trigger and NEW is unassigned in a DELETE one, and touching either raises
  -- "record `old` is not assigned yet" at runtime. A single condition like
  -- `tg_op = 'INSERT' or new.story_id is distinct from old.story_id` looks like
  -- it guards itself, and does not: PL/pgSQL hands the whole boolean to the SQL
  -- executor as one expression, which is under no obligation to short-circuit
  -- OR. So the branch has to happen in PL/pgSQL, before the expression is built.
  if tg_op = 'INSERT' then
    if new.story_id is not null then
      perform public.ai_refresh_story_aggregates(new.story_id);
    end if;

  elsif tg_op = 'DELETE' then
    if old.story_id is not null then
      perform public.ai_refresh_story_aggregates(old.story_id);
    end if;

  else
    -- UPDATE. An article can move between stories (an admin merge, a
    -- re-grouping), so the story it left is refreshed as well as the one it
    -- joined, and both are refreshed unconditionally: the trigger only fires on
    -- the four columns the aggregate is computed from, so there is nothing to
    -- be gained by working out which of them moved.
    if old.story_id is not null then
      perform public.ai_refresh_story_aggregates(old.story_id);
    end if;
    if new.story_id is not null and new.story_id is distinct from old.story_id then
      perform public.ai_refresh_story_aggregates(new.story_id);
    end if;
  end if;

  return null;
end;
$;

drop trigger if exists ai_news_articles_aggregate on public.ai_news_articles;
create trigger ai_news_articles_aggregate
  after insert or delete or update of story_id, published_at, status, source_name
  on public.ai_news_articles
  for each row execute function public.ai_articles_touch_story();

-- ---------------------------------------------------------------------------
-- 8. Publish stamping
-- ---------------------------------------------------------------------------
-- `published_at` is the moment a story went live on BharatHunt, which is not
-- the moment anyone published an article about it. Stamped here so no caller
-- has to remember, and cleared on un-publish so it never outlives the state it
-- describes.

create or replace function public.ai_stories_stamp_published()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  -- OLD does not exist on an INSERT, and reading it there is an error rather
  -- than a null (see the note in ai_articles_touch_story). Reading it once,
  -- inside a TG_OP branch, keeps the rest of the function ordinary.
  was_published boolean := false;
begin
  if tg_op = 'UPDATE' then
    was_published := old.status = 'published';
  end if;

  if new.status = 'published' and not was_published then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;

  return new;
end;
$;

drop trigger if exists ai_stories_stamp_published on public.ai_stories;
create trigger ai_stories_stamp_published
  before insert or update of status on public.ai_stories
  for each row execute function public.ai_stories_stamp_published();
