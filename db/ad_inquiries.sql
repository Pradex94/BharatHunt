-- Advertiser leads captured by the /advertise page (lib/actions/ad-inquiry.ts).
-- Run this once in the Supabase SQL editor.

create table if not exists public.ad_inquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text,
  package    text,
  message    text,
  created_at timestamptz not null default now()
);

alter table public.ad_inquiries enable row level security;

-- Anyone (including logged-out visitors) may submit an inquiry.
drop policy if exists "ad_inquiries_insert_anyone" on public.ad_inquiries;
create policy "ad_inquiries_insert_anyone"
  on public.ad_inquiries
  for insert
  with check (true);

-- No select/update/delete policy on purpose: leads are readable only via the
-- service role (Supabase dashboard / server-side jobs), never the public API.
