-- Four SECURITY DEFINER functions set search_path = '' (correct hardening
-- against search_path hijacking) but reference tables unqualified inside
-- their bodies, so every call fails with "relation ... does not exist".
-- Re-create them with fully-qualified `public.` table references, matching
-- the pattern already used correctly in handle_new_user().

create or replace function public.add_feedback_and_update_product(p_product_id uuid, p_rating integer)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  current_count integer;
  current_avg numeric;
  new_count integer;
  new_avg numeric;
begin
  select feedback_count, avg_rating into current_count, current_avg
  from public.products where id = p_product_id for update;

  new_count := coalesce(current_count, 0) + 1;
  new_avg := round(((coalesce(current_avg, 0) * coalesce(current_count, 0) + p_rating) / new_count)::numeric, 1);

  update public.products set feedback_count = new_count, avg_rating = new_avg where id = p_product_id;
end;
$$;

create or replace function public.calculate_product_scores()
returns void
language plpgsql security definer
set search_path to ''
as $$
begin
  update public.products p
  set
    popularity_score = coalesce((
      select
        (count(*) filter (where pe.event_type = 'view')) * 1
        + (count(*) filter (where pe.event_type = 'upvote') - count(*) filter (where pe.event_type = 'unvote')) * 3
        + (count(*) filter (where pe.event_type = 'comment')) * 5
        + (count(*) filter (where pe.event_type = 'share')) * 6
        + (count(*) filter (where pe.event_type = 'bookmark') - count(*) filter (where pe.event_type = 'unbookmark')) * 4
        + (count(*) filter (where pe.event_type = 'feedback')) * 10
        - (count(*) filter (where pe.event_type = 'report')) * 15
      from public.product_events pe
      where pe.product_id = p.id
    ), 0),
    trend_score = coalesce((
      select
        (count(*) filter (where pe.event_type = 'view')) * 1
        + (count(*) filter (where pe.event_type = 'upvote') - count(*) filter (where pe.event_type = 'unvote')) * 3
        + (count(*) filter (where pe.event_type = 'comment')) * 5
        + (count(*) filter (where pe.event_type = 'share')) * 6
        + (count(*) filter (where pe.event_type = 'bookmark') - count(*) filter (where pe.event_type = 'unbookmark')) * 4
        + (count(*) filter (where pe.event_type = 'feedback')) * 10
        - (count(*) filter (where pe.event_type = 'report')) * 15
      from public.product_events pe
      where pe.product_id = p.id
        and pe.created_at >= now() - interval '24 hours'
    ), 0)
  where p.status = 'published';
end;
$$;

create or replace function public.increment_product_counter(target_product_id uuid, counter_column text, delta integer)
returns void
language plpgsql security definer
set search_path to ''
as $$
begin
  if counter_column = 'upvote_count' then
    update public.products set upvote_count = greatest(0, upvote_count + delta) where id = target_product_id;
  elsif counter_column = 'bookmark_count' then
    update public.products set bookmark_count = greatest(0, bookmark_count + delta) where id = target_product_id;
  elsif counter_column = 'comment_count' then
    update public.products set comment_count = greatest(0, comment_count + delta) where id = target_product_id;
  elsif counter_column = 'feedback_count' then
    update public.products set feedback_count = greatest(0, feedback_count + delta) where id = target_product_id;
  elsif counter_column = 'share_count' then
    update public.products set share_count = greatest(0, share_count + delta) where id = target_product_id;
  end if;
end;
$$;

create or replace function public.purge_old_events()
returns void
language plpgsql security definer
set search_path to ''
as $$
begin
  delete from public.product_events
  where created_at < now() - interval '7 days';
end;
$$;
