-- Launch Agent: a per-product distribution plan for other launch platforms.
--
-- The shape of this feature in one paragraph
-- ------------------------------------------
-- `launch_platforms` is the registry -- where a product could be launched, what
-- each place asks for, and how much of the submission BharatHunt is allowed to
-- do. It is configuration, not code: an admin edits it in /admin/launch-agent
-- and nothing redeploys. When a product is approved (lib/review.ts) a
-- `launch_campaigns` row is queued for it. Analysis fills in one
-- `launch_platform_campaigns` row per recommended platform: fit score, the
-- prepared launch kit, the requirements checklist, the suggested date, and the
-- maker's own progress through the submission.
--
-- Why nothing here has a write policy
-- -----------------------------------
-- The rule this schema inherits from 20260825000000 (launch review) and
-- 20260909000000 (funding): NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser,
-- so a write policy lets a session write *any value* into its row -- including
-- `status = 'PUBLISHED'` on a platform it never launched on, or a registry row
-- that marks a platform AUTOMATED. Every write is `createServiceClient()` from
-- server code that has already proved the caller owns the product
-- (lib/actions/launch-agent.ts) or is an admin (lib/actions/launch-agent-admin.ts),
-- or from the job endpoint, which carries its own shared secret.
--
-- Reads: a maker can read their own campaign rows, so a direct PostgREST call
-- with their own session sees nothing belonging to anyone else. The registry's
-- active rows are public -- they describe third-party websites and nothing else.
--
-- Idempotent throughout: safe to re-run. The seed never overwrites a row an
-- admin has already edited (`on conflict (slug) do nothing`).

-- ---------------------------------------------------------------------------
-- 1. The platform registry
-- ---------------------------------------------------------------------------

create table if not exists public.launch_platforms (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text        not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name                   text        not null check (length(btrim(name)) between 1 and 80),
  description            text        not null default '' check (length(description) <= 600),
  website_url            text        not null check (website_url ~ '^https://'),
  submission_url         text        check (submission_url is null or submission_url ~ '^https://'),
  -- The platform's own rules page, shown beside the requirements so a maker can
  -- check what we say against the source.
  guidelines_url         text        check (guidelines_url is null or guidelines_url ~ '^https://'),
  category               text        not null default 'launch_platform'
                         check (category in ('launch_platform', 'community', 'directory', 'developer', 'newsletter')),
  -- AUTOMATED: an approved API or integration permits the operation.
  -- ASSISTED:  we prepare and deep-link; the maker completes the submission.
  -- AI_PREPARED: we prepare the kit; the maker submits by hand. (The name is
  --   the product brief's; the UI calls it "Prepared kit". No model writes it
  --   -- see lib/launch-agent/content.ts.)
  automation_level       text        not null default 'AI_PREPARED'
                         check (automation_level in ('AUTOMATED', 'ASSISTED', 'AI_PREPARED')),
  api_supported          boolean     not null default false,
  requires_user_action   boolean     not null default true,
  active                 boolean     not null default true,
  -- [{ key, label, required, note?, verified? }]. `key` selects the evaluator in
  -- lib/launch-agent/requirements.ts; unknown keys render as manual steps.
  requirements           jsonb       not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  -- Product categories this platform suits (PRODUCT_CATEGORIES values), or
  -- '{}' for any.
  supported_product_types text[]     not null default '{}',
  -- Audience tags matched against product signals, plus per-tag weights and
  -- hard rules. See lib/launch-agent/fit.ts.
  audience_tags          text[]      not null default '{}',
  fit_rules              jsonb       not null default '{}'::jsonb check (jsonb_typeof(fit_rules) = 'object'),
  -- Which content template family writes the launch kit.
  content_style          text        not null default 'directory'
                         check (content_style in ('producthunt', 'show_hn', 'reddit', 'peerlist', 'community_story', 'directory', 'devtools')),
  -- { phase, weekdays?, note? } -- drives the suggested launch timeline.
  launch_rules           jsonb       not null default '{}'::jsonb check (jsonb_typeof(launch_rules) = 'object'),
  -- Free-text guidance an admin maintains, shown on the platform sheet.
  instructions           text        not null default '' check (length(instructions) <= 2000),
  -- Adapter key (lib/launch-agent/adapters.ts). Unknown keys fall back to the
  -- adapter for `automation_level`.
  adapter                text        not null default 'default',
  priority               integer     not null default 100 check (priority between 0 and 1000),
  -- When a person last checked this row against the platform's own site.
  verified_at            date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- An AUTOMATED row must say it has an API, and must not also claim the maker
  -- has to finish by hand. Keeps a careless admin edit from producing a badge
  -- that promises something the adapter cannot do.
  constraint launch_platforms_automation_consistent check (
    automation_level <> 'AUTOMATED' or (api_supported and not requires_user_action)
  )
);

create unique index if not exists launch_platforms_slug_key on public.launch_platforms (slug);
create index if not exists launch_platforms_active_idx on public.launch_platforms (priority) where active;

alter table public.launch_platforms enable row level security;

drop policy if exists "Active launch platforms are public" on public.launch_platforms;
create policy "Active launch platforms are public"
  on public.launch_platforms for select
  using (active);

drop trigger if exists launch_platforms_updated_at on public.launch_platforms;
create trigger launch_platforms_updated_at
  before update on public.launch_platforms
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Campaigns: one per product
-- ---------------------------------------------------------------------------

create table if not exists public.launch_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid        not null references public.products (id) on delete cascade,
  user_id             text        not null references public.profiles (id) on delete cascade,
  status              text        not null default 'NOT_STARTED'
                      check (status in ('NOT_STARTED', 'ANALYZING', 'READY', 'FAILED')),
  overall_score       integer     check (overall_score between 0 and 100),
  -- The validated analysis (lib/launch-agent/validate.ts): score breakdown,
  -- matched audience, summary. Never rendered unvalidated.
  analysis            jsonb       not null default '{}'::jsonb,
  -- Rules version that produced `analysis`, so a change to the engine can
  -- re-analyse old campaigns deliberately rather than by accident.
  engine_version      text,
  -- The product's `updated_at` at analysis time. A later edit shows a
  -- "refresh your plan" prompt instead of silently serving stale copy.
  product_updated_at  timestamptz,
  -- Future access control (Free / Pro / Enterprise). Not read by any UI today;
  -- lib/launch-agent/access.ts answers "allowed" for everyone.
  access_tier         text        not null default 'free',
  attempts            integer     not null default 0 check (attempts >= 0),
  error_message       text,
  analyzed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The duplicate guard: publishing, retrying, re-approving and the job endpoint
-- all converge on this row instead of creating another.
create unique index if not exists launch_campaigns_product_key on public.launch_campaigns (product_id);
create index if not exists launch_campaigns_user_idx on public.launch_campaigns (user_id);
create index if not exists launch_campaigns_status_idx on public.launch_campaigns (status, created_at)
  where status in ('NOT_STARTED', 'FAILED');

alter table public.launch_campaigns enable row level security;

drop policy if exists "Makers read their own launch campaigns" on public.launch_campaigns;
create policy "Makers read their own launch campaigns"
  on public.launch_campaigns for select
  using (public.requesting_user_id() = user_id);

drop trigger if exists launch_campaigns_updated_at on public.launch_campaigns;
create trigger launch_campaigns_updated_at
  before update on public.launch_campaigns
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Per-platform progress inside a campaign
-- ---------------------------------------------------------------------------

create table if not exists public.launch_platform_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid        not null references public.launch_campaigns (id) on delete cascade,
  platform_id        uuid        not null references public.launch_platforms (id) on delete cascade,
  status             text        not null default 'NOT_STARTED'
                     check (status in ('NOT_STARTED', 'ANALYZING', 'READY', 'MISSING_INFORMATION',
                                       'READY_TO_SUBMIT', 'SUBMITTED', 'PUBLISHED', 'FAILED',
                                       'USER_ACTION_REQUIRED')),
  -- Copied from the registry at analysis time: the badge a maker saw when they
  -- prepared must not change under them because an admin edited the platform.
  automation_level   text        not null check (automation_level in ('AUTOMATED', 'ASSISTED', 'AI_PREPARED')),
  fit_score          integer     not null default 0 check (fit_score between 0 and 100),
  priority           text        not null default 'MEDIUM' check (priority in ('HIGH', 'MEDIUM', 'LOW')),
  recommended        boolean     not null default true,
  reason             text        not null default '',
  -- The prepared launch kit, and the maker's own edits kept apart from it, so
  -- "Regenerate" refreshes the drafts without discarding what they rewrote.
  generated_content  jsonb       not null default '{}'::jsonb,
  content_overrides  jsonb       not null default '{}'::jsonb,
  content_variant    integer     not null default 0 check (content_variant >= 0),
  requirements       jsonb       not null default '[]'::jsonb,
  readiness          integer     not null default 0 check (readiness between 0 and 100),
  scheduled_for      date,
  submission_url     text,
  utm_url            text,
  -- Only ever the maker's own report for a non-automated platform. The UI says
  -- "marked by you"; nothing here claims BharatHunt confirmed it.
  published_url      text        check (published_url is null or published_url ~ '^https://'),
  submitted_at       timestamptz,
  published_at       timestamptz,
  last_checked_at    timestamptz,
  error_message      text,
  prepared_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists launch_platform_campaigns_pair_key
  on public.launch_platform_campaigns (campaign_id, platform_id);
create index if not exists launch_platform_campaigns_campaign_idx on public.launch_platform_campaigns (campaign_id);
create index if not exists launch_platform_campaigns_platform_idx on public.launch_platform_campaigns (platform_id);
create index if not exists launch_platform_campaigns_status_idx on public.launch_platform_campaigns (status);

alter table public.launch_platform_campaigns enable row level security;

drop policy if exists "Makers read their own platform campaigns" on public.launch_platform_campaigns;
create policy "Makers read their own platform campaigns"
  on public.launch_platform_campaigns for select
  using (
    exists (
      select 1 from public.launch_campaigns c
      where c.id = campaign_id
        and c.user_id = public.requesting_user_id()
    )
  );

drop trigger if exists launch_platform_campaigns_updated_at on public.launch_platform_campaigns;
create trigger launch_platform_campaigns_updated_at
  before update on public.launch_platform_campaigns
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Seed the registry
-- ---------------------------------------------------------------------------
-- Checked against each platform's own pages on 2026-09-15. None of these offers
-- an API that lets a third-party commercial app publish on a maker's behalf --
-- Product Hunt's API is read-only by default and excludes commercial use
-- without permission -- so nothing is seeded AUTOMATED. ASSISTED rows are the
-- ones where we can hand the maker a pre-filled official submit link or a
-- guided launch-day checklist; the rest are prepared kits.
--
-- Requirements marked `"verified": true` were confirmed on the platform's own
-- site; anything else is phrased as guidance and says to check the form.

insert into public.launch_platforms
  (slug, name, description, website_url, submission_url, guidelines_url, category, automation_level,
   api_supported, requires_user_action, requirements, supported_product_types, audience_tags, fit_rules,
   content_style, launch_rules, instructions, adapter, priority, verified_at)
values
(
  'product-hunt', 'Product Hunt',
  'The largest daily launch community for new tech products. Launches compete on a daily leaderboard.',
  'https://www.producthunt.com', 'https://www.producthunt.com/posts/new',
  'https://help.producthunt.com',
  'launch_platform', 'ASSISTED', false, true,
  '[
    {"key":"website_url","label":"Product URL","required":true},
    {"key":"name","label":"Product name","required":true},
    {"key":"tagline","label":"Tagline","required":true,"note":"Keep it short — check the form for the current character limit."},
    {"key":"description","label":"Description","required":true},
    {"key":"logo","label":"Logo / thumbnail","required":true},
    {"key":"screenshots","label":"Gallery images","required":true},
    {"key":"maker_info","label":"Maker information","required":true},
    {"key":"topics","label":"Topics","required":true},
    {"key":"first_comment","label":"Maker first comment","required":false},
    {"key":"video","label":"Demo video","required":false},
    {"key":"launch_timing","label":"Launch day scheduled","required":false},
    {"key":"account","label":"A Product Hunt account (yours)","required":true,"manual":true,"verified":true},
    {"key":"final_submit","label":"You complete and schedule the post on Product Hunt","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{}', '{tech,saas,ai,productivity,design,developer,consumer,marketing}',
  '{"tagWeights":{"ai":14,"saas":12,"developer":8,"productivity":10,"design":10},"assetSensitive":true}'::jsonb,
  'producthunt', '{"phase":3,"weekdays":[2,3,4],"note":"Each launch day starts at 12:01 AM Pacific. Tuesday–Thursday is common; quieter days are less competitive."}'::jsonb,
  'Product Hunt''s API does not permit third-party commercial apps to post, so the final submission is always yours. Line up your first comment and be around to reply on launch day. Do not ask for upvotes.',
  'product-hunt', 10, '2026-09-15'
),
(
  'uneed', 'Uneed',
  'A daily launch platform for tools and startups, with a public queue that assigns your launch date.',
  'https://www.uneed.best', 'https://www.uneed.best/submit-a-tool', null,
  'launch_platform', 'AI_PREPARED', false, true,
  '[
    {"key":"website_url","label":"Product URL","required":true,"verified":true},
    {"key":"name","label":"Product name","required":true},
    {"key":"tagline","label":"Tagline","required":true},
    {"key":"description","label":"Description","required":true},
    {"key":"logo","label":"Logo","required":true},
    {"key":"screenshots","label":"Screenshots","required":true},
    {"key":"topics","label":"Categories","required":true},
    {"key":"account","label":"A Uneed account (created during submission)","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{}', '{saas,ai,productivity,design,developer,marketing,indie}',
  '{"tagWeights":{"saas":12,"ai":10,"indie":8,"productivity":8}}'::jsonb,
  'directory', '{"phase":1,"note":"The free queue assigns a launch date that can be months away — submit early. Paid options exist on the platform."}'::jsonb,
  'Submit early: the queue decides your date. Check the pricing page for the current free and paid options before you submit.',
  'default', 20, '2026-09-15'
),
(
  'peerlist', 'Peerlist Launchpad',
  'A professional network for builders. Launchpad runs a weekly cycle where projects are voted on through the week.',
  'https://peerlist.io', 'https://peerlist.io/launchpad',
  'https://help.peerlist.io/individual/launchpad/how-to-launch-a-project-on-peerlist-launchpad',
  'community', 'AI_PREPARED', false, true,
  '[
    {"key":"name","label":"Project name","required":true},
    {"key":"tagline","label":"Tagline","required":true},
    {"key":"description","label":"Complete project description","required":true,"note":"Only fully completed projects are eligible.","verified":true},
    {"key":"website_url","label":"Project link","required":true},
    {"key":"logo","label":"Project logo","required":true},
    {"key":"screenshots","label":"Project images","required":true},
    {"key":"maker_info","label":"Your Peerlist profile","required":true},
    {"key":"account","label":"A Peerlist account with the project added to your profile","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{}', '{developer,design,saas,ai,productivity,tech,india}',
  '{"tagWeights":{"developer":12,"design":10,"india":8,"ai":8}}'::jsonb,
  'peerlist', '{"phase":2,"weekdays":[1],"note":"Launches open on Mondays (UTC) and run for the week."}'::jsonb,
  'Add the project to your Peerlist profile first, then launch it on a Monday. Peerlist suggests building a little presence before your first launch.',
  'default', 30, '2026-09-15'
),
(
  'betalist', 'BetaList',
  'A directory of early-stage startups looking for early adopters.',
  'https://betalist.com', 'https://betalist.com/submit', 'https://betalist.com/faq',
  'directory', 'AI_PREPARED', false, true,
  '[
    {"key":"website_url","label":"A landing page with a way to sign up or get access","required":true,"verified":true},
    {"key":"name","label":"Startup name","required":true},
    {"key":"tagline","label":"One-line pitch","required":true},
    {"key":"description","label":"Clear description","required":true},
    {"key":"screenshots","label":"Visuals / screenshot","required":true},
    {"key":"early_stage","label":"Pre-launch or recently launched, without major press coverage","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{}', '{saas,ai,consumer,productivity,indie}',
  '{"tagWeights":{"saas":10,"indie":8,"ai":6},"prefersEarlyStage":true}'::jsonb,
  'directory', '{"phase":1,"note":"Review queues are long; paid expedited review exists. Check current submission pricing on the site."}'::jsonb,
  'BetaList is for early-stage startups. Submission pricing has changed over time — check the submit page before you rely on a free listing.',
  'default', 60, '2026-09-15'
),
(
  'tiny-startups', 'Tiny Startups',
  'A launch platform and newsletter for small and micro startups with a weekly leaderboard.',
  'https://www.tinystartups.com', 'https://www.tinystartups.com/submit', null,
  'newsletter', 'AI_PREPARED', false, true,
  '[
    {"key":"website_url","label":"Product URL","required":true},
    {"key":"name","label":"Startup name","required":true},
    {"key":"tagline","label":"Tagline","required":true},
    {"key":"description","label":"Description","required":true},
    {"key":"logo","label":"Logo","required":true}
  ]'::jsonb,
  '{}', '{indie,saas,ai,productivity,marketing}',
  '{"tagWeights":{"indie":14,"saas":10}}'::jsonb,
  'directory', '{"phase":2,"weekdays":[1],"note":"Weekly leaderboard, Monday to Sunday. A free queue and a paid skip-the-queue option exist."}'::jsonb,
  'Weekly leaderboards reset on Monday. A free launch is available; paid add-ons are optional.',
  'default', 50, '2026-09-15'
),
(
  'devhunt', 'DevHunt',
  'An open-source launch platform dedicated to developer tools, with GitHub-based logins.',
  'https://devhunt.org', 'https://devhunt.org', 'https://github.com/MarsX-dev/devhunt',
  'developer', 'AI_PREPARED', false, true,
  '[
    {"key":"website_url","label":"Tool URL","required":true},
    {"key":"name","label":"Tool name","required":true},
    {"key":"tagline","label":"Tagline","required":true},
    {"key":"description","label":"Description","required":true},
    {"key":"logo","label":"Logo","required":true},
    {"key":"screenshots","label":"Screenshots","required":true},
    {"key":"account","label":"Sign in with GitHub","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{Developer Tools}', '{developer,api,open_source,technical}',
  '{"tagWeights":{"developer":20,"api":10,"open_source":10},"requiredAnyTags":["developer","api","open_source"]}'::jsonb,
  'devtools', '{"phase":2,"note":"Weekly launches for developer tools."}'::jsonb,
  'Only for tools built for developers. Lead with what it does technically.',
  'default', 40, '2026-09-15'
),
(
  'indie-hackers', 'Indie Hackers',
  'A community of founders building profitable online businesses. Product pages plus a story-driven launch post.',
  'https://www.indiehackers.com', 'https://www.indiehackers.com/products', null,
  'community', 'AI_PREPARED', false, true,
  '[
    {"key":"name","label":"Product name","required":true},
    {"key":"tagline","label":"Tagline","required":true},
    {"key":"website_url","label":"Product URL","required":true},
    {"key":"launch_story","label":"A genuine launch story post","required":true},
    {"key":"account","label":"An Indie Hackers account","required":true,"manual":true}
  ]'::jsonb,
  '{}', '{indie,saas,marketing,productivity,ai}',
  '{"tagWeights":{"indie":16,"saas":10,"marketing":6}}'::jsonb,
  'community_story', '{"phase":4,"note":"Share what you learned building it, not an advert."}'::jsonb,
  'Write about the journey and what you learned; a bare link post rarely lands. Top Products features may carry a fee — check the site.',
  'default', 70, '2026-09-15'
),
(
  'show-hn', 'Hacker News (Show HN)',
  'Hacker News''s section for things people have made that others can try.',
  'https://news.ycombinator.com', 'https://news.ycombinator.com/submitlink',
  'https://news.ycombinator.com/showhn.html',
  'community', 'ASSISTED', false, true,
  '[
    {"key":"website_url","label":"Something people can try right away","required":true,"verified":true},
    {"key":"title_format","label":"Title starts with \"Show HN:\"","required":true,"verified":true},
    {"key":"first_comment","label":"A plain, technical explanation comment","required":false},
    {"key":"no_signup_wall","label":"No sign-up or email wall before people can try it","required":true,"manual":true,"verified":true},
    {"key":"no_vote_asks","label":"You will not ask anyone to upvote or comment","required":true,"manual":true,"verified":true},
    {"key":"account","label":"A Hacker News account","required":true,"manual":true}
  ]'::jsonb,
  '{}', '{developer,technical,open_source,api,ai}',
  '{"tagWeights":{"developer":16,"open_source":14,"technical":10,"api":8},"penalizeTags":{"consumer":10,"marketing":12},"requiresWebsite":true}'::jsonb,
  'show_hn', '{"phase":4,"note":"Blog posts, sign-up pages and landing pages are off-topic for Show HN."}'::jsonb,
  'Show HN is for things people can try now. No marketing language, and never ask friends to upvote — HN treats that as abuse.',
  'show-hn', 80, '2026-09-15'
),
(
  'launching-next', 'Launching Next',
  'A long-running directory of new startups and side projects, reviewed daily.',
  'https://www.launchingnext.com', 'https://www.launchingnext.com/submit/', null,
  'directory', 'AI_PREPARED', false, true,
  '[
    {"key":"name","label":"Startup name","required":true,"verified":true},
    {"key":"website_url","label":"URL","required":true,"verified":true},
    {"key":"tagline","label":"Headline","required":true,"verified":true},
    {"key":"description","label":"Full description","required":true,"verified":true},
    {"key":"topics","label":"Tags","required":true,"verified":true}
  ]'::jsonb,
  '{}', '{saas,consumer,indie,ai,productivity,marketing,tech}',
  '{"tagWeights":{"indie":6,"saas":6}}'::jsonb,
  'directory', '{"phase":1,"note":"Free submissions are reviewed daily; a paid option speeds up review."}'::jsonb,
  'Straightforward directory listing — a good early, low-effort step.',
  'default', 90, '2026-09-15'
),
(
  'alternativeto', 'AlternativeTo',
  'Crowdsourced software recommendations: people find your product as an alternative to tools they already know.',
  'https://alternativeto.net', 'https://alternativeto.net', 'https://alternativeto.net/faq',
  'directory', 'AI_PREPARED', false, true,
  '[
    {"key":"name","label":"Application name","required":true},
    {"key":"description","label":"Description","required":true},
    {"key":"topics","label":"Tags","required":true},
    {"key":"screenshots","label":"Screenshots","required":false},
    {"key":"platforms","label":"Platforms and license","required":true,"manual":true,"verified":true},
    {"key":"account","label":"An account at least 7 days old (Suggest new application)","required":true,"manual":true,"verified":true}
  ]'::jsonb,
  '{}', '{saas,productivity,design,developer,consumer,open_source}',
  '{"tagWeights":{"productivity":8,"open_source":10,"design":6}}'::jsonb,
  'directory', '{"phase":1,"note":"Review backlogs can run for months; submit early."}'::jsonb,
  'Best when your product is a clear alternative to a well-known tool. Use "Suggest new application" from your account menu.',
  'default', 100, '2026-09-15'
),
(
  'reddit-sideproject', 'Reddit r/SideProject',
  'A subreddit where makers share projects they have built and ask for feedback.',
  'https://www.reddit.com/r/SideProject/', 'https://www.reddit.com/r/SideProject/submit',
  'https://www.reddit.com/r/SideProject/',
  'community', 'ASSISTED', false, true,
  '[
    {"key":"name","label":"Post title","required":true},
    {"key":"reddit_post","label":"Community-appropriate post body","required":true},
    {"key":"website_url","label":"Link to try it","required":true},
    {"key":"subreddit_rules","label":"You have read the subreddit rules","required":true,"manual":true},
    {"key":"account","label":"A Reddit account in good standing","required":true,"manual":true}
  ]'::jsonb,
  '{}', '{indie,consumer,productivity,ai,developer,saas}',
  '{"tagWeights":{"indie":12,"consumer":6}}'::jsonb,
  'reddit', '{"phase":5,"note":"One honest post; stay to answer comments. Follow each subreddit''s self-promotion rules."}'::jsonb,
  'Ask for feedback, answer every comment, and post once. Subreddits remove promotional posts that ignore their rules.',
  'reddit', 110, '2026-09-15'
)
on conflict (slug) do nothing;
