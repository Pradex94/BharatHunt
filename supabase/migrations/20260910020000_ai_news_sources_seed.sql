-- The starting source list for AI Trending.
--
-- Every row here is a feed or documented public API whose publisher offers it
-- for exactly this purpose: an RSS/Atom feed a reader is meant to poll, arXiv's
-- published export API, Algolia's public Hacker News search API, or GDELT's
-- public document API. Nothing here scrapes an article page, works around a
-- paywall, ignores a robots directive or defeats a bot check -- the pipeline
-- reads the feed, keeps the headline, the link and the feed's own snippet, and
-- sends every reader to the publisher's own page.
--
-- Every endpoint below was fetched and parsed before it was written here, with
-- `node scripts/ai-news-dry-run.mjs`. Feeds that answered 404/410, that
-- rejected an identified bot with 429, or that served HTML from their /feed/
-- path were removed rather than left in to fail on a schedule. Re-run that
-- script after editing this file — it reads its source list straight out of the
-- VALUES block below, so it always tests what will actually be deployed.
--
-- `poll_interval_minutes` is the politeness contract with each publisher and
-- the whole of section 24: 15-20 minutes for the wires that genuinely move,
-- 30-60 for company blogs, 180+ for research feeds that post in batches. A
-- source is skipped by the scheduler until its interval has elapsed, so a
-- 10-minute cron does not turn into a 10-minute poll of everything.
--
-- `reliability_score` is an editorial judgement and is only ever set by hand
-- (see the column comment in 20260910000000). Primary sources -- a lab
-- announcing its own model, a paper feed -- outrank reporting about them, and
-- aggregators sit lowest because their value is the *link*, not the write-up.
--
-- `auto_publish = false` on the two aggregators is the important one. An
-- aggregator can add coverage to a story other sources already established, but
-- a story whose only evidence is an aggregator entry waits for a human in
-- /admin/ai-news.
--
-- Idempotent: `on conflict (lower(btrim(name)))` updates the configuration in
-- place, so re-running this migration re-syncs endpoints and intervals without
-- resetting health counters or duplicating rows. Deliberately does NOT touch
-- `enabled`: a source an operator switched off must stay off across a deploy,
-- and a source an operator switched *on* must stay on.

insert into public.ai_news_sources
  (name, source_type, feed_url, api_endpoint, publisher, homepage_url,
   source_category, reliability_score, region, auto_publish, priority,
   poll_interval_minutes, enabled)
values
  -- ── Primary sources: labs and platforms announcing their own work ──────
  ('OpenAI',               'rss', 'https://openai.com/news/rss.xml',                     null, 'OpenAI',               'https://openai.com/news',                        'official', 0.98, 'global', true,  10,  30, true),
  ('Google DeepMind',      'rss', 'https://deepmind.google/blog/rss.xml',                null, 'Google DeepMind',      'https://deepmind.google/discover/blog',          'official', 0.98, 'global', true,  10,  30, true),
  ('Google Research',      'rss', 'https://research.google/blog/rss/',                   null, 'Google Research',      'https://research.google/blog/',                  'official', 0.95, 'global', true,  15,  60, true),
  ('Microsoft Research',   'rss', 'https://www.microsoft.com/en-us/research/feed/',      null, 'Microsoft Research',   'https://www.microsoft.com/en-us/research/',      'official', 0.95, 'global', true,  15,  60, true),
  ('Meta Engineering',     'rss', 'https://engineering.fb.com/feed/',                    null, 'Meta',                 'https://engineering.fb.com/',                    'official', 0.92, 'global', true,  15,  60, true),
  ('NVIDIA Blog',          'rss', 'https://blogs.nvidia.com/feed/',                      null, 'NVIDIA',               'https://blogs.nvidia.com/',                      'official', 0.92, 'global', true,  20,  60, true),
  ('Hugging Face',         'rss', 'https://huggingface.co/blog/feed.xml',                null, 'Hugging Face',         'https://huggingface.co/blog',                    'official', 0.92, 'global', true,  20,  60, true),
  ('AWS Machine Learning', 'rss', 'https://aws.amazon.com/blogs/machine-learning/feed/', null, 'AWS',                  'https://aws.amazon.com/blogs/machine-learning/', 'official', 0.88, 'global', true,  30, 120, true),

  -- ── Research ───────────────────────────────────────────────────────────
  -- arXiv's export API, used within its documented terms: a descending-date
  -- window, a modest page size, a low polling rate, and a link back to the
  -- abstract page rather than to the PDF.
  ('arXiv cs.AI', 'arxiv', null, 'http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40', 'arXiv', 'https://arxiv.org/list/cs.AI/recent', 'research', 0.90, 'global', true, 40, 180, true),
  ('arXiv cs.CL', 'arxiv', null, 'http://export.arxiv.org/api/query?search_query=cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=40', 'arXiv', 'https://arxiv.org/list/cs.CL/recent', 'research', 0.90, 'global', true, 45, 180, true),
  ('arXiv cs.LG', 'arxiv', null, 'http://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40', 'arXiv', 'https://arxiv.org/list/cs.LG/recent', 'research', 0.88, 'global', true, 50, 240, true),

  -- ── Reporting ──────────────────────────────────────────────────────────
  ('TechCrunch AI',         'rss',  'https://techcrunch.com/category/artificial-intelligence/feed/',      null, 'TechCrunch',            'https://techcrunch.com/category/artificial-intelligence/', 'news', 0.85, 'global', true, 10, 15, true),
  ('The Verge AI',          'atom', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',  null, 'The Verge',             'https://www.theverge.com/ai-artificial-intelligence',      'news', 0.85, 'global', true, 15, 15, true),
  ('MIT Technology Review', 'rss',  'https://www.technologyreview.com/feed/',                             null, 'MIT Technology Review', 'https://www.technologyreview.com/',                        'news', 0.88, 'global', true, 25, 60, true),
  ('Ars Technica',          'rss',  'https://feeds.arstechnica.com/arstechnica/technology-lab',           null, 'Ars Technica',          'https://arstechnica.com/',                                 'news', 0.85, 'global', true, 30, 30, true),
  ('Wired AI',              'rss',  'https://www.wired.com/feed/tag/ai/latest/rss',                       null, 'WIRED',                 'https://www.wired.com/tag/ai/',                            'news', 0.82, 'global', true, 30, 30, true),

  -- ── India ──────────────────────────────────────────────────────────────
  -- The differentiator (section 20). These are general startup and tech feeds
  -- rather than AI-only ones, which is fine and is the point: the relevance
  -- filter in lib/ai-news/classify.ts decides what is AI coverage, and
  -- rejecting the rest is cheap because a rejected URL is remembered and never
  -- classified twice.
  ('Inc42',              'rss', 'https://inc42.com/feed/',                                         null, 'Inc42',              'https://inc42.com/',                            'news', 0.80, 'india', true, 15, 20, true),
  ('Entrackr',           'rss', 'https://entrackr.com/rss',                                        null, 'Entrackr',           'https://entrackr.com/',                         'news', 0.78, 'india', true, 20, 30, true),
  ('YourStory',          'rss', 'https://yourstory.com/feed',                                      null, 'YourStory',          'https://yourstory.com/',                        'news', 0.75, 'india', true, 25, 30, true),
  ('MediaNama',          'rss', 'https://www.medianama.com/feed/',                                 null, 'MediaNama',          'https://www.medianama.com/',                    'news', 0.78, 'india', true, 30, 60, true),
  ('ET Tech',            'rss', 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms', null, 'The Economic Times', 'https://economictimes.indiatimes.com/tech',     'news', 0.80, 'india', true, 25, 30, true),
  ('Indian Express Tech','rss', 'https://indianexpress.com/section/technology/feed/',              null, 'The Indian Express', 'https://indianexpress.com/section/technology/', 'news', 0.78, 'india', true, 30, 30, true),

  -- ── Aggregators ────────────────────────────────────────────────────────
  -- Public, documented APIs. Neither may create a live story on its own
  -- (`auto_publish = false`): an aggregator entry is a pointer to somebody
  -- else's reporting, which makes it excellent corroboration and poor evidence.
  --
  -- Hacker News is also the one source that carries a real public engagement
  -- figure (points + comments), which is where `external_engagement` and the
  -- engagement term of the trend score get their non-first-party input.
  ('Hacker News (AI)', 'hn', null, 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=60&numericFilters=points>10&query=AI', 'Hacker News', 'https://news.ycombinator.com/', 'aggregator', 0.45, 'global', false, 60, 30, true),

  -- Seeded DISABLED, deliberately. The GDELT document API is a legitimate
  -- public API and the adapter for it is implemented and tested, but
  -- api.gdeltproject.org was unreachable from the network this was built on
  -- (connection failure, not a 4xx), so it could not be verified end to end.
  -- Shipping it enabled would mean shipping a source that fails on a schedule.
  -- Turn it on in /admin/ai-news once a fetch from the deployment environment
  -- succeeds; `enabled` is never overwritten by a re-run of this migration.
  ('GDELT (AI)', 'gdelt', null, 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22artificial+intelligence%22&mode=ArtList&maxrecords=75&sort=DateDesc&format=json', 'GDELT', 'https://www.gdeltproject.org/', 'aggregator', 0.40, 'global', false, 70, 60, false),

  -- ── Manual ─────────────────────────────────────────────────────────────
  -- Never fetched. The bucket an admin-entered article is attributed to, so a
  -- hand-added story still has a source row to hang its reliability on.
  ('Added by BharatHunt', 'manual', null, null, 'BharatHunt', 'https://bharathunt.org/ai', 'blog', 0.70, 'india', true, 900, 1440, true)

on conflict (lower(btrim(name))) do update set
  source_type           = excluded.source_type,
  feed_url              = excluded.feed_url,
  api_endpoint          = excluded.api_endpoint,
  publisher             = excluded.publisher,
  homepage_url          = excluded.homepage_url,
  source_category       = excluded.source_category,
  reliability_score     = excluded.reliability_score,
  region                = excluded.region,
  auto_publish          = excluded.auto_publish,
  priority              = excluded.priority,
  poll_interval_minutes = excluded.poll_interval_minutes;
