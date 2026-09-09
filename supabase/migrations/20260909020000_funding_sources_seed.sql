-- The starting source list.
--
-- What "enabled" means here
-- ------------------------
-- Every row below with `enabled = true` was checked before it was written: the
-- URL was fetched and returned a parseable feed, and the publication's
-- robots.txt was read and permits it. The rows with `enabled = false` are
-- configured and ready but are somebody's decision to make, not this
-- migration's -- each one carries its reason in `last_error` so the admin table
-- shows why without anyone having to find this file.
--
-- Checked 2026-09-09:
--   entrackr.com/rss      200, RSS 2.0. robots.txt disallows only /static/* for
--                         `*` (plus SemrushBot and AhrefsBot by name).
--   yourstory.com/feed    200, RSS 2.0. robots.txt is `Allow: /` with no rule
--                         touching /feed and no AI-agent restrictions.
--   news.google.com/rss   200, RSS 2.0. Google's own syndication endpoint for
--                         a News search, which is what it is published for.
--   inc42.com/feed/       200, RSS 2.0, and `User-agent: *` allows it -- but the
--                         same file names GPTBot, ClaudeBot, CCBot and others
--                         and disallows them outright. This pipeline sends
--                         article metadata to a model, so enabling it is a call
--                         about the spirit of that rule and it belongs to the
--                         operator. Left off.
--   api.gdeltproject.org  429 on every attempt from a shared address, with the
--                         body asking for no more than one request every five
--                         seconds. The client honours that (GDELT_MIN_INTERVAL_MS
--                         in lib/funding/sources.ts) but the source is left off
--                         rather than shipping a feed that answers 429 on a
--                         cold start.
--
-- Two Google News queries rather than one, and Entrackr alongside them, because
-- section 5 is explicit that this must not depend on a single source: if one
-- goes quiet the feed keeps moving, and a round covered twice is what
-- `funding_round_articles` is for.
--
-- Guarded by "has anything ever been seeded" rather than `on conflict do
-- nothing`: an operator who disabled a feed, retuned its interval or deleted it
-- outright must not have that undone by the next `supabase db push`.

do $$
begin
  if exists (select 1 from public.funding_sources) then
    return;
  end if;

  insert into public.funding_sources
    (name, source_type, feed_url, api_endpoint, publisher, homepage_url,
     enabled, priority, poll_interval_minutes, last_error)
  values
  -- Highest priority: a dedicated Indian startup-funding desk. Its headlines
  -- are already close to structured ("Navam Capital leads Rs 22 Cr round in
  -- DigitalPaani"), and its item descriptions carry the investor list, which is
  -- what makes extraction from it accurate rather than hopeful.
  ('Entrackr', 'rss', 'https://entrackr.com/rss', null,
   'Entrackr', 'https://entrackr.com', true, 10, 15, null),

  ('YourStory', 'rss', 'https://yourstory.com/feed', null,
   'YourStory', 'https://yourstory.com', true, 20, 30, null),

  -- Google News search feeds. These are the breadth tier: they surface
  -- publications that have no feed of their own, and each item names its
  -- publisher in `<source>`. Their `<link>` is a news.google.com redirect to
  -- that publisher rather than a direct link, and their `<description>` is only
  -- an anchor tag -- so extraction from these runs on the headline alone and
  -- scores itself lower accordingly.
  ('Google News - India startup funding', 'rss',
   'https://news.google.com/rss/search?q=india+startup+funding+raises&hl=en-IN&gl=IN&ceid=IN:en',
   null, null, 'https://news.google.com', true, 30, 30, null),

  ('Google News - India seed and Series A', 'rss',
   'https://news.google.com/rss/search?q=indian+startup+%22seed+round%22+OR+%22series+A%22+funding&hl=en-IN&gl=IN&ceid=IN:en',
   null, null, 'https://news.google.com', true, 40, 60, null),

  ('Inc42', 'rss', 'https://inc42.com/feed/', null,
   'Inc42', 'https://inc42.com', false, 25, 30,
   'Disabled by default: inc42.com/robots.txt allows `*` but disallows named AI agents. Enable only if you are satisfied that applies to a first-party feed reader.'),

  ('GDELT', 'gdelt', null,
   'https://api.gdeltproject.org/api/v2/doc/doc',
   null, 'https://www.gdeltproject.org', false, 60, 60,
   'Disabled by default: GDELT answered 429 on every check and asks for no more than one request every 5 seconds. Enable once you have a query and cadence it is happy with.'),

  -- Not fetched, ever. This is the row an admin-entered round is attributed to,
  -- so `funding_rounds.source_id` is never null just because a human typed it.
  ('Manual entry', 'manual', null, null, 'Bharat Hunt', null, true, 999, 1440, null);
end $$;
