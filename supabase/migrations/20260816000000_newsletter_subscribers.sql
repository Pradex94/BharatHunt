-- Newsletter signups from the "Stay in the loop" form on the landing page
-- (lib/actions/newsletter.ts).
--
-- The form had no backend at all: it flipped a local `submitted` flag to show
-- "Subscribed" and dropped the address on the floor. Every signup since launch
-- is gone. This is where they land from now on.

create table if not exists public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  -- Stored lower-cased so Foo@x.com and foo@x.com are one subscriber. The
  -- check enforces it at the table rather than trusting the caller: the insert
  -- policy below is open to anyone, so "the app lower-cases it" is not a
  -- guarantee, it is a hope.
  email           text not null unique check (email = lower(email)),
  -- Which surface the signup came from, so a future second form is separable.
  source          text not null default 'landing',
  created_at      timestamptz not null default now(),
  -- Set rather than deleting the row, so an unsubscribe is not silently
  -- undone by the next signup and stays auditable.
  unsubscribed_at timestamptz
);

alter table public.newsletter_subscribers enable row level security;

-- Anyone, logged in or not, may subscribe.
drop policy if exists "newsletter_insert_anyone" on public.newsletter_subscribers;
create policy "newsletter_insert_anyone"
  on public.newsletter_subscribers
  for insert
  with check (true);

-- No select/update/delete policy on purpose. The subscriber list is readable
-- only through the service role (Supabase dashboard, server-side jobs) -- an
-- open select policy here would publish everyone's email address through the
-- public API. The app never needs to read this table.

-- Partial index: sending only ever asks for the people still subscribed.
create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (created_at desc)
  where unsubscribed_at is null;
