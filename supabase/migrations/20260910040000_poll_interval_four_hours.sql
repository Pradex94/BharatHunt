-- Poll every source at most once every four hours.
--
-- Why
-- ---
-- The seeds shipped per-source cadences between 15 minutes and a day, sized for
-- "how often does this publisher post". That is the wrong question to optimise:
-- the right one is "how often is it defensible to ask someone else's server for
-- a file we are not paying for". Four hours is the answer chosen for this
-- deployment, and it is applied as a FLOOR rather than a flat assignment:
--
--   greatest(poll_interval_minutes, 240)
--
-- so the sources already polling *less* often than four hours keep their slower
-- cadence. A flat `= 240` would have quietly made the daily arXiv sweep six
-- times more aggressive, which is the exact opposite of the intent.
--
-- The column default moves too. Without that, the next source added through
-- /admin/ai-news would arrive at the old 60-minute default and silently sit
-- outside the policy -- the kind of gap that is invisible until it is a
-- complaint from a publisher.
--
-- This does not change how much gets ingested, only how often we ask. Every
-- feed returns its whole current page on each fetch and `normalized_url` is
-- unique, so a slower cadence collects the same articles in fewer requests.
-- What it does affect is latency: a story can now be up to four hours old
-- before it is seen, which is the trade being made deliberately.
--
-- Both tables, because both pipelines fetch from third-party publishers on the
-- same schedule mechanism and the same reasoning applies to each.

-- ---------------------------------------------------------------------------
-- 1. New sources inherit the policy
-- ---------------------------------------------------------------------------
-- The `between 5 and 1440` check on both columns already permits 240; this only
-- moves where a row lands when the caller does not say.

alter table public.ai_news_sources
  alter column poll_interval_minutes set default 240;

alter table public.funding_sources
  alter column poll_interval_minutes set default 240;

-- ---------------------------------------------------------------------------
-- 2. Existing sources are raised to the floor
-- ---------------------------------------------------------------------------
-- `where poll_interval_minutes < 240` rather than an unconditional update, so
-- re-running this migration rewrites no rows and the slower sources are never
-- touched at all.

update public.ai_news_sources
   set poll_interval_minutes = 240
 where poll_interval_minutes < 240;

update public.funding_sources
   set poll_interval_minutes = 240
 where poll_interval_minutes < 240;

comment on column public.ai_news_sources.poll_interval_minutes is
  'Minimum minutes between fetch attempts for this source. Floor of 240 (four hours) set by 20260910040000; exponential backoff on consecutive failures multiplies it further.';

comment on column public.funding_sources.poll_interval_minutes is
  'Minimum minutes between fetch attempts for this source. Floor of 240 (four hours) set by 20260910040000; exponential backoff on consecutive failures multiplies it further.';
