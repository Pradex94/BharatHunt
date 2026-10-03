-- ===========================================================================
-- Product Intelligence, phase 3: engagement signals, trending/rising, search
-- filters, and user lists.
--
-- Builds on what exists rather than beside it:
--   - `product_events` (first schema) becomes the event log it was meant to
--     be. Nothing wrote to it before; now /api/signals does, through the
--     service role, with a daily-rotating anonymous session hash instead of an
--     IP address.
--   - `products.trend_score` (first schema) finally gets a value. It was 0 on
--     every row because `calculate_product_scores()` was never scheduled, so the
--     marketplace "Trending" sort was really an upvote tie-break. The new
--     `refresh_discovery_signals()` writes it hourly; every existing reader of
--     trend_score (marketplace, search, homepage) improves with no code change.
--   - `search_products()` keeps its ranking and gains the new filters.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Derived attributes for filtering and matching
-- ---------------------------------------------------------------------------

-- Flags from lib/intelligence/knowledge.ts: 'ai-first', 'open-source',
-- 'privacy', 'india-focus', 'free-plan', 'mobile'. Written by the indexer.
alter table public.product_intelligence
  add column if not exists attributes text[] not null default '{}';

create index if not exists product_intelligence_attributes_idx
  on public.product_intelligence using gin (attributes);

-- ---------------------------------------------------------------------------
-- 2. Ranking columns on products, and who may write them
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists rising_score    real        not null default 0,
  add column if not exists recent_saves    integer     not null default 0,
  add column if not exists recent_compares integer     not null default 0,
  add column if not exists signals_at      timestamptz;

-- Engagement counters and scores are inputs to public rankings, so a maker's
-- own session must not be able to set them. Before this, the creator UPDATE
-- policy let anyone holding the (public) anon key plus their own session write
-- `trend_score` or `upvote_count` on their own product. Same SECURITY INVOKER
-- `current_user` test as the review and source gates: the counter RPCs and
-- the signal job are SECURITY DEFINER / service role and pass; everyone else's
-- writes to these columns are quietly put back, so an ordinary edit that
-- happens to send a full row still succeeds.
create or replace function public.enforce_product_counter_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.view_count       := 0;
    new.upvote_count     := 0;
    new.comment_count    := 0;
    new.bookmark_count   := 0;
    new.trend_score      := 0;
    new.popularity_score := 0;
    new.rising_score     := 0;
    new.recent_saves     := 0;
    new.recent_compares  := 0;
    new.signals_at       := null;
  else
    new.view_count       := old.view_count;
    new.upvote_count     := old.upvote_count;
    new.comment_count    := old.comment_count;
    new.bookmark_count   := old.bookmark_count;
    new.trend_score      := old.trend_score;
    new.popularity_score := old.popularity_score;
    new.rising_score     := old.rising_score;
    new.recent_saves     := old.recent_saves;
    new.recent_compares  := old.recent_compares;
    new.signals_at       := old.signals_at;
  end if;
  return new;
end;
$$;

drop trigger if exists products_counter_gate on public.products;
create trigger products_counter_gate
  before insert or update on public.products
  for each row execute function public.enforce_product_counter_gate();

create index if not exists products_rising_idx
  on public.products (rising_score desc) where status = 'published';

-- ---------------------------------------------------------------------------
-- 3. The event log
-- ---------------------------------------------------------------------------

alter table public.product_events
  -- sha-256 of (secret, IST day, IP, user agent), truncated. Rotates daily, so
  -- a visitor cannot be followed from one day to the next, and no IP is kept.
  add column if not exists session_hash text,
  -- Hours since the epoch. With the unique index below, one session counts at
  -- most once per product, event and hour — the duplicate-event control.
  add column if not exists dedup_bucket integer,
  -- Where it happened: 'product', 'card', 'search', 'match', 'compare', …
  add column if not exists surface text check (surface is null or length(surface) <= 24);

alter table public.product_events drop constraint if exists product_events_event_type_check;
alter table public.product_events
  add constraint product_events_event_type_check
  check (event_type in (
    'view', 'upvote', 'unvote', 'bookmark', 'unbookmark', 'comment', 'feedback', 'share',
    'report', 'product_create', 'image_upload',
    'website_click', 'compare_add', 'compare_remove', 'match_impression', 'match_click',
    'search_click'
  ));

-- Not partial, so PostgREST's on_conflict can name it. Legacy rows have a null
-- session_hash, and nulls never collide.
create unique index if not exists product_events_dedup_idx
  on public.product_events (product_id, event_type, session_hash, dedup_bucket);

-- The log was readable and writable by anyone holding the public anon key:
-- readable meant user ids and IP addresses on the open API, writable meant
-- anyone could forge engagement. Every write now goes through /api/signals
-- (rate limited, bot-filtered, deduplicated) using the service role, and
-- nothing reads the log except the signal job.
drop policy if exists "Product events are insertable by anyone" on public.product_events;
drop policy if exists "Product events are readable by everyone" on public.product_events;
revoke all on public.product_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Daily rollups (raw events are kept for 8 days, rollups for 120)
-- ---------------------------------------------------------------------------

create table if not exists public.product_signal_daily (
  product_id        uuid    not null references public.products (id) on delete cascade,
  day               date    not null,
  views             integer not null default 0,
  visitors          integer not null default 0,
  website_clicks    integer not null default 0,
  saves             integer not null default 0,
  unsaves           integer not null default 0,
  compares          integer not null default 0,
  match_impressions integer not null default 0,
  match_clicks      integer not null default 0,
  search_clicks     integer not null default 0,
  upvotes           integer not null default 0,
  comments          integer not null default 0,
  primary key (product_id, day)
);

create index if not exists product_signal_daily_day_idx on public.product_signal_daily (day);

alter table public.product_signal_daily enable row level security;
-- No policies: aggregates are read through the service role (admin, job).

-- ---------------------------------------------------------------------------
-- 5. Trending / rising
-- ---------------------------------------------------------------------------

-- One hourly call from the indexer job. Rolls the last three days of events up,
-- scores every published product, writes the scores onto `products`, and
-- prunes old rows. Set-based throughout — a few statements, not a loop.
--
-- Trending: decayed sum of daily engagement over 7 days (half-life
--   `half_life_days`). Recent activity dominates by construction, so a product
--   with huge historical traffic does not stay "trending" forever.
-- Rising: engagement per day over the last 3 days against the 7 days before
--   that, only once there is at least `min_rising` engagement — acceleration,
--   not volume, and never noise from a single visit.
-- Engagement weights unique visitors, not raw views: one person refreshing a
--   page is one visitor.
create or replace function public.refresh_discovery_signals(
  half_life_days real    default 2.5,
  min_rising     real    default 6,
  w_visitor      real    default 1,
  w_click        real    default 3,
  w_save         real    default 4,
  w_compare      real    default 3,
  w_comment      real    default 5,
  w_upvote       real    default 3,
  w_match_click  real    default 2,
  w_search_click real    default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  since       date := (now() at time zone 'Asia/Kolkata')::date - 2;
  today       date := (now() at time zone 'Asia/Kolkata')::date;
  rolled      integer;
  scored      integer;
  purged      integer;
begin
  insert into public.product_signal_daily as d (
    product_id, day, views, visitors, website_clicks, saves, unsaves, compares,
    match_impressions, match_clicks, search_clicks, upvotes, comments
  )
  select product_id, day,
         sum(views), sum(visitors), sum(website_clicks), sum(saves), sum(unsaves), sum(compares),
         sum(match_impressions), sum(match_clicks), sum(search_clicks), sum(upvotes), sum(comments)
  from (
    select e.product_id,
           (e.created_at at time zone 'Asia/Kolkata')::date as day,
           count(*) filter (where e.event_type = 'view')                                    as views,
           count(distinct e.session_hash) filter (where e.event_type = 'view')              as visitors,
           count(*) filter (where e.event_type = 'website_click')                           as website_clicks,
           count(*) filter (where e.event_type = 'bookmark')                                as saves,
           count(*) filter (where e.event_type = 'unbookmark')                              as unsaves,
           count(*) filter (where e.event_type = 'compare_add')                             as compares,
           count(*) filter (where e.event_type = 'match_impression')                        as match_impressions,
           count(*) filter (where e.event_type = 'match_click')                             as match_clicks,
           count(*) filter (where e.event_type = 'search_click')                            as search_clicks,
           0 as upvotes, 0 as comments
    from public.product_events e
    where e.created_at >= (since::timestamp at time zone 'Asia/Kolkata')
      and e.session_hash is not null
    group by 1, 2
    union all
    select u.product_id, (u.created_at at time zone 'Asia/Kolkata')::date,
           0, 0, 0, 0, 0, 0, 0, 0, 0, count(*), 0
    from public.upvotes u
    where u.created_at >= (since::timestamp at time zone 'Asia/Kolkata')
    group by 1, 2
    union all
    select c.product_id, (c.created_at at time zone 'Asia/Kolkata')::date,
           0, 0, 0, 0, 0, 0, 0, 0, 0, 0, count(*)
    from public.comments c
    where c.created_at >= (since::timestamp at time zone 'Asia/Kolkata')
    group by 1, 2
  ) merged
  where exists (select 1 from public.products p where p.id = merged.product_id)
  group by product_id, day
  on conflict (product_id, day) do update set
    views = excluded.views, visitors = excluded.visitors,
    website_clicks = excluded.website_clicks, saves = excluded.saves,
    unsaves = excluded.unsaves, compares = excluded.compares,
    match_impressions = excluded.match_impressions, match_clicks = excluded.match_clicks,
    search_clicks = excluded.search_clicks, upvotes = excluded.upvotes,
    comments = excluded.comments;
  get diagnostics rolled = row_count;

  with engagement as (
    select d.product_id, d.day, today - d.day as age,
           d.visitors * w_visitor + d.website_clicks * w_click + d.saves * w_save
           + d.compares * w_compare + d.comments * w_comment + d.upvotes * w_upvote
           + d.match_clicks * w_match_click + d.search_clicks * w_search_click as value,
           d.saves - d.unsaves as net_saves,
           d.compares
    from public.product_signal_daily d
    where d.day >= today - 30
  ),
  scores as (
    select product_id,
           coalesce(sum(value * power(0.5, age / half_life_days)) filter (where age <= 6), 0) as trending,
           coalesce(sum(value) filter (where age <= 2), 0)                                     as recent3,
           coalesce(sum(value) filter (where age between 3 and 9), 0)                          as prev7,
           greatest(coalesce(sum(net_saves), 0), 0)                                            as saves30,
           coalesce(sum(compares), 0)                                                          as compares30
    from engagement
    group by product_id
  )
  update public.products p
  set trend_score     = round(coalesce(s.trending, 0)::numeric, 3),
      rising_score    = case
                          when coalesce(s.recent3, 0) >= min_rising
                            then round(((s.recent3 / 3.0) / greatest(s.prev7 / 7.0, 1.0))::numeric, 3)
                          else 0
                        end,
      recent_saves    = coalesce(s.saves30, 0),
      recent_compares = coalesce(s.compares30, 0),
      signals_at      = now()
  from public.products target
  left join scores s on s.product_id = target.id
  where p.id = target.id
    and target.status = 'published';
  get diagnostics scored = row_count;

  delete from public.product_events where created_at < now() - interval '8 days';
  get diagnostics purged = row_count;
  delete from public.product_signal_daily where day < today - 120;

  return jsonb_build_object('rolled_up', rolled, 'scored', scored, 'purged_events', purged);
end;
$$;

revoke all on function public.refresh_discovery_signals(real, real, real, real, real, real, real, real, real, real)
  from public, anon, authenticated;
grant execute on function public.refresh_discovery_signals(real, real, real, real, real, real, real, real, real, real)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Search: same ranking, new filters and sorts
-- ---------------------------------------------------------------------------

-- Body identical to 20260813000000 apart from the four new filter arguments
-- and the three new sort modes. The old six-argument signature is dropped so
-- PostgREST never has two overloads to choose between.
drop function if exists public.search_products(text, text, text[], text, integer, integer);

create or replace function public.search_products(
  search_query     text,
  category_filter  text        default null,
  pricing_filter   text[]      default null,
  sort_mode        text        default 'relevance',
  page_limit       integer     default 12,
  page_offset      integer     default 0,
  state_filter     text        default null,
  made_in_india    boolean     default null,
  launched_since   timestamptz default null,
  attribute_filter text[]      default null
)
returns table (
  id                   uuid,
  slug                 text,
  name                 text,
  tagline              text,
  category             text,
  pricing_type         text,
  avg_rating           numeric,
  upvote_count         integer,
  comment_count        integer,
  hero_image_url       text,
  tags                 text[],
  website_url          text,
  github_url           text,
  creator_display_name text,
  creator_username     text,
  relevance            real,
  total_count          bigint
)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- PL/pgSQL locals, not a joined CTE: the planner sees each LIKE pattern as a
  -- parameter and can use the trigram index (see 20260809120000).
  nq       text   := public.search_normalize(search_query);
  toks     text[] := public.search_tokens(search_query);
  rawq     text   := pg_catalog.lower(pg_catalog.btrim(coalesce(search_query, '')));
  pats     text[];
  nq_like  text;
  lead_pat text;
  fuzzy_on boolean;
begin
  if nq = '' then
    return;
  end if;

  pats     := array(select '%' || t || '%' from pg_catalog.unnest(toks) as t);
  nq_like  := '%' || nq || '%';
  lead_pat := pats[1];
  fuzzy_on := pg_catalog.length(nq) >= 4;

  return query
  with candidates as materialized (
    select
      p.id, p.slug, p.name, p.tagline, p.description, p.category, p.pricing_type,
      p.avg_rating, p.upvote_count, p.comment_count, p.hero_image_url, p.tags,
      p.website_url, p.github_url, p.creator_id, p.trend_score, p.pricing_amount,
      p.published_at, p.search_name, p.rising_score, p.recent_saves, p.recent_compares
    from public.products p
    where p.status = 'published'
      and (category_filter is null or p.category = category_filter)
      and (pricing_filter is null
           or pg_catalog.cardinality(pricing_filter) = 0
           or p.pricing_type = any (pricing_filter))
      and (state_filter is null or p.launch_state = state_filter)
      and (made_in_india is not true or p.launch_state is not null)
      and (launched_since is null or p.published_at >= launched_since)
      and (attribute_filter is null
           or pg_catalog.cardinality(attribute_filter) = 0
           or exists (
                select 1 from public.product_intelligence pi
                where pi.product_id = p.id and pi.attributes @> attribute_filter))
      and (
        p.search_text like nq_like
        or (lead_pat is not null
            and p.search_text like lead_pat
            and p.search_text like all (pats))
        or (fuzzy_on
            and p.search_name operator(extensions.%) nq
            and extensions.similarity(p.search_name, nq) >= 0.35)
      )
  ),
  scored as (
    select
      c.*,
      (case
         when pg_catalog.lower(c.name) = rawq              then 120
         when c.search_name = nq                           then 100
         when c.search_name like nq || '%'                 then 80
         when c.search_name like nq_like                   then 65
         else 0
       end
       + case
           when lead_pat is not null and c.search_name like all (pats) then 30
           else 0
         end
       + case when public.search_normalize(c.tagline)      like nq_like then 35 else 0 end
       + case when public.search_normalize(c.category)     like nq_like then 25 else 0 end
       + case when public.search_normalize_array(c.tags)   like nq_like then 25 else 0 end
       + case when public.search_normalize(c.description)  like nq_like then 15 else 0 end
       + case
           when fuzzy_on then (extensions.similarity(c.search_name, nq) * 40)
           else 0
         end
      )::real as relevance
    from candidates c
  ),
  counted as (
    select s.*, pg_catalog.count(*) over () as total_count from scored s
  )
  select
    c.id, c.slug, c.name, c.tagline, c.category, c.pricing_type,
    c.avg_rating, c.upvote_count, c.comment_count, c.hero_image_url,
    c.tags, c.website_url, c.github_url,
    pr.display_name, pr.username,
    c.relevance, c.total_count
  from counted c
  left join public.profiles pr on pr.id = c.creator_id
  order by
    case when sort_mode = 'relevance'     then c.relevance       end desc nulls last,
    case when sort_mode = 'trending'      then c.trend_score     end desc nulls last,
    case when sort_mode = 'rising'        then c.rising_score    end desc nulls last,
    case when sort_mode = 'most-saved'    then c.recent_saves    end desc nulls last,
    case when sort_mode = 'most-compared' then c.recent_compares end desc nulls last,
    case when sort_mode = 'top-rated'     then c.upvote_count    end desc nulls last,
    case when sort_mode = 'price-low'     then c.pricing_amount  end asc  nulls last,
    case when sort_mode = 'price-high'    then c.pricing_amount  end desc nulls last,
    case when sort_mode = 'newest'        then c.published_at    end desc nulls last,
    c.upvote_count desc nulls last,
    c.published_at desc nulls last,
    c.id
  limit  greatest(1, least(page_limit, 60))
  offset greatest(0, page_offset);
end
$$;

grant execute on function public.search_products(text, text, text[], text, integer, integer, text, boolean, timestamptz, text[])
  to anon, authenticated;

-- Which search box a query came from: the marketplace, or Product Match.
alter table public.search_queries
  add column if not exists source text not null default 'marketplace';
alter table public.search_queries drop constraint if exists search_queries_source_valid;
alter table public.search_queries
  add constraint search_queries_source_valid check (source in ('marketplace', 'match'));

-- ---------------------------------------------------------------------------
-- 7. User lists ("collections" in the UI — /collections is already the
--    programmatic SEO pages, so these live at /lists/[slug])
-- ---------------------------------------------------------------------------

create table if not exists public.user_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text        not null references public.profiles (id) on delete cascade,
  title       text        not null check (length(btrim(title)) between 1 and 80),
  -- `<title-slug>-<4 random chars>`: readable, unique, and not enumerable.
  slug        text        not null unique check (slug ~ '^[a-z0-9-]{3,100}$'),
  description text        check (description is null or length(description) <= 280),
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_lists_owner_idx on public.user_lists (owner_id, updated_at desc);

create table if not exists public.user_list_items (
  list_id    uuid        not null references public.user_lists (id) on delete cascade,
  product_id uuid        not null references public.products (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (list_id, product_id)
);

create index if not exists user_list_items_product_idx on public.user_list_items (product_id);

drop trigger if exists user_lists_updated_at on public.user_lists;
create trigger user_lists_updated_at
  before update on public.user_lists
  for each row execute function public.update_updated_at();

-- Bounds enforced where they cannot be skipped: 50 lists a person, 200
-- products a list. Generous for curation, useless for spam.
create or replace function public.enforce_user_list_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'user_lists' then
    if (select count(*) from public.user_lists where owner_id = new.owner_id) >= 50 then
      raise exception 'You can have up to 50 lists' using errcode = 'check_violation';
    end if;
  else
    if (select count(*) from public.user_list_items where list_id = new.list_id) >= 200 then
      raise exception 'A list can hold up to 200 products' using errcode = 'check_violation';
    end if;
    -- Touch the list so "recently updated" ordering and sitemaps see the change.
    update public.user_lists set updated_at = now() where id = new.list_id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_lists_limit on public.user_lists;
create trigger user_lists_limit
  before insert on public.user_lists
  for each row execute function public.enforce_user_list_limits();

drop trigger if exists user_list_items_limit on public.user_list_items;
create trigger user_list_items_limit
  before insert on public.user_list_items
  for each row execute function public.enforce_user_list_limits();

alter table public.user_lists enable row level security;
alter table public.user_list_items enable row level security;

drop policy if exists "user_lists_read" on public.user_lists;
create policy "user_lists_read" on public.user_lists for select
  using (is_public or owner_id = public.requesting_user_id());

drop policy if exists "user_lists_insert" on public.user_lists;
create policy "user_lists_insert" on public.user_lists for insert
  with check (owner_id = public.requesting_user_id());

drop policy if exists "user_lists_update" on public.user_lists;
create policy "user_lists_update" on public.user_lists for update
  using (owner_id = public.requesting_user_id())
  with check (owner_id = public.requesting_user_id());

drop policy if exists "user_lists_delete" on public.user_lists;
create policy "user_lists_delete" on public.user_lists for delete
  using (owner_id = public.requesting_user_id());

drop policy if exists "user_list_items_read" on public.user_list_items;
create policy "user_list_items_read" on public.user_list_items for select
  using (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id
      and (l.is_public or l.owner_id = public.requesting_user_id())
  ));

drop policy if exists "user_list_items_insert" on public.user_list_items;
create policy "user_list_items_insert" on public.user_list_items for insert
  with check (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id and l.owner_id = public.requesting_user_id()
  ));

drop policy if exists "user_list_items_delete" on public.user_list_items;
create policy "user_list_items_delete" on public.user_list_items for delete
  using (exists (
    select 1 from public.user_lists l
    where l.id = user_list_items.list_id and l.owner_id = public.requesting_user_id()
  ));

grant select on public.user_lists, public.user_list_items to anon, authenticated;
grant insert, update, delete on public.user_lists to authenticated;
grant insert, delete on public.user_list_items to authenticated;
