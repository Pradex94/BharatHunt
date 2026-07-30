-- ===========================================================================
-- Phase 2 schema for the "Product Launch Platform Upgrade" blueprint.
-- Adds the rich creator-form fields, a makers/team table, and a pinned-comment
-- flag. Idempotent — safe to run more than once in the Supabase SQL editor.
--
-- Run this BEFORE deploying the Phase 2 form + landing-page detail layout;
-- until it's applied, those fields have nowhere to persist.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. products: new launch fields (all optional / defaulted, so existing rows
--    and the current insert path keep working unchanged).
-- ---------------------------------------------------------------------------
alter table public.products
  -- Primary call-to-action
  add column if not exists cta_text          text,
  add column if not exists cta_url           text,
  -- Multi-platform availability matrix: { web, ios, android, github, chrome,
  -- firefox, figma, vscode, slack, shopify, producthunt, appsumo, ... }
  add column if not exists platform_links    jsonb        not null default '{}'::jsonb,
  -- Hero showcase: interactive demo iframe (Supademo/Storylane/Arcade/…)
  add column if not exists demo_embed_url    text,
  -- Captioned, re-orderable gallery: [{ "url": "...", "caption": "..." }, ...]
  -- (screenshot_urls stays for backward compatibility during migration)
  add column if not exists gallery           jsonb        not null default '[]'::jsonb,
  -- "The Story Behind the Launch" (Markdown)
  add column if not exists story             text,
  -- Key highlights: [{ "title": "...", "icon": "⚡", "description": "..." }, ...]
  add column if not exists features          jsonb        not null default '[]'::jsonb,
  -- Tech stack tags, distinct from discovery `tags`
  add column if not exists tech_stack        text[]       not null default '{}',
  -- Supplementary pricing badges: open-source | lifetime-deal | free-trial
  add column if not exists pricing_badges    text[]       not null default '{}',
  -- Exclusive launch offer
  add column if not exists coupon_code       text,
  add column if not exists offer_description text,
  add column if not exists offer_expires_at  timestamptz,
  -- Public roadmap & changelog
  add column if not exists roadmap_url       text,
  add column if not exists changelog_url     text,
  -- "Hire us / available for services"
  add column if not exists available_for_hire boolean     not null default false,
  add column if not exists hire_pitch        text;

-- ---------------------------------------------------------------------------
-- 2. comments: pinned maker intro comment.
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists is_pinned boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. product_makers: co-founders / team, registered or not.
-- ---------------------------------------------------------------------------
create table if not exists public.product_makers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  -- Registered maker (Clerk id in profiles.id) — nullable for external teammates
  user_id      text references public.profiles(id),
  name         text,          -- display name for non-registered makers
  role         text,          -- e.g. "Founder", "Design", "Engineering"
  avatar_url   text,
  x_url        text,
  linkedin_url text,
  github_url   text,
  website_url  text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists product_makers_product_id_idx
  on public.product_makers (product_id);

alter table public.product_makers enable row level security;

-- Anyone can read the makers of a published product (public showcase).
drop policy if exists "product_makers_select_published" on public.product_makers;
create policy "product_makers_select_published"
  on public.product_makers
  for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_makers.product_id
        and p.status = 'published'
    )
  );

-- Only the product's creator may add / edit / remove its makers.
drop policy if exists "product_makers_write_owner" on public.product_makers;
create policy "product_makers_write_owner"
  on public.product_makers
  for all
  using (
    exists (
      select 1 from public.products p
      where p.id = product_makers.product_id
        and p.creator_id = auth.jwt() ->> 'sub'
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_makers.product_id
        and p.creator_id = auth.jwt() ->> 'sub'
    )
  );
