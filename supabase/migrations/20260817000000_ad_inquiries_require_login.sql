-- Advertising inquiries now require a signed-in user (lib/actions/ad-inquiry.ts).
--
-- Previously anyone, including logged-out visitors, could submit a lead and the
-- insert policy was `with check (true)`. Requiring a Clerk session gives every
-- lead an accountable identity and lets the rate limiter key on a user id
-- rather than an IP address. Idempotent.

-- 1. Attribute each lead to its submitter.
--
-- Nullable on purpose: rows captured before this migration have no user, and
-- `on delete set null` keeps a historical lead readable after the account that
-- sent it is deleted. Like every other user reference in this schema, the FK
-- points at profiles.id (Clerk's user id, stored as text) -- so the action must
-- call ensureProfile() before inserting.
alter table public.ad_inquiries
  add column if not exists user_id text references public.profiles(id) on delete set null;

create index if not exists ad_inquiries_user_id_idx
  on public.ad_inquiries (user_id);

-- 2. Replace the anonymous insert policy with an authenticated one.
--
-- The server action already rejects logged-out callers; this is the same rule
-- at the database layer, so a lead cannot be inserted under someone else's id
-- even if the action is bypassed.
drop policy if exists "ad_inquiries_insert_anyone" on public.ad_inquiries;
drop policy if exists "ad_inquiries_insert_authenticated" on public.ad_inquiries;
create policy "ad_inquiries_insert_authenticated"
  on public.ad_inquiries
  for insert
  with check (public.requesting_user_id() = user_id);

-- No select/update/delete policy, unchanged: leads stay readable only via the
-- service role (Supabase dashboard / server-side jobs), never the public API.
