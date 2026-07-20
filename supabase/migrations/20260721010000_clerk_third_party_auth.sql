-- Migrate identity from Supabase's native auth.users to Clerk (third-party
-- auth). Clerk-issued JWTs never create rows in auth.users, and Clerk's user
-- IDs (e.g. "user_2abc...") aren't valid uuids, so every column that stores
-- a user identity has to become text, and every RLS policy that compared
-- against auth.uid() has to compare against the JWT's `sub` claim instead
-- (auth.uid() does not work with third-party tokens).
--
-- Note: the pre-existing "pardeep" profile is intentionally left in place
-- rather than deleted -- products_creator_id_fkey is ON DELETE CASCADE, and
-- the 5 seeded demo products are attributed to that profile. It simply can
-- no longer log in (Clerk issues a different id format), which is fine.

-- 1. Drop the trigger that auto-created profiles on auth.users signup -- it
-- can never fire for Clerk-authenticated users since they never touch
-- auth.users. Profile creation moves to a Clerk webhook instead.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2. Drop RLS policies that reference the columns we're about to retype.
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Creators can delete their own products" on public.products;
drop policy if exists "Creators can update their own products" on public.products;
drop policy if exists "Published products are viewable by everyone" on public.products;
drop policy if exists "Users can create products" on public.products;
drop policy if exists "Users can create comments" on public.comments;
drop policy if exists "Users can delete their own comments" on public.comments;
drop policy if exists "Users can create feedback" on public.feedback;
drop policy if exists "Users can delete their own feedback" on public.feedback;
drop policy if exists "Users can update their own feedback" on public.feedback;
drop policy if exists "Users can update their own notifications" on public.notifications;
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "Users can remove their own upvote" on public.upvotes;
drop policy if exists "Users can upvote" on public.upvotes;
drop policy if exists "Users can bookmark" on public.bookmarks;
drop policy if exists "Users can remove their own bookmark" on public.bookmarks;
drop policy if exists "Users can view their own bookmarks" on public.bookmarks;

-- 3. Drop the foreign keys that will be affected by the type change.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.products drop constraint if exists products_creator_id_fkey;
alter table public.comments drop constraint if exists comments_user_id_fkey;
alter table public.upvotes drop constraint if exists upvotes_user_id_fkey;
alter table public.bookmarks drop constraint if exists bookmarks_user_id_fkey;
alter table public.feedback drop constraint if exists feedback_user_id_fkey;
alter table public.notifications drop constraint if exists notifications_user_id_fkey;
alter table public.product_events drop constraint if exists product_events_user_id_fkey;

-- 4. Change every user-identity column from uuid to text.
alter table public.profiles alter column id type text using id::text;
alter table public.products alter column creator_id type text using creator_id::text;
alter table public.comments alter column user_id type text using user_id::text;
alter table public.upvotes alter column user_id type text using user_id::text;
alter table public.bookmarks alter column user_id type text using user_id::text;
alter table public.feedback alter column user_id type text using user_id::text;
alter table public.notifications alter column user_id type text using user_id::text;
alter table public.product_events alter column user_id type text using user_id::text;

-- 5. Recreate the foreign keys (profiles.id -> auth.users.id is gone for
-- good; Clerk manages identity externally now).
alter table public.products
  add constraint products_creator_id_fkey foreign key (creator_id) references public.profiles (id) on delete cascade;
alter table public.comments
  add constraint comments_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.upvotes
  add constraint upvotes_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.bookmarks
  add constraint bookmarks_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.feedback
  add constraint feedback_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.notifications
  add constraint notifications_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.product_events
  add constraint product_events_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;

-- 6. Helper to read the requesting user's Clerk ID from the JWT, mirroring
-- what auth.uid() used to do.
create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select auth.jwt()->>'sub'
$$;

-- 7. Recreate policies using the Clerk-based helper instead of auth.uid().
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (public.requesting_user_id() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (public.requesting_user_id() = id);

create policy "Published products are viewable by everyone"
  on public.products for select
  using (status = 'published' or public.requesting_user_id() = creator_id);

create policy "Users can create products"
  on public.products for insert
  with check (public.requesting_user_id() = creator_id);

create policy "Creators can update their own products"
  on public.products for update
  using (public.requesting_user_id() = creator_id);

create policy "Creators can delete their own products"
  on public.products for delete
  using (public.requesting_user_id() = creator_id);

create policy "Users can create comments"
  on public.comments for insert
  with check (public.requesting_user_id() = user_id);

create policy "Users can delete their own comments"
  on public.comments for delete
  using (public.requesting_user_id() = user_id);

create policy "Users can create feedback"
  on public.feedback for insert
  with check (public.requesting_user_id() = user_id);

create policy "Users can update their own feedback"
  on public.feedback for update
  using (public.requesting_user_id() = user_id);

create policy "Users can delete their own feedback"
  on public.feedback for delete
  using (public.requesting_user_id() = user_id);

create policy "Users can view their own notifications"
  on public.notifications for select
  using (public.requesting_user_id() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (public.requesting_user_id() = user_id);

create policy "Users can upvote"
  on public.upvotes for insert
  with check (public.requesting_user_id() = user_id);

create policy "Users can remove their own upvote"
  on public.upvotes for delete
  using (public.requesting_user_id() = user_id);

create policy "Users can bookmark"
  on public.bookmarks for insert
  with check (public.requesting_user_id() = user_id);

create policy "Users can remove their own bookmark"
  on public.bookmarks for delete
  using (public.requesting_user_id() = user_id);

create policy "Users can view their own bookmarks"
  on public.bookmarks for select
  using (public.requesting_user_id() = user_id);
