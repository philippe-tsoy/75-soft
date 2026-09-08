-- Achievement evaluation functions.
-- Apply this file after the day-tracking and post migrations. The evaluator
-- reads their public projections and never deletes an existing unlock.
--
-- WATER_BEFORE_NOON and WATER_EXACT_TARGET (and their supporting
-- private.achievement_water_flags helper) are retired here: "water" is no
-- longer a guaranteed goal every member has under the flat goals model, so
-- an achievement keyed to that one specific goal name no longer makes
-- sense. See the migration that deletes their catalog rows.

drop function if exists private.achievement_water_flags(
  uuid,
  text,
  date,
  date,
  timestamptz
);
-- Return shape changed (fixed per-goal booleans -> met_count/total_count).
drop function if exists private.achievement_day_facts(uuid, date, timestamptz);

create or replace function private.achievement_day_facts(
  p_user_id uuid,
  p_local_date date,
  p_as_of timestamptz
)
returns table(
  met_count integer,
  total_count integer,
  status text,
  invalidated boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  rollup record;
begin
  select *
  into rollup
  from public.get_day_rollup(p_user_id, p_local_date, p_as_of);

  if not found then
    met_count := 0;
    total_count := 0;
    status := 'unscored';
    invalidated := false;
    return next;
    return;
  end if;

  met_count := coalesce(rollup.met_count, 0);
  total_count := coalesce(rollup.total_count, 0);
  status := coalesce(rollup.status, 'unscored');
  invalidated := coalesce(rollup.invalidated, false);

  return next;
end;
$$;

create or replace function private.achievement_candidate_codes(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(code text)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  user_timezone text;
  join_date date;
  cohort_start date;
  local_today date;
  current_day_number integer;
  first_update boolean := false;
  first_full_day boolean := false;
  first_photo boolean := false;
  three_posts_one_day boolean := false;
  full_day_after_miss boolean := false;
  seven_photos boolean := false;
  date_row record;
  day_facts record;
  previous_day_facts record;
begin
  select
    profile.timezone,
    membership.join_local_date,
    cohort.start_date
  into
    user_timezone,
    join_date,
    cohort_start
  from public.memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  join public.cohorts as cohort on cohort.id = membership.cohort_id
  where membership.user_id = p_user_id
    and membership.cohort_id = private.active_cohort_id()
    and membership.removed_at is null;

  if not found then
    return;
  end if;

  local_today := (p_now at time zone user_timezone)::date;
  current_day_number := local_today - cohort_start + 1;

  first_update := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  first_photo := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.photo_path is not null
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  three_posts_one_day := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
    group by post.local_date
    having count(*) >= 3
  );

  seven_photos := (
    select count(*) >= 7
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.photo_path is not null
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  for date_row in
    select dates.local_date
    from (
      select delta.local_date
      from public.day_deltas as delta
      where delta.user_id = p_user_id
      union
      select post.local_date
      from public.posts as post
      where post.author_id = p_user_id
        and post.cohort_id = private.active_cohort_id()
    ) as dates
    where dates.local_date >= greatest(join_date, cohort_start)
      and dates.local_date <= local_today
    order by dates.local_date
  loop
    select *
    into day_facts
    from private.achievement_day_facts(
      p_user_id,
      date_row.local_date,
      p_now
    );

    if
      day_facts.total_count > 0
      and day_facts.met_count = day_facts.total_count
      and day_facts.status = 'complete'
      and not day_facts.invalidated
    then
      first_full_day := true;

      select *
      into previous_day_facts
      from private.achievement_day_facts(
        p_user_id,
        date_row.local_date - 1,
        p_now
      );

      if
        date_row.local_date - 1 < local_today
        and date_row.local_date - 1 >= greatest(join_date, cohort_start)
        and previous_day_facts.status = 'missed'
        and previous_day_facts.met_count = 0
        and not previous_day_facts.invalidated
      then
        full_day_after_miss := true;
      end if;
    end if;
  end loop;

  if first_update then
    return query select 'FIRST_UPDATE'::text;
  end if;
  if first_full_day then
    return query select 'FIRST_FULL_DAY'::text;
  end if;
  if first_photo then
    return query select 'FIRST_PHOTO'::text;
  end if;
  if current_day_number >= 75 then
    return query select 'DAY_75'::text;
  end if;
  if three_posts_one_day then
    return query select 'THREE_POSTS_ONE_DAY'::text;
  end if;
  if full_day_after_miss then
    return query select 'FULL_DAY_AFTER_MISS'::text;
  end if;
  if seven_photos then
    return query select 'SEVEN_PHOTOS'::text;
  end if;
end;
$$;

revoke all on function private.achievement_day_facts(uuid, date, timestamptz)
  from public;
revoke all on function private.achievement_candidate_codes(
  uuid,
  timestamptz
)
  from public;

create or replace function public.evaluate_achievements(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(
  achievement_id uuid,
  code text,
  unlocked_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  candidate record;
  inserted_at timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Achievement evaluation is limited to the current user'
      using errcode = '42501';
  end if;

  if not private.is_active_member(p_user_id) then
    return;
  end if;

  for candidate in
    select achievement.id, achievement.code
    from public.achievements as achievement
    where achievement.code in (
      select candidate_code.code
      from private.achievement_candidate_codes(p_user_id, p_now)
        as candidate_code
    )
    order by achievement.sort_order
  loop
    insert into public.user_achievements (
      user_id,
      achievement_id,
      unlocked_at,
      evidence
    )
    values (
      p_user_id,
      candidate.id,
      p_now,
      jsonb_build_object('evaluatedAt', p_now)
    )
    on conflict (user_id, achievement_id) do nothing
    returning unlocked_at into inserted_at;

    if found then
      achievement_id := candidate.id;
      code := candidate.code;
      unlocked_at := inserted_at;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_achievements(uuid, timestamptz)
  from public;
grant execute on function public.evaluate_achievements(uuid, timestamptz)
  to authenticated;
